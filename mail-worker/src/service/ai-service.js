import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';

const aiService = {
	async extractCode(c, email, options = {}) {
		if (!this.shouldExtractCode(options.aiCode, options.aiCodeFilter, email)) {
			return '';
		}

		const ai = c.env.ai;

		try {
			const subject = email.subject || '';
			const text = emailUtils.formatText(email.text || '');
			const htmlText = emailUtils.htmlToText(email.html || '');
			const body = (htmlText || text).slice(0, 6000);

			if (!subject && !body) {
				return '';
			}

			const result = await ai.run(c.env.ai_model || '@cf/daily-co/phonellm-mini-alpha-2', {
				messages: [
					{
						role: 'system',
						content: 'You extract verification codes from emails. Return only a JSON object, no markdown, no code fences, no explanation. Format: {"code":"12345678"} or {"code":""}. The code must be 8 characters or fewer and must not contain spaces. If the code is longer than 8 characters or contains spaces, return {"code":""}. Do not wrap the JSON in code blocks.'
					},
					{
						role: 'user',
						content: `Subject: ${subject}\n\n${body}`
					}
				],
				temperature: 0,
				max_tokens: 96
			});

			const content = this.extractContent(result);
			return this.parseCode(content);
		} catch (e) {
			console.error('验证码提取失败: ', e);
			return '';
		}
	},

	// 兼容不同模型的返回结构：
	// 1) 旧版字符串直出：result 为 string
	// 2) 旧版对象：result.response 为字符串
	// 3) 旧版对象：result.response 为 {code:"..."} 对象（llama-3.1-8b-fast-v2 等）
	// 4) OpenAI 兼容：result.choices[0].message.content
	extractContent(result) {
		if (!result) {
			return '';
		}
		if (typeof result === 'string') {
			return result;
		}

		const resp = result.response;
		if (typeof resp === 'string') {
			return resp;
		}
		if (resp && typeof resp === 'object') {
			// 只认明确的 code 字段；其它形态一律视为「没抽到」。
			// 不可 JSON.stringify 后交给 parseCode 的兜底正则，否则对象里的
			// 订单号/发票号等任意数字会被误判成验证码。
			return typeof resp.code === 'string' ? JSON.stringify({ code: resp.code }) : '';
		}

		const message = result.choices?.[0]?.message;
		if (message) {
			if (typeof message.content === 'string' && message.content) {
				return message.content;
			}
			if (typeof message.reasoning_content === 'string' && message.reasoning_content) {
				return message.reasoning_content;
			}
		}

		return '';
	},

	parseCode(content) {
		if (!content || typeof content !== 'string') {
			return '';
		}

		// 多种候选：原始内容 / 去 ```json 围栏 / 正则抓首个 {...}
		const candidates = [
			content,
			content.replace(/```(?:json)?/gi, '').trim(),
			(content.match(/\{[\s\S]*?\}/) || [null])[0]
		].filter(Boolean);

		for (const candidate of candidates) {
			try {
				const json = JSON.parse(candidate);
				if (json && typeof json.code === 'string' && json.code.length <= 8 && !/\s/.test(json.code)) {
					return json.code;
				}
			} catch (_) {
				// 尝试下一个候选
			}
		}

		// 兜底：直接抓取 4~8 位连续数字（常见验证码格式）
		const digitMatch = content.match(/\b\d{4,8}\b/);
		return digitMatch ? digitMatch[0] : '';
	},

	shouldExtractCode(aiCode, aiCodeFilterStr, email) {
		if (aiCode !== settingConst.aiCode.OPEN) {
			return false;
		}

		const filterList = aiCodeFilterStr ? aiCodeFilterStr.split(',').map(item => item.trim().toLowerCase()).filter(Boolean) : [];

		if (filterList.length === 0) {
			return true;
		}

		const fromEmail = (email.from?.address || '').trim().toLowerCase();
		const fromDomain = emailUtils.getDomain(fromEmail).toLowerCase();

		return filterList.some(item => item === fromEmail || item === fromDomain);
	}
};

export default aiService;
