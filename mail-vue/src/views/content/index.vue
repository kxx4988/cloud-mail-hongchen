<template>
  <div class="box">
    <div class="header-actions">
      <div class="icon-btn" @click="handleBack"><Icon class="icon" icon="material-symbols-light:arrow-back-ios-new" width="20" height="20"/><span class="icon-label">{{ t('back') }}</span></div>
      <div v-if="hasPerm(deletePermKey)" class="icon-btn" @click="handleDelete"><Icon class="icon" icon="uiw:delete" width="16" height="16"/><span class="icon-label">{{ t('delete') }}</span></div>
      <div v-if="emailStore.contentData.delType === 'deleted'" class="icon-btn" @click="handleRestore"><Icon class="icon" icon="fluent:arrow-undo-20-regular" width="18" height="18"/><span class="icon-label">{{ t('restore') }}</span></div>
      <!-- 自研定制：垃圾邮件。收件箱/星标来源可「标为垃圾」；垃圾邮件来源显示「移回收件箱」 -->
      <div v-if="showMarkSpam" class="icon-btn" @click="handleMarkSpam"><Icon class="icon" icon="mdi:email-off-outline" width="19" height="19"/><span class="icon-label">{{ t('markSpam') }}</span></div>
      <div v-if="emailStore.contentData.delType === 'spam'" class="icon-btn" @click="handleNotSpam"><Icon class="icon" icon="mdi:inbox-arrow-down" width="19" height="19"/><span class="icon-label">{{ t('notSpam') }}</span></div>
      <div class="star icon-btn" v-if="emailStore.contentData.showStar" @click="changeStar">
        <Icon class="icon" v-if="email.isStar" icon="fluent-color:star-16" width="20" height="20"/>
        <Icon class="icon" v-else icon="solar:star-line-duotone" width="18" height="18"/>
        <span class="icon-label">{{ email.isStar ? t('cancelStar') : t('star') }}</span>
      </div>
      <div class="icon-btn" v-if="emailStore.contentData.showReply" v-perm="'email:send'" @click="openReply"><Icon class="icon" icon="la:reply" width="21" height="21"/><span class="icon-label">{{ t('reply') }}</span></div>
      <div class="icon-btn" v-if="emailStore.contentData.showReply" v-perm="'email:send'" @click="openForward"><Icon class="icon" icon="iconoir:arrow-up-right" width="20" height="20"/><span class="icon-label">{{ t('forward') }}</span></div>
    </div>
    <div></div>
    <el-scrollbar class="scrollbar">
      <div class="container">
        <div class="email-title">
          <!-- 自研定制：垃圾邮件标记，详情页也能看出来源 -->
          <span v-if="email.spam" class="spam-badge">{{ t('spamTag') }}</span>
          {{ email.subject }}
        </div>
        <div class="content">
          <div class="email-info">
            <div class="address-meta">
              <div class="send"><span class="send-source">{{$t('from')}}</span>
                <div class="send-name" ref="sendNameRef" :class="{ 'is-wrapped': senderWrapped }">
                  <span class="send-name-title">{{ email.name }}</span>
                  <span class="send-email"><{{ email.sendEmail }}></span>
                  <span class="sent-via" v-if="sentViaEmail">
                    <el-tooltip effect="dark" :content="$t('sentVia', { email: sentViaEmail })">
                      <span>
                        <el-tag size="small" disable-transitions>{{ $t('sentViaTag') }}</el-tag>
                      </span>
                    </el-tooltip>
                  </span>
                </div>
              </div>
              <div class="receive"><span class="source">{{$t('recipient')}}</span><span class="receive-email">{{  formateReceive(email.recipient) }}</span></div>
              <div class="receive" v-if="ccText"><span class="source">{{$t('cc')}}</span><span class="receive-email">{{ ccText }}</span></div>
              <div class="date">
                <div>{{ formatDetailDate(email.createTime) }}</div>
              </div>
            </div>
            <el-alert v-if="email.status === 3" :closable="false" :title="toMessage(email.message)" class="email-msg" type="error" show-icon />
            <el-alert v-if="email.status === 4" :closable="false" :title="$t('complained')" class="email-msg" type="warning" show-icon />
            <el-alert v-if="email.status === 5" :closable="false" :title="$t('delayed')" class="email-msg" type="warning" show-icon />
          </div>
          <el-scrollbar class="htm-scrollbar" :class="!email.attList?.length ? 'bottom-distance' : ''">
            <ShadowHtml class="shadow-html" :html="formatImage(email.content)" v-if="email.content" />
            <pre v-else class="email-text" >{{email.text}}</pre>
          </el-scrollbar>
          <div class="att" v-if="email.attList?.length > 0">
            <div class="att-title">
              <span>{{$t('attachments')}}</span>
              <span>{{$t('attCount',{total: email.attList.length})}}</span>
            </div>
            <div class="att-box">

              <div class="att-item" v-for="att in email.attList" :key="att.attId">
                <div class="att-icon" @click="showImage(att.key)">
                  <Icon v-bind="getIconByName(att.filename)" />
                </div>
                <div class="att-name" @click="showImage(att.key)">
                  {{ att.filename }}
                </div>
                <div class="att-size">{{ formatBytes(att.size) }}</div>
                <div class="opt-icon att-icon">
                  <Icon v-if="isImage(att.filename)" icon="hugeicons:view" width="22" height="22" @click="showImage(att.key)"/>
                  <a :href="cvtR2Url(att.key)" download>
                    <Icon icon="system-uicons:push-down" width="22" height="22"/>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>
    <el-image-viewer
        v-if="showPreview"
        :url-list="srcList"
        show-progress
        @close="showPreview = false"
    />
  </div>
</template>
<script setup>
import ShadowHtml from '@/components/shadow-html/index.vue'
import {computed, reactive, ref, watch, onMounted, onUnmounted, nextTick} from "vue";
import {useRouter, useRoute} from 'vue-router'
import {ElMessage, ElMessageBox} from 'element-plus'
import {emailDelete, emailRead, emailDetail, emailRestore, emailForceDelete, emailSpam} from "@/request/email.js";
import {askBlockSender, askUnblockRules} from "@/utils/spam-block.js";
import {hasPerm} from "@/perm/perm.js";
import {Icon} from "@iconify/vue";
import {useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {formatDetailDate} from "@/utils/day.js";
import {starAdd, starCancel} from "@/request/star.js";
import {getExtName, formatBytes} from "@/utils/file-utils.js";
import {cvtR2Url,toOssDomain} from "@/utils/convert.js";
import {getIconByName} from "@/utils/icon-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {allEmailDelete} from "@/request/all-email.js";
import {useUiStore} from "@/store/ui.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import {buildRestoreMessage} from "@/utils/restore-msg.js";
const { t } = useI18n()

const uiStore = useUiStore();
const settingStore = useSettingStore();
const accountStore = useAccountStore();
const emailStore = useEmailStore();
const router = useRouter()
const route = useRoute()
const sendNameRef = ref(null)
const senderWrapped = ref(false)
let senderResizeObserver = null

const showPreview = ref(false)
const srcList = reactive([])

// 自研定制：删除按钮的权限键按来源区分。
// 从「全部邮件」进来走的是 /allEmail/delete（要 all-email:delete），
// 其余来源（收件箱/已发送/星标=软删除，回收站=彻底删除自己）都走 /email/* （要 email:delete）。
const deletePermKey = computed(() =>
    emailStore.contentData.delType === 'physics' ? 'all-email:delete' : 'email:delete'
)

// 自研定制：只有收件箱/星标来源的邮件才给「标为垃圾」（已发送、草稿、回收站、垃圾邮件本身都不给）
const showMarkSpam = computed(() =>
    ['email', 'star'].includes(emailStore.contentData.fromFolder)
)


const email = computed(() => emailStore.contentData.email || {
  emailId: 0,
  attList: [],
  content: '',
  text: '',
  recipient: '[]',
})

const ccText = computed(() => formateReceive(email.value.cc))

const sentViaEmail = computed(() => {
  const raw = String(email.value.senderEmail || '').trim()
  if (!raw) return ''
  const matched = raw.match(/<([^>]+)>/)
  const address = (matched ? matched[1] : raw).trim()
  if (!address || address.toLowerCase() === String(email.value.sendEmail || '').trim().toLowerCase()) return ''
  return address
})

watch(() => accountStore.currentAccountId, () => {
  handleBack()
})

let readRequesting = false

function contentWidth(el) {
  const range = document.createRange()
  range.selectNodeContents(el)
  const width = range.getBoundingClientRect().width
  range.detach()
  return width
}

function updateSenderWrap() {
  const root = sendNameRef.value
  if (!root) return
  const name = root.querySelector('.send-name-title')
  const mail = root.querySelector('.send-email')
  const tag = root.querySelector('.sent-via')
  if (!name || !mail) {
    senderWrapped.value = false
    return
  }
  const gap = 6
  let need = contentWidth(name) + gap + contentWidth(mail)
  if (tag) need += gap + contentWidth(tag)
  senderWrapped.value = need > root.clientWidth + 0.5
}


function tryMarkRead() {
  if (!emailStore.contentData.showUnread || readRequesting) return
  const current = email.value
  if (!current?.emailId || current.unread !== EmailUnreadEnum.UNREAD) return

  // 等详情数据就绪（detailMap 已写入，或正文已有内容）再标已读
  const full = emailStore.detailMap[current.emailId]
  const detailReady = !!full || !!(current.content || current.text)
  if (!detailReady) return

  readRequesting = true
  const emailId = current.emailId
  current.unread = EmailUnreadEnum.READ
  if (emailStore.detailMap[emailId]) {
    emailStore.detailMap[emailId].unread = EmailUnreadEnum.READ
  }
  emailStore.markListRead(emailId)
  emailRead([emailId]).finally(() => {
    readRequesting = false
  })
}

watch(
  () => [
    email.value?.emailId,
    email.value?.content,
    email.value?.text,
    emailStore.detailMap[email.value?.emailId]
  ],
  () => tryMarkRead(),
  { flush: 'post' }
)

watch(
  () => [email.value?.name, email.value?.sendEmail, sentViaEmail.value],
  () => nextTick(updateSenderWrap)
)

onMounted(() => {
  tryMarkRead()
  window.addEventListener('keydown', handleKeyDown);

  // v3.4.0 官方：代发发件人自动换行检测（必须放在下面深链 return 之前，避免被跳过）
  senderResizeObserver = new ResizeObserver(() => updateSenderWrap())
  if (sendNameRef.value) senderResizeObserver.observe(sendNameRef.value)
  nextTick(updateSenderWrap)

  // 自研定制：从 Telegram「网页版」链接深链进入，直接用 query.emailId 拉取详情
  const deepEmailId = Number(route.query.emailId)
  if (deepEmailId) {
    // 深链 URL 携带来源文件夹（worker 端按 type/isDel 计算），用于返回与侧边栏高亮
    emailStore.contentData.fromFolder = route.query.folder || null
    // 回收站邮件：后端需带 deleted=1 才能取到详情（默认接口过滤掉已删除邮件）
    const isDeletedMail = route.query.folder === 'deleted'
    if (isDeletedMail) {
      // 与回收站列表页保持一致：显示「恢复」，隐藏星标/回复
      emailStore.contentData.delType = 'deleted'
      emailStore.contentData.showStar = false
      emailStore.contentData.showReply = false
    }
    if (!email.value?.emailId || email.value.emailId !== deepEmailId) {
      emailDetail(deepEmailId, isDeletedMail).then(res => {
        if (res && res.emailId) {
          emailStore.contentData.email = res
          emailStore.detailMap[res.emailId] = res
          emailStore.contentData.showUnread = res.unread === EmailUnreadEnum.UNREAD
        }
      }).catch(() => {})
    }
    return
  }
  // 列表接口不返回正文 content，需单独拉取详情
  if (email.value?.emailId && !email.value.content && !email.value.text) {
    emailDetail(email.value.emailId).then(res => {
      if (res && emailStore.contentData.email?.emailId === res.emailId) {
        emailStore.detailMap[res.emailId] = res
        emailStore.contentData.email = res
      }
    }).catch(() => {})
  }
})

onUnmounted(() => {
  emailStore.contentData.showUnread = false;
  readRequesting = false
  window.removeEventListener('keydown', handleKeyDown);
  senderResizeObserver?.disconnect()
})

function handleKeyDown(event) {
  if (event.key !== 'Escape') return;
  if (showPreview.value) return;
  if (document.querySelector('.el-message-box')) return;
  const writeBox = document.querySelector('.write-box');
  if (writeBox && writeBox.offsetParent !== null) return;
  handleBack();
}

function openReply() {
  uiStore.writerRef.openReply(email.value)
}

function openForward() {
  uiStore.writerRef.openForward(email.value)
}

function toMessage(message) {
  return  message ? JSON.parse(message).message : '';
}

function formatImage(content) {
  content = content || '';
  const domain = settingStore.settings.r2Domain;
  return  content.replace(/{{domain}}/g, toOssDomain(domain) + '/');
}

function showImage(key) {
  if (!isImage(key)) return;
  const url = cvtR2Url(key)
  srcList.length = 0
  srcList.push(url)
  showPreview.value = true
}

function isImage(filename) {
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif','jfif'].includes(getExtName(filename))
}

function formateReceive(recipient) {
  if (!recipient) return ''
  recipient = JSON.parse(recipient)
  return recipient.map(item => item.address).join(', ')
}

function changeStar() {
  if (email.value.isStar) {
    email.value.isStar = 0;
    starCancel(email.value.emailId).then(() => {
      email.value.isStar = 0;
      emailStore.cancelStarEmailId = email.value.emailId
      setTimeout(() => emailStore.cancelStarEmailId = 0)
      emailStore.starScroll?.deleteEmail([email.value.emailId])
    }).catch((e) => {
      console.error(e)
      email.value.isStar = 1;
    })
  } else {
    email.value.isStar = 1;
    starAdd(email.value.emailId).then(() => {
      email.value.isStar = 1;
      emailStore.addStarEmailId = email.value.emailId
      setTimeout(() => emailStore.addStarEmailId = 0)
      emailStore.starScroll?.addItem(email.value)
    }).catch((e) => {
      console.error(e)
      email.value.isStar = 0;
    })
  }
}

// 返回列表：正常从列表进入有历史记录，用 router.back() 保留滚动/选中态；
// TG View 深链从新标签页进入无历史记录，跳到来源文件夹列表（fromFolder）
function goBackToList() {
  if (window.history.length > 1) {
    router.back()
  } else {
    const folder = emailStore.contentData.fromFolder || 'email'
    router.push({ name: folder })
  }
}

const handleBack = () => {
  goBackToList()
}

const handleDelete = () => {
  // 软删除（可从回收站恢复）：收件箱/已发送/星标(logic)、垃圾邮件(spam)
  // 物理删除（不可恢复）：回收站(deleted)、全部邮件(physics)
  const delType = emailStore.contentData.delType
  const physics = delType !== 'logic' && delType !== 'spam'
  ElMessageBox.confirm(physics ? t('forceDelEmailConfirm') : t('delEmailConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    // 自研定制：按来源分四路。
    // logic    = 收件箱/已发送/星标 → 软删除（进回收站）
    // spam     = 垃圾邮件 → 软删除（进回收站；恢复后回到垃圾邮件，倒计时重新起算）
    // deleted  = 回收站 → 彻底删除，走 /email/forceDelete（只删自己的，受 email:delete 控制）
    // physics  = 全部邮件（管理端）→ 走 /allEmail/delete（受 all-email:delete 控制）
    const request = (delType === 'logic' || delType === 'spam')
        ? emailDelete(email.value.emailId)
        : delType === 'deleted'
            ? emailForceDelete(email.value.emailId)
            : allEmailDelete(email.value.emailId)
    request.then(() => {
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
      emailStore.deleteIds = [email.value.emailId]
      goBackToList()
    })
  })
}

const handleRestore = () => {
  ElMessageBox.confirm(t('restoreConfirm', { msg: email.value.subject || t('thisEmail') }), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'info'
  }).then(() => {
    emailRestore([email.value.emailId]).then(() => {
      ElMessage({
        // 自研定制：按这封邮件的来源提示去处（垃圾邮件 / 收件箱 / 已发送 / 草稿箱）
        message: buildRestoreMessage([email.value]),
        type: 'success',
        plain: true,
      })
      emailStore.deleteIds = [email.value.emailId]
      goBackToList()
    }).catch((e) => {
      console.error(e)
    })
  })
}

// 自研定制：详情页「标为垃圾」——即时生效，成功后回到列表
const handleMarkSpam = () => {
  emailSpam([email.value.emailId], 1).then((res) => {
    ElMessage({
      message: t('spamMarked'),
      type: 'success',
      plain: true,
    })
    emailStore.deleteIds = [email.value.emailId]
    goBackToList()
    // 回到列表后询问是否把该发件人加入黑名单
    askBlockSender(res?.senders)
  })
}

// 自研定制：详情页「移回收件箱」
const handleNotSpam = () => {
  emailSpam([email.value.emailId], 0).then((res) => {
    ElMessage({
      message: t('spamUnmarked'),
      type: 'success',
      plain: true,
    })
    emailStore.deleteIds = [email.value.emailId]
    goBackToList()
    // 发件人仍在黑名单时，问一句是否取消屏蔽
    askUnblockRules(res?.blockedRules)
  })
}
</script>
<style scoped lang="scss">
.box {
  height: 100%;
  overflow: hidden;
}

.header-actions {
  padding: 9px 15px 9px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: var(--header-actions-border);
  font-size: 18px;
  .icon-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    color: var(--el-text-color-primary);
    white-space: nowrap;
    &:hover {
      color: var(--el-color-primary);
    }
  }
  .star {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 21px;
  }
  .icon {
    cursor: pointer;
    flex-shrink: 0;
    color: var(--el-text-color-primary);
  }
  .icon-label {
    font-size: 13px;
    font-weight: normal;
    @media (max-width: 767px) {
      display: none;
    }
  }
}


.scrollbar {
  height: calc(100% - 38px);
  width: 100%;
}

.container {
  font-size: 14px;
  padding-left: 20px;
  padding-right: 20px;
  padding-top: 10px;
  @media (max-width: 1023px) {
    padding-left: 15px;
    padding-right: 15px;
  }

  .email-title {
    font-size: 20px;
    font-weight: bold;
    margin-bottom: 10px;
  }

  .spam-badge {
    display: inline-block;
    margin-right: 8px;
    padding: 0 6px;
    height: 20px;
    line-height: 20px;
    font-size: 12px;
    font-weight: normal;
    border-radius: 4px;
    vertical-align: middle;
    color: var(--el-color-danger);
    background: var(--el-color-danger-light-9);
  }

  .htm-scrollbar {
  }

  .content {
    display: flex;
    flex-direction: column;

    .att {
      margin-top: 30px;
      margin-bottom: 30px;
      border: 1px solid var(--light-border-color);
      padding: 14px;
      border-radius: 6px;
      width: fit-content;
      .att-box {
        min-width: min(410px,calc(100vw - 60px));
        max-width: 600px;
        display: grid;
        gap: 12px;
        grid-template-rows: 1fr;
      }

      .att-title {
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
        span:first-child {
          font-weight: bold;
        }
      }

      .att-item {
        cursor: pointer;
        div {
          align-self: center;
        }
        background: var(--light-ill);
        padding: 5px 7px;
        border-radius: 4px;
        align-self: start;
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        .att-icon {
          display: grid;
        }

        .att-size {
          color: var(--secondary-text-color);
        }

        .att-name {
          margin-left: 8px;
          margin-right: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          word-break: break-all;
        }

        .att-image {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }

        .opt-icon {
          padding-left: 10px;
          color: var(--secondary-text-color);
          align-items: center;
          display: flex;
          gap: 8px;
          cursor: pointer;
          a {
            color: var(--secondary-text-color);
            align-items: center;
            display: flex;
          }
        }
      }
    }

    .email-info {

      border-bottom: 1px solid var(--light-border-color);
      margin-bottom: 20px;
      padding-bottom: 8px;
      @media (max-width: 1024px) {
        margin-bottom: 15px;
      }
      .date {
        color: var(--regular-text-color);
        margin-bottom: 6px;
      }

      .email-msg {
        max-width: 400px;
        width: fit-content;
        margin-bottom: 15px;
      }

      .address-meta {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        column-gap: 10px;
        row-gap: 6px;
        align-items: baseline;
      }

      .send,
      .receive {
        display: contents;
      }

      .send {
        .send-name {
          color: var(--regular-text-color);
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          column-gap: 6px;

          .send-email {
            max-width: 100%;
            overflow-wrap: anywhere;
          }

          &.is-wrapped {
            .send-name-title {
              order: 1;
            }

            .sent-via {
              order: 2;
            }

            .send-email {
              order: 3;
              flex-basis: 100%;
            }
          }
        }
      }

      .receive {
        .receive-email {
          max-width: 700px;
          word-break: break-word;
        }
        span:nth-child(2) {
          color: var(--regular-text-color);
        }
      }

      .date {
        grid-column: 1 / -1;
      }

      .send-source,
      .source {
        white-space: nowrap;
        font-weight: bold;
        text-align: left;
      }
    }
  }
}

.shadow-html::after  {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--message-block-color); /* 半透明黑色蒙层 */
  pointer-events: none; /* 不影响点击 */
}

.email-text {
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.bottom-distance {
  margin-bottom: 30px;
}


</style>
