import PostalMime from 'postal-mime';
import emailService from '../service/email-service';
import accountService from '../service/account-service';
import settingService from '../service/setting-service';
import attService from '../service/att-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { emailConst, isDel, settingConst } from '../const/entity-const';
import emailUtils from '../utils/email-utils';
import roleService from '../service/role-service';
import userService from '../service/user-service';
import telegramService from '../service/telegram-service';
import aiService from '../service/ai-service';
import webhookService from '../service/webhook-service';
import spamRuleService from '../service/spam-rule-service';
import notifyBindService from '../service/notify-bind-service';
import dayjs from 'dayjs';
import { notifyMailWs } from '../websocket/notify';

export async function email(message, env, ctx) {

	try {

		const {
			receive,
			tgChatId,
			tgBotStatus,
			forwardStatus,
			forwardEmail,
			webhookStatus,
			webhookUrl,
			webhookRetry,
			webhookSecret,
			ruleEmail,
			ruleType,
			r2Domain,
			noRecipient,
			blackSubject,
			blackContent,
			blackFrom,
			aiCode,
			aiCodeFilter,
			tgSpamNotify
		} = await settingService.query({ env });

		if (receive === settingConst.receive.CLOSE) {
			message.setReject('Service suspended');
			return;
		}

		const reader = message.raw.getReader();
		let content = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			content += new TextDecoder().decode(value);
		}

		const email = await PostalMime.parse(content);


		const blockFlag = checkBlock(blackSubject, blackContent, blackFrom, email);

		if (blockFlag) {
			message.setReject('Message rejected');
			return;
		}

		let account = await accountService.selectByEmailIncludeDel({ env: env }, message.to);

		if (!account) {
			const baseEmail = emailUtils.getBaseEmail(message.to);
			if (baseEmail && baseEmail !== message.to) {
				account = await accountService.selectByEmailIncludeDel({ env: env }, baseEmail);
			}
		}

		if (!account && noRecipient === settingConst.noRecipient.CLOSE) {
			message.setReject('Recipient not found');
			return;
		}

		let userRow = {}

		if (account) {
			 userRow = await userService.selectByIdIncludeDel({ env: env }, account.userId);
		}

		if (account && userRow.email !== env.admin) {

			let { banEmail, availDomain } = await roleService.selectByUserId({ env: env }, account.userId);

			if (!roleService.hasAvailDomainPerm(availDomain, message.to)) {
				message.setReject('The recipient is not authorized to use this domain.');
				return;
			}

			if(roleService.isBanEmail(banEmail, email.from.address)) {
				message.setReject('The recipient is disabled from receiving emails.');
				return;
			}

		}


		if (!email.to) {
			email.to = [{ address: message.to, name: emailUtils.getName(message.to)}]
		}

		const toName = email.to.find(item => item.address === message.to)?.name || '';
		const code = await aiService.extractCode({ env }, email, { aiCode, aiCodeFilter });
		const fromAddress = email.from?.address || '';

		// 自研定制：发件人黑名单命中则直接标为垃圾邮件（绝不拒收）。
		// 整段独立 try/catch —— 规则查询/计数失败一律按「未命中」处理，保证收信不受影响。
		let spamFlag = 0;
		let spamTime = null;
		if (account && fromAddress) {
			try {
				const hitRule = await spamRuleService.match({ env }, account.userId, fromAddress);
				if (hitRule) {
					spamFlag = 1;
					spamTime = dayjs().format('YYYY-MM-DD HH:mm:ss');
					await spamRuleService.increaseHit({ env }, hitRule.ruleId);
				}
			} catch (e) {
				console.error('垃圾邮件规则匹配失败：', e);
			}
		}

		const params = {
			toEmail: message.to,
			toName: toName,
			sendEmail: fromAddress,
			name: email.from?.name || emailUtils.getName(fromAddress),
			senderEmail: message.from || '',
			subject: email.subject,
			code,
			content: email.html,
			text: email.text,
			cc: email.cc ? JSON.stringify(email.cc) : '[]',
			bcc: email.bcc ? JSON.stringify(email.bcc) : '[]',
			recipient: JSON.stringify(email.to),
			inReplyTo: email.inReplyTo,
			relation: email.references,
			messageId: email.messageId,
			userId: account ? account.userId : 0,
			accountId: account ? account.accountId : 0,
			isDel: isDel.DELETE,
			status: emailConst.status.SAVING,
			// 自研定制：命中发件人黑名单时直接带垃圾标记入库
			spam: spamFlag,
			spamTime
		};

		const attachments = [];
		const cidAttachments = [];

		for (let item of email.attachments) {
			let attachment = { ...item };
			attachment.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(attachment.content) + fileUtils.getExtFileName(item.filename);
			attachment.size = item.content.length ?? item.content.byteLength;
			attachments.push(attachment);
			if (attachment.contentId) {
				cidAttachments.push(attachment);
			}
		}

		let emailRow = await emailService.receive({ env }, params, cidAttachments, r2Domain);

		attachments.forEach(attachment => {
			attachment.emailId = emailRow.emailId;
			attachment.userId = emailRow.userId;
			attachment.accountId = emailRow.accountId;
		});

		try {
			if (attachments.length > 0) {
				await attService.addAtt({ env }, attachments);
			}
		} catch (e) {
			console.error(e);
		}

		emailRow = await emailService.completeReceive({ env }, account ? emailConst.status.RECEIVE : emailConst.status.NOONE, emailRow.emailId);

		// 有账号才推个人收件箱；无人收件（无 account / userId=0）只推全部邮件。
		notifyMailWs(env, ctx, emailRow);

		if (ruleType === settingConst.ruleType.RULE) {
			if (!emailService.matchForwardRule({
				ruleEmail,
				userEmail: userRow?.email
			})) {
				return;
			}
		}

		//转发到TG
		// [S23] 推送门槛从「配了 tgChatId 才推」放宽为「TG 开关打开就尝试推」：
		// 普通用户用自己 bot 收通知时与 tgChatId 是否为空无关，不能被这个条件整段跳过。
		if (tgBotStatus === settingConst.tgBotStatus.OPEN) {
			// 自研定制：垃圾邮件是否推送由「系统设置 → Telegram → 推送垃圾邮件」控制（0=推送 1=不推送）。
			// 字段缺失（KV 仍是加列前的旧缓存）时按「推送」处理，避免升级瞬间垃圾邮件突然不推。
			const spamNotifyEnabled = (tgSpamNotify === undefined || tgSpamNotify === null)
				? true
				: Number(tgSpamNotify) === settingConst.tgBotStatus.OPEN;
			if (!(spamFlag === 1 && !spamNotifyEnabled)) {
				// 链路 A：官方那套（tgChatId 广播；是否收全站由 tgBroadcast 在 sendEmailToBot 内判断）
				if (tgChatId) {
					await telegramService.sendEmailToBot({ env }, emailRow)
				}
				// [S23] 链路 B：用户自己的 bot（按邮件归属用户推送；没配置的用户内部直接返回）
				await notifyBindService.pushToUser({ env }, emailRow)
			}
		}

		//转发到其他邮箱
		if (forwardStatus === settingConst.forwardStatus.OPEN && forwardEmail) {

			const emails = forwardEmail.split(',');

			await Promise.all(emails.map(async email => {

				try {
					await message.forward(email);
				} catch (e) {
					console.error(`转发邮箱 ${email} 失败：`, e);
				}

			}));

		}

		//转发到 Webhook
		if (webhookStatus === settingConst.webhookStatus.OPEN && webhookUrl) {
			await webhookService.sendEmail({ env }, emailRow, webhookUrl, webhookRetry, webhookSecret);
		}

	} catch (e) {
		console.error('邮件接收异常: ', e);
		throw e
	}
}

function checkBlock(blackSubjectStr, blackContentStr, blackFromStr, email) {

	const blackFromList = blackFromStr ? blackFromStr.split(',') : []
	const blackContentList = blackContentStr ? blackContentStr.split(',') : []
	const blackSubjectList = blackSubjectStr ? blackSubjectStr.split(',') : []

	for (const blackSubject of blackSubjectList) {
		if (email.subject?.includes(blackSubject)) {
			return true
		}
	}

	for (const blackContent of blackContentList) {
		if (email.html?.includes(blackContent) || email.text?.includes(blackContent)) {
			return true
		}
	}

	for (const blackFrom of blackFromList) {
		if (email.from.address === blackFrom || emailUtils.getDomain(email.from.address) === blackFrom) {
			return true
		}
	}

	return false

}
