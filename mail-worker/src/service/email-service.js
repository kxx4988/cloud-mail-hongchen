import orm from '../entity/orm';
import email from '../entity/email';
import { emailListColumns, emailBriefColumns, EMAIL_LIST_TEXT_LEN } from '../lib/email-list-columns';
import { attConst, emailConst, isDel, settingConst } from '../const/entity-const';
import { and, desc, eq, gt, inArray, notInArray, lt, count, asc, sql, ne, or, like, lte, gte } from 'drizzle-orm';
import { star } from '../entity/star';
import spamRule from '../entity/spam-rule';
import settingService from './setting-service';
import accountService from './account-service';
import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
import fileUtils from '../utils/file-utils';
import { Resend } from 'resend';
import attService from './att-service';
import { parseHTML } from 'linkedom';
import userService from './user-service';
import roleService from './role-service';
import user from '../entity/user';
import starService from './star-service';
import dayjs from 'dayjs';
import { localDayStr } from '../utils/date-uitil'; // [S48] 每日发送计数按站点时区换天
import kvConst from '../const/kv-const';
import { t } from '../i18n/i18n'
import domainUtils from '../utils/domain-uitls';
import account from "../entity/account";
import { att } from '../entity/att';
import telegramService from './telegram-service';
import webhookService from './webhook-service';
import forwardMime from '../utils/forward-mime';
import verifyUtils from '../utils/verify-utils';
import { notifyMailWsFromContext } from '../websocket/notify';
import proxyService from './proxy-service';

const emailService = {

	async list(c, params, userId) {

		// 自研定制：回收站（已删除）列表
		const { deleted, spam } = params;
		let {
			emailId,
			type,
			accountId,
			size,
			timeSort,
			allReceive,
			full,
			text,
			searchType,
			startDate,
			endDate,
		} = params;
		const isDeletedList = deleted === 1 || deleted === '1' || type === 'delete';
		// 自研定制：垃圾邮件列表（只收 type=0 的收件，spam=1）
		const isSpamList = !isDeletedList && (spam === 1 || spam === '1');

		size = Number(size);
		emailId = Number(emailId) || 0;
		timeSort = Number(timeSort);
		accountId = Number(accountId);
		allReceive = Number(allReceive);
		full = Number(full);

		if (!isDeletedList) {
			type = Number(type);
			if (isNaN(type)) {
				type = 0;
			}
		}

		// 游标项的置顶值：用于「置顶优先」排序下的复合游标翻页
		let cursorTop = 0;
		if (emailId) {
			const cursorRow = await orm(c).select({ top: email.top }).from(email).where(eq(email.emailId, emailId)).get();
			cursorTop = cursorRow ? cursorRow.top : 0;
		}

		if (isNaN(accountId)) {
			throw new BizError(t('emptyAccountId'));
		}

		if (isNaN(size)) {
			size = 10;
		}

		if (isNaN(full)) {
			full = 1;
		}

		full = full === 1;

		if (size > 50) {
			size = 50;
		}

		if (isNaN(allReceive)) {
			let accountRow = await accountService.selectById(c, accountId);
			allReceive = accountRow.allReceive;
		}

		// 自研定制：isDeletedList / cursorTop 参与过滤；v3.4.0 官方：text/searchType/startDate/endDate 高级搜索
		const filters = this.emailListFilters({
			userId,
			accountId,
			type,
			allReceive,
			emailId,
			timeSort,
			isDeletedList,
			isSpamList,
			cursorTop,
			text,
			searchType,
			startDate,
			endDate,
		});
		const countFilters = this.emailListFilters({
			userId,
			accountId,
			type,
			allReceive,
			withCursor: false,
			isDeletedList,
			isSpamList,
			cursorTop,
			text,
			searchType,
			startDate,
			endDate,
		});
		const columns = full ? emailListColumns : emailBriefColumns;

		const query = orm(c)
			.select({
				...columns,
				starId: star.starId
			})
			.from(email)
			.leftJoin(
				star,
				and(
					eq(star.emailId, email.emailId),
					eq(star.userId, userId)
				)
			)
			.innerJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(and(...filters));

		if (timeSort) {
			query.orderBy(asc(email.top), asc(email.emailId));
		} else {
			query.orderBy(desc(email.top), desc(email.emailId));
		}

		const listQuery = query.limit(size).all();

		const totalQuery = orm(c).select({ total: count() }).from(email)
			.innerJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(and(...countFilters))
			.get();

		const latestEmailQuery = orm(c).select({
			emailId: email.emailId,
			accountId: email.accountId,
			userId: email.userId,
		}).from(email).where(
			and(
				eq(email.userId, userId),
				isDeletedList ? eq(email.isDel, isDel.DELETE) : eq(email.isDel, isDel.NORMAL),
				isDeletedList ? undefined : eq(email.type, type),
				// 自研定制：垃圾邮件不算收件箱的「有新邮件」
				(isDeletedList || isSpamList) ? undefined : (type === emailConst.type.RECEIVE ? eq(email.spam, 0) : undefined),
				allReceive ? undefined : eq(email.accountId, accountId)
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		list = list.map(item => ({
			...item,
			isStar: item.starId != null ? 1 : 0
		}));

		// 自动清理倒计时：算清这封邮件「会不会被自动清理、何时被清理」，不会清就不返回字段，前端据此决定是否显示胶囊
		// 回收站按删除时间算倒计时；垃圾邮件按「标记时间 + 垃圾邮件天数」算，两者共用前端同一个胶囊
		if (isSpamList) {
			await this.applySpamDeleteAt(c, userId, list);
		} else {
			await this.applyAutoDeleteAt(c, userId, list);
		}

		if (full) {
			await this.emailAddAtt(c, list);
		} else {
			this.applyListText(list);
		}

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: accountId,
				userId: userId,
			}
		}

		return { list, total: totalRow.total, latestEmail };
	},

	// 自动清理倒计时：只有「确实会被自动清理」的邮件才算 autoDeleteAt（毫秒时间戳）。
	// 开启「仅清理已删除邮件」时按 delete_time 算，否则全量清理按 create_time 算，与 cron 的判定保持一致。
	async applyAutoDeleteAt(c, userId, list) {
		if (!list || !list.length) {
			return;
		}

		const { autoCleanDays, autoCleanDeletedOnly, autoCleanExclude } = await settingService.query(c);
		const days = Number(autoCleanDays);
		const deletedOnly = Number(autoCleanDeletedOnly) === 1;
		let enabled = !!days && days > 0;

		// 「排除用户」名单里的账号永不被清理，不能给它们显示倒计时（否则是假倒计时）
		if (enabled && autoCleanExclude) {
			const excludeEmails = String(autoCleanExclude)
				.split(/[,，]/)
				.map(item => item.trim())
				.filter(Boolean);
			if (excludeEmails.length) {
				const userRow = await orm(c).select({ email: user.email }).from(user).where(eq(user.userId, userId)).get();
				const myEmail = String(userRow?.email || '').toLowerCase();
				if (myEmail && excludeEmails.some(item => item.toLowerCase() === myEmail)) {
					enabled = false;
				}
			}
		}

		const span = enabled ? days * 86400000 : 0;
		for (const item of list) {
			if (enabled) {
				const base = deletedOnly ? item.deleteTime : item.createTime;
				const raw = String(base || '');
				if (raw) {
					const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
					// DB 里存的是 UTC 字符串，补 Z 才是绝对时间；与服务端 cron 的 cutoff 口径一致
					const at = Date.parse(iso.endsWith('Z') ? iso : iso + 'Z');
					if (Number.isFinite(at)) {
						item.autoDeleteAt = at + span;
					}
				}
			}
			// delete_time 只用于服务端算倒计时，不下发前端
			delete item.deleteTime;
		}
	},

	// 自研定制：垃圾邮件「还剩几天删除」——从「标记为垃圾的时间」起算，与 cron 判定口径完全一致
	async applySpamDeleteAt(c, userId, list) {
		if (!list || !list.length) {
			return;
		}

		const { spamCleanDays, autoCleanExclude } = await settingService.query(c);
		const days = Number(spamCleanDays);
		let enabled = !!days && days > 0;

		// 「排除用户」名单里的账号永不被自动清理，不能给它们显示假倒计时
		if (enabled && autoCleanExclude) {
			const excludeEmails = String(autoCleanExclude)
				.split(/[,，]/)
				.map(item => item.trim())
				.filter(Boolean);
			if (excludeEmails.length) {
				const userRow = await orm(c).select({ email: user.email }).from(user).where(eq(user.userId, userId)).get();
				const myEmail = String(userRow?.email || '').toLowerCase();
				if (myEmail && excludeEmails.some(item => item.toLowerCase() === myEmail)) {
					enabled = false;
				}
			}
		}

		const span = enabled ? days * 86400000 : 0;
		for (const item of list) {
			if (enabled) {
				const raw = String(item.spamTime || '');
				if (raw) {
					const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
					// DB 存 UTC 字符串，补 Z 才是绝对时间
					const at = Date.parse(iso.endsWith('Z') ? iso : iso + 'Z');
					if (Number.isFinite(at)) {
						item.autoDeleteAt = at + span;
					}
				}
			}
			// spam_time 只用于服务端算倒计时，不下发前端
			delete item.spamTime;
		}
	},

	toListText(item) {
		const raw = emailUtils.formatText(item.text) || emailUtils.htmlToText(item.content);
		return raw.replace(/\s+/g, ' ').trim().slice(0, EMAIL_LIST_TEXT_LEN);
	},

	applyListText(list) {
		for (const item of list) {
			item.text = this.toListText(item);
			delete item.content;
		}
		return list;
	},

	// 时间范围先通过窄索引筛出 ID，避免逐行读取大字段之后的 create_time。
	createTimeCondition({ startDate, endDate, userId }) {
		if (!startDate && !endDate) return null;
		const parts = [];
		if (userId) parts.push(sql`e.user_id = ${userId}`);
		if (startDate) parts.push(sql`e.create_time >= ${startDate}`);
		if (endDate) parts.push(sql`e.create_time <= ${endDate}`);
		return sql`${email.emailId} IN (SELECT e.email_id FROM email AS e WHERE ${sql.join(parts, sql` AND `)})`;
	},

	// 两个地址分别扫描各自的索引；UNION 去重，避免同时命中时重复计数。
	// 显式指定索引，避免 D1 为 UNION 合并排序而改用表扫描。
	emailAddressCondition(pattern) {
		return sql`${email.emailId} IN (
			SELECT e.email_id FROM email AS e INDEXED BY idx_email_to_email_nocase WHERE e.to_email COLLATE NOCASE LIKE ${pattern}
			UNION
			SELECT e.email_id FROM email AS e INDEXED BY idx_email_send_email_nocase WHERE e.send_email COLLATE NOCASE LIKE ${pattern}
		)`;
	},

	emailListFilters({
		userId,
		accountId,
		type,
		allReceive,
		emailId,
		timeSort,
		withCursor = true,
		// 自研定制
		isDeletedList = false,
		isSpamList = false,
		cursorTop = 0,
		// v3.4.0 官方高级搜索
		text,
		searchType,
		startDate,
		endDate,
	}) {
		const conditions = [
			eq(email.userId, userId),
			eq(account.isDel, isDel.NORMAL),
		];
		if (isDeletedList) {
			conditions.push(eq(email.isDel, isDel.DELETE));
		} else {
			conditions.push(eq(email.type, type));
			conditions.push(eq(email.isDel, isDel.NORMAL));
			if (isSpamList) {
				// 垃圾邮件列表：只看被标记为垃圾的
				conditions.push(eq(email.spam, 1));
			} else if (type === emailConst.type.RECEIVE) {
				// 收件箱：垃圾邮件不进收件箱
				conditions.push(eq(email.spam, 0));
			}
		}
		if (!allReceive) {
			conditions.push(eq(email.accountId, accountId));
		}
		// 复合游标：置顶优先排序下，翻页需同时按 top 与 emailId 截断
		if (withCursor && emailId) {
			if (timeSort) {
				conditions.push(or(gt(email.top, cursorTop), and(eq(email.top, cursorTop), gt(email.emailId, emailId))));
			} else {
				conditions.push(or(lt(email.top, cursorTop), and(eq(email.top, cursorTop), lt(email.emailId, emailId))));
			}
		}

		if (text?.trim() && searchType) {
			const searchText = `%${text.trim()}%`;

			if (searchType === 'subject') {
				conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${searchText}`);
			}

			if (searchType === 'content') {
				conditions.push(
					or(
						sql`${email.text} COLLATE NOCASE LIKE ${searchText}`,
						sql`${email.content} COLLATE NOCASE LIKE ${searchText}`,
					)
				);
			}

			if (searchType === 'sender') {
				conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${searchText}`);
			}

			if (searchType === 'senderAddress') {
				conditions.push(sql`${email.sendEmail} COLLATE NOCASE LIKE ${searchText}`);
			}

			if (searchType === 'recipientAddress') {
				conditions.push(sql`${email.toEmail} COLLATE NOCASE LIKE ${searchText}`);
			}
		}

		const timeCond = this.createTimeCondition({ startDate, endDate, userId });
		if (timeCond) conditions.push(timeCond);

		return conditions;
	},

	allEmailListFilters({ emailId, name, subject, accountEmail, userEmail, type, timeSort, withCursor = true, text, searchType, startDate, endDate }) {
		const conditions = [
			ne(email.status, emailConst.status.SAVING)
		];

		if (type === 'send') {
			conditions.push(eq(email.type, emailConst.type.SEND));
		}

		if (type === 'receive') {
			conditions.push(eq(email.type, emailConst.type.RECEIVE));
		}

		if (type === 'delete') {
			conditions.push(eq(email.isDel, isDel.DELETE));
		}

		if (type === 'noone') {
			conditions.push(eq(email.status, emailConst.status.NOONE));
		}

		// 自研定制：管理端按「垃圾邮件」筛选
		if (type === 'spam') {
			conditions.push(eq(email.spam, 1));
		}

		if (userEmail) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${userEmail + '%'}`);
		}

		if (accountEmail) {
			conditions.push(this.emailAddressCondition(accountEmail + '%'));
		}

		if (name) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${name + '%'}`);
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject + '%'}`);
		}

		if (text?.trim() && searchType) {
			const searchText = `%${text.trim()}%`;

			if (searchType === 'subject') {
				conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${searchText}`);
			}

			if (searchType === 'sender') {
				conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${searchText}`);
			}

			if (searchType === 'senderAddress') {
				conditions.push(sql`${email.sendEmail} COLLATE NOCASE LIKE ${searchText}`);
			}

			if (searchType === 'user') {
				conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${searchText}`);
			}

			if (searchType === 'account') {
				conditions.push(this.emailAddressCondition(searchText));
			}
		}

		const timeCond = this.createTimeCondition({ startDate, endDate });
		if (timeCond) conditions.push(timeCond);

		if (withCursor && emailId) {
			conditions.push(timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId));
		}

		return conditions;
	},

	async delete(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = emailIds.split(',').map(Number);
		const { syncDelete } = await settingService.query(c);

		if (syncDelete === settingConst.syncDelete.OPEN) {
			const owned = await orm(c).select({ emailId: email.emailId }).from(email)
				.where(and(eq(email.userId, userId), inArray(email.emailId, emailIdList)))
				.all();
			const ownedIds = owned.map(row => row.emailId);
			if (ownedIds.length) {
				await this.physicsDelete(c, { emailIds: ownedIds.join(',') });
			}
			return;
		}

		const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
		await orm(c).update(email).set({ isDel: isDel.DELETE, deleteTime: now }).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIdList)))
			.run();
	},

	receive(c, params, cidAttList, r2domain) {
		params.content = this.imgReplace(params.content, cidAttList, r2domain)
		return orm(c).insert(email).values({ ...params }).returning().get();
	},

	normalizeAddressList(value) {
		if (value == null || value === '') {
			return [];
		}
		const list = Array.isArray(value) ? value : [value];
		const result = [];
		const seen = new Set();
		for (const item of list) {
			const address = String(item ?? '').trim();
			if (!address) {
				continue;
			}
			if (!verifyUtils.isEmail(address)) {
				throw new BizError(t('notEmail'));
			}
			const key = address.toLowerCase();
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			result.push(address);
		}
		return result;
	},

	// 发送入口：公共校验、参数准备、渠道选择和结果汇总。
	async send(c, params, userId) {
		let {
			accountId, //发送账号id
			name, //发件人名字
			sendType, //发件类型
			emailId, //邮件id，如果是回复邮件会带
			receiveEmail, //收件人邮箱
			ccEmail, //抄送
			bccEmail, //密送
			text, //邮件纯文本
			content, //邮件内容
			subject, //邮件标题
			attachments = [] //附件
		} = params;

		ccEmail = this.normalizeAddressList(ccEmail);
		bccEmail = this.normalizeAddressList(bccEmail);
		const takenAddress = new Set((receiveEmail || []).map(item => String(item).toLowerCase()));
		ccEmail = ccEmail.filter(address => !takenAddress.has(address.toLowerCase()));
		ccEmail.forEach(address => takenAddress.add(address.toLowerCase()));
		bccEmail = bccEmail.filter(address => !takenAddress.has(address.toLowerCase()));

		const { resendTokens, r2Domain, send, domainList } = await settingService.query(c);

		// 引用正文里的 /proxy?url= 还原成原始外链再发。
		content = proxyService.restoreHtml(content);
		let { imageDataList, html } = await attService.toImageUrlHtml(c, content);

		//判断是否关闭发件功能
		if (send === settingConst.send.CLOSE) {
			throw new BizError(t('disabledSend'), 403);
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		// 分开发送不带抄送和密送。
		const separate = params.manyType === 'divide';
		if (separate) {
			ccEmail = [];
			bccEmail = [];
		}
		const copyCount = ccEmail.length + bccEmail.length;
		const quotaCount = receiveEmail.length + copyCount;

		//判断接收方是不是全部为站内邮箱
		const allInternal = [...receiveEmail, ...ccEmail, ...bccEmail].every(email => {
			const domain = '@' + emailUtils.getDomain(email);
			return domainList.includes(domain);
		});

		if (c.env.admin !== userRow.email) {

			//发件被禁用
			if (roleRow.sendType === 'ban') {
				throw new BizError(t('bannedSend'), 403);
			}

			//发件被禁用
			if (roleRow.sendType === 'internal' && !allInternal) {
				throw new BizError(t('onlyInternalSend'), 403);
			}

		}

		//如果不是管理员，权限设置了发送次数
		if (c.env.admin !== userRow.email && roleRow.sendCount) {

			if (userRow.sendCount >= roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLimit'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLimit'), 403);
			}

			if (userRow.sendCount + quotaCount > roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLack'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLack'), 403);
			}

		}

		const accountRow = await accountService.selectById(c, accountId);

		if (!accountRow) {
			throw new BizError(t('senderAccountNotExist'));
		}

		if (accountRow.userId !== userId) {
			throw new BizError(t('sendEmailNotCurUser'));
		}

		if (c.env.admin !== userRow.email) {
			//用户没有这个域名的使用权限
			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, accountRow.email)) {
				throw new BizError(t('noDomainPermSend'),403)
			}

		}

		const domain = emailUtils.getDomain(accountRow.email);
		const resendToken = resendTokens[domain];
		const useCloudflareEmail = !!c.env.email;

		//如果接收方存在站外邮箱，又没有发信服务
		if (!useCloudflareEmail && !resendToken && !allInternal) {
			throw new BizError(t('noSendProvider'));
		}

		//没有发件人名字自动截取
		if (!name) {
			name = emailUtils.getName(accountRow.email);
		}

		let emailRow = {
			messageId: null
		};

		//如果是回复邮件
		if (sendType === 'reply') {

			emailRow = await this.selectById(c, emailId);

			if (!emailRow) {
				throw new BizError(t('notExistEmailReply'));
			}

		}

		const sendParams = {
			name,
			accountEmail: accountRow.email,
			receiveEmail,
			ccEmail,
			bccEmail,
			subject,
			text,
			html,
			attachments: [...imageDataList, ...attachments],
			sendType,
			messageId: emailRow.messageId
		};

		if (imageDataList.length > 10) {
			throw new BizError(t('imageAttLimit'));
		}
		if (attachments.length > 10) {
			throw new BizError(t('attLimit'));
		}

		if (!allInternal) {
			const perMessageCount = (separate ? 1 : receiveEmail.length) + copyCount;
			if (perMessageCount > 50) {
				throw new BizError(t('recipientLimit'));
			}
		}

		// sendParams 用于渠道请求，saveParams 保留保存记录所需的账号、权限和附件数据。
		const context = {
			separate, allInternal, useCloudflareEmail, resendToken, sendParams,
			saveParams: {
				accountId, userId, name, subject, text, html,
				sendEmail: accountRow.email,
				ccEmail, bccEmail,
				messageId: emailRow.messageId,
				sendType, useCloudflareEmail, roleRow, r2Domain,
				imageDataList, attachments
			}
		};

		// 全部站内收件人走本地投递；存在站外收件人时优先 CF，其次 Resend。
		let deliveries;
		if (allInternal) {
			deliveries = this.sendInternal(c, context);
		} else if (useCloudflareEmail) {
			deliveries = this.sendCloudflare(c, context);
		} else {
			deliveries = this.sendResend(c, context);
		}

		const emailResults = [];
		let sendError = '';

		// 渠道每完成一组发送并保存记录后返回结果，后续发送失败仍保留已完成部分。
		for await (const delivery of deliveries) {
			if (delivery.error) {
				sendError = delivery.error.message;
				break;
			}

			emailResults.push(...delivery.emails);
		}

		if (!separate) {
			if (sendError) throw new BizError(sendError);
			return emailResults;
		}

		// 分开发送只返回尚未完成的收件人，供前端保留并重试。
		const sentRecipients = emailResults.flatMap(item =>
			JSON.parse(item.recipient).map(recipient => recipient.address)
		);
		return {
			emails: emailResults,
			failedRecipients: sendParams.receiveEmail.filter(address => !sentRecipients.includes(address)),
			error: sendError
		};
	},

	// 站内发送：普通发送共用一条发件记录，分开发送则每人一条，再写入站内收件箱。
	async *sendInternal(c, { separate, sendParams, saveParams }) {
		const recipientGroups = separate
			? sendParams.receiveEmail.map(address => [address])
			: [sendParams.receiveEmail];
		for (const receiveEmail of recipientGroups) {
			const emailResult = await this.saveSentEmail(c, { ...saveParams, receiveEmail });
			const inboxAddresses = [...receiveEmail, ...sendParams.ccEmail, ...sendParams.bccEmail];
			const emailRowList = await this.HandleOnSiteEmail(c, inboxAddresses, emailResult, emailResult.attList);
			await this.forwardOnSiteEmail(c, emailRowList, { sendParams: { ...sendParams, receiveEmail } });
			yield { emails: [emailResult] };
		}
	},

	// CF 发送：普通发送一次提交所有收件人，分开发送逐人调用并保存结果。
	async *sendCloudflare(c, { separate, sendParams, saveParams }) {
		const recipientGroups = separate
			? sendParams.receiveEmail.map(address => [address])
			: [sendParams.receiveEmail];
		for (const receiveEmail of recipientGroups) {
			let result;
			try {
				result = await this.sendByCloudflareEmail(c, { ...sendParams, receiveEmail });
			} catch (error) {
				if (!separate) throw error;
				// 分开发送遇到渠道错误即停止，已成功的记录由入口汇总。
				yield { error: { message: error.message } };
				return;
			}
			const emailResult = await this.saveSentEmail(c, {
				...saveParams, receiveEmail, providerId: result.data.id
			});
			yield { emails: [emailResult] };
		}
	},

	// Resend 分开发送一次最多提交 100 封独立邮件，普通发送仍调用单封接口。
	async *sendResend(c, { separate, resendToken, sendParams, saveParams }) {
		if (separate && sendParams.receiveEmail.length > 100) {
			throw new BizError(t('resendRecipientLimit'));
		}
		// 批量接口不支持附件，包含正文转换得到的内嵌附件。
		if (separate && sendParams.attachments.length > 0) {
			throw new BizError(t('resendSeparateAttachments'));
		}
		let result;
		try {
			result = separate
				? await this.sendBatchByResend(resendToken, sendParams)
				: await this.sendByResend(resendToken, sendParams);
		} catch (error) {
			if (!separate) throw error;
			yield { error: { message: error.message } };
			return;
		}
		if (result.error) {
			yield { error: result.error };
			return;
		}
		// 严格校验模式下，批量返回的邮件 ID 按提交顺序对应各收件人。
		const items = separate
			? sendParams.receiveEmail.map((address, index) => ({
				receiveEmail: [address], id: result.data.data[index].id
			}))
			: [{ receiveEmail: sendParams.receiveEmail, id: result.data?.id }];
		const emails = [];
		for (const item of items) {
			emails.push(await this.saveSentEmail(c, {
				...saveParams, receiveEmail: item.receiveEmail, providerId: item.id
			}));
		}
		yield { emails };
	},

	// 三个渠道共用的发件记录保存：恢复正文图片 URL、保存附件并更新发送计数。
	async saveSentEmail(c, params) {
		const {
			accountId, userId, name, subject, text, html, sendEmail, receiveEmail,
			ccEmail = [], bccEmail = [],
			providerId, messageId, sendType, useCloudflareEmail,
			roleRow, r2Domain, attachments
		} = params;
		const imageDataList = params.imageDataList.map(item => ({
			...item, contentId: `<${item.contentId.replace(/^<|>$/g, '')}>`
		}));
		const emailData = {
			sendEmail, name, subject, text, accountId, userId,
			content: this.imgReplace(html, imageDataList, r2Domain),
			status: useCloudflareEmail ? emailConst.status.DELIVERED : emailConst.status.SENT,
			type: emailConst.type.SEND,
			resendEmailId: providerId,
			recipient: JSON.stringify(receiveEmail.map(address => ({ address, name: '' }))),
			cc: JSON.stringify(ccEmail.map(address => ({ address, name: '' }))),
			bcc: JSON.stringify(bccEmail.map(address => ({ address, name: '' })))
		};
		if (sendType === 'reply') {
			emailData.inReplyTo = messageId;
			emailData.relation = messageId;
		}
		const deliveredCount = receiveEmail.length + ccEmail.length + bccEmail.length;
		if (roleRow.sendCount && roleRow.sendType !== 'internal') {
			await userService.incrUserSendCount(c, deliveredCount, userId);
		}

		const emailResult = await orm(c).insert(email).values(emailData).returning().get();

		if (imageDataList.length > 0) {
			await attService.saveArticleAtt(c, imageDataList, userId, accountId, emailResult.emailId);
		}

		if (attachments?.length > 0) {
			await attService.saveSendAtt(c, attachments, userId, accountId, emailResult.emailId);
		}

		const attList = await attService.selectByEmailIds(c, [emailResult.emailId]);
		emailResult.attList = attList;

		// [S48] 按站点时区的「今天」分桶（原 dayjs().format 是 UTC 天，北京时间 08:00 才换天）
		const dateStr = localDayStr();
		let daySendTotal = await c.env.kv.get(kvConst.SEND_DAY_COUNT + dateStr);

		//记录每天发件次数统计
		if (!daySendTotal) {
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(deliveredCount), { expirationTtl: 60 * 60 * 24 });
		} else  {
			daySendTotal = Number(daySendTotal) + deliveredCount
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(daySendTotal), { expirationTtl: 60 * 60 * 24 });
		}

		return emailResult;
	},

	// 附件已在 Resend 处理器中校验，批量接口为每位收件人构造独立邮件。
	async sendBatchByResend(resendToken, params) {
		const resend = new Resend(resendToken);
		const sendForm = {
			from: `${params.name} <${params.accountEmail}>`,
			subject: params.subject,
			text: params.text,
			html: params.html
		};
		if (params.sendType === 'reply' && params.messageId) {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}
		return resend.batch.send(params.receiveEmail.map(address => ({
			...sendForm,
			to: [address],
			...(params.ccEmail.length > 0 ? { cc: params.ccEmail } : {}),
			...(params.bccEmail.length > 0 ? { bcc: params.bccEmail } : {})
		})), { batchValidation: 'strict' });
	},

	async sendByCloudflareEmail(c, params) {
		const sendForm = {
			from: { email: params.accountEmail, name: params.name },
			to: [...params.receiveEmail],
			subject: params.subject
		};

		if (params.ccEmail.length > 0) {
			sendForm.cc = [...params.ccEmail];
		}

		if (params.bccEmail.length > 0) {
			sendForm.bcc = [...params.bccEmail];
		}

		if (params.text) {
			sendForm.text = params.text;
		}

		if (params.html) {
			sendForm.html = params.html;
		}

		const attachments = await this.toCloudflareAttachments(params.attachments);
		if (attachments.length > 0) {
			sendForm.attachments = attachments;
		}

		if (params.sendType === 'reply' && params.messageId) {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}

		const result = await c.env.email.send(sendForm);

		return {
			data: {
				id: result.messageId
			}
		};
	},

	async sendByResend(resendToken, params) {
		const resend = new Resend(resendToken);

		const sendForm = {
			from: `${params.name} <${params.accountEmail}>`,
			to: [...params.receiveEmail],
			subject: params.subject,
			text: params.text,
			html: params.html,
			attachments: await this.toResendAttachments(params.attachments)
		};

		if (params.ccEmail.length > 0) {
			sendForm.cc = [...params.ccEmail];
		}

		if (params.bccEmail.length > 0) {
			sendForm.bcc = [...params.bccEmail];
		}

		if (params.sendType === 'reply') {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}

		return await resend.emails.send(sendForm);
	},

	async toCloudflareAttachments(attachments) {
		const arrayBufferAttachments = await this.toArrayBufferAttachments(attachments);

		return arrayBufferAttachments.map(attachment => {
			const item = {
				content: attachment.content,
				filename: attachment.filename,
				type: attachment.mimeType || attachment.contentType || attachment.type || 'application/octet-stream',
				disposition: attachment.contentId ? 'inline' : 'attachment'
			};

			if (attachment.contentId) {
				item.contentId = attachment.contentId.replace(/^<|>$/g, '');
			}

			return item;
		});
	},

	async toResendAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentBase64(attachment);
			if (!content) {
				continue;
			}

			result.push({
				...attachment,
				content,
				contentType: attachment.contentType || attachment.mimeType || attachment.type || 'application/octet-stream'
			});
		}

		return result;
	},

	async toArrayBufferAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentArrayBuffer(attachment);
			if (!content) {
				continue;
			}

			result.push({ ...attachment, content });
		}

		return result;
	},

	async toAttachmentBase64(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return content.replace(/\s+/g, '');
		}

		const arrayBuffer = await this.toAttachmentArrayBuffer(attachment);
		if (!arrayBuffer) {
			return null;
		}

		const bytes = new Uint8Array(arrayBuffer);
		let binary = '';

		for (let i = 0; i < bytes.length; i += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		}

		return btoa(binary);
	},

	async toAttachmentArrayBuffer(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (content instanceof ArrayBuffer) {
			return content;
		}

		if (content instanceof Uint8Array) {
			return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return fileUtils.base64ToUint8Array(content.replace(/\s+/g, '')).buffer;
		}

		return content;
	},

	//处理站内邮件发送
	async HandleOnSiteEmail(c, receiveEmail, sendEmailData, attList) {

		const { noRecipient  } = await settingService.query(c);

		//查询所有收件人账号信息
		let accountList = await orm(c).select().from(account).where(inArray(sql`${account.email} COLLATE NOCASE`, receiveEmail)).all();

		// 对于含+未精确匹配的收件人，获取基础地址账号
		const plusEmails = receiveEmail.filter(
			e => e.includes('+') && !accountList.some(a => a.email.toLowerCase() === e.toLowerCase())
		);
		const baseAccounts = [];
		if (plusEmails.length > 0) {
			const baseEmails = [...new Set(
				plusEmails.map(e => emailUtils.getBaseEmail(e)).filter(Boolean)
			)];
			const existing = new Set(accountList.map(a => a.email.toLowerCase()));
			const needed = baseEmails.filter(e => !existing.has(e.toLowerCase()));
			if (needed.length > 0) {
				const rows = await orm(c).select().from(account)
					.where(inArray(sql`${account.email} COLLATE NOCASE`, needed)).all();
				baseAccounts.push(...rows);
			}
		}

		// 合并精确匹配和基础地址匹配的账号用于权限查询
		const allAccounts = [...accountList, ...baseAccounts];

		//查询所有收件人权限身份
		const userIds = allAccounts.map(accountRow => accountRow.userId);
		let roleList = await roleService.selectByUserIds(c, userIds);

		//封装数据库准备保存到数据库
		const emailDataList = [];

		for (const email of receiveEmail) {

			//把发件人邮件改成收件
			const emailValues = {...sendEmailData}
			emailValues.bcc = '[]';
			emailValues.status = emailConst.status.RECEIVE;
			emailValues.type = emailConst.type.RECEIVE;
			emailValues.toEmail = email;
			emailValues.toName = emailUtils.getName(email);
			emailValues.emailId = null;

			let accountRow = allAccounts.find(accountRow => accountRow.email.toLowerCase() === email.toLowerCase());

			// 精确匹配不到时回退到主地址（去掉 +tag）
			if (!accountRow && email.includes('+')) {
				const baseEmail = emailUtils.getBaseEmail(email);
				accountRow = allAccounts.find(accountRow => accountRow.email.toLowerCase() === baseEmail.toLowerCase());
			}

			//如果收件人存在就把邮件信息改成收件人的
			if (accountRow) {

				//设置给收件人保存
				emailValues.userId = accountRow.userId;
				emailValues.accountId = accountRow.accountId;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.RECEIVE;

				const roleRow = roleList.find(roleRow => roleRow.userId === accountRow.userId);

				let { banEmail, availDomain } = roleRow;

				//如果收件人没有这个域名的使用权限和有邮件拦截，就把邮件改为拒收状态
				if (email !== c.env.admin) {

					if (!roleService.hasAvailDomainPerm(availDomain, email)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is not authorized to use this domain.`;
					} else if(roleService.isBanEmail(banEmail, sendEmailData.sendEmail)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is disabled from receiving emails.`;
					}

				}

				emailDataList.push(emailValues);

			} else {

				//设置无收件人邮件信息
				emailValues.userId = 0;
				emailValues.accountId = 0;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.NOONE;

				//如果无人收件关闭改为拒收
				if (noRecipient === settingConst.noRecipient.CLOSE) {
					emailValues.status = emailConst.status.BOUNCED;
					emailValues.message = `Recipient not found: <${email}>`;
				}

				emailDataList.push(emailValues);

			}

		}

		//保存邮件
		const receiveEmailList = emailDataList.filter(emailRow => emailRow.status === emailConst.status.RECEIVE || emailRow.status === emailConst.status.NOONE);
		const emailRowList = [];

		for (const emailData of receiveEmailList) {

			const emailRow = await orm(c).insert(email).values(emailData).returning().get();
			emailRowList.push(emailRow);
			// 站内信同样：有 userId 推收件箱，无人收件只推全部邮件。
			notifyMailWsFromContext(c, emailRow);

			//设置附件保存
			for (const attRow of attList) {
				const attValues = {...attRow};
				attValues.emailId = emailRow.emailId;
				attValues.accountId = emailRow.accountId;
				attValues.userId = emailRow.userId;
				attValues.attId = null;
				await orm(c).insert(att).values(attValues).run();
			}

		}

		const bouncedEmail = emailDataList.find(emailRow => emailRow.status === emailConst.status.BOUNCED);


		let status = emailConst.status.DELIVERED;
		let message = ''
		//如果有拒收邮件，就把发件人的邮件改成拒收
		if (bouncedEmail) {
			const messageJson = { message: bouncedEmail.message };
			message = JSON.stringify(messageJson);
			status = emailConst.status.BOUNCED;
		}

		await orm(c).update(email).set({ status, message: message }).where(eq(email.emailId, sendEmailData.emailId)).run();

		return emailRowList;
	},

	// 规则转发：只按所属用户登录邮箱匹配，名单仍存在 rule_email。
	matchForwardRule({ ruleEmail, userEmail }) {
		const users = String(ruleEmail || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
		return !!(userEmail && users.includes(String(userEmail).toLowerCase()));
	},

	//站内邮件不经过 email 事件，在这里按转发规则推送
	async forwardOnSiteEmail(c, emailRowList, { sendParams }) {

		const { tgBotStatus, tgChatId, forwardStatus, forwardEmail, webhookStatus, webhookUrl, webhookRetry, webhookSecret, ruleEmail, ruleType } = await settingService.query(c);

		if (ruleType === settingConst.ruleType.RULE) {
			const userIds = [...new Set(emailRowList.map(row => row.userId).filter(Boolean))];
			const userRows = userIds.length
				? await orm(c).select({ userId: user.userId, email: user.email }).from(user).where(inArray(user.userId, userIds)).all()
				: [];
			const userEmailById = Object.fromEntries(userRows.map(row => [row.userId, row.email]));
			emailRowList = emailRowList.filter(emailRow => this.matchForwardRule({
				ruleEmail,
				userEmail: userEmailById[emailRow.userId]
			}));
		}

		for (const emailRow of emailRowList) {

			//转发到TG
			if (tgBotStatus === settingConst.tgBotStatus.OPEN && tgChatId) {
				await telegramService.sendEmailToBot(c, emailRow);
			}

			//转发到 Webhook
			if (webhookStatus === settingConst.webhookStatus.OPEN && webhookUrl) {
				await webhookService.sendEmail(c, emailRow, webhookUrl, webhookRetry, webhookSecret);
			}

		}

		//转发到其他邮箱。发件人用站内实际发件人，信头收件人保留原收件人，信封送到已验证地址。
		if (forwardStatus === settingConst.forwardStatus.OPEN && forwardEmail && emailRowList.length > 0) {

			const addresses = forwardEmail.split(',').map(address => address.trim()).filter(Boolean);
			const params = {
				...sendParams,
				attachments: await this.toCloudflareAttachments(sendParams.attachments || []),
				receiveEmail: emailRowList.map(row => ({ address: row.toEmail, name: row.toName || '' })).filter(item => item.address)
			};

			await Promise.all(addresses.map(async address => {

				try {
					const result = await forwardMime.send(c.env.forward, params, address);
					if (result?.error) {
						console.error(`转发邮箱 ${address} 失败：`, result.error);
					}
				} catch (e) {
					console.error(`转发邮箱 ${address} 失败：`, e);
				}

			}));

		}

	},

	imgReplace(content, cidAttList, r2domain) {

		if (!content) {
			return ''
		}

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		const useAtts = []

		for (const img of images) {

			const src = img.getAttribute('src');
			if (src && src.startsWith('cid:') && cidAttList) {

				const cid = src.replace(/^cid:/, '');
				const attCidIndex = cidAttList.findIndex(cidAtt => cidAtt.contentId.replace(/^<|>$/g, '') === cid);

				if (attCidIndex > -1) {
					const cidAtt = cidAttList[attCidIndex];
					img.setAttribute('src', '{{domain}}' + cidAtt.key);
					useAtts.push(cidAtt)
				}

			}

			r2domain = domainUtils.toOssDomain(r2domain)

			if (src && src.startsWith(r2domain + '/')) {
				img.setAttribute('src', src.replace(r2domain + '/', '{{domain}}'));
			}

		}

		useAtts.forEach(att => {
			att.type = attConst.type.EMBED
		})

		return document.toString();
	},

	// includeDeleted=true 时不过滤 isDel：用于取回收站（已删除）邮件详情（回收站深链 / TG 自动跳转）
	selectById(c, emailId, includeDeleted = false) {
		return orm(c).select().from(email).where(
			and(eq(email.emailId, emailId),
				includeDeleted ? undefined : eq(email.isDel, isDel.NORMAL)))
			.get();
	},

	async latest(c, params, userId) {
		let { emailId, accountId, allReceive } = params;
		allReceive = Number(allReceive);

		if (isNaN(allReceive)) {
			let accountRow = await accountService.selectById(c, accountId);
			allReceive = accountRow.allReceive;
		}

		let list = await orm(c).select({ ...emailBriefColumns }).from(email)
			.innerJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.userId, userId),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL),
					allReceive ? undefined : eq(email.accountId, accountId),
					eq(email.type, emailConst.type.RECEIVE),
					// 自研定制：收件箱轮询排除垃圾邮件
					eq(email.spam, 0)
				))
			.orderBy(desc(email.emailId))
			.limit(50);

		return this.applyListText(list);
	},

	async physicsDelete(c, params) {
		let { emailIds } = params;
		emailIds = emailIds.split(',').map(Number);
		await attService.removeByEmailIds(c, emailIds);
		await starService.removeByEmailIds(c, emailIds);
		await orm(c).delete(email).where(inArray(email.emailId, emailIds)).run();
	},

	async physicsDeleteUserIds(c, userIds) {
		await attService.removeByUserIds(c, userIds);
		await orm(c).delete(email).where(inArray(email.userId, userIds)).run();
	},

	updateEmailStatus(c, params) {
		const { status, resendEmailId, message } = params;
		return orm(c).update(email).set({
			status: status,
			message: message
		}).where(eq(email.resendEmailId, resendEmailId)).returning().get();
	},

	async selectUserEmailCountList(c, userIds, type, del = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: email.userId,
				count: count(email.emailId)
			})
			.from(email)
			.where(and(
				inArray(email.userId, userIds),
				eq(email.type, type),
				eq(email.isDel, del),
				ne(email.status, emailConst.status.SAVING),
			))
			.groupBy(email.userId);
		return result;
	},

	async allList(c, params) {

		let { emailId, size, name, subject, accountEmail, userEmail, type, timeSort, full, text, searchType, startDate, endDate } = params;

		size = Number(size);
		emailId = Number(emailId) || 0;
		timeSort = Number(timeSort);
		full = Number(full);

		if (type === undefined) {
			type = 'receive';
		}

		if (isNaN(size)) {
			size = 10;
		}

		if (size > 50) {
			size = 50;
		}

		if (isNaN(full)) {
			full = 1;
		}

		full = full === 1;

		const filters = this.allEmailListFilters({ emailId, name, subject, accountEmail, userEmail, type, timeSort, text, searchType, startDate, endDate });
		const countFilters = this.allEmailListFilters({ emailId, name, subject, accountEmail, userEmail, type, timeSort, text, searchType, startDate, endDate, withCursor: false });
		const searchUser = Boolean(text?.trim() && searchType === 'user');
		const columns = full ? emailListColumns : emailBriefColumns;

		const listWhere = and(...filters);
		const countWhere = and(...countFilters);
		const query = orm(c).select({ ...columns, userEmail: user.email })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId));
		if (listWhere) query.where(listWhere);

		// count 不搜用户时无需 join user
		const queryCount = userEmail || searchUser
			? orm(c).select({ total: count() })
				.from(email)
				.leftJoin(user, eq(email.userId, user.userId))
			: orm(c).select({ total: count() })
				.from(email);
		if (countWhere) queryCount.where(countWhere);

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();
		const totalQuery = queryCount.get();
		const latestEmailQuery = orm(c).select({
			emailId: email.emailId,
			accountId: email.accountId,
			userId: email.userId,
		}).from(email)
			.where(eq(email.type, emailConst.type.RECEIVE))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		if (full) {
			await this.emailAddAtt(c, list);
		} else {
			this.applyListText(list);
		}

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: 0,
				userId: 0,
			}
		}

		return { list: list, total: totalRow.total, latestEmail };
	},

	async allEmailLatest(c, params) {

		const { emailId } = params;

		let list = await orm(c).select({ ...emailBriefColumns, userEmail: user.email }).from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.type, emailConst.type.RECEIVE),
					ne(email.status, emailConst.status.SAVING)
				))
			.orderBy(desc(email.emailId))
			.limit(50);

		return this.applyListText(list);
	},

	async emailAddAtt(c, list) {

		const emailIds = list.map(item => item.emailId);

		if (emailIds.length > 0) {

			const attList = await attService.selectByEmailIds(c, emailIds);

			list.forEach(emailRow => {
				const atts = attList.filter(attRow => attRow.emailId === emailRow.emailId);
				emailRow.attList = atts;
			});
		}

		// 完整邮件查询：给附件后，把正文外链图改成 /proxy?url=。
		await proxyService.rewriteList(c, list);
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(eq(email.userId, userId)).run();
	},

	async restore(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = emailIds.split(',').map(Number);
		const owned = await orm(c).select({ emailId: email.emailId, spam: email.spam }).from(email)
			.where(and(eq(email.userId, userId), inArray(email.emailId, emailIdList))).all();
		const ownedIds = owned.map(row => row.emailId);
		if (ownedIds.length) {
			await orm(c).update(email).set({ isDel: isDel.NORMAL, deleteTime: null }).where(inArray(email.emailId, ownedIds)).run();

			// 自研定制：从垃圾邮件删进回收站再恢复时，保留期重新从「恢复这一刻」起算，
			// 否则旧 spam_time 可能早已超期，一恢复就会被下一次自动清理删掉
			const spamIds = owned.filter(row => Number(row.spam) === 1).map(row => row.emailId);
			if (spamIds.length) {
				await orm(c).update(email).set({ spamTime: dayjs().format('YYYY-MM-DD HH:mm:ss') })
					.where(inArray(email.emailId, spamIds)).run();
			}

			return { count: ownedIds.length, spamCount: spamIds.length };
		}
		return { count: 0, spamCount: 0 };
	},

	async forceDelete(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = emailIds.split(',').map(Number);
		const owned = await orm(c).select({ emailId: email.emailId }).from(email)
			.where(and(eq(email.userId, userId), inArray(email.emailId, emailIdList))).all();
		const ownedIds = owned.map(row => row.emailId);
		if (ownedIds.length) {
			await this.physicsDelete(c, { emailIds: ownedIds.join(',') });
		}
		return { count: ownedIds.length };
	},

	// 自研定制：标记 / 取消标记垃圾邮件。只允许操作收件类型且属于本人的邮件。
	// 标记时写入 spam_time（自动清理与倒计时都从这一刻起算）；取消标记时清空。
	async spam(c, params, userId) {
		const idList = String(params.emailIds || '')
			.split(',')
			.map(Number)
			.filter(id => Number.isFinite(id) && id > 0);
		if (!idList.length) {
			return { count: 0 };
		}

		const flag = Number(params.spam) === 1 ? 1 : 0;
		const owned = await orm(c).select({ emailId: email.emailId }).from(email)
			.where(and(
				eq(email.userId, userId),
				eq(email.type, emailConst.type.RECEIVE),
				inArray(email.emailId, idList)
			)).all();
		const ownedIds = owned.map(row => row.emailId);
		if (!ownedIds.length) {
			return { count: 0 };
		}

		await orm(c).update(email).set({
			spam: flag,
			spamTime: flag ? dayjs().format('YYYY-MM-DD HH:mm:ss') : null
		}).where(inArray(email.emailId, ownedIds)).run();

		// 自研定制：取出这批邮件的发件人（去重），
		// 标记时供前端询问「是否屏蔽发件人」，取消标记时用于查是否仍在黑名单。
		let senders = [];
		let blockedRules = [];
		try {
			const senderRows = await orm(c).selectDistinct({ sendEmail: email.sendEmail }).from(email)
				.where(inArray(email.emailId, ownedIds)).all();
			senders = [...new Set(
				senderRows
					.map(row => String(row.sendEmail || '').trim().toLowerCase())
					.filter(Boolean)
			)];

			if (!flag && senders.length) {
				const candidates = [];
				senders.forEach(addr => {
					candidates.push(addr);
					const domain = addr.split('@')[1] || '';
					if (domain) {
						candidates.push(domain);
					}
				});
				blockedRules = await orm(c).select({
					ruleId: spamRule.ruleId,
					ruleValue: spamRule.ruleValue,
					ruleType: spamRule.ruleType
				}).from(spamRule)
					.where(and(eq(spamRule.userId, userId), inArray(spamRule.ruleValue, candidates)))
					.all();
			}
		} catch (e) {
			console.error('查询垃圾邮件发件人/屏蔽规则失败：', e);
		}

		return { count: ownedIds.length, senders, blockedRules };
	},

	// 自研定制：立即删除所有垃圾邮件（物理删除，不进回收站）
	async clearSpam(c, userId) {
		const rows = await orm(c).select({ emailId: email.emailId }).from(email)
			.where(and(
				eq(email.userId, userId),
				eq(email.spam, 1),
				eq(email.isDel, isDel.NORMAL)
			)).all();
		const ids = rows.map(row => row.emailId);
		if (!ids.length) {
			return { count: 0 };
		}

		// 分批，避免单条 SQL 参数过多
		for (let i = 0; i < ids.length; i += 90) {
			await this.physicsDelete(c, { emailIds: ids.slice(i, i + 90).join(',') });
		}
		return { count: ids.length };
	},

	// 置顶 / 取消置顶（top: 1 置顶, 0 取消）
	async pin(c, params, userId) {
		const { emailIds, top } = params;
		const emailIdList = emailIds.split(',').map(Number);
		const owned = await orm(c).select({ emailId: email.emailId }).from(email)
			.where(and(eq(email.userId, userId), inArray(email.emailId, emailIdList))).all();
		const ownedIds = owned.map(row => row.emailId);
		if (ownedIds.length) {
			await orm(c).update(email).set({ top: Number(top) === 1 ? 1 : 0 }).where(inArray(email.emailId, ownedIds)).run();
		}
		return { count: ownedIds.length };
	},

	async completeReceive(c, status, emailId) {
		return await orm(c).update(email).set({
			isDel: isDel.NORMAL,
			status: status
		}).where(eq(email.emailId, emailId)).returning().get();
	},

	async completeReceiveAll(c) {
		// 用 EXISTS 走 status=6 部分索引 + account 主键；避免 IN (SELECT account_id FROM account) 触发全盘扫描
		await c.env.db.prepare(
			`UPDATE email
			 SET status = ${emailConst.status.RECEIVE}
			 WHERE status = ${emailConst.status.SAVING}
			   AND EXISTS (SELECT 1 FROM account WHERE account.account_id = email.account_id)`
		).run();
		await c.env.db.prepare(
			`UPDATE email
			 SET status = ${emailConst.status.NOONE}
			 WHERE status = ${emailConst.status.SAVING}`
		).run();
	},

	async autoClean(c) {
		const { autoCleanDays, autoCleanExclude, autoCleanDeletedOnly } = await settingService.query(c);
		const days = Number(autoCleanDays);

		if (!days || days <= 0) {
			return;
		}

		const cutoff = dayjs().subtract(days, 'day').format('YYYY-MM-DD HH:mm:ss');
		const excludeEmails = String(autoCleanExclude || '')
			.split(/[,，]/)
			.map(item => item.trim())
			.filter(Boolean);

		let excludeUserIds = [];
		if (excludeEmails.length) {
			const rows = await orm(c)
				.select({ userId: user.userId })
				.from(user)
				.where(sql`${user.email} COLLATE NOCASE IN (${sql.join(excludeEmails.map(email => sql`${email}`), sql`, `)})`)
				.all();
			excludeUserIds = rows.map(row => row.userId);
		}

		const batchSize = 95;
		const onlyDeleted = Number(autoCleanDeletedOnly) === 1;

		while (true) {
			const conditions = [];
			if (onlyDeleted) {
				conditions.push(eq(email.isDel, isDel.DELETE));
				conditions.push(lt(email.deleteTime, cutoff));
			} else {
				conditions.push(lt(email.createTime, cutoff));
			}
			// 自研定制：仍在垃圾邮件里的邮件由「垃圾邮件自动清理」独立负责，这里不碰
			conditions.push(sql`NOT (${email.spam} = 1 AND ${email.isDel} = 0)`);
			if (excludeUserIds.length) {
				conditions.push(notInArray(email.userId, excludeUserIds));
			}

			const rows = await orm(c)
				.select({ emailId: email.emailId })
				.from(email)
				.where(and(...conditions))
				.limit(batchSize)
				.all();

			if (!rows.length) {
				break;
			}

			const emailIds = rows.map(row => row.emailId);
			await this.physicsDelete(c, { emailIds: emailIds.join(',') });

			if (rows.length < batchSize) {
				break;
			}
		}
	},

	// 自研定制：垃圾邮件自动清理——按「标记为垃圾的时间」起算（不是收件时间），物理删除
	async cleanSpam(c) {
		const { spamCleanDays, autoCleanExclude } = await settingService.query(c);
		const days = Number(spamCleanDays);

		if (!days || days <= 0) {
			return;
		}

		const cutoff = dayjs().subtract(days, 'day').format('YYYY-MM-DD HH:mm:ss');
		const excludeEmails = String(autoCleanExclude || '')
			.split(/[,，]/)
			.map(item => item.trim())
			.filter(Boolean);

		let excludeUserIds = [];
		if (excludeEmails.length) {
			const rows = await orm(c)
				.select({ userId: user.userId })
				.from(user)
				.where(sql`${user.email} COLLATE NOCASE IN (${sql.join(excludeEmails.map(email => sql`${email}`), sql`, `)})`)
				.all();
			excludeUserIds = rows.map(row => row.userId);
		}

		const batchSize = 95;

		while (true) {
			const conditions = [
				eq(email.spam, 1),
				eq(email.isDel, isDel.NORMAL),
				lt(email.spamTime, cutoff)
			];
			if (excludeUserIds.length) {
				conditions.push(notInArray(email.userId, excludeUserIds));
			}

			const rows = await orm(c)
				.select({ emailId: email.emailId })
				.from(email)
				.where(and(...conditions))
				.limit(batchSize)
				.all();

			if (!rows.length) {
				break;
			}

			await this.physicsDelete(c, { emailIds: rows.map(row => row.emailId).join(',') });

			if (rows.length < batchSize) {
				break;
			}
		}
	},

	async batchDelete(c, params) {
		let { sendName, sendEmail, toEmail, subject, startTime, endTime, type  } = params

		let right = type === 'left' || type === 'include'
		let left = type === 'include'

		const conditions = []

		if (sendName) {
			conditions.push(like(email.name,`${left ? '%' : ''}${sendName}${right ? '%' : ''}`))
		}

		if (subject) {
			conditions.push(like(email.subject,`${left ? '%' : ''}${subject}${right ? '%' : ''}`))
		}

		if (sendEmail) {
			conditions.push(like(email.sendEmail,`${left ? '%' : ''}${sendEmail}${right ? '%' : ''}`))
		}

		if (toEmail) {
			conditions.push(like(email.toEmail,`${left ? '%' : ''}${toEmail}${right ? '%' : ''}`))
		}

		if (startTime && endTime) {
			conditions.push(gte(email.createTime,`${startTime}`))
			conditions.push(lte(email.createTime,`${endTime}`))
		}

		if (conditions.length === 0) {
			return;
		}

		const emailIdsRow = await orm(c).select({emailId: email.emailId}).from(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).all();

		const emailIds = emailIdsRow.map(row => row.emailId);

		if (emailIds.length === 0){
			return;
		}

		await attService.removeByEmailIds(c, emailIds);

		await orm(c).delete(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).run();
	},

	async physicsDeleteByAccountId(c, accountId) {
		await attService.removeByAccountId(c, accountId);
		await orm(c).delete(email).where(eq(email.accountId, accountId)).run();
	},

	async read(c, params, userId) {
		const { emailIds, unread } = params;
		// 兼容 number / 数字字符串 / 数组 / 逗号串，避免把数组直接当标量绑定到 SQL（D1_TYPE_ERROR）
		let idList = [];
		if (Array.isArray(emailIds)) {
			idList = emailIds;
		} else if (typeof emailIds === 'string') {
			idList = emailIds.split(',');
		} else {
			idList = [emailIds];
		}
		idList = idList.map(Number).filter(id => Number.isFinite(id) && id > 0);
		if (!idList.length) {
			return;
		}
		// unread 传 0 = 标未读，其余（含不传）= 标已读
		const target = Number(unread) === emailConst.unread.UNREAD
			? emailConst.unread.UNREAD
			: emailConst.unread.READ;
		await orm(c).update(email).set({ unread: target }).where(and(eq(email.userId, userId), inArray(email.emailId, idList)));
	}
};

export default emailService;
