<template>
  <emailScroll ref="sendScroll"
               :cancel-success="cancelStar"
               :star-success="addStar"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               :email-top="emailTop"
               show-status
               actionLeft="4px"
               :star-cancel="starCancel"
               :time-sort="params.timeSort"
               :highlight-text="sendStore.searchParams.text"
               @jump="jumpContent"
               :type="'send'"
  >
    <template #first>
      <!-- [S43] 排序按钮统一走公共组件 -->
      <time-sort :time-sort="params.timeSort" @change="changeTimeSort"/>
    </template>
  </emailScroll>
</template>

<script setup>
import TimeSort from "@/components/time-sort/index.vue";
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useSendStore} from "@/store/send.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {emailList, emailDelete, emailTop} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, onMounted, reactive, ref, watch} from "vue";
import {Icon} from "@iconify/vue";
import router from "@/router/index.js";

defineOptions({
  name: 'send'
})

const emailStore = useEmailStore();
const sendStore = useSendStore();
const accountStore = useAccountStore();
const sendScroll = ref({})

// 自研定制：已发送时间排序（最新/最旧在前）
const params = reactive({
  timeSort: 0,
})

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  // 切换排序后必须重拉列表，否则只有图标/文案变了、列表顺序要等刷新
  sendScroll.value.refreshList()
}

onMounted(() => {
  emailStore.sendScroll = sendScroll;
})

watch(() => accountStore.currentAccountId, () => {
  sendScroll.value.refreshList();
})

watch(
  () => sendStore.searchParams,
  () => {
    sendScroll.value.refreshList()
  },
  {deep: true}
)

function jumpContent(email) {
  emailStore.contentData.email = emailStore.toContentEmail(email)
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.fromFolder = 'send'
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  router.push({name: 'content', params: {mailbox: 'sent'}})
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}

function getEmailList(emailId, size) {
  const accountId =  accountStore.currentAccountId;
  const allReceive = accountStore.currentAccount.allReceive;
  return emailStore.fetchList(full =>
    emailList(accountId, allReceive, emailId, params.timeSort, size, 1, full, sendStore.searchParams)
  ).then(data => {
    data.latestEmail.reqAccountId = accountId;
    data.latestEmail.allReceive = allReceive;
    return data;
  })
}

</script>

<style scoped>
.icon {
  cursor: pointer;
}
</style>
