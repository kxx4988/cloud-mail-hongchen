import http from '@/axios/index.js';

// [S23] 自研：用户自己的 Telegram 通知（用自己的 bot 收自己名下账号的新邮件）
// 全部只要登录，后端按 JWT 的 userId 限定，只能操作自己的绑定。

export function notifyList() {
    return http.get('/notify/list')
}

// 关注指引：站点机器人的 @用户名（管理员没配置时返回空串）
export function notifySiteBot() {
    return http.get('/notify/siteBot')
}

// 保存并验证：token 与 chat_id 都由用户自己填，后端做两条硬校验（是否关注站点 bot、token 能否发到该 chat）
export function notifySave(token, chatId) {
    return http.post('/notify/save', {token, chatId})
}

export function notifyDelete(bindId) {
    return http.post('/notify/delete', {bindId})
}

// [S27] 编辑绑定：token 传空串 = 不修改 token，只改 Chat ID
export function notifyUpdate(bindId, token, chatId) {
    return http.post('/notify/update', {bindId, token, chatId})
}

export function notifyToggle(bindId, enabled) {
    return http.post('/notify/toggle', {bindId, enabled})
}

// [S30] 群发公告：先取关注名单人数（管理员），再分批发送直到 done
export function notifyBroadcastCount() {
    return http.get('/notify/broadcast')
}

export function notifyBroadcastSend(text, offset) {
    return http.post('/notify/broadcast', {text, offset})
}

// [S32] 「Bot 查询命令」安装/删除：装上后可在自己的 Telegram bot 菜单里发命令查邮件
// 已有第三方 webhook 时后端返回 code=409，前端需弹「覆盖安装」确认后带 force=true 重试
export function notifyCmdInstall(bindId, force = false) {
    return http.post('/notify/cmd/install', {bindId, force})
}

export function notifyCmdUninstall(bindId) {
    return http.post('/notify/cmd/uninstall', {bindId})
}
