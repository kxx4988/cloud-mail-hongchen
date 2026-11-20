import {useUserStore} from "@/store/user.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/perm/perm.js";
import router from "@/router";
import {websiteConfig} from "@/request/setting.js";
import i18n from "@/i18n/index.js";
import {spaTokenUserId} from "@/utils/spa-token.js";

export async function init() {
    document.title = '\u200B'

    const settingStore = useSettingStore();
    const userStore = useUserStore();
    const accountStore = useAccountStore();

    // Telegram「网页版」免登录深链：路由守卫尚未运行，URL 已带 ?t=。
    // 此处先处理它再初始化（否则 token 为 null 会跳过 loginUserInfo，导致
    // userStore/accountStore 缺失或与 Pinia 持久化的旧会话态错配，表现为首屏空白、刷新后才正常）。
    // [S33] 深链 token 优先：浏览器已登录其它账号时也必须按链接身份进入（原「仅未登录才采纳」
    // 会导致点 TG 里用户 bot 的 webmail 链接永远进不去链接所属账号）。
    //  - 链接 userId 与本地不同 → 覆盖并打标记（layout 挂载后提示一次「已切换账号」）
    //  - 相同 → 覆盖续期，无感
    //  - 解析失败（非 JWT）→ 忽略，保留本地会话
    // 覆盖后立即把 ?t= 从地址栏移除（保留 emailId/folder 等其它参数），token 不留在历史记录里。
    let token = localStorage.getItem('token');
    const deepT = new URLSearchParams(location.search).get('t');
    let spaSwitchedEmail = '';
    if (deepT) {
        const deepUserId = spaTokenUserId(deepT);
        if (deepUserId !== null) {
            const localUserId = spaTokenUserId(token);
            if (deepT !== token) {
                if (localUserId !== null && localUserId !== deepUserId) {
                    localStorage.setItem('cm-spa-switched', '1');
                }
                localStorage.setItem('token', deepT);
                token = deepT;
            }
            const url = new URL(location.href);
            url.searchParams.delete('t');
            history.replaceState(history.state, '', url.pathname + url.search + url.hash);
        }
    }
    if (!settingStore.lang) {
        let lang = navigator.language.split('-')[0]
        lang = lang === 'zh' ? lang : 'en'
        settingStore.lang = lang
    }

    i18n.global.locale.value = settingStore.lang

    let setting = null;

    if (token) {
        const userPromise = loginUserInfo().catch(e => {
            console.error(e);
            return null;
        });

        const [s, user] = await Promise.all([websiteConfig(), userPromise]);
        setting = s;
        settingStore.settings = setting;
        settingStore.domainList = setting.domainList;
        document.title = setting.title;

        if (user) {
            accountStore.currentAccountId = user.account.accountId;
            accountStore.currentAccount = user.account;
            userStore.user = user;

            // [S33] 刚发生过跨账号切换时，把新身份邮箱存下来给 layout 提示用
            if (localStorage.getItem('cm-spa-switched') === '1') {
                spaSwitchedEmail = user?.email || user?.account?.email || '';
            }

            const routers = permsToRouter(user.permKeys);
            routers.forEach(routerData => {
                router.addRoute('layout', routerData);
            });
        }

    } else {
        setting = await websiteConfig();
        settingStore.settings = setting;
        settingStore.domainList = setting.domainList;
        document.title = setting.title;
    }

    // [S33] 切换后的邮箱（可能为空字符串），layout 挂载后读取并提示一次
    if (localStorage.getItem('cm-spa-switched') === '1') {
        localStorage.setItem('cm-spa-switched-email', spaSwitchedEmail);
    }
}
