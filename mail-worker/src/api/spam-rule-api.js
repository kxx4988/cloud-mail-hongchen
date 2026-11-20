import app from '../hono/hono';
import spamRuleService from '../service/spam-rule-service';
import result from '../model/result';
import userContext from '../security/user-context';

// 自研定制：垃圾邮件发件人黑名单（用户级）。
// 仅要求登录 + userId 归属校验，不挂权限（与垃圾邮件其他接口一致）。

app.get('/spamRule/list', async (c) => {
	const list = await spamRuleService.list(c, userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.post('/spamRule/add', async (c) => {
	const data = await spamRuleService.add(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/spamRule/delete', async (c) => {
	const data = await spamRuleService.remove(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});
