import {h} from 'vue';
import {ElMessage, ElMessageBox} from 'element-plus';
import i18n from '@/i18n/index.js';
import {spamRuleAdd, spamRuleDelete} from '@/request/spam.js';

// 自研定制：垃圾邮件「屏蔽发件人」交互（列表页与详情页共用）
// 标记为垃圾后询问是否把发件人加入黑名单；移回收件箱后询问是否取消屏蔽。

const t = (key, values) => i18n.global.t(key, values);

// 偏好：'' = 每次询问；'yes' = 直接屏蔽；'no' = 从不屏蔽
const SPAM_BLOCK_PREF_KEY = 'cm-spam-block-pref';

function getSpamBlockPref() {
	return localStorage.getItem(SPAM_BLOCK_PREF_KEY) || '';
}

function setSpamBlockPref(value) {
	try {
		localStorage.setItem(SPAM_BLOCK_PREF_KEY, value);
	} catch (e) {
		console.error(e);
	}
}

// 批量加入黑名单：失败项（已存在 / 本站域名）由 axios 拦截器统一提示，这里只统计成功数
async function blockSenders(list) {
	let okCount = 0;
	for (const value of list) {
		try {
			await spamRuleAdd(value);
			okCount++;
		} catch (e) {
			// 忽略，拦截器已提示
		}
	}
	if (okCount > 0) {
		ElMessage({
			message: t('spamBlocked', { n: okCount }),
			type: 'success',
			plain: true
		});
	}
}

export function askBlockSender(senders) {
	const list = [...new Set((senders || []).filter(Boolean))];
	if (!list.length) {
		return;
	}
	const pref = getSpamBlockPref();
	if (pref === 'no') {
		return;
	}
	if (pref === 'yes') {
		blockSenders(list);
		return;
	}

	let dontAsk = false;
	const askText = list.length > 1
		? t('spamBlockAskMany', { n: list.length })
		: t('spamBlockAskBody', { from: list[0] });

	ElMessageBox({
		title: t('spamBlockAskTitle'),
		message: h('div', [
			h('div', { style: 'line-height:1.6' }, askText),
			h('label', {
				style: 'display:flex;align-items:center;gap:8px;margin-top:14px;cursor:pointer;font-size:13px;color:var(--el-text-color-secondary)'
			}, [
				h('input', {
					type: 'checkbox',
					onChange: (e) => {
						dontAsk = e.target.checked;
					}
				}),
				h('span', t('spamBlockDontAsk'))
			])
		]),
		showCancelButton: true,
		confirmButtonText: t('spamBlockConfirm'),
		cancelButtonText: t('spamBlockSkip'),
		type: 'warning'
	}).then(() => {
		if (dontAsk) {
			setSpamBlockPref('yes');
		}
		blockSenders(list);
	}).catch(() => {
		if (dontAsk) {
			setSpamBlockPref('no');
		}
	});
}

export function askUnblockRules(blockedRules) {
	const rules = (blockedRules || []).filter(item => item && item.ruleId);
	if (!rules.length) {
		return;
	}
	const names = rules.map(item => item.ruleValue).join('、');
	ElMessageBox.confirm(
		t('spamUnblockAskBody', { from: names }),
		t('spamUnblockTitle'),
		{
			confirmButtonText: t('spamUnblockConfirm'),
			cancelButtonText: t('spamUnblockKeep'),
			type: 'info'
		}
	).then(() => {
		spamRuleDelete(rules.map(item => item.ruleId)).then(() => {
			ElMessage({
				message: t('spamUnblocked', { n: rules.length }),
				type: 'success',
				plain: true
			});
		});
	}).catch(() => {
	});
}
