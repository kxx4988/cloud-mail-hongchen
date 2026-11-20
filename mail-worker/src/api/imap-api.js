import app from '../hono/hono';
import userContext from '../security/user-context';
import result from '../model/result';
import imapPasswordService from '../service/imap-password-service';
import jwtUtils from '../utils/jwt-utils';
import reqUtils from '../utils/req-utils';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import constant from '../const/constant';
import settingService from '../service/setting-service';

// [S37] 第三方客户端（IMAP）接口：
// - /imap/auth：网关专用（无 JWT，security.js exclude 已放行该前缀），邮箱 + 应用密码 → 换 1 小时 token
// - 其余为用户 JWT 管理接口（个人设置卡片用）
// token 载荷 { userId, accountId, scope:'imap', spa:true }：spa=true 走免 KV 校验通道（security.js S33 逻辑），
// 但 scope='imap' 仅用于识别，底层 /email/* 归属校验仍按 userId 生效，跨用户不可见。

const IMAP_TOKEN_TTL = 3600; // 1 小时

// IP 失败计数限流：15 分钟窗口内最多 10 次失败（KV key 前缀本文件自定义，不动官方 kv-const）
const FAIL_LIMIT = 10;
const FAIL_WINDOW = 900;
const FAIL_KEY_PREFIX = 'imap_fail:';

async function checkFailLimit(c) {
	const ip = reqUtils.getIp(c);
	const key = FAIL_KEY_PREFIX + ip;
	const val = await c.env.kv.get(key);
	const n = val ? Number(val) : 0;
	if (n >= FAIL_LIMIT) {
		throw new BizError(t('imapAuthRateLimit'), 429);
	}
	return { ip, key, n };
}

async function recordFail(c, key, n) {
	await c.env.kv.put(key, String(n + 1), { expirationTtl: FAIL_WINDOW });
}

app.get('/imap/accounts', async (c) => {
	const list = await imapPasswordService.listMyAccounts(c, userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.get('/imap/password/list', async (c) => {
	const list = await imapPasswordService.list(c, userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.post('/imap/password', async (c) => {
	const data = await imapPasswordService.create(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok(data));
});

app.post('/imap/password/reset/:id', async (c) => {
	const data = await imapPasswordService.reset(c, userContext.getUserId(c), c.req.param('id'));
	return c.json(result.ok(data));
});

app.put('/imap/password/status/:id', async (c) => {
	const body = await c.req.json();
	await imapPasswordService.setStatus(c, userContext.getUserId(c), c.req.param('id'), body.status);
	return c.json(result.ok());
});

app.put('/imap/password/name/:id', async (c) => {
	const body = await c.req.json();
	const data = await imapPasswordService.rename(c, userContext.getUserId(c), c.req.param('id'), body?.name);
	return c.json(result.ok(data));
});

app.delete('/imap/password/:id', async (c) => {
	await imapPasswordService.del(c, userContext.getUserId(c), c.req.param('id'));
	return c.json(result.ok());
});

app.post('/imap/auth', async (c) => {
	const body = await c.req.json();
	const { email, password } = body || {};
	const limiter = await checkFailLimit(c);
	// 容错：客户端可能带入空格 / 横线 / 大写
	const normalized = String(password || '').replace(/[\s-]/g, '').toLowerCase();
	const verified = await imapPasswordService.verify(c, email, normalized);
	if (!verified) {
		await recordFail(c, limiter.key, limiter.n);
		throw new BizError(t('imapAuthFail'), 401);
	}
	const token = await jwtUtils.generateToken(c, { gen: constant.AUTH_GEN,
		userId: verified.userId,
		accountId: verified.accountId,
		scope: 'imap',
		spa: true,
	}, IMAP_TOKEN_TTL);
	return c.json(result.ok({
		token,
		userId: verified.userId,
		accountId: verified.accountId,
		email: verified.email,
		expiresIn: IMAP_TOKEN_TTL,
	}));
});

// [S55] 网关心跳：网关每小时 POST 一次（security.js exclude 已放行，凭上报密钥自校验）。
// 只落状态字段（时间 / 版本 / 证书天数 / 自报域名），不记录 IP，响应不含站点信息。
app.post('/imap/heartbeat', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const data = await settingService.touchHeartbeat(c, body);
	return c.json(result.ok(data));
});
