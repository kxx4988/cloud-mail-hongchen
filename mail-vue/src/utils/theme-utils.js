// 主题工具（自研）：统一「浅色 / 深色 / 跟随系统」的解析与应用
// 说明：uiStore.dark 始终保存「当前实际是否深色」，uiStore.followSystem 表示是否由系统决定
export const THEME_MODE = {
    LIGHT: 'light',
    DARK: 'dark',
    AUTO: 'auto',
}

const MEDIA_QUERY = '(prefers-color-scheme: dark)'

/** 系统当前是否为深色 */
export function isSystemDark() {
    return window.matchMedia(MEDIA_QUERY).matches
}

/** 取系统主题的 MediaQueryList（用于监听变化） */
export function systemThemeQuery() {
    return window.matchMedia(MEDIA_QUERY)
}

/** 按实际深浅把 class 与浏览器主题色刷到页面上 */
export function applyTheme(dark) {
    const root = document.documentElement
    root.classList.toggle('dark', !!dark)
    const isMobile = !window.matchMedia('(pointer: fine) and (hover: hover)').matches
    document.getElementById('theme-color-meta')?.setAttribute(
        'content',
        dark ? (isMobile ? '#141414' : '#000000') : (isMobile ? '#191A23' : '#F1F1F1')
    )
}

/** 由 uiStore 的 dark + followSystem 推出当前模式 */
export function currentThemeMode(dark, followSystem) {
    if (followSystem) return THEME_MODE.AUTO
    return dark ? THEME_MODE.DARK : THEME_MODE.LIGHT
}
