import orm from '../entity/orm';
import { notifyBind, notifyFollow } from '../entity/notify-bind';
import user from '../entity/user';
import { att } from '../entity/att';
import settingService from './setting-service';
import BizError from '../error/biz-error';
import { and, eq, isNull, isNotNull, like, desc } from 'drizzle-orm';
import { isDel, emailConst, userConst } from '../const/entity-const';
import constant from '../const/constant';
import jwtUtils from '../utils/jwt-utils';
import domainUtils from '../utils/domain-uitls';
import emailMsgTemplate from '../template/email-msg';
import { localTimeStr } from '../utils/date-uitil'; // [S48] 公告署名按站点时区展示

// [S23] 自研：用户自己的 Telegram 通知
// 一个用户可以用自己的 bot 收自己名下账号的新邮件；与官方那套（tgChatId 广播）互不影响。
// 安全约束：token 加密存库、接口只按登录 userId 读写、推送目标只从表里取、chat 全局唯一。

const CHANNEL = 'telegram';
// Telegram bot token 形如 123456789:AAxxxx...（冒号前是 bot id，后面 35 位左右）
const TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,64}$/;
// Chat ID：私聊是纯数字（用户 id），群组/频道是负号开头
const CHAT_RE = /^-?\d{5,20}$/;

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ------------------------------------------------------------------ *
 * 一、token 加解密（AES-GCM，密钥由 jwt_secret 派生）
 * 明文只在内存里出现：入库前加密、发消息前解密，接口永不返回。
 * ------------------------------------------------------------------ */

let cachedKey = null;
let cachedSecret = null;

async function getKey(c) {
	const secret = String(c.env.jwt_secret || 'cloud-mail');
	if (cachedKey && cachedSecret === secret) return cachedKey;
	const material = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
	cachedKey = await crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt: enc.encode('cloud-mail/notify-bind'), iterations: 50000, hash: 'SHA-256' },
		material,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
	cachedSecret = secret;
	return cachedKey;
}

async function encryptToken(c, token) {
	const key = await getKey(c);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(token));
	const buf = new Uint8Array(iv.length + cipher.byteLength);
	buf.set(iv, 0);
	buf.set(new Uint8Array(cipher), iv.length);
	return btoa(String.fromCharCode(...buf));
}

async function decryptToken(c, cipherText) {
	if (!cipherText) return null;
	const raw = Uint8Array.from(atob(cipherText), ch => ch.charCodeAt(0));
	const iv = raw.slice(0, 12);
	const data = raw.slice(12);
	const key = await getKey(c);
	const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
	return dec.decode(plain);
}

/* ------------------------------------------------------------------ *
 * 二、Telegram Bot API 封装
 * ------------------------------------------------------------------ */

async function tgApi(token, method, payload) {
	try {
		const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload || {})
		});
		let body = null;
		try {
			body = await res.json();
		} catch (e) {
			body = null;
		}
		return { ok: res.ok && body?.ok === true, status: res.status, body };
	} catch (e) {
		return { ok: false, status: 0, body: { description: e.message } };
	}
}

// [S23] 不再用 getUpdates 猜 chat_id：bot 是公开的，谁最后给它发消息就可能被误认成「主人」，
// 那样别人的 chat 会被绑上、邮件反而推给别人。改为和官方系统设置一致 —— 用户自己填 chat_id，
// 再用他自己的 token 给这个 chat 发一条测试消息：发得出去 = token 与 chat 确实对得上。

/* ------------------------------------------------------------------ *
 * 三、推送消息构建（与官方格式一致，按钮用 url）
 * ------------------------------------------------------------------ */

async function buildPushPayload(c, emailRow) {
	const setting = await settingService.query(c);
	const { customDomain, tgMsgTo, tgMsgFrom, tgMsgText } = setting;

	// 来源文件夹决定「返回列表」落在哪：顺序沿用 B21 的 deleted → spam → sent → inbox，
	// 否则垃圾邮件会被标成 inbox，点返回就找不到那封（历史坑，不能简化）。
	let pushFolder;
	if (Number(emailRow.isDel) === isDel.DELETE) pushFolder = 'deleted';
	else if (Number(emailRow.spam) === 1) pushFolder = 'spam';
	else if (Number(emailRow.type) === emailConst.type.SEND) pushFolder = 'sent';
	else pushFolder = 'inbox';

	// 深链 token 带 userId：普通用户点开时按「邮件属于谁」校验，而不是按管理员
	const token = await jwtUtils.generateToken(c, { gen: constant.AUTH_GEN,
		emailId: emailRow.emailId,
		folder: pushFolder,
		userId: emailRow.userId
	});

	const base = customDomain ? domainUtils.toOssDomain(customDomain) : '';
	const url = base
		? `${base}/api/telegram/getEmail/${token}${base.includes('?') ? '&' : '?'}_t=${Date.now()}`
		: 'https://www.cloudflare.com/404';

	// [S24] 与系统设置那条推送保持一致：用 web_app 按钮在 Telegram 内置窗口打开，不跳外部浏览器。
	// 内联键盘的 web_app 只要求「HTTPS + 私聊」，并不需要用户去 @BotFather 配 /setdomain。
	// 唯一的例外是群聊（官方限私聊），所以另存一份 url 版本，发送失败时由 pushToUser 自动降级。
	const inlineKeyboard = [[{ text: 'View', web_app: { url } }]];
	const inlineKeyboardUrl = [[{ text: 'View', url }]];

	let bodyImgCount = 0;
	let attCount = 0;
	try {
		const inlineRows = await orm(c).select({ mimeType: att.mimeType }).from(att).where(
			and(eq(att.emailId, emailRow.emailId), isNotNull(att.contentId), like(att.mimeType, 'image/%'))
		).all();
		bodyImgCount = inlineRows.length;

		const attRows = await orm(c).select({ mimeType: att.mimeType }).from(att).where(
			and(eq(att.emailId, emailRow.emailId), isNull(att.contentId))
		).all();
		attCount = attRows.length;
	} catch (e) {
		console.warn('[notify] 计算附件数失败，按 0 处理:', e.message);
	}

	const text = emailMsgTemplate(emailRow, tgMsgTo, tgMsgFrom, tgMsgText, bodyImgCount, attCount);
	if (emailRow.code) {
		// 两套键盘都要带上验证码按钮（各用独立数组，避免 push 时共用一个引用）
		inlineKeyboard.push([{ text: emailRow.code, copy_text: { text: emailRow.code } }]);
		inlineKeyboardUrl.push([{ text: emailRow.code, copy_text: { text: emailRow.code } }]);
	}

	return { text, inline_keyboard: inlineKeyboard, inline_keyboard_url: inlineKeyboardUrl };
}

/* ------------------------------------------------------------------ */

const notifyBindService = {

	// 我的绑定列表（不返回 token，只回显 @用户名与 chat）
	async list(c, userId) {
		return await orm(c).select({
			bindId: notifyBind.bindId,
			channel: notifyBind.channel,
			botUsername: notifyBind.botUsername,
			target: notifyBind.target,
			enabled: notifyBind.enabled,
			// [S28] 失效原因回显给前端（「已失效：bot was blocked」），否则用户只看到「已停用」不知道为什么
			failCount: notifyBind.failCount,
			lastError: notifyBind.lastError,
			lastFailTime: notifyBind.lastFailTime,
			// [S32] 「Bot 查询命令」安装状态（卡片显示 未安装/已安装、安装时间、最后使用）
			cmdInstalled: notifyBind.cmdInstalled,
			cmdInstallTime: notifyBind.cmdInstallTime,
			cmdLastUsed: notifyBind.cmdLastUsed,
			createTime: notifyBind.createTime
		}).from(notifyBind)
			.where(and(eq(notifyBind.userId, userId), eq(notifyBind.channel, CHANNEL)))
			.orderBy(desc(notifyBind.bindId))
			.all();
	},

	// 站点 bot 的 @用户名（关注指引用）。取不到返回空串，不阻断页面。
	async siteBot(c) {
		const cached = c.get?.('notifySiteBot');
		if (cached !== undefined) return cached;
		let username = '';
		try {
			const { tgBotToken } = await settingService.query(c);
			if (tgBotToken) {
				const r = await tgApi(tgBotToken, 'getMe');
				if (r.ok) username = r.body?.result?.username || '';
			}
		} catch (e) {
			console.warn('[notify] 获取站点机器人信息失败:', e.message);
		}
		c.set?.('notifySiteBot', username);
		return username;
	},

	// [S29] 每个用户最多能绑几个（系统设置决定，0 或缺字段 = 不限制）
	async bindLimit(c) {
		try {
			const { notifyBindLimit } = await settingService.query(c);
			const n = Number(notifyBindLimit);
			return Number.isFinite(n) && n > 0 ? n : 0;
		} catch (e) {
			// 读不到设置就按「不限制」处理，绝不能因为读配置失败把用户挡在门外
			return 0;
		}
	},

	// 保存绑定：token 与 chat_id 都由用户自己填（和官方系统设置一个思路），两条硬校验都过才入库：
	// ① 站点 bot 能给它发的 chat 发消息 → 说明确实关注过管理员机器人；
	// ② 用户自己的 token 能给这个 chat 发消息 → 说明 token 与 chat 确实对得上（填别人的 chat 会发不出去）。

	// 校验 token 形状
	checkToken(token) {
		if (!TOKEN_RE.test(token)) {
			throw new BizError('机器人 token 格式不对。它应该形如 123456789:AA...（在 @BotFather 里获取）');
		}
		// [S32] 禁止把站点机器人自己的 token 绑进来：拿到站点 token 的人可以改它的 webhook，
		// 截获全站推送、顶掉管理员配置 —— 这条边界必须堵死。
		// （异步取 setting，所以 checkBinding 是 async；保存/编辑两条路都经过这里。）
	},

	// 校验 chat_id 形状。[S26] 群组/频道一律拒绝，见下。
	checkChatId(chatId) {
		if (!CHAT_RE.test(chatId)) {
			throw new BizError('Chat ID 格式不对。它是一串数字，可在 Telegram 里搜索 @userinfobot 查询');
		}
		// [S26] 只支持私聊：群组/频道（chat_id 为负）过不了「必须关注站点 bot」这一关
		// （群里没有"关注"这回事，站点 bot 不在群里就发不出去），而且邮件正文与验证码会被整个群看到。
		// 用户想把自己 bot 拉进群是他的自由，但本功能只承载私聊通知，这里直接拒绝并说清原因。
		if (chatId.startsWith('-')) {
			throw new BizError('目前只支持私聊：请填写你自己的数字 Chat ID（不是群组/频道的负数 ID）。群和频道会把邮件内容和验证码暴露给全部成员');
		}
	},

	// [S27] save / update 共用的完整校验链，保证「新建」和「编辑」两条路径一模一样。
	// excludeBindId：编辑时排除自己，否则「这个 Chat 已经绑定过了」会把原记录自己拦住。
	async checkBinding(c, { token, chatId, userId, excludeBindId = 0 }) {
		// [S32] 站点机器人自己的 token 不允许被任何人绑定为「自己的通知」
		const settingRow = await settingService.query(c);
		if (settingRow.tgBotToken && token === settingRow.tgBotToken) {
			throw new BizError('不能绑定站点机器人，请使用你自己在 @BotFather 创建的机器人');
		}

		// 同一个 token 不能被两个用户绑（防止借用别人的 bot）
		const rows = await orm(c).select({
			bindId: notifyBind.bindId,
			userId: notifyBind.userId,
			botTokenEnc: notifyBind.botTokenEnc
		}).from(notifyBind).where(eq(notifyBind.channel, CHANNEL)).all();
		for (const row of rows) {
			if (Number(row.userId) === Number(userId)) continue;
			const other = await decryptToken(c, row.botTokenEnc).catch(() => null);
			if (other && other === token) {
				throw new BizError('该机器人已被其他账号绑定');
			}
		}

		const me = await tgApi(token, 'getMe');
		if (!me.ok) {
			throw new BizError('token 无效或已失效：' + (me.body?.description || 'getMe 调用失败'));
		}
		const botUsername = me.body?.result?.username || '';

		const exist = await orm(c).select({ bindId: notifyBind.bindId, userId: notifyBind.userId })
			.from(notifyBind)
			.where(and(eq(notifyBind.channel, CHANNEL), eq(notifyBind.target, chatId)))
			.get();
		if (exist && (!excludeBindId || Number(exist.bindId) !== Number(excludeBindId))) {
			throw new BizError(Number(exist.userId) === Number(userId)
				? '这个 Chat 已经绑定过了'
				: '这个 Chat 已被其他账号绑定');
		}

		// ① 必须关注站点 bot：站点 bot 能发出去，说明对方确实和它说过话
		const follow = await this.ensureFollow(c, chatId, userId);
		if (!follow.ok) throw new BizError(follow.message);

		// ② token 与 chat 必须对得上：换 bot 或换 chat，这条消息都发不出去
		const test = await tgApi(token, 'sendMessage', {
			chat_id: chatId,
			text: '✅ 绑定成功。之后你的邮箱账号收到新邮件，会通过这个机器人通知你。'
		});
		if (!test.ok) {
			const description = test.body?.description || '';
			const cantReach = /chat not found|can't initiate|blocked|PEER_ID_INVALID/i.test(description) || test.status === 400 || test.status === 403;
			throw new BizError(cantReach
				? '这个 Chat ID 收不到你机器人的消息：请核对 Chat ID 是否正确，并确认你已打开过自己的机器人'
				: '测试消息发送失败：' + (description || '请检查机器人是否可用'));
		}

		return botUsername;
	},

	async save(c, params, userId) {
		const token = String(params?.token || '').trim();
		this.checkToken(token);

		const chatId = String(params?.chatId || '').trim();
		this.checkChatId(chatId);

		// [S29] 数量上限：放在所有网络调用之前，超限直接回，不浪费 getMe 与测试消息
		const limit = await this.bindLimit(c);
		if (limit > 0) {
			const mine = await orm(c).select({ bindId: notifyBind.bindId }).from(notifyBind)
				.where(and(eq(notifyBind.userId, userId), eq(notifyBind.channel, CHANNEL))).all();
			if (mine.length >= limit) {
				throw new BizError(`最多只能绑定 ${limit} 个通知，请先删除不用的再绑定`);
			}
		}

		const botUsername = await this.checkBinding(c, { token, chatId, userId });

		const botTokenEnc = await encryptToken(c, token);
		await orm(c).insert(notifyBind).values({
			userId,
			channel: CHANNEL,
			botTokenEnc,
			botUsername,
			target: chatId,
			enabled: 1
		}).run();

		return { botUsername, target: chatId };
	},

	// [S27] 编辑绑定：换 token / 换 chat 不用删了重建。
	// token 留空 = 不修改（接口永不返回明文，前端没法回填），其余校验与新建完全一致。
	async update(c, params, userId) {
		const bindId = Number(params?.bindId || 0);
		if (!bindId) throw new BizError('缺少要修改的绑定');

		const row = await orm(c).select().from(notifyBind)
			.where(and(eq(notifyBind.bindId, bindId), eq(notifyBind.userId, userId))).get();
		if (!row) throw new BizError('绑定不存在，或不属于当前账号');

		let token = String(params?.token || '').trim();
		const changedToken = !!token;
		// [S32] 无论换不换 token，都要拿到「旧 token」给清理钩子用（换 token 时旧 bot 上的 webhook 要拆掉）
		const oldToken = await decryptToken(c, row.botTokenEnc).catch(() => null);
		if (changedToken) {
			this.checkToken(token);
		} else {
			token = oldToken;
			if (!token) throw new BizError('原 token 无法解密，请重新填写机器人 token');
		}

		const chatId = String(params?.chatId || '').trim() || String(row.target);
		this.checkChatId(chatId);

		const botUsername = await this.checkBinding(c, { token, chatId, userId, excludeBindId: bindId });

		// 编辑成功即视为「重新验证通过」：顺手清零失效计数、恢复启用（S28）
		const patch = { botUsername, target: chatId, enabled: 1, failCount: 0, lastError: '', lastFailTime: null };
		if (changedToken) patch.botTokenEnc = await encryptToken(c, token);
		await orm(c).update(notifyBind).set(patch).where(eq(notifyBind.bindId, bindId)).run();

		// [S32] 生命周期钩子（telegram-user-service 注册）：绑定已安装过命令时，
		// 换 token 要拆旧 bot 的 webhook、换 chat 要把菜单挪到新会话，否则留一个「僵死」的 bot。
		// 钩子内部全部 best-effort，失败只记日志，不影响编辑结果。
		if (this.lifecycle.onUpdated) {
			await this.lifecycle.onUpdated(c, {
				bindId,
				userId,
				wasInstalled: Number(row.cmdInstalled) === 1,
				oldToken,
				newToken: token,
				oldTarget: String(row.target),
				newTarget: chatId
			}).catch(e => console.warn('[notify] 绑定更新后的命令重装失败:', e.message));
		}

		return { botUsername, target: chatId, tokenChanged: changedToken };
	},

	// 校验并记录「已关注站点 bot」
	async ensureFollow(c, chatId, userId) {
		const { tgBotToken } = await settingService.query(c);
		if (!tgBotToken) {
			return { ok: false, message: '管理员还没有配置站点机器人，暂时无法绑定' };
		}
		const siteUsername = await this.siteBot(c);
		const r = await tgApi(tgBotToken, 'sendMessage', {
			chat_id: chatId,
			text: '✅ 已确认关注通知机器人。请回到网页完成绑定。'
		});
		if (!r.ok) {
			const description = r.body?.description || '';
			const notStarted = r.status === 403 || /can't initiate|chat not found|blocked/i.test(description);
			return {
				ok: false,
				message: notStarted
					? `请先在 Telegram 里关注 @${siteUsername || '站点机器人'} 并发送一句 /start，再回来保存`
					: '无法向你发送确认消息：' + (description || '未知原因')
			};
		}
		await this.recordFollow(c, chatId, userId);
		return { ok: true };
	},

	// 记录关注名单（以后群发公告用）。失败只记日志，不影响主流程。
	async recordFollow(c, chatId, userId = null) {
		try {
			const target = String(chatId);
			const exist = await orm(c).select({ chatId: notifyFollow.chatId })
				.from(notifyFollow).where(eq(notifyFollow.chatId, target)).get();
			if (exist) {
				if (userId) {
					await orm(c).update(notifyFollow).set({ userId }).where(eq(notifyFollow.chatId, target)).run();
				}
				return;
			}
			await orm(c).insert(notifyFollow).values({ chatId: target, userId }).run();
		} catch (e) {
			console.warn('[notify] 记录关注名单失败:', e.message);
		}
	},

	async remove(c, params, userId) {
		const bindId = Number(params?.bindId || 0);
		if (!bindId) return { count: 0 };
		const row = await orm(c).select().from(notifyBind)
			.where(and(eq(notifyBind.bindId, bindId), eq(notifyBind.userId, userId))).get();
		if (!row) return { count: 0 };
		await orm(c).delete(notifyBind).where(eq(notifyBind.bindId, bindId)).run();

		// [S32] 生命周期钩子：绑定装过「Bot 查询命令」时，先把这个 bot 的 webhook / 菜单拆干净，
		// 再让记录消失 —— 否则用户拿回 bot 接别的服务时会一直冲突。
		if (this.lifecycle.onRemoved) {
			const oldToken = await decryptToken(c, row.botTokenEnc).catch(() => null);
			await this.lifecycle.onRemoved(c, {
				bindId,
				wasInstalled: Number(row.cmdInstalled) === 1,
				oldToken,
				oldTarget: String(row.target)
			}).catch(e => console.warn('[notify] 删除绑定后的命令清理失败:', e.message));
		}
		return { count: 1 };
	},

	async toggle(c, params, userId) {
		const bindId = Number(params?.bindId || 0);
		const enabled = Number(params?.enabled) === 0 ? 0 : 1;
		if (!bindId) return { count: 0 };
		const row = await orm(c).select({ bindId: notifyBind.bindId }).from(notifyBind)
			.where(and(eq(notifyBind.bindId, bindId), eq(notifyBind.userId, userId))).get();
		if (!row) return { count: 0 };
		await orm(c).update(notifyBind).set({ enabled }).where(eq(notifyBind.bindId, bindId)).run();
		return { enabled };
	},

	// [S32] 供 telegram-user-service 读取某个绑定的明文 token（只在自己 api 层使用，绝不返回给前端）
	async getDecryptedToken(c, bindId, userId) {
		const row = await orm(c).select({ botTokenEnc: notifyBind.botTokenEnc })
			.from(notifyBind)
			.where(and(eq(notifyBind.bindId, Number(bindId)), eq(notifyBind.userId, userId))).get();
		if (!row) return null;
		return await decryptToken(c, row.botTokenEnc).catch(() => null);
	},

	// [S32] 生命周期钩子注册表：notify-bind-service 不反向 import telegram-user-service（避免循环依赖），
	// 由 telegram-user-service 在模块加载时调 setLifecycleHooks 注册；没注册时行为与原来完全一致。
	lifecycle: {},
	setLifecycleHooks(hooks) {
		this.lifecycle = { ...this.lifecycle, ...hooks };
	},

	// [S28] 失效自愈：判定这次失败是不是「绑定真的坏了」。
	// 只有确定性失效才计数 —— 429 限流 / 5xx / 网络抖动绝不算，否则 Telegram 抖一下就把用户的绑定停了。
	isPermanentFailure(status, description) {
		const d = String(description || '');
		if (status === 401 || status === 403) return true; // token 被 revoke / 用户 block 了 bot
		if (status === 400) {
			return /chat not found|PEER_ID_INVALID|bot was blocked|user is deactivated|not enough rights|chat_id is empty/i.test(d);
		}
		return false;
	},

	async markFail(c, bind, status, description) {
		try {
			const boundFailCount = Number(bind.failCount || 0) + 1;
			const patch = {
				failCount: boundFailCount,
				lastError: String(description || `HTTP ${status}`).slice(0, 200),
				lastFailTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
			};
			// 连续 3 次确定性失效 → 自动停用，避免一直白发；页面会显示原因，用户可重新启用或编辑
			if (boundFailCount >= 3) patch.enabled = 0;
			await orm(c).update(notifyBind).set(patch).where(eq(notifyBind.bindId, bind.bindId)).run();
			if (boundFailCount >= 3) {
				console.warn(`[notify] 绑定连续 ${boundFailCount} 次失效，已自动停用 bind=${bind.bindId} ${patch.lastError}`);
			}
		} catch (e) {
			console.warn('[notify] 记录失效次数失败:', e.message);
		}
	},

	// 恢复正常就把计数清零。常态成功不写库（省一次 D1 写）。
	async markOk(c, bind) {
		if (!Number(bind.failCount || 0) && !bind.lastError) return;
		try {
			await orm(c).update(notifyBind)
				.set({ failCount: 0, lastError: '', lastFailTime: null })
				.where(eq(notifyBind.bindId, bind.bindId)).run();
		} catch (e) {
			console.warn('[notify] 清零失效次数失败:', e.message);
		}
	},

	// 入站邮件 → 按邮件归属用户推送到他自己的 bot。
	// 调用方是 email.js（传 {env}），所以全程只用 c.env，不用 c.get/c.set 的强依赖。
	async pushToUser(c, emailRow) {
		try {
			const userId = Number(emailRow?.userId || 0);
			// 无人收件（user_id=0）不属于任何人，不推
			if (!userId) return;

			const userRow = await orm(c).select({
				userId: user.userId, isDel: user.isDel, status: user.status
			}).from(user).where(eq(user.userId, userId)).get();
			// 用户已删除 / 已封禁 → 不推
			if (!userRow || Number(userRow.isDel) === isDel.DELETE || Number(userRow.status) === userConst.status.BAN) return;

			const binds = await orm(c).select().from(notifyBind).where(
				and(
					eq(notifyBind.userId, userId),
					eq(notifyBind.channel, CHANNEL),
					eq(notifyBind.enabled, 1)
				)
			).all();
			if (!binds.length) return;

			const setting = await settingService.query(c);
			// [S23] 去重条件必须「同一个机器人 + 同一个 chat」同时成立。
			// Telegram 私聊的 chat_id 就是用户 ID，与用哪个 bot 无关：同一个人换自己的 bot 绑定，
			// chat_id 会和 tgChatId 里的值完全相同。若只比 chat_id，用户会一条都收不到（静默跳过）。
			const broadcastChats = String(setting.tgChatId || '').split(',').map(s => s.trim()).filter(Boolean);
			const siteBotToken = String(setting.tgBotToken || '');

			const payload = await buildPushPayload(c, emailRow);

			for (const bind of binds) {
				const token = await decryptToken(c, bind.botTokenEnc).catch(() => null);
				if (!token) {
					console.warn(`[notify] 解密 token 失败 bind=${bind.bindId}`);
					continue;
				}
				// 仅当「同一个机器人往同一个 chat 发」才算重复，不同机器人是两条独立消息，照发
				if (broadcastChats.includes(String(bind.target)) && token === siteBotToken) continue;
				// [S24] 先按管理员那条用 web_app（TG 内置打开）；群聊等不支持时自动降级为 url，保证不丢通知
				const sendMsg = (keyboard) => tgApi(token, 'sendMessage', {
					chat_id: bind.target,
					parse_mode: 'HTML',
					text: payload.text,
					reply_markup: { inline_keyboard: keyboard }
				});
				let r = await sendMsg(payload.inline_keyboard);
				if (!r.ok) {
					console.warn(`[notify] web_app 发送失败，降级 url 重试 bind=${bind.bindId} ${r.body?.description || ''}`);
					r = await sendMsg(payload.inline_keyboard_url);
				}
				if (!r.ok) {
					const desc = r.body?.description || '';
					console.error(`[notify] 推送失败 bind=${bind.bindId} status=${r.status} ${desc}`);
					// [S28] 只对确定性失效计数（连续 3 次自动停用并记下原因），临时故障不碰
					if (this.isPermanentFailure(r.status, desc)) {
						await this.markFail(c, bind, r.status, desc);
					}
				} else {
					await this.markOk(c, bind);
				}
			}
		} catch (e) {
			// 推送失败绝不影响入站收信
			console.error('[notify] 按用户推送异常:', e.message);
		}
	},

	/* ------------------------------------------------------------------ *
	 * 六、[S30] 管理员群发公告：站点 bot → notify_follow 关注名单
	 * 分批发送：Workers 免费版单请求约 50 个子请求上限（D1 查询也计入），
	 * 每批只发 40 条留足余量；接口返回 nextOffset，前端循环调用直到 done。
	 * ------------------------------------------------------------------ */
	BROADCAST_BATCH: 40,

	// 关注名单（chatId 全局唯一，天然去重；个人部署量级很小，直接全量查）
	async broadcastList(c) {
		return orm(c).select({ chatId: notifyFollow.chatId }).from(notifyFollow).all();
	},

	// 公告正文转义：消息走 parse_mode=HTML，管理员输入的 <>& 必须转义，否则 Telegram 直接拒收
	escapeHtml(str) {
		return String(str || '')
			.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	},

	// 发送一批公告。offset 之前已发过；确定性失效的 chat 直接从名单删除（自愈），429/5xx 保留下次重试
	async broadcastSend(c, { text, offset = 0 }) {
		const body = String(text || '').trim();
		if (!body) throw new BizError('公告内容不能为空');

		const setting = await settingService.query(c);
		const token = String(setting.tgBotToken || '');
		if (!token) throw new BizError('站点 Telegram 机器人未配置，请先在上方填写 Bot Token');

		const all = await this.broadcastList(c);
		const total = all.length;
		if (!total) throw new BizError('还没有用户关注站点机器人，名单为空');

		// [S48] 署名时间只用于展示，不落库：按站点时区转换（原 S42 用「+8 小时」拼字符串）
		const now = localTimeStr();
		const title = this.escapeHtml(setting.title || '邮箱');
		const message = `📢 <b>${title} 公告</b>\n\n${this.escapeHtml(body)}\n\n<i>—— 管理员发送于 ${now}</i>`;

		const batch = all.slice(Number(offset) || 0, (Number(offset) || 0) + this.BROADCAST_BATCH);
		let sent = 0;
		let failed = 0;

		for (const chat of batch) {
			const r = await tgApi(token, 'sendMessage', {
				chat_id: chat.chatId,
				parse_mode: 'HTML',
				text: message,
				// 禁止预览、通知声保持默认：公告是主动触达，别让人误以为是邮件转发
				link_preview_options: { is_disabled: true }
			});
			if (r.ok) {
				sent++;
				continue;
			}
			failed++;
			const desc = r.body?.description || '';
			console.warn(`[notify] 公告发送失败 chat=${chat.chatId} status=${r.status} ${desc}`);
			// 名单自愈：bot 被 block / chat 不存在等确定性失效 → 从关注名单移除，以后不再白发
			if (this.isPermanentFailure(r.status, desc)) {
				await orm(c).delete(notifyFollow).where(eq(notifyFollow.chatId, chat.chatId)).run();
			}
		}

		const nextOffset = (Number(offset) || 0) + batch.length;
		return { total, sent, failed, nextOffset, done: nextOffset >= total };
	}
};

export default notifyBindService;
