import { sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// [S37] 第三方客户端（IMAP）应用密码表：懒建表（见 imap-password-service.ensureTable），init.js 零改动
export const imapPassword = sqliteTable('imap_password', {
	imapPasswordId: integer('imap_password_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	accountId: integer('account_id').notNull(),
	name: text('name').notNull().default(''),
	hash: text('hash').notNull(),
	status: integer('status').notNull().default(0),   // 0 生效 / 1 已停用
	lastUsed: text('last_used'),
	resetTime: text('reset_time'),
	deletedAt: text('deleted_at'),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export default imapPassword
