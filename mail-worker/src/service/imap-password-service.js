import orm from '../entity/orm';
import imapPassword from '../entity/imap-password';
import account from '../entity/account';
import { and, eq, isNull, count } from 'drizzle-orm';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import dayjs from 'dayjs';

// [S37] 第三方客户端（IMAP）应用密码：生成 / 校验 / 停用 / 删除 / 归属校验。
// 设计要点：
// - 懒建表：首次请求 CREATE TABLE IF NOT EXISTS（module 级 flag，isolate 内只跑一次）→ init.js 零改动
// - 哈希：PBKDF2-SHA256（Workers 原生 crypto.subtle，零新增依赖），明文永不落库、接口只返回一次
// - 一个应用密码绑定一个邮箱账号（account_id），IMAP 登录用户名必须等于该邮箱
// - 每账号生效中密码上限 5 个；停用不释放名额，删除才释放

const MAX_PER_ACCOUNT = 5;
const PBKDF2_ITERATIONS = 100000;
// 纯小写字母+数字，剔除 i l o 0 1（避免手抄混淆），Gmail/Fastmail 应用密码同款规格
const PWD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const PWD_LENGTH = 16;

// 懒建表状态：isolate 级内存标记
let tableReady = false;

async function ensureTable(c) {
	if (tableReady) return;
	await c.env.db.prepare(`
		CREATE TABLE IF NOT EXISTS imap_password (
			imap_password_id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			account_id INTEGER NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			hash TEXT NOT NULL,
			status INTEGER NOT NULL DEFAULT 0,
			last_used TEXT,
			reset_time TEXT,
			deleted_at TEXT,
			create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`).run();
	await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_imap_pw_account ON imap_password(account_id)`).run();
	await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_imap_pw_user ON imap_password(user_id)`).run();
	tableReady = true;
}

function b64urlEncode(buf) {
	return btoa(String.fromCharCode(...new Uint8Array(buf)))
		.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(str) {
	str = str.replace(/-/g, '+').replace(/_/g, '/');
	while (str.length % 4) str += '=';
	return Uint8Array.from(atob(str), ch => ch.charCodeAt(0));
}

async function pbkdf2Derive(password, saltBytes, iterations) {
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		{ name: 'PBKDF2' },
		false,
		['deriveBits']
	);
	return crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
		keyMaterial,
		256
	);
}

function generatePassword() {
	const buf = new Uint8Array(PWD_LENGTH);
	crypto.getRandomValues(buf);
	let out = '';
	for (let i = 0; i < PWD_LENGTH; i++) {
		out += PWD_ALPHABET[buf[i] % PWD_ALPHABET.length];
	}
	return out;
}

async function hashPassword(plain) {
	const salt = new Uint8Array(16);
	crypto.getRandomValues(salt);
	const bits = await pbkdf2Derive(plain, salt, PBKDF2_ITERATIONS);
	return `pbkdf2$${PBKDF2_ITERATIONS}$${b64urlEncode(salt)}$${b64urlEncode(bits)}`;
}

async function verifyPassword(plain, stored) {
	try {
		const [scheme, iterStr, saltStr, hashStr] = String(stored).split('$');
		if (scheme !== 'pbkdf2') return false;
		const iterations = Number(iterStr);
		const salt = b64urlDecode(saltStr);
		const bits = await pbkdf2Derive(plain, salt, iterations);
		// 常数时间比较
		const expect = b64urlDecode(hashStr);
		const a = new Uint8Array(bits);
		if (a.length !== expect.length) return false;
		let diff = 0;
		for (let i = 0; i < a.length; i++) diff |= a[i] ^ expect[i];
		return diff === 0;
	} catch (e) {
		return false;
	}
}

function now() {
	return dayjs().format('YYYY-MM-DD HH:mm:ss');
}

const imapPasswordService = {

	async ensureTable(c) {
		return ensureTable(c);
	},

	// 用户自己的账号清单（个人设置卡片选邮箱用，天然只查本人）
	async listMyAccounts(c, userId) {
		return orm(c).select({
			accountId: account.accountId,
			email: account.email,
			name: account.name,
		}).from(account).where(
			and(eq(account.userId, userId), eq(account.isDel, 0))
		).all();
	},

	// 用户的密码列表（不返回 hash），联出账号邮箱便于前端展示
	async list(c, userId) {
		const rows = await orm(c).select().from(imapPassword).where(
			and(
				eq(imapPassword.userId, userId),
				isNull(imapPassword.deletedAt)
			)
		).all();
		const accounts = await this.listMyAccounts(c, userId);
		const accMap = new Map(accounts.map(a => [a.accountId, a]));
		return rows.map(row => {
			const acc = accMap.get(row.accountId);
			return {
				imapPasswordId: row.imapPasswordId,
				accountId: row.accountId,
				accountEmail: acc ? acc.email : '',
				name: row.name,
				status: row.status,
				lastUsed: row.lastUsed,
				resetTime: row.resetTime,
				createTime: row.createTime,
			};
		});
	},

	async create(c, userId, params) {
		await ensureTable(c);
		const { accountId, name } = params;
		const accId = Number(accountId);
		if (!accId) throw new BizError(t('emptyAccountId'));
		// 归属校验：只能给自己的账号生成
		const accRow = await orm(c).select().from(account).where(
			and(eq(account.accountId, accId), eq(account.userId, userId), eq(account.isDel, 0))
		).get();
		if (!accRow) throw new BizError(t('imapPwNoAccount'));
		// 上限：生效中（含停用，停用不释放名额）≤ 5
		const cntRow = await orm(c).select({ c: count() }).from(imapPassword).where(
			and(
				eq(imapPassword.accountId, accId),
				isNull(imapPassword.deletedAt)
			)
		).get();
		if (cntRow && cntRow.c >= MAX_PER_ACCOUNT) {
			throw new BizError(t('imapPwLimit'));
		}
		const plain = generatePassword();
		const hash = await hashPassword(plain);
		const res = await orm(c).insert(imapPassword).values({
			userId,
			accountId: accId,
			name: String(name || '').slice(0, 50),
			hash,
			status: 0,
			createTime: now(),
		}).run();
		return { plain, imapPasswordId: res.meta?.last_row_id || 0 };
	},

	// 重新生成：旧密码立即作废，保留记录与名称
	async reset(c, userId, id) {
		await ensureTable(c);
		const row = await orm(c).select().from(imapPassword).where(
			and(eq(imapPassword.imapPasswordId, Number(id)), eq(imapPassword.userId, userId))
		).get();
		if (!row || row.deletedAt) throw new BizError(t('imapPwNotExist'));
		const plain = generatePassword();
		const hash = await hashPassword(plain);
		await orm(c).update(imapPassword).set({
			hash,
			status: 0,
			resetTime: now(),
		}).where(eq(imapPassword.imapPasswordId, row.imapPasswordId));
		return { plain };
	},

	// 重命名：只改 name，不动密码与状态；归属校验同 setStatus
	async rename(c, userId, id, name) {
		await ensureTable(c);
		const row = await orm(c).select().from(imapPassword).where(
			and(eq(imapPassword.imapPasswordId, Number(id)), eq(imapPassword.userId, userId))
		).get();
		if (!row || row.deletedAt) throw new BizError(t('imapPwNotExist'));
		const val = String(name || '').trim().slice(0, 50);
		if (!val) throw new BizError(t('imapPwNameRequired'));
		await orm(c).update(imapPassword).set({ name: val })
			.where(eq(imapPassword.imapPasswordId, row.imapPasswordId));
		return { name: val };
	},

	// 停用 / 启用
	async setStatus(c, userId, id, status) {
		await ensureTable(c);
		const target = Number(status) === 1 ? 1 : 0;
		const row = await orm(c).select().from(imapPassword).where(
			and(eq(imapPassword.imapPasswordId, Number(id)), eq(imapPassword.userId, userId))
		).get();
		if (!row || row.deletedAt) throw new BizError(t('imapPwNotExist'));
		await orm(c).update(imapPassword).set({ status: target })
			.where(eq(imapPassword.imapPasswordId, row.imapPasswordId));
	},

	// 删除（软删）
	async del(c, userId, id) {
		await ensureTable(c);
		const row = await orm(c).select().from(imapPassword).where(
			and(eq(imapPassword.imapPasswordId, Number(id)), eq(imapPassword.userId, userId))
		).get();
		if (!row) throw new BizError(t('imapPwNotExist'));
		await orm(c).update(imapPassword).set({ deletedAt: now(), status: 1 })
			.where(eq(imapPassword.imapPasswordId, row.imapPasswordId));
	},

	// 网关登录校验：email 必须是本人账号；成功返回 { userId, accountId }
	// 由 api 层在调用前做 IP 失败计数限流
	async verify(c, email, plain) {
		await ensureTable(c);
		const mail = String(email || '').trim().toLowerCase();
		if (!mail || !plain) return null;
		const accRow = await orm(c).select().from(account).where(
			and(eq(account.email, mail), eq(account.isDel, 0))
		).get();
		if (!accRow) return null;
		const rows = await orm(c).select().from(imapPassword).where(
			and(
				eq(imapPassword.accountId, accRow.accountId),
				eq(imapPassword.status, 0),
				isNull(imapPassword.deletedAt)
			)
		).all();
		for (const row of rows) {
			if (await verifyPassword(plain, row.hash)) {
				// last_used 60s 节流写库
				const ts = now();
				if (!row.lastUsed || dayjs(ts).diff(dayjs(row.lastUsed), 'second') >= 60) {
					try {
						await orm(c).update(imapPassword).set({ lastUsed: ts })
							.where(eq(imapPassword.imapPasswordId, row.imapPasswordId));
					} catch (e) { /* 尽力而为 */ }
				}
				return { userId: accRow.userId, accountId: accRow.accountId, email: accRow.email };
			}
		}
		return null;
	},
};

export default imapPasswordService
