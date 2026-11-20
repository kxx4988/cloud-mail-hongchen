import app from '../hono/hono';
import notifyBindService from '../service/notify-bind-service';
import telegramUserService from '../service/telegram-user-service';
import result from '../model/result';
import userContext from '../security/user-context';
import BizError from '../error/biz-error';

// [S23] 自研：用户自己的 Telegram 通知。
// 登录即可访问，不挂权限（和垃圾邮件规则一致：只管自己的数据）。
// userId 一律取自 JWT，绝不接受前端传入，避免越权读写别人的绑定。
// 返回体统一 result.ok / result.fail（HTTP 200 + body code，见 MERGE-REFERENCE 专章 A-2），
// 否则前端 axios 走错误分支只会弹「服务器繁忙」，把具体原因（如「请先 /start」）吞掉。

app.get('/notify/list', async (c) => {
	const list = await notifyBindService.list(c, userContext.getUserId(c));
	return c.json(result.ok(list));
});

// 关注指引需要的站点机器人 @用户名（取不到返回空串）+ 每个用户可绑定的数量上限（0 = 不限制，S29）
app.get('/notify/siteBot', async (c) => {
	const username = await notifyBindService.siteBot(c);
	const limit = await notifyBindService.bindLimit(c);
	return c.json(result.ok({ username, limit }));
});

app.post('/notify/save', async (c) => {
	const data = await notifyBindService.save(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

// [S27] 编辑绑定：token 传空表示不修改（接口永不返回明文，前端无法回填）
app.post('/notify/update', async (c) => {
	const data = await notifyBindService.update(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/notify/delete', async (c) => {
	const data = await notifyBindService.remove(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/notify/toggle', async (c) => {
	const data = await notifyBindService.toggle(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

// [S30] 管理员群发公告。/notify/* 虽在 JWT 鉴权内，但群发是管理操作，必须再单独校验管理员身份
// （判定与 telegram-api 的 isAdmin 同口径：登录用户邮箱 === env.admin）
function assertAdmin(c) {
	const u = userContext.getUser(c);
	if (!u || u.email !== c.env.admin) {
		throw new BizError('未授权：仅管理员可群发公告', 403);
	}
}

// 关注名单人数（弹窗里先展示再确认发送）
app.get('/notify/broadcast', async (c) => {
	assertAdmin(c);
	const list = await notifyBindService.broadcastList(c);
	return c.json(result.ok({ count: list.length }));
});

// 分批发送：offset 之前已发过；返回 nextOffset，前端循环调用直到 done（绕开 Workers 子请求上限）
app.post('/notify/broadcast', async (c) => {
	assertAdmin(c);
	const data = await notifyBindService.broadcastSend(c, await c.req.json());
	return c.json(result.ok(data));
});

// [S32] 安装「Bot 查询命令」：给用户自己的 bot 设 webhook + 按 chat 命令菜单。
// 已有第三方 webhook 时返回 code=409，前端弹「覆盖安装」确认后带 force=true 重试。
app.post('/notify/cmd/install', async (c) => {
	const data = await telegramUserService.install(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

// [S32] 删除命令：拆 webhook + 清菜单，回到「只推送新邮件」的现状
app.post('/notify/cmd/uninstall', async (c) => {
	const data = await telegramUserService.uninstall(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});
