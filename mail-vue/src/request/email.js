import http from '@/axios/index.js';

export function emailList(accountId, allReceive, emailId, timeSort, size, type, full, searchParams = {}) {
    const {type: searchType, text, startDate, endDate} = searchParams
    return http.get('/email/list', {params: {accountId, allReceive, emailId, timeSort, size, type, full, searchType, text, startDate, endDate}})
}

export function emailDelete(emailIds) {
    return http.delete('/email/delete?emailIds=' + emailIds)
}

export function emailLatest(emailId, accountId, allReceive) {
    return http.get('/email/latest', {params: {emailId, accountId, allReceive}, noMsg: true, timeout: 35 * 1000})
}

export function emailRead(emailIds, unread = 1) {
    return http.put('/email/read', {emailIds, unread})
}

export function emailSend(form,progress) {
    return http.post('/email/send', form,{
        onUploadProgress: (e) => {
            progress(e)
        },
        noMsg: true
    })
}

export function emailDetail(emailId, deleted = false) {
    return http.get('/email/detail', { params: { emailId, deleted: deleted ? 1 : undefined }, noMsg: true, timeout: 15000 })
}

export function emailDeletedList(accountId, allReceive, emailId, size, full, timeSort) {
    // [S39] 回收站支持时间排序（timeSort=1 最旧在前），后端 email-service.list 已原生支持
    return http.get('/email/list', {params: {accountId, allReceive, emailId, size, full, timeSort, deleted: 1}})
}

// 支持单条（number/字符串）与批量（array）：统一转成逗号串。
// 此前只接受数组，详情页传单个 emailId 时会在 .join 处抛 TypeError，
// 又被 .catch 吞掉 → 表现为「点恢复没任何反应」，请求根本没发出去。
function toIdsParam(emailIds) {
    if (Array.isArray(emailIds)) return emailIds.join(',')
    return emailIds == null ? '' : String(emailIds)
}

export function emailRestore(emailIds) {
    return http.post('/email/restore', {emailIds: toIdsParam(emailIds)})
}

export function emailForceDelete(emailIds) {
    return http.post('/email/forceDelete', {emailIds: toIdsParam(emailIds)})
}

export function emailTop(emailIds, top) {
    return http.post('/email/top', {emailIds: toIdsParam(emailIds), top})
}

// 自研定制：垃圾邮件
export function emailSpamList(accountId, allReceive, emailId, size, full, timeSort) {
    return http.get('/email/list', {params: {accountId, allReceive, emailId, size, full, timeSort, spam: 1}})
}

// spam=1 标记为垃圾邮件；spam=0 移回收件箱
export function emailSpam(emailIds, spam = 1) {
    return http.post('/email/spam', {emailIds: toIdsParam(emailIds), spam})
}

// 立即删除所有垃圾邮件（物理删除，不进回收站）
export function emailClearSpam() {
    return http.post('/email/clearSpam')
}
