import {createRouter, createWebHistory} from 'vue-router'
import NProgress from 'nprogress';
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {cvtR2Url} from "@/utils/convert.js";
import {spaTokenUserId} from "@/utils/spa-token.js";

const routes = [
    {
        path: '/',
        name: 'layout',
        redirect: '/inbox',
        component: () => import('@/layout/index.vue'),
        children: [
            {
                path: '/inbox',
                name: 'email',
                component: () => import('@/views/email/index.vue'),
                meta: {
                    title: 'inbox',
                    name: 'email',
                    menu: true
                }
            },
            {
                path: '/:mailbox(inbox|starred|sent|all-mail|deleted|spam)/messages',
                name: 'content',
                component: () => import('@/views/content/index.vue'),
                meta: {
                    title: 'message',
                    name: 'content',
                    menu: false
                }
            },
            {
                path: '/settings',
                name: 'setting',
                component: () => import('@/views/setting/index.vue'),
                meta: {
                    title: 'settings',
                    name: 'setting',
                    menu: true
                }
            },
            {
                path: '/starred',
                name: 'star',
                component: () => import('@/views/star/index.vue'),
                meta: {
                    title: 'starred',
                    name: 'star',
                    menu: true
                }
            },
            {
                path: '/deleted',
                name: 'deleted',
                component: () => import('@/views/deleted/index.vue'),
                meta: {
                    title: 'deletedBox',
                    name: 'deleted',
                    menu: true
                }
            },
            {
                // 自研定制：垃圾邮件（所有登录用户可用，因此静态注册，不挂权限）
                path: '/spam',
                name: 'spam',
                component: () => import('@/views/spam/index.vue'),
                meta: {
                    title: 'spamTitle',
                    name: 'spam',
                    menu: true
                }
            },
        ]

    },
    {
        path: '/messages',
        redirect: '/inbox/messages'
    },
    {
        path: '/login',
        name: 'login',
        component: () => import('@/views/login/index.vue')
    },
    {
        path: '/test',
        name: 'test',
        component: () => import('@/views/test/index.vue')
    },
    {
        path: '/:pathMatch(.*)*',
        name: '404',
        component: () => import('@/views/404/index.vue')
    }
]


const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes
})

NProgress.configure({
    showSpinner: false,   // 不显示旋转图标
    trickleSpeed: 50,    // 自动递增速度
    minimum: 0.1          // 最小百分比
});

let timer
let first = true

router.beforeEach((to, from, next) => {

    if (timer) {
        clearTimeout(timer)
    }

    if (!first) {
        timer = setTimeout(() => {
            NProgress.start()
        }, 100)
    }

    let token = localStorage.getItem('token')

    // [S33] Telegram「网页版」免登录深链兜底：链接 token 优先于本地会话（跨账号也切换）。
    // init/init.js 启动时已处理并清掉地址栏的 t；这里只覆盖「带 t 的路由导航」场景。
    // 解析失败（非 JWT）→ 忽略链接 token，保留本地会话。
    if (typeof to.query.t === 'string' && to.query.t) {
        const deepUserId = spaTokenUserId(to.query.t)
        const localUserId = spaTokenUserId(token)
        if (deepUserId !== null) {
            if (deepUserId !== localUserId) {
                localStorage.setItem('cm-spa-switched', '1')
                localStorage.setItem('token', to.query.t)
                if (localUserId !== null) {
                    // 已登录其它账号：整页 reload 走 init 重新初始化，否则 userStore/accountStore 还是旧身份
                    const q = new URLSearchParams()
                    Object.entries(to.query).forEach(([k, v]) => q.set(k, v))
                    window.location.replace(to.path + '?' + q.toString())
                    return false
                }
            }
            const query = {...to.query}
            delete query.t
            return next({path: to.path, query, replace: true})
        }
    }

    if (!token && !to.path.startsWith('/login')) {
        return next({name: 'login'})
    }

    if (!token && to.path.startsWith('/login')) {
        loadBackground(next)
        return
    }

    if (token && to.path.startsWith('/login')) {
        return next(from.path)
    }

    next()

})

function loadBackground(next) {

    const settingStore = useSettingStore();

    if (settingStore.settings.background) {

        const src = cvtR2Url(settingStore.settings.background);

        const img = new Image();
        img.src = src;

        img.onload = () => {
            next()
        };

        img.onerror = () => {
            console.warn("背景图片加载失败:", img.src);
            next()
        };

        setTimeout(() => {
            console.warn("背景加载超时，已放行");
            next()
        }, 3000)

    } else {
        next()
    }

}

router.afterEach((to) => {

    clearTimeout(timer)
    if (first) {
        removeLoading()
    } else {
        NProgress.done();
    }

    const uiStore = useUiStore()
    if (to.meta.menu) {
        // 自研定制：在官方白名单基础上只补 spam（垃圾邮件页需要展开账号面板），
        // 其余页面保持官方默认（收起）。content 的 menu 为 false，实际上不会进入本分支。
        if (['content', 'email', 'send', 'deleted', 'spam'].includes(to.meta.name)) {
            uiStore.accountShow = window.innerWidth > 767;
        } else {
            uiStore.accountShow = false
        }
    }

    if (window.innerWidth < 1025) {
        uiStore.asideShow = false
    }

    first = false
})

function removeLoading() {
    const doc = document.getElementById('loading-first');
    if (!doc) {
        return;
    }

    doc.remove()
}

export default router
