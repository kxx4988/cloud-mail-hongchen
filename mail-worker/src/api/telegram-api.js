import app from '../hono/hono';
import result from '../model/result';
import telegramService from '../service/telegram-service';
import telegramUserService from '../service/telegram-user-service';
import jwtUtils from '../utils/jwt-utils';
import constant from '../const/constant';
import userService from '../service/user-service';

// /telegram 整段在 security.js 的免鉴权名单里（webhook 与深链必须免登录访问），
// 但「重设机器人命令/菜单/webhook」属于管理操作，必须在这里单独校验管理员身份。
async function isAdmin(c) {
	try {
		const payload = await jwtUtils.verifyToken(c, c.req.header(constant.TOKEN_HEADER));
		if (!payload?.userId) return false;
		const user = await userService.selectById(c, payload.userId);
		return !!user && user.email === c.env.admin;
	} catch (e) {
		return false;
	}
}

app.get('/telegram/getEmail/:token', async (c) => {
	const content = await telegramService.getEmailContent(c, c.req.param());
	// 我方保留 no-cache：TG 预览页内容会随「删除/恢复/标垃圾」变化，缓存 1 小时会看到旧状态
	c.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
	c.header('Pragma', 'no-cache');
	c.header('Expires', '0');
	// [S41] 官方 v3.6.0：邮件预览页加 CSP，禁止外部脚本与连接（XSS 加固）
	c.header('Content-Security-Policy', `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'`);
	return c.html(content)
});

app.post('/telegram/replyEmail', async (c) => {
	const { token, content } = await c.req.json();
	const r = await telegramService.replyEmail(c, token, content);
	if (r.error) return c.json({ success: false, message: r.error }, 400);
	return c.json({ success: true, emailId: r.emailId });
});

// 设置 TG 机器人菜单（8 命令 + 底部「菜单」按钮 + webhook 注册，含 secret_token）。
// 必须管理员：否则任何人访问该 URL 就能重设命令、菜单按钮与 webhook。
// 返回体走项目统一的 { code, message, data } 封装（HTTP 200），前端按钮才能正常弹出成功/失败提示。
app.get('/telegram/setup', async (c) => {
	if (!(await isAdmin(c))) {
		return c.json(result.fail('未授权：仅管理员可重设 Telegram 机器人配置', 403));
	}
	const r = await telegramService.setupTelegramMenu(c);
	if (r.error) return c.json(result.fail(r.error, 400));
	return c.json(result.ok({ webhookUrl: r.webhookUrl, results: r.results }));
});

// web_app「更多」页面：按 accountId + folder 渲染该账号该文件夹全部邮件（token 校验见 service）。
app.get('/telegram/more/:token', async (c) => {
	const content = await telegramService.getMoreEmails(c, c.req.param());
	c.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
	c.header('Pragma', 'no-cache');
	c.header('Expires', '0');
	return c.html(content);
});

// Webhook：接收 TG 推送的用户消息（命令/按钮点击），回复 InlineKeyboard 邮件列表。
// 来源校验：Telegram 每次回调都会带上 setWebhook 注册的 secret_token，
// 比对不上直接 401，避免任何人伪造请求体驱动机器人（例如向任意 chat_id 发消息）。
app.post('/telegram/webhook', async (c) => {
	const expected = await telegramService.getWebhookSecret(c);
	const got = c.req.header('X-Telegram-Bot-Api-Secret-Token');
	if (!expected || got !== expected) {
		return c.json({ ok: false, message: 'unauthorized' }, 401);
	}
	const body = await c.req.json();
	const r = await telegramService.handleIncomingMessage(c, body);
	return c.json(r || { ok: true });
});

// [S32] 用户自己 bot 的 webhook：路径里的 bindId 定位绑定，安全靠 per-bind secret 头
// （SHA-256(jwt_secret + bindId + botToken)，用户 bot 安装时通过 setWebhook 注册给 Telegram）。
// secret 不对返回 401；其余情况一律回 200 —— Telegram 对非 2xx 会重试，不能让它疯狂重打。
app.post('/telegram/userWebhook/:bindId', async (c) => {
	const body = await c.req.json();
	const r = await telegramUserService.handleUserWebhook(c, c.req.param().bindId, body);
	return c.json(r || { ok: true });
});

