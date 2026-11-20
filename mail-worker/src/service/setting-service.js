import KvConst from '../const/kv-const';
import setting from '../entity/setting';
import orm from '../entity/orm';
import {settingConst, verifyRecordType} from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import constant from '../const/constant';
import BizError from '../error/biz-error';
import {t} from '../i18n/i18n'
import verifyRecordService from './verify-record-service';
import userContext from '../security/user-context';
import domainUtils from '../utils/domain-uitls';
import {nowUtcStr} from '../utils/date-uitil';

// [S55] 心跳密钥比较：固定长度、逐字节异或，避免按首位提前返回泄露前缀
function safeEqual(a, b) {
	if (a.length !== b.length) {
		return false;
	}
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

const settingService = {

	async refresh(c) {
		const settingRow = await orm(c).select().from(setting).get();
		settingRow.resendTokens = JSON.parse(settingRow.resendTokens);
		settingRow.r2Domain = '';
		c.set('setting', settingRow);
		await c.env.kv.put(KvConst.SETTING, JSON.stringify(settingRow));
	},

	async query(c) {

		if (c.get?.('setting')) {
			return c.get('setting')
		}

		const setting = await c.env.kv.get(KvConst.SETTING, { type: 'json' });

		if (!setting) {
			throw new BizError('数据库未初始化 Database not initialized.');
		}

		let domainList = c.env.domain;

		if (typeof domainList === 'string') {
			try {
				domainList = JSON.parse(domainList)
			} catch (error) {
				throw new BizError(t('notJsonDomain'));
			}
		}

		if (!c.env.domain) {
			throw new BizError(t('noDomainVariable'));
		}

		domainList = domainList.map(item => '@' + item);
		setting.domainList = domainList;

		let projectLink = c.env.project_link;
		if (typeof projectLink === 'string' && projectLink === 'false') {
			projectLink = false
		} else if (projectLink === false) {
			projectLink = false
		} else {
			projectLink = true
		}

		setting.projectLink = projectLink;
		setting.loginVerify ??= settingConst.loginVerify.CLOSE;
		setting.loginVerifyCount ??= 1;

		setting.emailPrefixFilter = setting.emailPrefixFilter.split(",").filter(Boolean);
		setting.autoRefresh = Number(setting.autoRefresh) === 1 ? 1 : 2; // 1 关闭，2 开启

		c.set?.('setting', setting);
		return setting;
	},

	async get(c) {

		const [settingRow, recordList] = await Promise.all([
			await this.query(c),
			verifyRecordService.selectListByIP(c)
		]);

		settingRow.secretKey = settingRow.secretKey ? `${settingRow.secretKey.slice(0, 6)}******` : null;

		Object.keys(settingRow.resendTokens).forEach(key => {
			settingRow.resendTokens[key] = `${settingRow.resendTokens[key].slice(0, 12)}******`;
		});

		settingRow.s3AccessKey = settingRow.s3AccessKey ? `${settingRow.s3AccessKey.slice(0, 12)}******` : null;
		settingRow.s3SecretKey = settingRow.s3SecretKey ? `${settingRow.s3SecretKey.slice(0, 12)}******` : null;
		settingRow.tgBotToken = settingRow.tgBotToken ? `${settingRow.tgBotToken.slice(0, 20)}******` : null;
		settingRow.hasR2 = !!c.env.r2
		settingRow.hasCfEmail = !!c.env.email

		let regVerifyOpen = false
		let addVerifyOpen = false
		let loginVerifyOpen = false

		recordList.forEach(row => {
			if (row.type === verifyRecordType.REG) {
				regVerifyOpen = row.count >= settingRow.regVerifyCount
			}
			if (row.type === verifyRecordType.ADD) {
				addVerifyOpen = row.count >= settingRow.addVerifyCount
			}
			if (row.type === verifyRecordType.LOGIN) {
				loginVerifyOpen = row.count >= settingRow.loginVerifyCount
			}
		})

		settingRow.regVerifyOpen = regVerifyOpen
		settingRow.addVerifyOpen = addVerifyOpen
		settingRow.loginVerifyOpen = loginVerifyOpen

		settingRow.storageType = await r2Service.storageType(c);

		return settingRow;
	},

	async set(c, params) {
		const settingData = await this.query(c);
		let resendTokens = { ...settingData.resendTokens, ...params.resendTokens };
		Object.keys(resendTokens).forEach(domain => {
			if (!resendTokens[domain]) delete resendTokens[domain];
		});

		if (Array.isArray(params.emailPrefixFilter)) {
			params.emailPrefixFilter = params.emailPrefixFilter + '';
		}

		if (Array.isArray(params.aiCodeFilter)) {
			params.aiCodeFilter = params.aiCodeFilter + '';
		}

		if (params.webhookUrl !== undefined) {
			params.webhookUrl = domainUtils.toOssDomain(params.webhookUrl) || '';
		}

		params.resendTokens = JSON.stringify(resendTokens);

		if (params.autoRefresh !== undefined) {
			params.autoRefresh = Number(params.autoRefresh) === 1 ? 1 : 2;
		}

		if (params.loginVerifyCount !== undefined && (!Number.isSafeInteger(params.loginVerifyCount) || params.loginVerifyCount < 1)) {
			params.loginVerifyCount = 1;
		}

		await orm(c).update(setting).set({ ...params }).returning().get();
		await this.refresh(c);
	},

	async deleteBackground(c) {

		const { background } = await this.query(c);
		if (!background) return

		if (background.startsWith('http')) {
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
			return;
		}

		if (background) {
			await r2Service.delete(c,background)
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
		}
	},

	async setBackground(c, params) {

		let { background } = params

		await this.deleteBackground(c);

		if (background && !background.startsWith('http')) {

			const file = fileUtils.base64ToFile(background)

			const arrayBuffer = await file.arrayBuffer();
			background = constant.BACKGROUND_PREFIX + await fileUtils.getBuffHash(arrayBuffer) + fileUtils.getExtFileName(file.name);


			await r2Service.putObj(c, background, arrayBuffer, {
				contentType: file.type,
				cacheControl: `public, max-age=31536000, immutable`,
				contentDisposition: `inline; filename="${file.name}"`
			});

		}

		await orm(c).update(setting).set({ background }).run();
		await this.refresh(c);
		return background;
	},


	async setBlacklist(c, params) {
		const { blackSubject, blackContent, blackFrom  } = params
		await orm(c).update(setting).set({ blackSubject, blackContent, blackFrom }).run();
		await this.refresh(c);
		return this.get(c);
	},

	// [S55] 上报密钥：首次为空时生成一次，之后永久不变（界面不提供重置，避免误点弄断上报）
	async ensureHbKey(c) {
		const settingRow = await this.get(c);
		const exist = String(settingRow.imapHbKey || '').trim();
		if (exist) {
			return exist;
		}
		const buf = new Uint8Array(32);
		crypto.getRandomValues(buf);
		const key = [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
		await orm(c).update(setting).set({ imapHbKey: key }).run();
		await this.refresh(c);
		return key;
	},

	// [S55] 网关状态：只给管理员看（普通用户的 websiteConfig 不下发密钥与上报细节）
	async imapHbState(c) {
		const key = await this.ensureHbKey(c);
		const settingRow = await this.get(c);
		return {
			key,
			hbTime: settingRow.imapHbTime,
			firstTime: settingRow.imapHbFirstTime,
			version: settingRow.imapHbVersion,
			certDays: settingRow.imapHbCertDays,
			domain: settingRow.imapHbDomain,
			gatewayDomain: settingRow.imapGatewayDomain
		};
	},

	// [S55] 网关每小时上报：校验密钥后覆盖状态字段。不记录 IP，响应里不带任何站点信息
	async touchHeartbeat(c, params) {
		const settingRow = await this.get(c);
		const expect = String(settingRow.imapHbKey || '').trim();
		const got = String(params?.key || '').trim();
		if (!expect || !got || !safeEqual(expect, got)) {
			throw new BizError(t('unauthorized'), 401);
		}
		const now = nowUtcStr();
		const certDays = Number(params?.certDays);
		const patch = {
			imapHbTime: now,
			imapHbVersion: String(params?.version || '').slice(0, 32),
			imapHbDomain: String(params?.domain || '').slice(0, 253),
			imapHbCertDays: Number.isFinite(certDays) ? Math.max(-1, Math.min(3650, Math.trunc(certDays))) : -1
		};
		if (!String(settingRow.imapHbFirstTime || '').trim()) {
			patch.imapHbFirstTime = now;
		}
		await orm(c).update(setting).set(patch).run();
		await this.refresh(c);
		return { serverTime: now };
	},

	async websiteConfig(c) {

		const settingRow = await this.get(c);
		const token = await userContext.getToken(c);

		return {
			register: settingRow.register,
			title: settingRow.title,
			manyEmail: settingRow.manyEmail,
			addEmail: settingRow.addEmail,
			autoRefresh: settingRow.autoRefresh,
			addEmailVerify: settingRow.addEmailVerify,
			registerVerify: settingRow.registerVerify,
			loginVerify: settingRow.loginVerify,
			send: settingRow.send,
			r2Domain: settingRow.r2Domain,
			// [S49] 站点正式地址：后台「自定义域名」配置，供前端生成安装命令等场景优先使用
			customDomain: settingRow.customDomain,
			// [S50] 网关域名：个人设置「使用说明」据此显示服务器地址（未配置时前端回退 imap.<邮箱域名>）
			imapGatewayDomain: settingRow.imapGatewayDomain,
			siteKey: settingRow.siteKey,
			background: settingRow.background,
			loginOpacity: settingRow.loginOpacity,
			domainList: settingRow.loginDomain === 1 && !token ? [] : settingRow.domainList,
			regKey: settingRow.regKey,
			regVerifyOpen: settingRow.regVerifyOpen,
			addVerifyOpen: settingRow.addVerifyOpen,
			loginVerifyOpen: settingRow.loginVerifyOpen,
			noticeTitle: settingRow.noticeTitle,
			noticeContent: settingRow.noticeContent,
			noticeType: settingRow.noticeType,
			noticeDuration: settingRow.noticeDuration,
			noticePosition: settingRow.noticePosition,
			noticeWidth: settingRow.noticeWidth,
			noticeOffset: settingRow.noticeOffset,
			notice: settingRow.notice,
			loginDomain: settingRow.loginDomain,
			linuxdoClientId: settingRow.linuxdoClientId,
			linuxdoSwitch: settingRow.linuxdoSwitch,
			githubClientId: settingRow.githubClientId,
			githubSwitch: settingRow.githubSwitch,
			googleClientId: settingRow.googleClientId,
			googleSwitch: settingRow.googleSwitch,
			minEmailPrefix: settingRow.minEmailPrefix,
			projectLink: settingRow.projectLink,
			// 无人收件开关：侧边栏要据此显示/隐藏「无人收件」入口（OPEN=0 / CLOSE=1）
			noRecipient: settingRow.noRecipient,
			// 自研定制：垃圾邮件自动清理天数（垃圾邮件页顶部提示条要拿它显示实际天数，0=关闭）
			spamCleanDays: settingRow.spamCleanDays
		};
	},

};

export default settingService;
