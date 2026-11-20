<template>
  <div class="spam-page">
    <!-- 自研定制：顶部提示条，天数读系统设置（0=关闭）；右侧「立即删除所有垃圾邮件」为物理删除 -->
    <div class="spam-banner">
      <Icon class="spam-banner-icon" icon="mdi:email-off-outline" width="18" height="18"/>
      <span class="spam-banner-text">
        {{ autoDays > 0 ? t('spamBannerAuto', {n: autoDays}) : t('spamBannerOff') }}
      </span>
      <span class="spam-banner-action" @click="goSpamRules">{{ t('spamManageRules') }}</span>
      <span class="spam-banner-divider">|</span>
      <span class="spam-banner-action" @click="handleClearAll">{{ t('spamClearAll') }}</span>
    </div>
    <div class="spam-list">
      <emailScroll type="spam" ref="scroll"
                   :allow-star="false"
                   :getEmailList="getEmailList"
                   :emailDelete="emailDelete"
                   :email-not-spam="notSpam"
                   :emailTop="emailTop"
                   :email-read="emailRead"
                   :show-unread="true"
                   :time-sort="params.timeSort"
                   @jump="jumpContent"
                   actionLeft="6px"
      >
        <!-- [S39] 时间排序按钮：与收件箱/已发送同款图标与文案 -->
        <template #first>
          <!-- [S43] 排序按钮统一走公共组件 -->
          <time-sort :time-sort="params.timeSort" @change="changeTimeSort"/>
        </template>
      </emailScroll>
    </div>
  </div>
</template>

<script setup>
import TimeSort from "@/components/time-sort/index.vue";
import emailScroll from "@/components/email-scroll/index.vue"
import {Icon} from "@iconify/vue";
import {
  emailClearSpam,
  emailDelete,
  emailRead,
  emailSpam,
  emailSpamList,
  emailTop
} from "@/request/email.js";
import {useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {useSettingStore} from "@/store/setting.js";
import {defineOptions, computed, onMounted, reactive, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import router from "@/router/index.js";

defineOptions({
  name: 'spam'
})

const {t} = useI18n()
const scroll = ref({})
const emailStore = useEmailStore();
const accountStore = useAccountStore();
const settingStore = useSettingStore();

// [S39] 列表排序状态：0=最新在前（默认），1=最旧在前
const params = reactive({
  timeSort: 0
})

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  // 切换后必须重拉列表，否则只有图标/文案变了、顺序要等刷新
  scroll.value.refreshList()
}

// 自动清理天数（0=关闭），决定提示条文案
const autoDays = computed(() => Number(settingStore.settings.spamCleanDays) || 0)

// 移回收件箱 = 取消垃圾标记
const notSpam = (ids) => emailSpam(ids, 0)

// 管理屏蔽规则（发件人黑名单）在个人设置里
function goSpamRules() {
  router.push({name: 'setting'})
}

function jumpContent(email) {
  emailStore.contentData.email = emailStore.toContentEmail(email)
  // delType='spam'：详情页删除走软删除（进回收站），并显示「移回收件箱」
  emailStore.contentData.delType = 'spam'
  emailStore.contentData.fromFolder = 'spam'
  emailStore.contentData.showStar = false
  emailStore.contentData.showReply = true
  router.push({name: 'content', params: {mailbox: 'spam'}})
}

function getEmailList(emailId, size) {
  const accountId = accountStore.currentAccountId;
  const matched = accountStore.currentAccount && accountStore.currentAccount.accountId === accountId;
  const allReceive = matched ? accountStore.currentAccount.allReceive : undefined;
  return emailStore.fetchList(full =>
    // [S39] 透传 timeSort（原来写死 0）
    emailSpamList(accountId, allReceive, emailId, size, full, params.timeSort)
  )
}

function handleClearAll() {
  ElMessageBox.confirm(t('spamClearConfirmBody'), {
    title: t('spamClearConfirmTitle'),
    confirmButtonText: t('spamClearForever'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    emailClearSpam().then(res => {
      ElMessage({
        message: t('spamCleared', {n: res?.count ?? 0}),
        type: 'success',
        plain: true
      })
      scroll.value.refreshList()
    })
  }).catch(() => {})
}

onMounted(() => {
  emailStore.spamScroll = scroll
})

watch(() => accountStore.currentAccountId, () => {
  scroll.value.refreshList();
})
</script>

<style scoped>
.spam-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
}

/* 提示条整行居中（对齐 Gmail 的单行居中样式），不再左右分置 */
.spam-banner {
  flex: none;
  padding: 9px 16px;
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.spam-banner-icon {
  vertical-align: -4px;
  margin-right: 6px;
  color: var(--el-text-color-secondary);
}

.spam-banner-text {
  min-width: 0;
}

.spam-banner-action {
  margin: 0 2px;
  color: var(--el-color-primary);
  cursor: pointer;
  user-select: none;
  /* 窄屏整条提示换行时，链接文字不能被从中间拆开 */
  white-space: nowrap;
}

.spam-banner-action:hover {
  text-decoration: underline;
}

.spam-banner-divider {
  margin: 0 4px;
  color: var(--el-border-color);
}

.spam-list {
  flex: 1;
  min-height: 0;
  min-width: 0;
}
</style>
