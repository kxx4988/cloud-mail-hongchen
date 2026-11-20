<template>
  <emailScroll type="deleted" ref="scroll"
               :allow-star="false"
               :getEmailList="getEmailList"
               :emailDelete="emailForceDelete"
               :email-restore="emailRestore"
               :email-top="emailTop"
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
</template>

<script setup>
import TimeSort from "@/components/time-sort/index.vue";
import emailScroll from "@/components/email-scroll/index.vue"
import {emailDeletedList, emailDetail, emailForceDelete, emailRestore, emailTop} from "@/request/email.js";
import {useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {defineOptions, onMounted, reactive, ref, watch} from "vue";
import router from "@/router/index.js";
import { useRoute } from 'vue-router';
import {Icon} from "@iconify/vue";

defineOptions({
  name: 'deleted'
})

const scroll = ref({})
const emailStore = useEmailStore();
const accountStore = useAccountStore();
const route = useRoute();

// [S39] 列表排序状态：0=最新在前（默认），1=最旧在前
const params = reactive({
  timeSort: 0
})

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  // 切换后必须重拉列表，否则只有图标/文案变了、顺序要等刷新
  scroll.value.refreshList()
}

// Telegram View 深链修复：必须在子组件 emailScroll 首次发请求之前（父组件 setup 阶段）
// 就把活动账号切到目标账号。否则首拉会用默认账号(admin)的回收站，等到 onMounted 再切账号时
// 触发的 refresh 又被 emailScroll 的 reqLock 吞掉，最终列表停留在 admin、找不到目标邮件、
// 也跳不到正文。
const deepAccountId = Number(route.query.accountId)
if (deepAccountId) {
  accountStore.currentAccountId = deepAccountId
}
const deepEmailId = Number(route.query.emailId)

function jumpContent(email) {
  emailStore.contentData.email = emailStore.toContentEmail(email)
  emailStore.contentData.delType = 'deleted'
  emailStore.contentData.fromFolder = 'deleted'
  emailStore.contentData.showStar = false
  emailStore.contentData.showReply = false
  // 官方 v3.4.0 把详情路由由 /mail 改为 /:mailbox/messages，此处原先仍写 '/mail' 会落到 404
  router.push({name: 'content', params: {mailbox: 'deleted'}})
}

function getEmailList(emailId, size) {
  const accountId = accountStore.currentAccountId;
  // 深链切换账号后 currentAccount 仍可能是旧账号对象（init 只注入了默认账号），
  // 此时传 undefined 让后端按 accountId 自取 allReceive，避免用错账号的 allReceive 导致范围错误。
  const matched = accountStore.currentAccount && accountStore.currentAccount.accountId === accountId;
  const allReceive = matched ? accountStore.currentAccount.allReceive : undefined;
  return emailStore.fetchList(full =>
    // [S39] 透传 timeSort
    emailDeletedList(accountId, allReceive, emailId, size, full, params.timeSort)
  )
}

onMounted(() => {
  emailStore.deletedScroll = scroll
  // 已在 setup 阶段把活动账号切到目标账号，子组件首拉即为该账号回收站；
  // 这里只需轮询列表找到目标邮件并打开正文。
  if (deepEmailId) {
    let tries = 0
    const tryJump = () => {
      const target = emailStore.deletedScroll?.emailList?.find(e => e.emailId === deepEmailId)
      if (target) {
        jumpContent(target)
        return true
      }
      // 列表未就绪，最多重试 20 次（每次 300ms）
      if (tries++ < 20) {
        setTimeout(tryJump, 300)
        return false
      }
      // 首屏分页内找不到：回收站按 emailId 倒序，目标邮件较旧时不在首屏内
      // → 直接按 id 拉取该回收站邮件详情（后端需带 deleted=1 才能取到已删除邮件）
      emailDetail(deepEmailId, true).then(res => {
        if (res && res.emailId) {
          emailStore.detailMap[res.emailId] = res
          jumpContent(res)
        }
      }).catch(() => {})
      return false
    }
    tryJump()
  }
})

watch(() => accountStore.currentAccountId, () => {
  scroll.value.refreshList();
})
</script>
