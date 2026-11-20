import app from '../hono/hono';
import emailService from '../service/email-service';
import result from '../model/result';
import userContext from '../security/user-context';
import attService from '../service/att-service';

app.get('/email/list', async (c) => {
	const data = await emailService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/email/latest', async (c) => {
	const list = await emailService.latest(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.delete('/email/delete', async (c) => {
	await emailService.delete(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.post('/email/restore', async (c) => {
	const data = await emailService.restore(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
})

// 自研定制：标记 / 取消标记垃圾邮件（所有人可用，仅限本人收件）
app.post('/email/spam', async (c) => {
	const data = await emailService.spam(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
})

// 自研定制：立即删除所有垃圾邮件（物理删除，不进回收站）
app.post('/email/clearSpam', async (c) => {
	const data = await emailService.clearSpam(c, userContext.getUserId(c));
	return c.json(result.ok(data));
})

app.post('/email/forceDelete', async (c) => {
	await emailService.forceDelete(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.post('/email/top', async (c) => {
	await emailService.pin(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.get('/email/attList', async (c) => {
	const attList = await attService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(attList));
});

app.post('/email/send', async (c) => {
	const email = await emailService.send(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(email));
});

app.put('/email/read', async (c) => {
	await emailService.read(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.get('/email/detail', async (c) => {
	const { emailId, deleted } = c.req.query();
	if (!emailId) return c.json(result.fail('缺少 emailId'), 400);
	const userId = userContext.getUserId(c);
	// deleted=1：允许取回收站（已删除）邮件详情，供回收站深链 / TG 自动跳转使用；
	// 归属校验不变，仍只返回本人邮件，非本人一律 404。
	const includeDeleted = deleted === '1' || deleted === 'true';
	const row = await emailService.selectById(c, Number(emailId), includeDeleted);
	if (!row || row.userId !== userId) return c.json(result.fail('邮件不存在'), 404);
	const attList = await attService.list(c, { emailId }, userId);
	return c.json(result.ok({ ...row, attList: attList || [] }));
})

