// 人机验证（Cloudflare Turnstile）统一封装 —— 自研
// 解决的问题：
//  1. 脚本一次性 onload + 30s 超时会把状态「锁死」，失败后只能刷新页面；
//  2. 全局 window.onTurnstileSuccess/Error 被多个组件互相覆盖，回调会串号；
//  3. 重试没有退避，一次网络抖动就把重试次数烧光；
//  4. render 失败后没有手动重试入口。
// 现在的行为：脚本按需加载、失败自动退避重试、失败不锁死、回调走组件内闭包、可手动重试。
import { nextTick, ref } from 'vue'

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
const SCRIPT_TIMEOUT = 15000
const MAX_SCRIPT_RETRY = 3
const RENDER_WAIT = 3000

// 全局共用同一个加载中的 Promise，避免并发重复插脚本
let scriptPromise = null

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function injectScript(src) {
    return new Promise((resolve, reject) => {
        const el = document.createElement('script')
        el.src = src
        el.async = true
        el.defer = true
        el.dataset.turnstileLoader = '1'
        let settled = false
        const finish = (fn, arg) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            fn(arg)
        }
        const timer = setTimeout(() => {
            el.onload = null
            el.onerror = null
            el.remove()
            finish(reject, new Error('turnstile 脚本加载超时'))
        }, SCRIPT_TIMEOUT)
        el.onload = () => finish(resolve)
        el.onerror = () => {
            el.remove()
            finish(reject, new Error('turnstile 脚本加载失败'))
        }
        document.head.appendChild(el)
    })
}

async function waitRenderReady(timeout = RENDER_WAIT) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
        if (window.turnstile && typeof window.turnstile.render === 'function') return window.turnstile
        await sleep(100)
    }
    return null
}

/**
 * 等容器有可用宽度（Turnstile 只依赖宽度，高度由它自己撑开，切勿把 height=0 当异常）。
 * 隐藏态样式 `.turnstile-hide { position: fixed; opacity: 0 }` 会让容器宽度塌成 0，
 * 此时调用 render 会拿不到布局宽度，挑战 iframe 加载不出来。
 */
async function waitContainerReady(el, timeout = 2500) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
        if (el.isConnected && el.offsetWidth > 0) return true
        await sleep(50)
    }
    return !!(el.isConnected && el.offsetWidth > 0)
}

/**
 * 加载 Turnstile 脚本（幂等）。失败会自动重试若干次，且失败后不锁死，下次调用可重新尝试。
 */
export function loadTurnstile() {
    if (window.turnstile && typeof window.turnstile.render === 'function') {
        return Promise.resolve(window.turnstile)
    }
    if (scriptPromise) return scriptPromise

    scriptPromise = (async () => {
        let lastError = null
        for (let attempt = 0; attempt <= MAX_SCRIPT_RETRY; attempt++) {
            // 第 2 次起加时间戳，避开代理/CDN 缓存的坏副本
            const src = attempt === 0
                ? `${SCRIPT_SRC}?render=explicit`
                : `${SCRIPT_SRC}?render=explicit&_r=${Date.now()}`
            try {
                await injectScript(src)
                const ts = await waitRenderReady()
                if (ts) return ts
                lastError = new Error('turnstile 脚本已载入但 render 未就绪')
            } catch (e) {
                lastError = e
            }
            if (attempt < MAX_SCRIPT_RETRY) {
                // 退避：1.5s → 3s → 4.5s
                await sleep(Math.min(1500 * (attempt + 1), 6000))
            }
        }
        scriptPromise = null // 关键：失败不锁死
        throw lastError || new Error('turnstile 加载失败')
    })()

    return scriptPromise
}

/** 预热：页面/弹窗打开时先拉脚本，用户真正操作时可秒出 */
export function warmupTurnstile() {
    loadTurnstile().catch(() => {})
}

/**
 * 单个 widget 控制器：回调全部走组件内闭包，不再依赖 window 上的全局函数
 */
export function createTurnstile({ getContainer, getSitekey, onToken, onError, onExpired }) {
    let widgetId = null
    let rendering = false
    let disposed = false

    function resolveEl() {
        const container = getContainer?.()
        if (!container) return null
        return typeof container === 'string' ? document.querySelector(container) : container
    }

    function destroy() {
        if (widgetId !== null && window.turnstile && typeof window.turnstile.remove === 'function') {
            try {
                window.turnstile.remove(widgetId)
            } catch (e) { /* 已移除 */ }
        }
        widgetId = null
    }

    async function render() {
        if (rendering) return null
        rendering = true
        try {
            destroy()
            const el = resolveEl()
            if (!el) throw new Error('人机验证容器尚未挂载')
            const sitekey = getSitekey?.()
            if (!sitekey) throw new Error('人机验证 siteKey 未配置')
            // 清掉上一次失败残留的骨架 DOM：否则 Turnstile 认为该容器已渲染过，重试永远失败
            el.innerHTML = ''
            const ts = await loadTurnstile()
            if (disposed) return null
            // 必须等容器有真实尺寸再 render，否则挑战 iframe 不会被加载
            const ready = await waitContainerReady(el)
            if (disposed) return null
            if (!ready) throw new Error('人机验证容器宽度为 0，无法渲染')
            const isDark = document.documentElement.classList.contains('dark')
            widgetId = ts.render(el, {
                sitekey,
                theme: isDark ? 'dark' : 'light',
                language: 'auto',
                size: 'normal',
                callback: (token) => onToken?.(token),
                'error-callback': (code) => onError?.(code),
                'expired-callback': () => {
                    onToken?.('')
                    onExpired?.()
                },
                'timeout-callback': () => onError?.('timeout'),
                'refresh-expired': 'auto',
                'retry-interval': 8000,
            })
            return widgetId
        } finally {
            rendering = false
        }
    }

    function reset() {
        if (widgetId !== null && window.turnstile && typeof window.turnstile.reset === 'function') {
            try {
                window.turnstile.reset(widgetId)
            } catch (e) { /* ignore */ }
        }
    }

    function dispose() {
        disposed = true
        destroy()
    }

    return { render, reset, destroy, dispose }
}

/**
 * 组件侧组合式封装：状态 + 退避重试 + 手动重试 + 复位
 * @param {{getSitekey: () => string, maxRetry?: number}} options
 */
export function useTurnstile({ getSitekey, maxRetry = 3 } = {}) {
    const el = ref(null)
    const visible = ref(false)
    const error = ref(false)
    const token = ref('')

    let retryCount = 0
    let retryTimer = null

    const widget = createTurnstile({
        getContainer: () => el.value,
        getSitekey,
        onToken: (t) => {
            token.value = t || ''
            if (t) {
                retryCount = 0
                error.value = false
            }
        },
        onError: () => scheduleRetry(),
        onExpired: () => {
            token.value = ''
        },
    })

    function clearTimer() {
        if (retryTimer) {
            clearTimeout(retryTimer)
            retryTimer = null
        }
    }

    // 自动重试：带退避，避免网络抖动时把次数一次烧光
    function scheduleRetry() {
        if (retryCount >= maxRetry) {
            error.value = true
            return
        }
        retryCount++
        clearTimer()
        retryTimer = setTimeout(() => {
            retryTimer = null
            if (visible.value) doRender()
        }, Math.min(2000 * retryCount, 6000))
    }

    async function doRender() {
        error.value = false
        try {
            await widget.render()
        } catch (e) {
            console.warn('[turnstile]', e)
            error.value = true
        }
    }

    // 两帧 rAF 替代裸 nextTick：确保 visible 切换后浏览器已完成布局（容器脱离 position:fixed）
    function renderNextFrame() {
        nextTick(() => requestAnimationFrame(() => requestAnimationFrame(doRender)))
    }

    /** 首次展示（点提交时触发） */
    function show() {
        visible.value = true
        retryCount = 0
        clearTimer()
        renderNextFrame()
    }

    /** 手动重试（用户点「重试」或报错后再点提交） */
    function retry() {
        retryCount = 0
        clearTimer()
        visible.value = true
        renderNextFrame()
    }

    /** 复位：关弹窗、切页签、提交成功后调用 */
    function reset() {
        visible.value = false
        token.value = ''
        retryCount = 0
        clearTimer()
        widget.destroy()
    }

    function dispose() {
        reset()
        widget.dispose()
    }

    return { el, visible, error, token, show, retry, reset, dispose }
}
