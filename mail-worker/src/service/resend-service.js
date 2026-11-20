import emailService from './email-service';
import { emailConst } from '../const/entity-const';

const resendService = {

	async webhooks(c, body) {

		const params = {
			resendEmailId: body.data.email_id,
			status: emailConst.status.SENT
		}

		if (body.type === 'email.delivered') {
			params.status = emailConst.status.DELIVERED
			params.message = null
		}

		if (body.type === 'email.complained') {
			params.status = emailConst.status.COMPLAINED
			params.message = null
		}

		if (body.type === 'email.bounced') {
			let bounce = body.data.bounce
			bounce = JSON.stringify(bounce);
			params.status = emailConst.status.BOUNCED
			params.message = bounce
		}

		if (body.type === 'email.delivery_delayed') {
			params.status = emailConst.status.DELAYED
			params.message = null
		}

		if (body.type === 'email.failed') {
			params.status = emailConst.status.FAILED
			params.message = (body.data.failed && body.data.failed.reason) || null
		}

		const emailRow = await emailService.updateEmailStatus(c, params)

		// Resend 的 webhook 是账号/域名级别回调，会为所有通过该 Resend 账号发出的邮件触发，
		// 其中可能包含并非本系统（cloud-mail）发出的邮件，其 email_id 在本表无对应记录。
		// 这种情况属正常：仅记录日志并正常返回（resend-api 会回 200），避免返回 500
		// 触发 Resend 反复重试，造成大量“更新邮件状态记录失败”的失败日志。
		if (!emailRow) {
			// 未知邮件事件（如历史数据、重复投递、测试事件）：记录日志后正常返回，
			// 避免 Resend 因连续收到 500 而熔断关闭 Webhook
			console.warn('[resend-webhook] 未匹配到邮件记录，已忽略。event=', body.type, 'email_id=', params.resendEmailId);
			return;
		}

	}
}

export default resendService
