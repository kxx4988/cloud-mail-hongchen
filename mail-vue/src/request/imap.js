import http from '@/axios/index.js';

// [S37] 自研：第三方客户端（IMAP）应用密码管理，全部只要登录，后端按 JWT userId 限定

export function imapAccounts() {
    return http.get('/imap/accounts')
}

export function imapPwList() {
    return http.get('/imap/password/list')
}

export function imapPwCreate(accountId, name) {
    return http.post('/imap/password', {accountId, name})
}

export function imapPwReset(id) {
    return http.post(`/imap/password/reset/${id}`)
}

export function imapPwSetStatus(id, status) {
    return http.put(`/imap/password/status/${id}`, {status})
}

export function imapPwRename(id, name) {
    return http.put(`/imap/password/name/${id}`, {name})
}

export function imapPwDelete(id) {
    return http.delete(`/imap/password/${id}`)
}
