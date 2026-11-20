import orm from '../entity/orm';
import email from '../entity/email';
import account from '../entity/account';
import user from '../entity/user';
import settingService from './setting-service';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
import { eq, and, isNull, isNotNull, like, desc, inArray } from 'drizzle-orm';
import { att } from '../entity/att';
import { star } from '../entity/star';
import { attConst, isDel, emailConst, settingConst } from '../const/entity-const';
import { SITE_TZ } from '../utils/date-uitil'; // [S48] TG 展示时间按站点时区
import jwtUtils from '../utils/jwt-utils';
import emailMsgTemplate from '../template/email-msg';
import emailTextTemplate from '../template/email-text';
import emailHtmlTemplate from '../template/email-html';
import verifyUtils from '../utils/verify-utils';
import domainUtils from "../utils/domain-uitls";
import proxyService from './proxy-service';
import emailService from './email-service';
import userService from './user-service';
import permService from './perm-service';
import notifyBindService from './notify-bind-service';
import KvConst from '../const/kv-const';
import constant from '../const/constant';
import { v4 as uuidv4 } from 'uuid';

function escapeHtml(text = '') {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

// [S48] TG 里展示的时间：库内是 UTC 裸串，按站点时区输出（原先直接吐 row.createTime，少 8 小时）
function tgTimeStr(v) {
	if (!v) return '';
	const d = dayjs.utc(String(v));
	return d.isValid() ? d.tz(SITE_TZ).format('MM-DD HH:mm') : String(v);
}

// 给 web_app 链接加缓存破除参数，避免 Telegram WebView 按路径缓存旧页面
// （旧页无「返回邮件列表」链接、也不写未读，会导致两个问题同时看似「没修好」）
function cacheBust(url) {
	const sep = url.includes('?') ? '&' : '?';
	return `${url}${sep}_t=${Date.now()}`;
}

// 星标邮件在网页端是「按用户汇总」的单一列表（star-service.list 只按 userId 过滤，与 accountId 无关），
// TG 侧必须保持一致：合并全账号成一条消息，不能再按账号分组。
// 这里用一个不可能出现在 account.account_id 里的负值做哨兵，复用到「更多」分页 token 里，
// 取数时识别到该值就不加 accountId 条件；正数仍走原有的分账号逻辑。
const STAR_ALL_ACCOUNTS = -1;

// 邮件的归属用户 id（TG 侧一遍取一次，缓存到上下文里避免每个命令重复查库）。
// TG 机器人是「单站点一个机器人」，管理员在网页端登录后能看到全站邮件（管理端），
// 但普通用户的邮箱不应该出现在这里 —— 否则机器人就成了跨用户读取邮件的口子。
// 所以统一按「管理员本人」的视野查询，与管理员登录网页端后看到的收件箱/已发送/回收站/星标一致。
async function getOwnerUserId(c) {
	const cached = c.get?.('tgOwnerUserId');
	if (cached !== undefined) return cached;

	let userId = null;
	try {
		if (c.env.admin) {
			const row = await orm(c).select({ userId: user.userId }).from(user)
				.where(eq(user.email, c.env.admin)).get();
			if (row) userId = row.userId;
		}
	} catch (e) {
		console.warn('[telegram] 解析管理员用户失败:', e.message);
	}

	c.set?.('tgOwnerUserId', userId);
	return userId;
}

// Telegram 命令清单（菜单显示用）。系统设置里的「重设菜单」与「按 chat 隐藏无权限命令」共用，
// 新增/修改命令只改这一处，避免两处描述不一致。
const TG_COMMANDS = [
	{ command: 'start',   description: '开始使用' },
	{ command: 'inbox',   description: '收件箱' },
	{ command: 'sent',    description: '已发送' },
	{ command: 'deleted', description: '回收站' },
	{ command: 'star',    description: '星标邮件' },
	{ command: 'spam',    description: '垃圾邮件' },
	{ command: 'noone',   description: '无人收件' },
	{ command: 'webmail', description: '网页版邮箱' }
];

// ★ 命令 → 网页端所需权限键（唯一一处，改权限只改这张表）
// 键名与后端 security.js 的 premKey、前端 perm/perm.js 保持一致；
// 未列出的命令 = 网页端登录即可访问，TG 同样不校验。
// 以后网页端权限有变动、或新增命令，只改这里；合版本时对照 security.js 的 premKey 检查即可。
const COMMAND_PERMS = {
	sent: 'email:send',      // 网页端侧栏「已发送 / 草稿箱」需 email:send（TG 无草稿命令）
	noone: 'all-email:query' // 网页端「无人收件」走全部邮件页，需 all-email:query
};

// 归属用户的权限键。判定与网页端完全一致：admin 邮箱直接视为 ['*']
// （同 user-service.loginUserInfo 的写法）。同一请求内缓存，避免菜单同步时逐条命令重复查库。
async function getOwnerPermKeys(c, userId) {
	const cached = c.get?.('tgOwnerPermKeys');
	if (cached !== undefined) return cached;

	let keys = [];
	try {
		const userRow = userId ? await userService.selectById(c, userId) : null;
		if (userRow) {
			keys = userRow.email === c.env.admin ? ['*'] : await permService.userPermKeys(c, userId);
		}
	} catch (e) {
		console.warn('[telegram] 解析用户权限失败:', e.message);
	}

	c.set?.('tgOwnerPermKeys', keys);
	return keys;
}

// 某条命令是否有权限（与网页端「侧栏菜单是否可见」同源）
async function hasCommandPerm(c, folder, userId) {
	const permKey = COMMAND_PERMS[folder];
	if (!permKey) return true;
	if (!userId) return false;
	const permKeys = await getOwnerPermKeys(c, userId);
	return permKeys.includes('*') || permKeys.includes(permKey);
}

// 按 chat 单独设置命令菜单：没权限的命令直接不出现（对齐网页端「侧栏看不到」）。
// 只在收到 /start、或命中无权限命令时调用，避免每条命令都打一次 Telegram API。
async function syncChatCommands(c, tgBotToken, chatId, userId) {
	try {
		const visible = [];
		for (const cmd of TG_COMMANDS) {
			if (await hasCommandPerm(c, cmd.command, userId)) visible.push(cmd);
		}
		await fetch(`https://api.telegram.org/bot${tgBotToken}/setMyCommands`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ commands: visible, scope: { type: 'chat', chat_id: chatId } })
		});
	} catch (e) {
		// 菜单设置失败不影响命令本身：此时退化为「菜单全显示，点了给无权限提示」
		console.warn('[telegram] 设置按聊天命令菜单失败:', e.message);
	}
}

// [S23] 非白名单 chat 的命令菜单必须是空的。
// 放行 /start 只是为了让普通用户能「关注」站点 bot（绑定前必需），不能顺带把命令清单递给他：
// 回复文案不列命令，同时把他的菜单设成空数组，点「菜单」什么都看不到。
async function clearChatCommands(c, tgBotToken, chatId) {
	try {
		await fetch(`https://api.telegram.org/bot${tgBotToken}/setMyCommands`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ commands: [], scope: { type: 'chat', chat_id: chatId } })
		});
	} catch (e) {
		console.warn('[telegram] 清空非白名单 chat 菜单失败:', e.message);
	}
}

// 邮件深链 token 不加过期时间：TG 聊天记录里的链接必须长期可用，
// 否则旧消息点开只剩 Access denied，得回去重新发命令拿新链接，属于体验倒退。
const telegramService = {

	// Telegram webhook 来源校验用 secret_token（Telegram 仅允许 A-Za-z0-9_-，1-256 字符）。
	// 由 jwt_secret + bot token 派生 SHA-256，避免新增数据库字段；
	// 注意：更换 jwt_secret 后必须重新调用 /api/telegram/setup，才能与 Telegram 侧重新对齐。
	async getWebhookSecret(c) {
		const { tgBotToken } = await settingService.query(c);
		if (!tgBotToken || !c.env.jwt_secret) return null;
		const data = new TextEncoder().encode(`tg-webhook:${c.env.jwt_secret}:${tgBotToken}`);
		const digest = await crypto.subtle.digest('SHA-256', data);
		return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
	},

	async getEmailContent(c, params) {

		const { token } = params

		const result = await jwtUtils.verifyToken(c, token);

		if (!result) {
			return emailTextTemplate('Access denied')
		}

		const emailRow = await orm(c).select().from(email).where(eq(email.emailId, result.emailId)).get();

		if (!emailRow) {
			return emailTextTemplate('The email does not exist')
		}

		// 归属校验：token 只是一张凭证，不能因为它有效就认为「谁都能看」。
		// 只放行两类：这封邮件的主人，以及无人收件（user_id=0 的系统级邮件）。
		// [S23] 以 token 里的 userId 为准（普通用户的推送深链带的是他自己）；
		// 旧 token 没有 userId，回退到「管理员」，兼容历史链接。
		const tokenUserId = result.userId != null ? Number(result.userId) : await getOwnerUserId(c);
		const isSystemMail = Number(emailRow.userId) === 0;
		if (!isSystemMail && Number(emailRow.userId) !== tokenUserId) {
			return emailTextTemplate('Access denied')
		}

		// 推算来源文件夹：优先用 token 携带的 folder（分组列表/更多页/推送已知），
		// 否则按邮件类型/删除状态兜底（旧 token 不含 folder 时仍可正确返回）
		let folder = result.folder;
		if (!folder) {
			if (emailRow.isDel === isDel.DELETE) folder = 'deleted';
			// 垃圾邮件必须单独识别：收件箱按 spam=0 过滤，
			// 兜底成 inbox 会让「返回列表」落回收件箱、看不到这封邮件。
			else if (Number(emailRow.spam) === 1) folder = 'spam';
			else if (emailRow.type === emailConst.type.SEND) folder = 'sent';
			else folder = 'inbox';
		}

		// 未读同步：TG 端打开即视为已读，网页端同步
		if (emailRow.unread === emailConst.unread.UNREAD) {
			await orm(c).update(email).set({ unread: emailConst.unread.READ }).where(eq(email.emailId, emailRow.emailId));
		}

		// 生成「返回邮件列表」链接：按 accountId + folder 签 token，正确返回所属账号+文件夹，不串号/串文件夹
		// 星标例外：它是全账号合并列表（不分账号），返回时必须带哨兵，否则会退化成只看某一账号的星标
		const { customDomain } = await settingService.query(c);
		const base = customDomain ? domainUtils.toOssDomain(customDomain) : '';
		let backUrl = '';
		try {
			const backAccountId = folder === 'star' ? STAR_ALL_ACCOUNTS : emailRow.accountId;
			// [S25] 必须带 userId：否则 getMoreEmails 回退成「管理员」，
			// 查询变成 email.user_id=管理员 AND account_id=普通用户账号 → 0 行，普通用户点「返回邮件列表」是空的。
			// 用邮件真实主人（无人收件是 0，folderWhere 对 noone 不拼 owner，不受影响）。
			const moreToken = await jwtUtils.generateToken(c, { gen: constant.AUTH_GEN, accountId: backAccountId, folder, userId: emailRow.userId });
			backUrl = cacheBust(`${base}/api/telegram/more/${moreToken}`);
		} catch (e) {
			console.warn('[telegram-getEmail] 生成返回列表 token 失败:', e.message);
		}

		// 软删除（已在回收站）的邮件：不渲染正文/附件，仅提示+跳转回收站链接
		if (emailRow.isDel === isDel.DELETE) {
			let spaUrl = '';
			try {
				const { customDomain } = await settingService.query(c);
				if (customDomain) {
					const spaToken = await telegramService.createSpaToken(c, emailRow.userId);
					if (spaToken) {
						// 直接指向回收站详情深链：前端 v3.4.0 起详情路由为 /:mailbox/messages；
					// folder=deleted 让内容页按 deleted=1 取已删除邮件详情（后端默认过滤掉已删除邮件）
					spaUrl = `${domainUtils.toOssDomain(customDomain)}/deleted/messages?emailId=${emailRow.emailId}&t=${encodeURIComponent(spaToken)}&folder=deleted`;
					}
				}
			} catch (e) {
				console.warn('[telegram-getEmail] 回收站邮件生成链接失败:', e.message);
			}
			const linkHtml = spaUrl
				? `<a href="${spaUrl}" target="_blank" rel="noopener noreferrer">点此在网页版回收站查看并恢复</a>`
				: '请在网页版回收站恢复后再查看';
			const backHtml = backUrl ? `<br><a href="${backUrl}">返回邮件列表</a>` : '';
			return `<!DOCTYPE html><html lang='zh-CN'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1.0'><style>body{box-sizing:border-box;margin:0;padding:16px 12px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#4E5969;word-break:break-word;background:#FFF}a{color:#0E70DF;text-decoration:none}</style></head><body>该邮件已在回收站，${linkHtml}${backHtml}</body></html>`;
		}

		if (emailRow.content) {
			const { r2Domain, customDomain } = await settingService.query(c);
			let attCount = 0;
			try {
				const attRows = await orm(c).select({ attId: att.attId }).from(att).where(
					and(
						eq(att.emailId, emailRow.emailId),
						eq(att.type, attConst.type.ATT),
						isNull(att.contentId)
					)
				).all();
				attCount = attRows.length;
			} catch (e) {
				console.warn('[telegram-getEmail] 查询附件数失败，按 0 处理:', e.message);
			}
			// 生成「网页版」免登录跳转链接（供有附件时查看/下载完整网页端）
			let spaUrl = '';
			try {
			if (customDomain) {
				const spaToken = await telegramService.createSpaToken(c, emailRow.userId);
				if (spaToken) {
					// 前端约定的来源标记（与 views/*/index.vue 里 contentData.fromFolder 取值一致）
					// 注意：这与上方 backUrl 用的 more 分页 folder（inbox/sent/deleted）是两套枚举，
					// 故单独命名 spaFolder，避免与外层 folder 同名遮蔽造成误改。
					let spaFolder = 'email';
					if (emailRow.isDel === 1) spaFolder = 'deleted';
					// 垃圾邮件（spam=1 且未删除）：单独映射到 /spam，否则会落到收件箱——
					// 而收件箱列表按 spam=0 过滤，返回后会看不到这封邮件、侧栏也高亮错。
					else if (Number(emailRow.spam) === 1) spaFolder = 'spam';
					else if (emailRow.type === 1) spaFolder = 'send';
					// 前端详情路由在 v3.4.0 已改为 /:mailbox/messages（旧 /mail 会落到 404），
					// mailbox 由来源标记映射；spaFolder 仍原样传递，供前端「返回」与侧边栏高亮
					const mailboxMap = { deleted: 'deleted', send: 'sent', email: 'inbox', spam: 'spam' };
					const mailbox = mailboxMap[spaFolder] || 'inbox';
					spaUrl = `${domainUtils.toOssDomain(customDomain)}/${mailbox}/messages?emailId=${emailRow.emailId}&t=${encodeURIComponent(spaToken)}&folder=${spaFolder}`;
				}
			}
			} catch (e) {
				console.warn('[telegram-getEmail] 生成网页版 token 失败:', e.message);
			}
			// [S41] 官方 v3.6.0：外链图改写成 /proxy?url=，避免暴露打开者 IP（我方参数顺序不变）
			const proxiedHtml = await proxyService.rewriteHtml(c, emailRow.content || '')
			return emailHtmlTemplate(proxiedHtml, r2Domain, attCount, token, spaUrl, backUrl)
		} else {
				const backHtml = backUrl ? `<br><a href="${backUrl}" style="color:#0E70DF;text-decoration:none;">返回邮件列表</a>` : '';
				return emailTextTemplate((emailRow.text || '') + backHtml)
			}

	},

	// 生成「网页版」免登录 token：签一个含 userId+session 的 JWT，并把 session uuid
	// 写入 KV auth-uid:{userId}.tokens，使 SPA 打开链接后自动通过 security 鉴权。
	async createSpaToken(c, userId) {
		const userRow = await userService.selectById(c, userId);
		if (!userRow) return null;

		const uuid = uuidv4();
		const jwt = await jwtUtils.generateToken(c, { gen: constant.AUTH_GEN, userId, token: uuid, spa: true });

		let authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		if (authInfo && authInfo.user && authInfo.user.email === userRow.email) {
			if (!Array.isArray(authInfo.tokens)) authInfo.tokens = [];
			if (authInfo.tokens.length > 10) authInfo.tokens.shift();
			authInfo.tokens.push(uuid);
		} else {
			authInfo = {
				tokens: [uuid],
				user: userRow,
				refreshTime: dayjs().toISOString()
			};
		}
		await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
		return jwt;
	},

	async sendEmailToBot(c, email) {

		const { tgBotToken, tgChatId, customDomain, tgMsgTo, tgMsgFrom, tgMsgText, tgBroadcast } = await settingService.query(c);

		// [S23] 「接收全站推送」开关：0 = 只推管理员本人名下账号的邮件（不是全都不推）。
		// 字段缺失（KV 仍是加列前的旧缓存）一律按 1（开）处理，否则升级瞬间会被误判成关闭。
		const broadcastOn = (tgBroadcast === undefined || tgBroadcast === null)
			? true
			: Number(tgBroadcast) === 1;
		if (!broadcastOn) {
			const adminUserId = await getOwnerUserId(c);
			if (!adminUserId || Number(email.userId) !== Number(adminUserId)) {
				return;
			}
		}

		// [S23] 空值保护：tgChatId 可能被清空（改为只用个人 bot），split('') 会得到 [''] 白跑请求
		const tgChatIds = String(tgChatId || '').split(',').map(s => s.trim()).filter(Boolean);
		if (!tgChatIds.length) {
			return;
		}

		// 推送消息的来源文件夹：决定「返回列表」退到哪儿，必须与实际所在列表一致。
		// 垃圾邮件单独处理 —— 收件箱按 spam=0 过滤，标成 inbox 会让用户返回后找不到这封邮件。
		let pushFolder;
		if (email.isDel === isDel.DELETE) pushFolder = 'deleted';
		else if (Number(email.spam) === 1) pushFolder = 'spam';
		else if (email.type === emailConst.type.SEND) pushFolder = 'sent';
		else pushFolder = 'inbox';
		const jwtToken = await jwtUtils.generateToken(c, { gen: constant.AUTH_GEN, emailId: email.emailId, folder: pushFolder })

		const webAppUrl = customDomain ? cacheBust(`${domainUtils.toOssDomain(customDomain)}/api/telegram/getEmail/${jwtToken}`) : 'https://www.cloudflare.com/404'
		const inlineKeyboard = [
			[
				{
					text: 'View',
					web_app: { url: webAppUrl }
				}
			]
		];
		// [S24] web_app 官方限私聊：tgChatId 里如果填了群（负数），web_app 会整条发送失败。
		// 这里留一份 url 版本作降级用，私聊仍走上面的 web_app（TG 内置打开）。
		const inlineKeyboardUrl = [[{ text: 'View', url: webAppUrl }]];

		let bodyImgCount = 0;
		let attCount = 0;
		try {
			// 正文图：内联附件（content_id 非空）且为图片。
			// 外部直链头像/logo/跟踪像素等不会存进 attachments 表（att-service.js 仅转换 data:/OSS/attachments 链接），天然排除，避免被误算进正文图。
			const inlineRows = await orm(c).select({ mimeType: att.mimeType }).from(att).where(
				and(
					eq(att.emailId, email.emailId),
					isNotNull(att.contentId),
					like(att.mimeType, 'image/%')
				)
			).all();
			bodyImgCount = inlineRows.length;

			// 附件：普通附件（content_id 为空），统计全部类型，不区分图片与否（与网页版「共 X 个」一致）。
			const attRows = await orm(c).select({ mimeType: att.mimeType, filename: att.filename }).from(att).where(
				and(
					eq(att.emailId, email.emailId),
					isNull(att.contentId)
				)
			).all();
			attCount = attRows.length;
		} catch (e) {
			console.warn('[telegram] 计算附件数失败，按 0 处理:', e.message);
		}

		if (email.code) {
			const codeBtn = [
				{
					text: email.code,
					copy_text: { text: email.code }
				}
			];
			inlineKeyboard.push(codeBtn);
			// [S24] 降级用的 url 键盘同样要带验证码按钮
			inlineKeyboardUrl.push([{ text: email.code, copy_text: { text: email.code } }]);
		}

		await Promise.all(tgChatIds.map(async chatId => {
			try {
				// [S24] 抽出 post：发送失败（典型是目标填了群，web_app 不受支持）时，改用 url 键盘重发一次，
				// 避免整条通知丢失。私聊仍然走 web_app，行为与官方原版完全一致。
				const post = keyboard => fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						chat_id: chatId,
						parse_mode: 'HTML',
						text: emailMsgTemplate(email, tgMsgTo, tgMsgFrom, tgMsgText, bodyImgCount, attCount),
						reply_markup: {
							inline_keyboard: keyboard
						}
					})
				});
				let res = await post(inlineKeyboard);
				if (!res.ok) {
					console.error(`转发 Telegram 失败 status: ${res.status} response: ${await res.text()}`);
					res = await post(inlineKeyboardUrl);
					if (!res.ok) {
						console.error(`转发 Telegram 降级 url 仍失败 status: ${res.status} response: ${await res.text()}`);
					}
				}
			} catch (e) {
				console.error(`转发 Telegram 失败:`, e.message);
			}
		}));

	},

	async replyEmail(c, token, content) {
		const result = await jwtUtils.verifyToken(c, token);
		if (!result) {
			return { error: 'Access denied' };
		}

		const emailRow = await orm(c).select().from(email).where(eq(email.emailId, result.emailId)).get();
		if (!emailRow) {
			return { error: '邮件不存在' };
		}

		// 归属校验：回信会以邮件主人的身份发出，必须确认这封邮件属于持链接的人，
		// 否则拿到链接就能替别人发信（无人收件的系统邮件无真实账号，不允许回复）。
		// [S23] 同样以 token 里的 userId 为准；旧 token 无 userId 时回退到管理员。
		const tokenUserId = result.userId != null ? Number(result.userId) : await getOwnerUserId(c);
		const isSystemMail = Number(emailRow.userId) === 0;
		if (isSystemMail || Number(emailRow.userId) !== tokenUserId) {
			return { error: 'Access denied' };
		}

		// 软删除（已在回收站）的邮件：禁止回复
		if (emailRow.isDel === isDel.DELETE) {
			return { error: '该邮件已在回收站，请在回收站恢复后再回复' };
		}

		let subject = emailRow.subject || '';
		if (!/^re:/i.test(subject)) {
			subject = 'Re: ' + subject;
		}

		const params = {
			accountId: emailRow.accountId,
			userId: emailRow.userId,
			sendType: 'reply',
			emailId: emailRow.emailId,
			receiveEmail: [emailRow.sendEmail],
			subject,
			text: content,
			content: content.replace(/\n/g, '<br>'),
			attachments: []
		};

		try {
			const sent = await emailService.send(c, params, emailRow.userId);
			return { emailId: sent[0]?.emailId };
		} catch (e) {
			return { error: e.message || '发送失败' };
		}

	},

	// 设置 Telegram 机器人菜单：
	// 1) setMyCommands —— 8 个命令（开始/收件箱/已发送/回收站/星标邮件/垃圾邮件/无人收件/网页版）
	// 2) setChatMenuButton —— 底部「菜单」按钮（type=commands，点击弹出命令列表）
	// 3) setWebhook —— 注册 webhook URL，使 bot 能接收用户消息并回复 InlineKeyboard
	async setupTelegramMenu(c) {
		const { tgBotToken, customDomain, tgChatId } = await settingService.query(c);
		if (!tgBotToken) {
			return { error: '未配置 Telegram Bot Token，无法设置菜单' };
		}

		const webhookUrl = customDomain
			? `${domainUtils.toOssDomain(customDomain)}/api/telegram/webhook`
			: null;

		// 命令清单集中在文件顶部 TG_COMMANDS，避免与「按 chat 隐藏无权限命令」两处漂移
		const commands = TG_COMMANDS;

		const results = {};
		try {
			const cmdRes = await fetch(`https://api.telegram.org/bot${tgBotToken}/setMyCommands`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ commands })
			});
			results.commands = await cmdRes.json();
		} catch (e) {
			results.commandsError = e.message;
		}

		try {
			const btnRes = await fetch(`https://api.telegram.org/bot${tgBotToken}/setChatMenuButton`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					menu_button: { type: 'commands', text: '菜单' }
				})
			});
			results.menuButton = await btnRes.json();
		} catch (e) {
			results.menuButtonError = e.message;
		}

		if (webhookUrl && tgChatId) {
			try {
				// secret_token：Telegram 之后每次回调都会带上 X-Telegram-Bot-Api-Secret-Token 头，
				// 后端比对一致才处理，避免任何人伪造 webhook 请求体驱动机器人。
				const secretToken = await this.getWebhookSecret(c);
				const whRes = await fetch(`https://api.telegram.org/bot${tgBotToken}/setWebhook`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						url: webhookUrl,
						allowed_updates: ['message'],
						...(secretToken ? { secret_token: secretToken } : {})
					})
				});
				results.webhook = await whRes.json();
				results.webhookSecretSet = !!secretToken;
			} catch (e) {
				results.webhookError = e.message;
			}
		}

		return { success: true, webhookUrl, results };
	},

	renderPanelHtml(items, title = '邮件', pager = '') {
		const list = items.map(({ row, url }) => `
			<div style="padding:12px 0;border-bottom:1px solid #eee;">
				<a href="${url}" style="font-weight:600;color:#0E70DF;text-decoration:none;">${escapeHtml(row.subject || '(无主题)')}</a>
				${!row.unread ? '<span style="color:#f53f3f;font-size:12px;margin-left:6px;">未读</span>' : ''}
				<div style="color:#86909c;font-size:12px;margin-top:4px;">${escapeHtml(row.name || '')} &lt;${escapeHtml(row.sendEmail || '')}&gt; · ${escapeHtml(tgTimeStr(row.createTime))}</div>
			</div>
		`).join('');

		const pagerHtml = pager ? `<div style="position:sticky;bottom:0;background:#FFF;border-top:1px solid #eee;padding:12px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:14px;">${pager}</div>` : '';

		return `<!DOCTYPE html><html lang='zh-CN'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1.0'><title>${escapeHtml(title)}</title></head><body style="box-sizing:border-box;margin:0;padding:16px 12px 56px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#4E5969;background:#FFF;">${list || '<p style="color:#86909c;">暂无邮件</p>'}${pagerHtml}</body></html>`;
	},

	// 构造底部分页导航：上一页 / 下一页（web_app 内用 <a> 跳转，page 走 URL 参数）
	buildPager(base, token, page, hasPrev, hasNext) {
		const tokenUrl = `${base}/api/telegram/more/${token}`;
		const parts = [];
		if (hasPrev) parts.push(`<a href="${tokenUrl}?page=${page - 1}&_t=${Date.now()}" style="color:#0E70DF;text-decoration:none;padding:6px 14px;border:1px solid #eee;border-radius:6px;">‹ 上一页</a>`);
		if (hasNext) parts.push(`<a href="${tokenUrl}?page=${page + 1}&_t=${Date.now()}" style="color:#0E70DF;text-decoration:none;padding:6px 14px;border:1px solid #eee;border-radius:6px;">下一页 ›</a>`);
		return parts.join(' ');
	},

	// 文件夹标题（命令 → 分组展示用）
	FOLDER_TITLE: {
		inbox: '📥 收件箱',
		sent: '✈️ 已发送',
		deleted: '🗑️ 回收站',
		star: '⭐ 星标邮件',
		spam: '🚫 垃圾邮件',
		noone: '📭 无人收件'
	},

	// 构造某文件夹的 where 条件（不含 accountId）；star 走 join 不在内
	// userId：邮件归属用户。除「无人收件」外一律按此过滤，
	// 与网页端一致 —— 网页端每个列表都以登录用户为范围，TG 侧就以管理员为范围。
	// 「无人收件」例外：这类邮件入库时 user_id=0（系统级），没有归属用户，
	// 网页端也是在管理端「全部邮件」里看全站，加过滤会让它永远为空。
	folderWhere(folder, e, userId) {
		const c = [];
		const owner = userId == null ? undefined : eq(e.userId, userId);
		// 与网页端 emailListFilters 对齐：收件箱/已发送只取未删除邮件，仅「回收站」取 isDel=1。
		// 否则回收站里的已发送邮件会混进 TG 的已发送列表（点开只会显示「已在回收站」）。
		if (folder === 'inbox') { c.push(owner, eq(e.type, 0), eq(e.isDel, 0), eq(e.spam, 0)); }
		else if (folder === 'sent') { c.push(owner, eq(e.type, 1), eq(e.isDel, 0)); }
		else if (folder === 'deleted') { c.push(owner, eq(e.isDel, 1)); }
		// 垃圾邮件：与网页端 spam 列表一致（只收 type=0 的收件、未删除、spam=1）
		else if (folder === 'spam') { c.push(owner, eq(e.type, 0), eq(e.isDel, 0), eq(e.spam, 1)); }
		// 无人收件：与网页端 allEmailListFilters 的 type='noone' 一致（status=NOONE 且未删除），刻意不加 owner
		else if (folder === 'noone') { c.push(eq(e.isDel, 0), eq(e.status, emailConst.status.NOONE)); }
		return c.filter(Boolean);
	},

	// 取某文件夹下出现过的全部 accountId（去重）
	// 额外排除已删除的邮箱账号，与网页端 emailListFilters 里的 account.isDel 过滤保持一致
	async getFolderAccountIds(c, folder, userId) {
		const e = email;
		// 无人收件特例：这类邮件入库时 account_id = 0 / user_id = 0（见 email.js 的
		// 「account ? account.userId : 0」），account 表里没有 accountId=0 的行。
		// 若走下面的常规去重 + account 表过滤，会被刷成空数组、误报「暂无邮件」，
		// 因此固定返回单组 0，消息标题也按「无人收件」而不是「账号#0」显示。
		if (folder === 'noone') {
			const cond = this.folderWhere(folder, e, userId);
			const row = await orm(c).select({ emailId: e.emailId }).from(e).where(and(...cond)).limit(1).get();
			return row ? [0] : [];
		}
		let accountIds;
		if (folder === 'star') {
			// 星标：网页端是「按用户汇总」的单一列表，不按账号拆分。
			// 这里只判断「有没有星标邮件」，有则返回一个哨兵分组（全账号合并），
			// 不再返回各账号 —— 否则有 2 个账号带星就会发 2 条消息，与网页端不一致。
			// 星标行本身带 userId，必须按 userId 取，否则会把别人的星标也算进来。
			const starRows = await orm(c).select({ emailId: star.emailId }).from(star)
				.where(userId == null ? undefined : eq(star.userId, userId)).all();
			if (!starRows.length) return [];
			const ids = starRows.map(r => r.emailId);
			// 与 star-service.list 对齐：未删除 + 非垃圾才进星标列表
			const row = await orm(c).select({ emailId: e.emailId }).from(e).where(
				and(inArray(e.emailId, ids), eq(e.isDel, isDel.NORMAL), eq(e.spam, 0))
			).limit(1).get();
			return row ? [STAR_ALL_ACCOUNTS] : [];
		}

		const cond = this.folderWhere(folder, e, userId);
		const rows = await orm(c).selectDistinct({ accountId: e.accountId }).from(e).where(cond.length ? and(...cond) : undefined).all();
		accountIds = rows.map(r => r.accountId);

		if (!accountIds.length) return [];
		const accRows = await orm(c).select({ accountId: account.accountId }).from(account).where(
			and(inArray(account.accountId, accountIds), eq(account.isDel, isDel.NORMAL))
		).all();
		return accRows.map(r => r.accountId);
	},

	// 取某账号某文件夹的邮件（limit + offset 控制分页）
	// accountId 传 STAR_ALL_ACCOUNTS（仅星标）时表示不分账号、全账号合并取数
	async getFolderRows(c, folder, accountId, limit, offset = 0, userId) {
		const e = email;
		if (folder === 'star') {
			const starRows = await orm(c).select({ emailId: star.emailId }).from(star)
				.where(userId == null ? undefined : eq(star.userId, userId))
				.orderBy(desc(star.createTime)).all();
			if (!starRows.length) return [];
			const ids = starRows.map(r => r.emailId);
			// 星标同样只看未删除邮件（网页端 star-service.list 也过滤 isDel=NORMAL + spam=0）
			// accountId 为哨兵时不加账号条件，实现全账号合并
			return await orm(c).select().from(e).where(
				and(
					inArray(e.emailId, ids),
					accountId === STAR_ALL_ACCOUNTS ? undefined : eq(e.accountId, accountId),
					eq(e.isDel, isDel.NORMAL),
					eq(e.spam, 0)
				)
			).orderBy(desc(e.emailId)).limit(limit).offset(offset).all();
		}
		const cond = this.folderWhere(folder, e, userId);
		cond.push(eq(e.accountId, accountId));
		return await orm(c).select().from(e).where(and(...cond)).orderBy(desc(e.emailId)).limit(limit).offset(offset).all();
	},

	// Webhook 消息处理：解析用户命令 → 按账号分组 → 每账号一条消息（最多3封 + 更多）
	async handleIncomingMessage(c, body) {
		const msg = body.message;
		if (!msg || !msg.text) return;

		const { tgBotToken, tgChatId, customDomain } = await settingService.query(c);
		if (!tgBotToken || !tgChatId) return;

		const text = msg.text.trim().toLowerCase();
		const chatId = String(msg.chat?.id || tgChatId.split(',')[0]);

		// 安全校验：只响应后台已配置的 Telegram chat（白名单）。
		// 否则任何知道机器人用户名的人私聊发命令，都能拿到全部邮件列表与免登链接。
		const allowChatIds = String(tgChatId).split(',').map(s => s.trim()).filter(Boolean);
		const isAllowedChat = allowChatIds.includes(chatId);

		// [S31] 兼容深链与群组写法：t.me/xxx?start=abc 进来 text 是 `/start abc`，
		// 群里是 `/start@YourBot`，都算「给站点 bot 发过 /start」，都要进群发名单
		const isStartCmd = text === '/start' || text.startsWith('/start ') || text.startsWith('/start@');

		// [S23] 非白名单 chat 只放行 /start：它是「关注站点 bot」的唯一入口，也是普通用户绑定
		// 自己通知的前置条件。回复只给一句确认，不列任何命令，同时把该 chat 的菜单清空。
		// 其余命令一律照旧拒绝 —— 「谁能查邮件」这条安全边界完全不变。
		if (!isAllowedChat) {
			if (isStartCmd) {
				await notifyBindService.recordFollow(c, chatId);
				await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						chat_id: chatId,
						text: '✅ 已关注。此机器人只会向这个会话推送通知，邮箱内容请在网页版查看。'
					})
				});
				await clearChatCommands(c, tgBotToken, chatId);
			} else {
				await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ chat_id: chatId, text: '⛔ 未授权：此机器人仅对已配置的账号开放。' })
				});
			}
			return;
		}

		// /start → 返回使用说明（纯文案，不查任何邮件，放在归属校验之前，
		// 避免管理员账号异常时连帮助都看不了）
		if (isStartCmd) {
			// 帮助文案本身不查邮件，但顺手按权限刷新该 chat 的命令菜单（无权限的命令不显示）；
			// 归属用户取不到就跳过菜单，帮助仍照常返回，不让菜单问题拖累 /start。
			const startUserId = await getOwnerUserId(c);
			// [S31] 白名单 chat 发 /start 也进群发名单（非白名单分支早有记录），
			// 让「发过 /start 就收公告」覆盖全部 chat，不再只限绑定过通知的用户。
			// recordFollow 内部已 try/catch，失败只记日志，不影响帮助返回。
			await notifyBindService.recordFollow(c, chatId, startUserId);
			await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					chat_id: chatId,
					text: '📬 邮箱助手\n\n可用命令：\n/start — 邮箱使用助手\n/inbox — 收件箱（按账号分组查看各账号最新邮件）\n/sent — 已发送（按账号分组查看各账号已发送邮件）\n/deleted — 回收站（按账号分组查看各账号回收站邮件）\n/star — 星标邮件（汇总所有邮箱账号的星标邮件）\n/spam — 垃圾邮件（按账号分组查看各账号垃圾邮件）\n/noone — 无人收件（未匹配到已注册邮箱的来信）\n/webmail — 网页版邮箱首页（完整功能，外置浏览器打开）\n\n点击底部「菜单」按钮也可查看命令列表。'
				})
			});
			// 消息发完再刷菜单：即使 setMyCommands 失败或变慢，帮助照常到达
			if (startUserId) await syncChatCommands(c, tgBotToken, chatId, startUserId);
			return;
		}

		// 机器人视角的归属用户：所有列表都以它为范围，取不到就明确报错。
		// 不能悄悄降级成「不过滤」—— 那样就退回到「能看全站邮件」的老问题。
		const ownerUserId = await getOwnerUserId(c);
		if (!ownerUserId) {
			await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chat_id: chatId, text: '未找到管理员账号，无法确定邮件范围。请检查「系统设置 → 基础设置」中的管理员邮箱是否与已注册账号一致。' })
			});
			return;
		}

		// /webmail → 生成带登录凭证的网页版邮箱首页链接（url 按钮，外置浏览器打开，完整功能）
		if (text === '/webmail') {
			if (!customDomain) {
				await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ chat_id: chatId, text: '未配置自定义域名，无法生成网页版邮箱链接。请在「系统设置 → 基础设置」中配置域名。' })
				});
				return;
			}
			// 必须用归属用户签凭证。原先取「账号表第一条」的 userId，既没排序也没过滤，
			// 一旦第一条账号不属于管理员，点开链接就是直接登进别人的账号。
			const userId = ownerUserId;
			const spaToken = await this.createSpaToken(c, userId);
			if (!spaToken) {
				await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ chat_id: chatId, text: '生成登录凭证失败，请稍后重试。' })
				});
				return;
			}
			const spaUrl = `${domainUtils.toOssDomain(customDomain)}/?t=${encodeURIComponent(spaToken)}`;
			await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					chat_id: chatId,
					text: '网页版邮箱（完整功能，外置浏览器打开）：',
					reply_markup: {
						inline_keyboard: [[{ text: '打开网页版邮箱', url: spaUrl }]]
					}
				})
			});
			return;
		}

		const folderMap = { '/inbox': 'inbox', '/sent': 'sent', '/deleted': 'deleted', '/star': 'star', '/spam': 'spam', '/noone': 'noone' };
		const folder = folderMap[text];
		if (!folder) return; // 不认识的命令，不回复

		// 权限对齐网页端（集中表见文件顶部 COMMAND_PERMS）：
		// 网页端侧栏看不到的入口，TG 同样不给数据。没权限直接提示，不进入查询逻辑。
		if (!await hasCommandPerm(c, folder, ownerUserId)) {
			await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chat_id: chatId, text: '该功能仅限管理员查看。' })
			});
			// 顺手把该 chat 的菜单刷成「只剩有权限的命令」，以后点菜单就看不到它了
			await syncChatCommands(c, tgBotToken, chatId, ownerUserId);
			return;
		}

		// /noone → 「无人收件」开关关闭（1=关闭）时页面入口都不显示，这里先提示，避免误以为没邮件
		if (folder === 'noone') {
			const { noRecipient } = await settingService.query(c);
			if (Number(noRecipient) !== settingConst.noRecipient.OPEN) {
				await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ chat_id: chatId, text: '「无人收件」当前已关闭（命中不存在邮箱的来信会被拒收），请在「系统设置 → 基础设置」中开启后再试。' })
				});
				return;
			}
		}

		try {
			const base = customDomain ? domainUtils.toOssDomain(customDomain) : '';
			const title = this.FOLDER_TITLE[folder];
			const accountIds = await this.getFolderAccountIds(c, folder, ownerUserId);

			if (!accountIds.length) {
				await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ chat_id: chatId, text: `${title}（暂无邮件）` })
				});
				return;
			}

			for (const accountId of accountIds) {
				// 星标是「全账号合并」的单一列表，没有单一账号可显示；无人收件同理（无真实账号）
				const merged = folder === 'star' || folder === 'noone';
				const acc = merged ? null : await orm(c).select().from(account).where(eq(account.accountId, accountId)).get();
				const accLabel = merged ? '' : (acc?.email || `账号#${accountId}`);

				// 取 4 封：前 3 展示，第 4 存在则说明还有更多
				const rows = await this.getFolderRows(c, folder, accountId, 4, 0, ownerUserId);
				const show = rows.slice(0, 3);
				const hasMore = rows.length > 3;

				const keyboard = [];
				for (const row of show) {
					const jwtToken = await jwtUtils.generateToken(c, { gen: constant.AUTH_GEN, emailId: row.emailId, folder, userId: ownerUserId }); // [S25] 同 backUrl，带上归属避免回退成管理员
					const url = cacheBust(`${base}/api/telegram/getEmail/${jwtToken}`);
					const label = (row.subject || '(无主题)').slice(0, 28);
					keyboard.push([{ text: `${!row.unread ? '🔴 ' : ''}${label}`, web_app: { url } }]);
				}

				if (hasMore) {
					const moreToken = await jwtUtils.generateToken(c, { gen: constant.AUTH_GEN, accountId, folder, userId: ownerUserId }); // [S25] 同上
					const moreUrl = cacheBust(`${base}/api/telegram/more/${moreToken}`);
					keyboard.push([{ text: merged ? '查看全部 ›' : `查看 ${accLabel} 更多 ›`, web_app: { url: moreUrl } }]);
				}

				await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						chat_id: chatId,
						// 星标/无人收件不分账号，标题已含文件夹名，再拼账号会变成「📭 无人收件 · 无人收件」
						text: merged ? title : `${title} · ${accLabel}`,
						reply_markup: { inline_keyboard: keyboard }
					})
				});
			}
		} catch (e) {
			console.error('[telegram-webhook] 处理失败:', e.message);
		}
	},

	// 「更多」页面：按 accountId + folder 分页渲染该账号该文件夹邮件（web_app 打开）
	// 页码从 URL ?page=N 读取（token 只含 accountId+folder），每页 20 封。
	// 用「多查 1 条」判断是否还有下一页，免 count 查询。
	async getMoreEmails(c, params) {
		const { token } = params;
		const result = await jwtUtils.verifyToken(c, token);
		if (!result || result.accountId == null || !result.folder) {
			return emailTextTemplate('Access denied');
		}

		const { customDomain } = await settingService.query(c);
		const base = customDomain ? domainUtils.toOssDomain(customDomain) : '';
		const PAGE_SIZE = 20;
		const page = Math.max(1, parseInt(c.req.query('page')) || 1);
		const offset = (page - 1) * PAGE_SIZE;

		// [S23] 视图归属以 token 里的 userId 为准（普通用户的深链带他自己），旧 token 回退到管理员
		const viewUserId = result.userId != null ? Number(result.userId) : await getOwnerUserId(c);

		const rows = await this.getFolderRows(c, result.folder, result.accountId, PAGE_SIZE + 1, offset, viewUserId);
		const hasNext = rows.length > PAGE_SIZE;
		const show = rows.slice(0, PAGE_SIZE);

		// 星标为全账号合并（token 带哨兵）、无人收件无真实账号（accountId=0），两者都不显示账号名
		const merged = result.folder === 'star' || result.folder === 'noone';
		const acc = merged ? null : await orm(c).select().from(account).where(eq(account.accountId, result.accountId)).get();
		const accLabel = acc?.email || `账号#${result.accountId}`;
		const title = this.FOLDER_TITLE[result.folder] || '邮件';

		const items = [];
		for (const row of show) {
			const jwtToken = await jwtUtils.generateToken(c, { gen: constant.AUTH_GEN, emailId: row.emailId, folder: result.folder, userId: viewUserId });
			items.push({ row, url: cacheBust(`${base}/api/telegram/getEmail/${jwtToken}`) });
		}
		const hasPrev = page > 1;
		const pager = (hasPrev || hasNext) ? this.buildPager(base, token, page, hasPrev, hasNext) : '';
		const titleText = merged
			? `${title}（第 ${page} 页）`
			: `${title} · ${accLabel}（第 ${page} 页）`;
		return this.renderPanelHtml(items, titleText, pager);
	},

	// [S32] 把「命令清单 / 权限判定 / 按 chat 设菜单」暴露给用户自己的 bot（telegram-user-service）复用：
	// 规则仍然只存在这一处（TG_COMMANDS + COMMAND_PERMS），用户 bot 的菜单与站点 bot 永远不会漂移。
	// 只是把模块内函数挂到导出对象上，不改动任何现有实现。
	TG_COMMANDS,
	hasCommandPerm,
	syncChatCommands

}

export default telegramService
