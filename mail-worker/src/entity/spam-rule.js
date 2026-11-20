import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 自研定制：垃圾邮件发件人黑名单（用户级）
// ruleType 0=邮箱精确匹配 1=整域匹配；ruleValue 一律存小写，去掉前导 @
export const spamRule = sqliteTable('spam_rule', {
	ruleId: integer('rule_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	ruleValue: text('rule_value').notNull(),
	ruleType: integer('rule_type').default(0).notNull(),
	hitCount: integer('hit_count').default(0).notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
});
export default spamRule
