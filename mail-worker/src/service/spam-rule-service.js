import orm from '../entity/orm';
import spamRule from '../entity/spam-rule';
import { and, eq, inArray, sql } from 'drizzle-orm';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

// 自研定制：垃圾邮件发件人黑名单（用户级）
// 命中后由入站流程把邮件标为垃圾（spam=1），绝不拒收。
// 匹配规则只做「完整邮箱相等」或「完整域名相等」，不做子串/子域名匹配，避免误伤正常邮件。
const spamRuleService = {

	async list(c, userId) {
		return await orm(c).select({
			ruleId: spamRule.ruleId,
			ruleValue: spamRule.ruleValue,
			ruleType: spamRule.ruleType,
			hitCount: spamRule.hitCount,
			createTime: spamRule.createTime
		}).from(spamRule)
			.where(eq(spamRule.userId, userId))
			.orderBy(sql`${spamRule.ruleId} DESC`)
			.all();
	},

	async add(c, params, userId) {
		const raw = String(params?.value || '').trim().toLowerCase();
		if (!raw) {
			throw new BizError(t('spamRuleEmpty'));
		}
		// 允许用户填 @x.com，统一去掉前导 @
		const value = raw.startsWith('@') ? raw.slice(1) : raw;

		let type;
		let domain;
		if (value.includes('@')) {
			const [prefix, ...rest] = value.split('@');
			domain = rest.join('@');
			if (!prefix || !domain || domain.includes('@')) {
				throw new BizError(t('spamRuleInvalid'));
			}
			if (!this.isDomainLike(domain)) {
				throw new BizError(t('spamRuleInvalid'));
			}
			type = 0;
		} else {
			if (!this.isDomainLike(value)) {
				throw new BizError(t('spamRuleInvalid'));
			}
			domain = value;
			type = 1;
		}

		// 禁止屏蔽本站域名 / 本站邮箱
		if (this.getDomainList(c).includes(domain)) {
			throw new BizError(t('spamRuleSelfDomain'));
		}

		// 去重
		const exist = await orm(c).select({ ruleId: spamRule.ruleId }).from(spamRule)
			.where(and(eq(spamRule.userId, userId), eq(spamRule.ruleValue, value)))
			.get();
		if (exist) {
			throw new BizError(t('spamRuleExists'));
		}

		await orm(c).insert(spamRule).values({ userId, ruleValue: value, ruleType: type }).run();
		return { value, type };
	},

	async remove(c, params, userId) {
		const ids = String(params?.ruleIds || '')
			.split(',')
			.map(Number)
			.filter(id => Number.isFinite(id) && id > 0);
		if (!ids.length) {
			return { count: 0 };
		}
		const owned = await orm(c).select({ ruleId: spamRule.ruleId }).from(spamRule)
			.where(and(eq(spamRule.userId, userId), inArray(spamRule.ruleId, ids)))
			.all();
		const ownedIds = owned.map(row => row.ruleId);
		if (!ownedIds.length) {
			return { count: 0 };
		}
		await orm(c).delete(spamRule).where(inArray(spamRule.ruleId, ownedIds)).run();
		return { count: ownedIds.length };
	},

	// 入站匹配：一次查询同时比对完整邮箱与完整域名
	async match(c, userId, fromAddress) {
		const addr = String(fromAddress || '').trim().toLowerCase();
		if (!addr || !userId) {
			return null;
		}
		const domain = addr.split('@')[1] || '';
		const candidates = domain ? [addr, domain] : [addr];
		const rows = await orm(c).select().from(spamRule)
			.where(and(eq(spamRule.userId, userId), inArray(spamRule.ruleValue, candidates)))
			.all();
		return rows.length ? rows[0] : null;
	},

	// 命中计数：失败只打日志，绝不影响收信
	async increaseHit(c, ruleId) {
		try {
			await orm(c).update(spamRule)
				.set({ hitCount: sql`${spamRule.hitCount} + 1` })
				.where(eq(spamRule.ruleId, ruleId))
				.run();
		} catch (e) {
			console.error('更新垃圾邮件规则命中次数失败：', e);
		}
	},

	// 本站域名列表（小写）。c.env.domain 为 JSON 字符串或数组，非法时返回空数组（不阻断收信/添加）
	getDomainList(c) {
		let list = c.env.domain;
		if (typeof list === 'string') {
			try {
				list = JSON.parse(list);
			} catch (e) {
				list = [];
			}
		}
		if (!Array.isArray(list)) {
			list = [];
		}
		return list.map(item => String(item).trim().toLowerCase()).filter(Boolean);
	},

	isDomainLike(value) {
		return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value);
	}
};

export default spamRuleService;
