import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// [S23] 自研：用户自己的 Telegram 通知配置
// 每个用户用自己的 bot、发到自己登记的 chat，只收自己名下账号的邮件。
// channel 预留扩展（telegram / email / webhook …），以后加通知方式不用改表。
// bot_token_enc 是 AES-GCM 密文（密钥由 jwt_secret 派生），明文只在内存里出现，绝不入库/不返回前端。
export const notifyBind = sqliteTable('notify_bind', {
	bindId: integer('bind_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	channel: text('channel').notNull().default('telegram'),
	botTokenEnc: text('bot_token_enc').notNull(),
	botUsername: text('bot_username').notNull().default(''),
	target: text('target').notNull(),
	enabled: integer('enabled').notNull().default(1),
	// [S28] 失效自愈：只统计「确定性失效」（token 被 revoke / 被 block / chat 不存在），
	// 临时故障（429、5xx、网络）不计数；连续 3 次自动 enabled=0，页面显示原因。
	failCount: integer('fail_count').notNull().default(0),
	lastError: text('last_error').default(''),
	lastFailTime: text('last_fail_time'),
	// [S32] 「Bot 查询命令」安装状态：0=未安装（只推送新邮件，行为与原来一致）；
	// 1=已安装（给这个 bot 设了 webhook + 命令菜单，可以在 TG 里发命令查邮件）
	cmdInstalled: integer('cmd_installed').notNull().default(0),
	cmdInstallTime: text('cmd_install_time'),
	cmdLastUsed: text('cmd_last_used'),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
});

// [S23] 关注站点 bot 的名单：绑定时补 user_id。
// 用途一：保存绑定时校验「确实关注了管理员 bot」（发得出去才算）；
// 用途二：为以后给所有关注者群发公告留名单。
export const notifyFollow = sqliteTable('notify_follow', {
	chatId: text('chat_id').primaryKey(),
	userId: integer('user_id'),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
});
