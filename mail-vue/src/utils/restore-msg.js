import i18n from '@/i18n/index.js';

// 自研定制：从回收站「恢复」后，按邮件的来源文件夹拼提示文案
// 列表页（工具栏 + 右键）与详情页共用，避免三处文案逻辑漂移。
//
// 来源判定优先级：spam=1 → 垃圾邮件（即使 type=0 也不算收件箱）
//                 type=1 → 已发送 / type=2 → 草稿箱 / 其余 → 收件箱

const t = (key, values) => i18n.global.t(key, values);

// 固定顺序，混合提示时按这个顺序拼
const FOLDER_ORDER = ['inbox', 'sent', 'draft', 'spam'];

const SINGLE_MSG_KEY = {
	inbox: 'restoredToInbox',
	sent: 'restoredToSent',
	draft: 'restoredToDrafts',
	spam: 'restoredToSpam',
};

const FOLDER_LABEL_KEY = {
	inbox: 'inbox',
	sent: 'sent',
	draft: 'drafts',
	spam: 'spamTitle',
};

export function resolveRestoreFolder(item) {
	if (Number(item?.spam) === 1) {
		return 'spam';
	}
	const type = Number(item?.type);
	if (type === 1) {
		return 'sent';
	}
	if (type === 2) {
		return 'draft';
	}
	return 'inbox';
}

/**
 * 生成恢复结果提示
 * @param {Array} items 本次恢复的邮件（需含 type、spam）
 * @returns {string} 例如「已恢复到垃圾邮件」或「已恢复 3 封：收件箱 2 封、垃圾邮件 1 封」
 */
export function buildRestoreMessage(items) {
	const list = Array.isArray(items) ? items.filter(Boolean) : [];
	if (!list.length) {
		return t('restoreSuccessMsg');
	}

	const counts = {};
	list.forEach(item => {
		const folder = resolveRestoreFolder(item);
		counts[folder] = (counts[folder] || 0) + 1;
	});

	const folders = FOLDER_ORDER.filter(folder => counts[folder] > 0);

	// 单一去向：直接说清楚回到哪个文件夹
	if (folders.length === 1) {
		return t(SINGLE_MSG_KEY[folders[0]]);
	}

	// 混合去向：总数打头 + 按文件夹拆数量
	const parts = folders
		.map(folder => t('restoredPart', {folder: t(FOLDER_LABEL_KEY[folder]), n: counts[folder]}))
		.join(t('restoredPartsSep'));

	return t('restoredMixed', {n: list.length, parts});
}
