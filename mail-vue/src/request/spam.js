import http from '@/axios/index.js';

// 自研定制：垃圾邮件发件人黑名单（用户级）

export function spamRuleList() {
    return http.get('/spamRule/list')
}

// value 为邮箱（a@b.com）或域名（b.com），后端自动识别类型
export function spamRuleAdd(value) {
    return http.post('/spamRule/add', {value})
}

export function spamRuleDelete(ruleIds) {
    const ids = Array.isArray(ruleIds) ? ruleIds.join(',') : String(ruleIds)
    return http.post('/spamRule/delete', {ruleIds: ids})
}
