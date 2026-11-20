import http from '@/axios/index.js';

export function settingSet(setting) {
    return http.put('/setting/set', setting)
}

export function settingQuery() {
    return http.get('/setting/query')
}

export function websiteConfig() {
    return http.get('/setting/websiteConfig')
}

export function setBackground(background) {
    return http.put('/setting/setBackground',{background})
}

export function deleteBackground() {
    return http.delete('/setting/deleteBackground')
}

// [S55] 网关心跳状态（管理员）：密钥为空时后端懒生成一次，之后永久不变
export function imapHbState() {
    return http.get('/setting/imapHb')
}

export function setBlackList(params) {
    return http.put('/setting/setBlacklist', params)
}

// 重设 Telegram 机器人菜单：重新下发 8 条命令 + 底部「菜单」按钮 + 重新注册 webhook。
// 后端要求管理员身份，Authorization 头由 axios 拦截器统一带上。
export function telegramSetup() {
    return http.get('/telegram/setup')
}