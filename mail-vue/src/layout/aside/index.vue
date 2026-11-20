<template>
  <el-scrollbar class="scroll">
    <div>
      <div class="title" :class="{ 'title-display': titleUsesDisplayFont }">
        <img class="logo" :src="logoUrl" alt="" />
        <div>{{settingStore.settings.title}}</div>
      </div>
      <!-- 自研定制：写信入口统一放在顶栏 header（蓝色圆形图标 + 「写邮件」文字），
           此处不再放官方的 compose-bar，避免出现两个写信按钮 -->
      <el-menu :collapse="false" text-color="#fff" active-text-color="#fff" style="margin-top: 6px">
        <el-menu-item @click="router.push({name: 'email'})" index="email"
                      :class="activeName === 'email' ? 'choose-item' : ''">
          <Icon icon="hugeicons:mailbox-01" width="20" height="20" />
          <span class="menu-name" style="margin-left: 16px">{{$t('inbox')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'send'})" index="send" v-perm="'email:send'"
                      :class="activeName === 'send' ? 'choose-item' : ''">
          <Icon icon="cil:send" width="20" height="20" />
          <span class="menu-name" style="margin-left: 16px">{{$t('sent')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'draft'})" index="draft" v-perm="'email:send'"
                      :class="activeName === 'draft' ? 'choose-item' : ''">
          <Icon icon="ep:document" width="19" height="19" />
          <span class="menu-name" style="margin-left: 17px">{{$t('drafts')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'deleted'})" index="deleted"
                      :class="activeName === 'deleted' ? 'choose-item' : ''">
          <Icon icon="fluent:delete-20-regular" width="20" height="20" />
          <span class="menu-name" style="margin-left: 16px">{{$t('deletedBox')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'star'})" index="star"
                      :class="activeName === 'star' ? 'choose-item' : ''">
          <Icon icon="solar:star-line-duotone" width="20" height="20" />
          <span class="menu-name" style="margin-left: 16px">{{$t('starred')}}</span>
        </el-menu-item>
        <!-- 自研定制：垃圾邮件。所有登录用户可用 → 不加 v-perm，按「星标下面、无人收件上面」的位置约定 -->
        <el-menu-item @click="router.push({name: 'spam'})" index="spam"
                      :class="activeName === 'spam' ? 'choose-item' : ''">
          <Icon icon="mdi:email-off-outline" width="20" height="20" />
          <span class="menu-name" style="margin-left: 16px">{{$t('spamTitle')}}</span>
        </el-menu-item>
        <!-- 自研定制：无人收件入口。仅当「无人收件」开关为开放(0) 且拥有全部邮件权限时显示，
             点击跳到全部邮件页并自带 type=noone 筛选，省得每次手动下拉选择 -->
        <el-menu-item v-if="showNoRecipient"
                      @click="router.push({name: 'all-email', query: {type: 'noone'}})"
                      index="noone"
                      :class="activeName === 'all-email' && route.query.type === 'noone' ? 'choose-item' : ''">
          <Icon icon="mdi:email-outline" width="20" height="20" />
          <span class="menu-name" style="margin-left: 16px">{{$t('noRecipientTitle')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'setting'})" index="setting"
                      :class="activeName === 'setting' ? 'choose-item' : ''">
          <Icon icon="fluent:settings-48-regular" width="20" height="20" />
          <span class="menu-name" style="margin-left: 16px">{{$t('settings')}}</span>
        </el-menu-item>
        <div class="manage-title" v-perm="['all-email:query','user:query','role:query','setting:query','analysis:query','reg-key:query']">
          <div>{{$t('manage')}}</div>
        </div>
        <el-menu-item @click="router.push({name: 'analysis'})" index="analysis" v-perm="'analysis:query'"
                      :class="activeName === 'analysis' ? 'choose-item' : ''">
          <Icon icon="fluent:data-pie-20-regular" width="24" height="24" />
          <span class="menu-name" style="margin-left: 13px">{{$t('analytics')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'user'})" index="setting" v-perm="'user:query'"
                      :class="activeName === 'user' ? 'choose-item' : ''">
          <Icon icon="si:user-alt-2-line" width="20" height="20" />
          <span class="menu-name" style="margin-left: 16px">{{$t('allUsers')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'all-email'})" index="all-email" v-perm="'all-email:query'"
                      :class="activeName === 'all-email' && route.query.type !== 'noone' ? 'choose-item' : ''">
          <Icon icon="fluent:mail-list-28-regular" width="22" height="22" />
          <span class="menu-name" style="margin-left: 15px">{{$t('allMail')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'role'})" index="setting" v-perm="'role:query'"
                      :class="activeName === 'role' ? 'choose-item' : ''">
          <Icon icon="fluent:lock-closed-16-regular" width="22" height="22" />
          <span class="menu-name" style="margin-left: 15px">{{$t('permissions')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'reg-key'})" index="reg-key" v-perm="'reg-key:query'"
                      :class="activeName === 'reg-key' ? 'choose-item' : ''">
          <Icon icon="fluent:fingerprint-20-filled" width="22" height="22" />
          <span class="menu-name" style="margin-left: 15px">{{$t('inviteCode')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'sys-setting'})" index="sys-setting" v-perm="'setting:query'"
                      :class="activeName === 'sys-setting' ? 'choose-item' : ''">
          <Icon icon="eos-icons:system-ok-outlined" width="18" height="18" style="margin-left: 2px" />
          <span class="menu-name" style="margin-left: 17px">{{$t('SystemSettings')}}</span>
        </el-menu-item>
      </el-menu>
    </div>
  </el-scrollbar>
</template>

<script setup>
import router from "@/router/index.js";
import {computed, onMounted, onUnmounted} from "vue";
import { useRoute } from "vue-router";
import {Icon} from "@iconify/vue";
import {useSettingStore} from "@/store/setting.js";
import {useEmailStore} from "@/store/email.js";
import {useUserStore} from "@/store/user.js";

const settingStore = useSettingStore();
const emailStore = useEmailStore();
const userStore = useUserStore();
const route = useRoute();
const logoUrl = `${import.meta.env.BASE_URL}mail.png`
const titleUsesDisplayFont = computed(() => !/\p{Script=Han}/u.test(settingStore.settings.title || ''))

// 在内容详情页（route.meta.name==='content'）时，按来源文件夹高亮侧边栏；
// 普通列表页直接用 route.meta.name。
const activeName = computed(() => {
  if (route.meta.name === 'content') {
    return emailStore.contentData.fromFolder || 'email'
  }
  return route.meta.name
});

// 自研定制「无人收件」入口可见性：开关为开放(0) 且具备全部邮件权限。
// 权限必须一起判 —— all-email 路由是按权限动态注册的，没权限的人点进去会 404。
const showNoRecipient = computed(() => {
  if (Number(settingStore.settings.noRecipient) !== 0) return false
  const permKeys = userStore.user?.permKeys || []
  return permKeys.includes('*') || permKeys.includes('all-email:query')
});

// 自研定制：跨标签页同步无人收件开关。
// storage 事件只在「其它」标签页触发，当前页靠设置页保存时直接改 store 实现即时生效。
function onStorageChange(e) {
  if (e.key === 'cm-no-recipient' && e.newValue !== null && e.newValue !== '') {
    settingStore.settings.noRecipient = Number(e.newValue)
  }
}

onMounted(() => window.addEventListener('storage', onStorageChange))
onUnmounted(() => window.removeEventListener('storage', onStorageChange))

</script>

<style lang="scss" scoped>

@font-face {
  font-family: "BAHAMASB";
  src: url("/fonts/BAHAMASB.woff") format("woff");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

.title {
  margin: 10px 6px;
  height: 45px;
  border-radius: 6px;
  display: flex;
  position: relative;
  font-size: 18px;
  font-weight: 600;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  color: #ffffff;
  transition: all 0.3s ease;
  max-width: 240px;
  padding: 0 10px;
  > div {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: calc(240px - 20px - 32px - 5px);
  }

  .logo {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    object-fit: contain;
  }

  .user-right-icon {
    align-self: center;
    position: absolute;
    font-size: 12px;
    right: 8px;
    color: #ffffff;
  }

}

.title.title-display {
  font-family: "BAHAMASB", Inter, "Helvetica Neue", Helvetica, sans-serif;
  font-size: 22px;
  font-weight: normal;
}

.manage-title {
  margin-top: 12px;
  padding-left: 20px;
  color: #fff;
}

.el-menu-item {
  margin: 3px 12px !important;
  border-radius: 6px;
  height: 36px;
  padding: 10px !important;
}

.choose-item {
  font-weight: 400;
  background: var(--aside-menu-active-background) !important;
  backdrop-filter: blur(4px);
}

@media (hover: hover) {
  .el-menu-item:hover {
    background: rgba(255, 255, 255, 0.08) !important;
  }
}

.menu-name {
  user-select: none;
}


:deep(.el-scrollbar__wrap--hidden-default ) {
  background: var(--aside-backgound) !important;
}

:deep(.el-menu-item) {
  background: var(--aside-backgound);
}

:deep(.el-menu) {
  background: var(--aside-backgound);
}

.el-menu {
  border-right: 0;
  width: 260px;
}

:deep(.el-divider__text) {
  background: var(--aside-backgound);
  color: #FFFFFF;
}

.scroll {

}
</style>
