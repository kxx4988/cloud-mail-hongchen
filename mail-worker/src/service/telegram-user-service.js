import orm from '../entity/orm';
import { notifyBind } from '../entity/notify-bind';
import account from '../entity/account';
import settingService from './setting-service';
import BizError from '../error/biz-error';
import { eq } from 'drizzle-orm';
import { settingConst } from '../const/entity-const';
import constant from '../const/constant';
import telegramService from './telegram-service';
import notifyBindService from './notify-bind-service';
import jwtUtils from '../utils/jwt-utils';
import domainUtils from '../utils/domain-uitls';

// [S32] 自研：用户自己 bot 的「Bot 查询命令」
// 未安装时，用户的 bot 只收新邮件推送（与 S23 行为完全一致）；点「安装命令」后才给这个 bot
// 设置 webhook + 命令菜单，用户就能在自己的 bot 里发命令查自己名下账号的邮件。
// 边界：
//  1. 命令清单与权限完全复用 telegram-service 的 TG_COMMANDS / COMMAND_PERMS / hasCommandPerm，
//     管理员看 8 条、普通用户只看有权限的 —— 与网页端侧栏一致（S22）。
//  2. 所有查询按 bind.userId 过滤（S10 的归属隔离），普通用户绝不可能看到别人的邮件。
//  3. webhook 只认「绑定时的那个 chat」（bind.target），别的 chat 一律拒绝。
//  4. webhook secret 按 bindId + bot token 派生（与站点 bot 同一套思路，不新增字段）。

// 命令 → 文件夹映射（与管理员侧 handleIncomingMessage 一致）
const FOLDER_MAP = { '/inbox': 'inbox', '/sent': 'sent', '/deleted': 'deleted', '/star': 'star', '/spam': 'spam', '/noone': 'noone' };

const enc = new TextEncoder();

function nowStr() {
	return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

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

// 用户 bot 的 webhook secret：SHA-256("tg-user-webhook:" + jwt_secret + ":" + bindId + ":" + botToken)。
// Telegram 只允许 A-Za-z0-9_-，hex 满足；bindId 在 URL 里、secret 在头里，两样都对得上才放行。
async function webhookSecret(c, bindId, token) {
	const data = enc.encode(`tg-user-webhook:${c.env.jwt_secret}:${bindId}:${token}`);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 该归属用户在菜单里可见的命令（与网页端侧栏权限一致）
async function visibleCommands(c, userId) {
	const visible = [];
	for (const cmd of telegramService.TG_COMMANDS) {
		if (await telegramService.hasCommandPerm(c, cmd.command, userId)) visible.push(cmd);
	}
	return visible;
}

// 把一个 bot「装好」：webhook + 按 chat 的命令菜单 + 底部菜单按钮 + 欢迎消息。
// install 和「绑定更新后自动重装」共用这一段，保证两条路径行为一致。
async function provision(c, { bindId, token, chatId, userId, welcome = true }) {
	const { customDomain } = await settingService.query(c);
	if (!customDomain) {
		throw new BizError('站点还没有配置自定义域名：Telegram 的 webhook 必须是公网 HTTPS 地址，请先在「系统设置 → 基础设置」里配置');
	}
	const webhookUrl = `${domainUtils.toOssDomain(customDomain)}/api/telegram/userWebhook/${bindId}`;
	const secret = await webhookSecret(c, bindId, token);

	const wh = await tgApi(token, 'setWebhook', {
		url: webhookUrl,
		allowed_updates: ['message'],
		// drop_pending_updates：装之前积压的旧消息直接丢弃，避免装完瞬间被刷屏
		drop_pending_updates: true,
		secret_token: secret
	});
	if (!wh.ok) {
		throw new BizError('安装失败：' + (wh.body?.description || 'setWebhook 调用失败'));
	}

	// 命令菜单按 chat 设置：只有绑定的这个会话看得到，陌生人搜到这个 bot 也看不到任何命令
	const commands = await visibleCommands(c, userId);
	await tgApi(token, 'setMyCommands', { commands, scope: { type: 'chat', chat_id: chatId } });
	await tgApi(token, 'setChatMenuButton', {
		menu_button: { type: 'commands', text: '菜单' },
		scope: { type: 'chat', chat_id: chatId }
	});

	if (welcome) {
		const lines = commands.map(x => `/${x.command} — ${x.description}`).join('\n');
		await tgApi(token, 'sendMessage', {
			chat_id: chatId,
			text: `✅ 查询命令已安装。\n\n可用命令：\n${lines}\n\n点击底部「菜单」按钮也可查看命令列表。`
		});
	}
	return webhookUrl;
}

// 只清某个 chat 的菜单/底部按钮（换 chat 时用，webhook 不动）
async function cleanupChatMenu(c, token, chatId) {
	await tgApi(token, 'setMyCommands', { commands: [], scope: { type: 'chat', chat_id: chatId } });
	await tgApi(token, 'setChatMenuButton', { menu_button: { type: 'default' }, scope: { type: 'chat', chat_id: chatId } });
}

// 整个 bot 拆干净：webhook + 默认命令 + 该 chat 的菜单（删除绑定 / 换 token 时用）
async function cleanupBot(c, token, chatId) {
	try {
		await tgApi(token, 'deleteWebhook', { drop_pending_updates: false });
		await tgApi(token, 'deleteMyCommands');
		if (chatId) await cleanupChatMenu(c, token, chatId);
	} catch (e) {
		console.warn(`[user-bot] 清理机器人失败: ${e.message}`);
	}
}

// 「最后使用」时间：60 秒内只写一次，省 D1 写
async function touchLastUsed(c, bind) {
	try {
		const last = bind.cmdLastUsed ? new Date(String(bind.cmdLastUsed).replace(' ', 'T') + 'Z').getTime() : 0;
		if (Date.now() - last < 60_000) return;
		await orm(c).update(notifyBind).set({ cmdLastUsed: nowStr() }).where(eq(notifyBind.bindId, bind.bindId)).run();
	} catch (e) {
		console.warn('[user-bot] 记录最后使用失败:', e.message);
	}
}

// 加载属于自己的绑定
async function loadBind(c, bindId, userId) {
	return await orm(c).select().from(notifyBind)
		.where(eq(notifyBind.bindId, Number(bindId) || 0)).get()
		.then(row => (row && Number(row.userId) === Number(userId) ? row : null));
}

const telegramUserService = {

	// 安装（重复点 = 重新安装，幂等）。force=true 表示用户确认覆盖已有的第三方 webhook。
	async install(c, params, userId) {
		const bindId = Number(params?.bindId || 0);
		const force = !!params?.force;
		const bind = await loadBind(c, bindId, userId);
		if (!bind) throw new BizError('绑定不存在，或不属于当前账号');
		// [S34] 停用 = 只停「新邮件推送」；命令安装/使用与推送开关解耦（用户 2026-11-11 明确要求「分开可控」），
		// 故此处不再因 enabled=0 拦截安装。

		const token = await notifyBindService.getDecryptedToken(c, bindId, userId);
		if (!token) throw new BizError('机器人 token 无法解密，请编辑绑定重新填写 token');

		const { customDomain } = await settingService.query(c);
		if (!customDomain) {
			throw new BizError('站点还没有配置自定义域名：Telegram 的 webhook 必须是公网 HTTPS 地址，请先在「系统设置 → 基础设置」里配置');
		}

		// 冲突检查：一个 bot 只能有一个 webhook，装了就会顶掉原来的（getUpdates 轮询同样会失效）
		const info = await tgApi(token, 'getWebhookInfo');
		const currentUrl = info.ok ? String(info.body?.result?.url || '') : '';
		const targetUrl = `${domainUtils.toOssDomain(customDomain)}/api/telegram/userWebhook/${bindId}`;
		if (currentUrl && currentUrl !== targetUrl && !force) {
			// code=409：前端收到后弹「覆盖安装」确认，用户确认才带 force=true 重试
			throw new BizError(`这个机器人已经在别处设置了消息推送（${currentUrl}）`, 409);
		}

		const webhookUrl = await provision(c, { bindId, token, chatId: bind.target, userId: bind.userId });

		// [S48] 时间口径统一：改回存 UTC（原 S42 为让设置页显示正确而 +8 写库，把时区写进了数据）
		const time = nowStr();
		await orm(c).update(notifyBind).set({ cmdInstalled: 1, cmdInstallTime: time }).where(eq(notifyBind.bindId, bindId)).run();
		return { installed: 1, installTime: time, webhookUrl };
	},

	// 删除命令：拆 webhook + 清菜单，回到「只推送新邮件」的现状
	async uninstall(c, params, userId) {
		const bindId = Number(params?.bindId || 0);
		const bind = await loadBind(c, bindId, userId);
		if (!bind) throw new BizError('绑定不存在，或不属于当前账号');

		const token = await notifyBindService.getDecryptedToken(c, bindId, userId);
		if (token) {
			await cleanupBot(c, token, bind.target);
		}
		await orm(c).update(notifyBind).set({ cmdInstalled: 0, cmdInstallTime: null, cmdLastUsed: null })
			.where(eq(notifyBind.bindId, bindId)).run();
		return { installed: 0 };
	},

	// 用户 bot 的 webhook 入口。安全性：
	//  ① secret 头必须与按 bindId+token 派生的值一致（不知道 jwt_secret 与 token 就伪造不了）；
	//  ② 只有绑定的那个 chat 能得到回复，其他 chat 一律拒绝；
	//  ③ 所有查询按 bind.userId 过滤（复用 telegram-service 的取数函数）。
	async handleUserWebhook(c, bindId, body) {
		let bind = null;
		let token = null;
		try {
			bind = await orm(c).select().from(notifyBind).where(eq(notifyBind.bindId, Number(bindId) || 0)).get();
			if (!bind || Number(bind.cmdInstalled) !== 1) return { ok: true };

			token = await notifyBindService.getDecryptedToken(c, bind.bindId, bind.userId);
			if (!token) return { ok: true };

			const expected = await webhookSecret(c, bind.bindId, token);
			if (c.req.header('X-Telegram-Bot-Api-Secret-Token') !== expected) {
				return { ok: false };
			}
		} catch (e) {
			console.error('[user-bot] webhook 校验失败:', e.message);
			return { ok: true };
		}

		try {
			const msg = body?.message;
			if (!msg || !msg.text) return { ok: true };

			const chatId = String(msg.chat?.id || '');
			const userId = Number(bind.userId);

			// 只服务绑定的那个私聊会话；其他人搜到这个 bot 发什么都拒（与站点 bot 的陌生 chat 处理一致）
			if (!chatId || chatId !== String(bind.target)) {
				await tgApi(token, 'sendMessage', {
					chat_id: chatId || bind.target,
					text: '⛔ 未授权：此机器人只对绑定的会话开放。'
				});
				return { ok: true };
			}

			const raw = msg.text.trim();
			// 兼容群组写法 /inbox@mybot 与带参数的 /start xxx
			const cmd = raw.split(/\s+/)[0].toLowerCase().split('@')[0];

			// /start → 帮助 + 按权限刷新该 chat 菜单
			if (cmd === '/start') {
				const commands = await visibleCommands(c, userId);
				const lines = commands.map(x => `/${x.command} — ${x.description}`).join('\n');
				await tgApi(token, 'sendMessage', {
					chat_id: chatId,
					text: `📬 邮箱助手\n\n可用命令：\n${lines}\n\n点击底部「菜单」按钮也可查看命令列表。`
				});
				await telegramService.syncChatCommands(c, token, chatId, userId);
				await touchLastUsed(c, bind);
				return { ok: true };
			}

			// /webmail → 自己的网页版免登录链接（SPA token 按 bind.userId 签，只能进自己的邮箱）
			if (cmd === '/webmail') {
				const { customDomain } = await settingService.query(c);
				if (!customDomain) {
					await tgApi(token, 'sendMessage', {
						chat_id: chatId,
						text: '站点还没有配置自定义域名，暂时无法生成网页版邮箱链接。'
					});
					return { ok: true };
				}
				const spaToken = await telegramService.createSpaToken(c, userId);
				if (!spaToken) {
					await tgApi(token, 'sendMessage', { chat_id: chatId, text: '生成登录凭证失败，请稍后重试。' });
					return { ok: true };
				}
				await tgApi(token, 'sendMessage', {
					chat_id: chatId,
					text: '网页版邮箱（完整功能，外置浏览器打开）：',
					reply_markup: {
						inline_keyboard: [[{
							text: '打开网页版邮箱',
							url: `${domainUtils.toOssDomain(customDomain)}/?t=${encodeURIComponent(spaToken)}`
						}]]
					}
				});
				await touchLastUsed(c, bind);
				return { ok: true };
			}

			const folder = FOLDER_MAP[cmd];
			if (!folder) return { ok: true }; // 不认识的命令不回复

			// 权限对齐网页端（与站点 bot 同一张 COMMAND_PERMS 表）：没权限不给数据，并把菜单刷掉该命令
			if (!await telegramService.hasCommandPerm(c, folder, userId)) {
				await tgApi(token, 'sendMessage', { chat_id: chatId, text: '⛔ 你没有使用这个命令的权限。' });
				await telegramService.syncChatCommands(c, token, chatId, userId);
				return { ok: true };
			}

			// 「无人收件」是系统级入口，站点开关关闭时同样提示（与站点 bot 行为一致）
			if (folder === 'noone') {
				const { noRecipient } = await settingService.query(c);
				if (Number(noRecipient) !== settingConst.noRecipient.OPEN) {
					await tgApi(token, 'sendMessage', {
						chat_id: chatId,
						text: '「无人收件」当前已关闭，请在网页版开启后再试。'
					});
					return { ok: true };
				}
			}

			await this.sendFolderList(c, { token, chatId, userId, folder });
			await touchLastUsed(c, bind);
		} catch (e) {
			// 命令处理失败只影响这一次回复，绝不让 webhook 500（Telegram 会疯狂重试）
			console.error('[user-bot] 处理命令失败:', e.message);
		}
		return { ok: true };
	},

	// 按账号分组发送某文件夹邮件列表（与站点 bot 同一套取数：getFolderAccountIds / getFolderRows）
	async sendFolderList(c, { token, chatId, userId, folder }) {
		const { customDomain } = await settingService.query(c);
		const base = customDomain ? domainUtils.toOssDomain(customDomain) : '';
		const title = telegramService.FOLDER_TITLE[folder];
		const accountIds = await telegramService.getFolderAccountIds(c, folder, userId);

		if (!accountIds.length) {
			await tgApi(token, 'sendMessage', { chat_id: chatId, text: `${title}（暂无邮件）` });
			return;
		}

		for (const accountId of accountIds) {
			// 星标是「全账号合并」的单一列表，没有单一账号可显示；无人收件同理（无真实账号）
			const merged = folder === 'star' || folder === 'noone';
			const acc = merged ? null : await orm(c).select().from(account).where(eq(account.accountId, accountId)).get();
			const accLabel = merged ? '' : (acc?.email || `账号#${accountId}`);

			// 取 4 封：前 3 展示，第 4 存在则说明还有更多
			const rows = await telegramService.getFolderRows(c, folder, accountId, 4, 0, userId);
			const show = rows.slice(0, 3);
			const hasMore = rows.length > 3;

			const keyboard = [];
			for (const row of show) {
				const jwtToken = await jwtUtils.generateToken(c, { gen: constant.AUTH_GEN, emailId: row.emailId, folder, userId });
				const url = `${base}/api/telegram/getEmail/${jwtToken}?_t=${Date.now()}`;
				const label = (row.subject || '(无主题)').slice(0, 28);
				keyboard.push([{ text: `${!row.unread ? '🔴 ' : ''}${label}`, web_app: { url } }]);
			}

			if (hasMore) {
				const moreToken = await jwtUtils.generateToken(c, { gen: constant.AUTH_GEN, accountId, folder, userId });
				const moreUrl = `${base}/api/telegram/more/${moreToken}?_t=${Date.now()}`;
				keyboard.push([{ text: merged ? '查看全部 ›' : `查看 ${accLabel} 更多 ›`, web_app: { url: moreUrl } }]);
			}

			await tgApi(token, 'sendMessage', {
				chat_id: chatId,
				text: merged ? title : `${title} · ${accLabel}`,
				reply_markup: { inline_keyboard: keyboard }
			});
		}
	}
};

// [S32] 注册绑定生命周期钩子：编辑绑定 / 删除绑定时，把 bot 上的 webhook 与菜单同步收拾干净。
// 钩子全部 best-effort：Telegram 调用失败只记日志，绝不影响绑定本身的保存/删除。
notifyBindService.setLifecycleHooks({
	// 删除绑定 → 整个 bot 拆干净（webhook + 默认命令 + 该 chat 菜单）
	onRemoved: async (c, { oldToken, oldTarget }) => {
		if (oldToken) await cleanupBot(c, oldToken, oldTarget);
	},

	// 编辑绑定（已安装过命令时才需要收拾）：
	//  - 换了 token → 旧 bot 拆干净，新 bot 重装（webhook URL 里只有 bindId，不含 token，URL 不变）
	//  - 只换了 chat → 同一个 bot 上把菜单从旧 chat 挪到新 chat
	onUpdated: async (c, info) => {
		if (!info.wasInstalled) return;
		if (info.oldToken && info.oldToken !== info.newToken) {
			await cleanupBot(c, info.oldToken, info.oldTarget);
		}
		const bind = await orm(c).select().from(notifyBind).where(eq(notifyBind.bindId, info.bindId)).get();
		if (!bind) return;
		const token = await notifyBindService.getDecryptedToken(c, bind.bindId, bind.userId);
		if (!token) return;
		if (info.oldTarget !== String(bind.target)) {
			await cleanupChatMenu(c, token, info.oldTarget);
		}
		await provision(c, { bindId: bind.bindId, token, chatId: bind.target, userId: bind.userId, welcome: false });
	}
});

export default telegramUserService;
