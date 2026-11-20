<template>
  <div class="email-list-box">
    <emailScroll ref="sysEmailScroll"
                 :get-emailList="getEmailList"
                 :email-delete="allEmailDelete"
                 :star-add="nooneMode ? undefined : starAdd"
                 :star-cancel="nooneMode ? undefined : starCancel"
                 :show-star="false"
                 show-user-info
                 show-status
                 actionLeft="4px"
                 :show-account-icon="false"
                 :time-sort="params.timeSort"
                 :item-height="65"
                 @jump="jumpContent"
                 @refresh-success="onRefreshSuccess"
                 @right-search="rightSearch"
                 :highlight-text="allEmailStore.searchParams.text"
                 :type="'all-email'"

    >
      <template #first>
        <!-- 自研定制：官方 v3.5.0 把状态筛选/时间排序挪进 all-email-search 组件，
             此处按我方规范补回「时间排序 + 文字标注」和「清理」入口 -->
        <!-- [S43] 排序按钮统一走公共组件 -->
        <time-sort :time-sort="params.timeSort" @change="changeTimeSort"/>
        <div class="icon-btn" @click="openBathDelete">
          <Icon class="icon clear" icon="fluent:broom-sparkle-16-regular" width="22" height="22"/>
          <span class="icon-label">{{ t('clean') }}</span>
        </div>
      </template>
    </emailScroll>
    <el-dialog v-model="showBathDelete" :title="$t('clearEmail')" width="335"
               @closed="closedClear">
      <div class="clear-email">
        <el-input v-model="clearParams.sendName" :placeholder="$t('sender')" @keyup.enter="batchDelete"/>
        <el-input v-model="clearParams.subject" :placeholder="$t('subject')" @keyup.enter="batchDelete"/>
        <el-input v-model="clearParams.sendEmail" :placeholder="$t('sendEmailAddress')" @keyup.enter="batchDelete"/>
        <el-input v-model="clearParams.toEmail" :placeholder="$t('toEmail')" @keyup.enter="batchDelete"/>
        <el-date-picker popper-class="my-date-picker"
                        v-model="clearTime"
                        type="daterange"
                        :teleported="false"
                        unlink-panels
                        :range-separator="t('to')"
                        size="default"
        />
        <div class="clear-button">
          <el-select v-model="clearParams.type" style="width: 200px">
            <el-option key="eq" :label="t('equal')" value="eq"/>
            <el-option key="left" :label="t('leading')" value="left"/>
            <el-option key="include" :label="t('include')" value="include"/>
          </el-select>
          <el-button :loading="clearLoading" type="primary" @click="batchDelete">{{ t('clear') }}</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import TimeSort from "@/components/time-sort/index.vue";
// [S45] 星标能力按视图动态控制：无人收件邮件 userId=0，star 接口按 userId 校验必然 501
// 「星标的邮件不存在」——noone 视图下不传 starAdd/starCancel 隐藏星标按钮，其余视图保留。
import {starAdd, starCancel} from "@/request/star.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {defineOptions, reactive, ref, watch, onMounted, onBeforeUnmount, computed} from "vue";
import {useAllEmailStore} from "@/store/all-email.js";
import {useEmailStore} from "@/store/email.js";
import {
  allEmailList,
  allEmailDelete,
  allEmailBatchDelete,
  allEmailLatest
} from "@/request/all-email.js";
import {Icon} from "@iconify/vue";
import router from "@/router/index.js";
import {useI18n} from 'vue-i18n';
import {toUtc} from "@/utils/day.js";
import {sleep} from "@/utils/time-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {allEmailWs, isAutoRefreshEnabled} from "@/websocket/client.js";
// [S20] 官方 v3.6.0 改用 allEmailStore.searchParams 后删掉了 route，但「无人收件」入口仍靠 route.query.type 判断，必须保留
import {useRoute} from 'vue-router';

defineOptions({
  name: 'all-email'
})

const {t} = useI18n();
const route = useRoute();
const emailStore = useEmailStore();
const allEmailStore = useAllEmailStore();
// [S45] 无人收件（noone）视图下隐藏星标：邮件无归属用户，星标接口必然拒绝
const nooneMode = computed(() => allEmailStore.searchParams.status === 'noone');
const settingStore = useSettingStore();
const clearTime = ref('')
const sysEmailScroll = ref({})
const showBathDelete = ref(false)
const clearLoading = ref(false)
let pullTimer = null

onMounted(() => {
  // 全部邮件实时：连共享 hub，含无人收件；重连后补拉
  allEmailWs.start({
    isEnabled: () => isAutoRefreshEnabled(settingStore.settings.autoRefresh),
    onMessage: () => schedulePullLatest(),
    onReconnect: () => schedulePullLatest(),
  });
})

onBeforeUnmount(() => {
  if (pullTimer) {
    window.clearTimeout(pullTimer)
    pullTimer = null
  }
  allEmailWs.stop()
})

watch(() => settingStore.settings.autoRefresh, () => {
  allEmailWs.sync()
})

function onRefreshSuccess() {
  allEmailWs.retryNow()
}

const params = reactive({
  timeSort: 0,
})

const clearParams = reactive({
  subject: '',
  sendEmail: '',
  sendName: '',
  startTime: '',
  toEmail: '',
  endTime: '',
  type: 'eq',
})

function resetClearParams() {
  clearParams.subject = ''
  clearParams.sendEmail = ''
  clearParams.sendName = ''
  clearParams.startTime = ''
  clearParams.toEmail = ''
  clearParams.endTime = ''
}

function closedClear() {
  resetClearParams()
  clearParams.type = 'eq'
  clearParams.endTime = ''
  clearTime.value = null
}

const paramsStar = localStorage.getItem('all-email-params')
if (paramsStar) {
  const locaParams = JSON.parse(paramsStar)
  // 官方 v3.5.0 起状态/搜索类型由 allEmailStore.searchParams 承载，这里只恢复时间排序
  if (locaParams.timeSort !== undefined) params.timeSort = Number(locaParams.timeSort)
}

// 自研定制：从侧栏「无人收件」入口进入时，直接把搜索状态设为 noone
if (route.query.type === 'noone') {
  allEmailStore.setSearchParams({ status: 'noone' })
}

// 已经在本页时再点侧栏入口：路由 query 变了但组件不会重建，这里补一次切换。
// 双向都要处理 —— 只处理「切到 noone」的话，从「无人收件」点回「全部邮件」菜单时
// query 被清空、筛选却残留，列表还停在被过滤的状态。
watch(() => route.query.type, (val) => {
  if (val === 'noone') {
    if (allEmailStore.searchParams.status !== 'noone') {
      allEmailStore.setSearchParams({ status: 'noone' })
    }
  } else if (allEmailStore.searchParams.status === 'noone') {
    allEmailStore.setSearchParams({ status: 'all' })
  }
})

// 自研定制：手动把筛选从「无人收件」改成别的状态时，清掉地址栏的 type=noone，
// 否则侧栏会一直高亮「无人收件」。
watch(() => allEmailStore.searchParams.status, (val) => {
  if (route.query.type === 'noone' && val !== 'noone') {
    router.replace({ name: 'all-email' })
  }
})

// 官方 v3.5.0：搜索条件变化 → 刷新列表
watch(
  () => allEmailStore.searchParams,
  () => {
    sysEmailScroll.value.refreshList?.()
  },
  {deep: true}
)

// 自研定制：时间排序切换（官方 v3.5.0 移除了该入口，我方保留）
function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  localStorage.setItem('all-email-params', JSON.stringify({ timeSort: params.timeSort }))
  sysEmailScroll.value.refreshList?.()
}

function openBathDelete() {
  showBathDelete.value = true
}

function batchDelete() {

  if (clearLoading.value) return

  if (clearTime.value) {
    clearParams.startTime = toUtc(clearTime.value[0]).format("YYYY-MM-DD HH:mm:ss")
    clearParams.endTime = toUtc(clearTime.value[1]).add(1, 'day').format("YYYY-MM-DD HH:mm:ss")
  }

  if (!clearParams.sendEmail && !clearParams.sendName && !clearParams.subject && !clearParams.toEmail && !clearTime.value) {
    showBathDelete.value = false
    return
  }

  ElMessageBox.confirm(
      t('delAllConfirm'),
      {
        confirmButtonText: t('confirm'),
        cancelButtonText: t('cancel'),
        type: 'warning',
      }
  ).then(() => {
    clearLoading.value = true

    allEmailBatchDelete(clearParams).then(() => {
      ElMessage({
        message: t('clearSuccess'),
        type: "success",
        plain: true
      })
      resetClearParams()
      sysEmailScroll.value.refreshList();
    }).finally(() => {
      clearLoading.value = false
    })
  })
}

function rightSearch(type, value) {
  const typeMap = {name: 'sender', user: 'user', account: 'account'}
  allEmailStore.setSearchParams({
    text: value || '',
    type: typeMap[type] || 'subject',
    startDate: '',
    endDate: '',
  })
}

function jumpContent(email) {
  emailStore.contentData.email = emailStore.toContentEmail(email)
  emailStore.contentData.delType = 'physics'
  emailStore.contentData.fromFolder = 'all-email'
  emailStore.contentData.showStar = false
  emailStore.contentData.showReply = false
  router.push({name: 'content', params: {mailbox: 'all-mail'}})
}


function getEmailList(emailId, size) {
  const search = allEmailStore.searchParams
  return emailStore.fetchList(full => allEmailList({
    emailId,
    size,
    full,
    timeSort: params.timeSort,
    type: search.status || 'all',
    text: search.text,
    searchType: search.type,
    startDate: search.startDate,
    endDate: search.endDate,
  }))
}

// 短时间多条推送合并成一次补拉。
function schedulePullLatest() {
  if (pullTimer) {
    window.clearTimeout(pullTimer)
  }
  pullTimer = window.setTimeout(() => {
    pullTimer = null
    void pullLatest()
  }, 150)
}

// 按当前列表最新 id 拉取之后的新邮件并插入。
async function pullLatest() {
  const latestId = sysEmailScroll.value.latestEmail?.emailId

  if (!latestId && latestId !== 0) {
    return
  }

  if (sysEmailScroll.value.firstLoad) {
    return
  }

  const search = allEmailStore.searchParams
  if (search.text || search.startDate || search.endDate || (search.status && search.status !== 'all' && search.status !== 'receive')) {
    return
  }

  try {
    const curTimeSort = params.timeSort
    const curStatus = search.status
    const list = await allEmailLatest(latestId)

    if (list.length === 0) {
      return
    }

    if (params.timeSort !== curTimeSort || allEmailStore.searchParams.status !== curStatus) {
      return
    }

    emailStore.applyFullList(list)

    for (let email of list) {
      sysEmailScroll.value.addItem(email)
      await sleep(50)
    }
  } catch (e) {
    if (e.code === 401 || e.code === 403) {
      settingStore.settings.autoRefresh = 1;
      allEmailWs.sync();
    }
    console.error(e)
  }
}

</script>
<style>

@media (max-width: 767px) {
  .el-date-range-picker .el-picker-panel__body {
    min-width: auto;

  }

  .my-date-picker::after {
    content: "";
    position: absolute; /* 脱离文档流，不会撑开 */
    left: 0;
    right: 0;
    height: 20px;
    background: transparent; /* 方便看效果 */
  }

  .el-date-range-picker__content {
    width: 100%;
  }

  .el-date-range-picker {
    width: 300px;
  }

  .el-tooltip .el-picker_popper {
    padding-bottom: 200px;
  }

  .el-date-range-picker__content.is-left {
    border-right: 0;
  }
}

</style>
<style scoped lang="scss">
.email-list-box {
  height: 100%;
  width: 100%;
  overflow: hidden;
}


.clear-email {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.clear-button {
  display: flex;
  align-items: center;
  gap: 15px;

  .el-button {
    width: 100%;
  }
}

:deep(.el-date-editor.el-input__wrapper) {
  width: 303px;
}

.icon {
  cursor: pointer;
}

.icon-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.icon-label {
  font-size: 13px;
  @media (max-width: 767px) {
    display: none;
  }
}

.clear {
  @media (max-width: 419px) {
    position: absolute;
    top: 41px;
    left: 242px;
  }
}

:deep(.reload) {
  @media (max-width: 419px) {
    position: absolute;
    top: 42px;
    left: 208px;
  }
}

:deep(.delete) {
  @media (max-width: 456px) {
    position: absolute;
    top: 43px;
    left: 294px;
  }

  @media (max-width: 419px) {
    position: absolute;
    top: 43px;
    left: 282px;
  }
}
</style>
