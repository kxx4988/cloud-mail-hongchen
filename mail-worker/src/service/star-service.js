import orm from '../entity/orm';
import { star } from '../entity/star';
import emailService from './email-service';
import BizError from '../error/biz-error';
import { and, desc, eq, lt, sql, inArray, or, gt } from 'drizzle-orm';
import email from '../entity/email';
import { emailListColumns, emailBriefColumns } from '../lib/email-list-columns';
import { isDel } from '../const/entity-const';
import attService from "./att-service";
import { t } from '../i18n/i18n'
import proxyService from './proxy-service';
const starService = {

	toIdList(value) {
		if (Array.isArray(value)) {
			return value.map(Number).filter(id => Number.isFinite(id) && id > 0);
		}
		if (typeof value === 'string') {
			return value.split(',').map(Number).filter(id => Number.isFinite(id) && id > 0);
		}
		const id = Number(value);
		return Number.isFinite(id) && id > 0 ? [id] : [];
	},

	async add(c, params, userId) {
		const emailIds = starService.toIdList(params.emailId);
		if (!emailIds.length) {
			return;
		}
		const owned = await orm(c).select({ emailId: email.emailId }).from(email)
			.where(and(eq(email.userId, userId), inArray(email.emailId, emailIds))).all();
		const ownedIds = owned.map(row => row.emailId);
		if (!ownedIds.length) {
			throw new BizError(t('starNotExistEmail'));
		}
		const existRows = await orm(c).select({ emailId: star.emailId }).from(star)
			.where(and(eq(star.userId, userId), inArray(star.emailId, ownedIds))).all();
		const existIds = new Set(existRows.map(row => row.emailId));
		const values = ownedIds.filter(id => !existIds.has(id)).map(id => ({ userId, emailId: id }));
		if (values.length) {
			await orm(c).insert(star).values(values).run();
		}
	},

	async cancel(c, params, userId) {
		const emailIds = starService.toIdList(params.emailId);
		if (!emailIds.length) {
			return;
		}
		await orm(c).delete(star).where(
			and(
				eq(star.userId, userId),
				inArray(star.emailId, emailIds)))
			.run();
	},

	async list(c, params, userId) {
		let { emailId, size, full } = params;
		emailId = Number(emailId) || 0;
		size = Number(size);
		full = Number(full) === 1;
		const columns = full ? emailListColumns : emailBriefColumns;

		// 游标项的置顶值：用于「置顶优先」排序下的复合游标翻页
		let cursorTop = 0;
		if (emailId) {
			const cursorRow = await orm(c).select({ top: email.top }).from(email).where(eq(email.emailId, emailId)).get();
			cursorTop = cursorRow ? cursorRow.top : 0;
		}

		const list = await orm(c).select({
			isStar: sql`1`.as('isStar'),
			starId: star.starId,
			...columns
		}).from(star)
			.leftJoin(email, eq(email.emailId, star.emailId))
			.where(
				and(
					eq(star.userId, userId),
					eq(email.isDel, isDel.NORMAL),
					// 自研定制：垃圾邮件不进星标列表
					eq(email.spam, 0),
					emailId ? or(lt(email.top, cursorTop), and(eq(email.top, cursorTop), lt(star.emailId, emailId))) : undefined))
			.orderBy(desc(email.top), desc(star.emailId))
			.limit(size)
			.all();

		if (full) {
			const emailIds = list.map(item => item.emailId);
			const attsList = await attService.selectByEmailIds(c, emailIds);
			list.forEach(emailRow => {
				emailRow.attList = attsList.filter(attsRow => attsRow.emailId === emailRow.emailId);
			});
			// 星标完整查询同样走图片代理改写。
			await proxyService.rewriteList(c, list);
		} else {
			list.forEach(emailRow => {
				emailRow.listText = emailService.toListText(emailRow);
				delete emailRow.text;
				delete emailRow.content;
			});
		}

		return { list };
	},
	async removeByEmailIds(c, emailIds) {
		await orm(c).delete(star).where(inArray(star.emailId, emailIds)).run();
	},

	async removeByUserIds(c, userIds) {
		await orm(c).delete(star).where(inArray(star.userId, userIds)).run();
	}
};

export default starService;
