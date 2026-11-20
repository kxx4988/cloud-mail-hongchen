// [S33] TG 深链 token 身份识别（自研）：只解析 JWT payload 取 userId，
// 不做签名校验（签名校验由后端接口负责）；这里仅用于「链接身份 vs 本地登录身份」比较，
// 解析失败返回 null，调用方按「忽略链接 token、保留本地会话」处理。
export function spaTokenUserId(token) {
    if (!token || typeof token !== 'string') return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    try {
        const payload = JSON.parse(decodeBase64Url(parts[1]))
        const userId = Number(payload?.userId)
        return Number.isFinite(userId) ? userId : null
    } catch (e) {
        return null
    }
}

function decodeBase64Url(segment) {
    let base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4) base64 += '='
    const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0))
    return new TextDecoder().decode(bytes)
}
