<template>
  <div class="email-container">
    <div class="header-actions">
      <el-checkbox
          v-model="checkAll"
          :indeterminate="isIndeterminate"
          :disabled="!emailList.length || loading"
          @change="handleCheckAllChange"
      >
      </el-checkbox>
      <div class="header-left" :style="'padding-left:' + actionLeft">

        <slot name="first"></slot>
        <!-- [S40] 工具栏文案统一走 i18n：官方有几处写死中文，英文界面下会显示中文 -->
        <div class="icon-btn" @click="refresh"><Icon class="icon reload" icon="ion:reload" width="18" height="18"/><span class="icon-label">{{ t('refresh') }}</span></div>
        <div v-perm="deletePermKey" class="icon-btn" @click="handleDelete"><Icon class="icon delete" icon="uiw:delete" width="16" height="16"/><span class="icon-label">{{ t('delete') }}</span></div>
        <div v-if="props.emailRestore" class="icon-btn" @click="handleRestore"><Icon class="icon" icon="fluent:arrow-undo-20-regular" width="18" height="18"/><span class="icon-label">{{ t('restore') }}</span></div>
        <!-- 自研定制：标为垃圾 / 移回收件箱 -->
        <div v-if="props.emailSpam" class="icon-btn" @click="handleSpam"><Icon class="icon" icon="mdi:email-off-outline" width="19" height="19"/><span class="icon-label">{{ t('markSpam') }}</span></div>
        <div v-if="props.emailNotSpam" class="icon-btn" @click="handleNotSpam"><Icon class="icon" icon="mdi:inbox-arrow-down" width="19" height="19"/><span class="icon-label">{{ t('notSpam') }}</span></div>
        <div v-perm="'email:delete'" v-if="showUnread" class="icon-btn" @click="handleRead"><Icon class="icon delete" :icon="selectedAllRead ? 'fluent:mail-unread-20-regular' : 'fluent:mail-read-20-regular'" width="21" height="21"/><span class="icon-label">{{ selectedAllRead ? t('markUnread') : t('markRead') }}</span></div>
        <div v-if="props.emailTop" class="icon-btn" @click="handleToolbarTop"><Icon class="icon" :icon="firstSelectedTop ? 'fluent:pin-off-20-regular' : 'fluent:pin-20-regular'" width="18" height="18"/><span class="icon-label">{{ firstSelectedTop ? t('cancelTop') : t('top') }}</span></div>
        <div v-if="props.starAdd && props.starCancel" class="icon-btn" @click="handleToolbarStar"><Icon class="icon" :icon="selectedAllStar ? 'fluent-color:star-16' : 'solar:star-line-duotone'" width="18" height="18"/><span class="icon-label">{{ selectedAllStar ? t('cancelStar') : t('star') }}</span></div>
        <div v-perm="'email:send'" class="icon-btn" @click="handleToolbarReply"><Icon class="icon" icon="la:reply" width="18" height="18"/><span class="icon-label">{{ t('reply') }}</span></div>
        <div v-perm="'email:send'" class="icon-btn" @click="handleToolbarForward"><Icon class="icon" icon="iconoir:arrow-up-right" width="18" height="18"/><span class="icon-label">{{ t('forward') }}</span></div>
      </div>

      <div class="header-right">
        <span class="email-count" v-if="total">{{ $t('emailCount', {total: total}) }}</span>
        <Icon v-if="showAccountIcon" class="more-icon icon" width="16" height="16" icon="akar-icons:dot-grid-fill"
              @click="changeAccountShow"/>
      </div>
    </div>

    <div ref="scroll" class="scroll">
      <UseVirtualList ref="scrollbarRef"
                        @scroll="onScroll"
                        :list="list"
                        :options="{ itemHeight: itemHeight, overscan: 15 }"
                        class="virtual"
                        style="height: 100%"
                        v-if="!loading && emailList.length > 0"
                        :key="keyCount"
        >
          <template #default="{ data: item, index }" >
            <div :class="['email-row', props.type, { 'right-checked': item.rightChecked, 'is-pinned': item.top === 1 }]"
                 :data-checked="item.checked"
                 @click="jumpDetails(item)"
                 v-if="!item.expand"
                 :key="item.emailId"
                 @contextmenu="handleContextmenu($event, item)"
            >
              <el-checkbox :class=" props.type === 'all-email' ? 'all-email-checkbox' : 'checkbox'"
                           v-model="item.checked"
                           :disabled="!item.checked && isSelectMax"
                           @click.stop></el-checkbox>
              <div @click.stop="starChange(item)" class="pc-star" v-if="showStar">
                <Icon v-if="item.isStar" icon="fluent-color:star-16" width="20" height="20"/>
                <Icon v-else icon="solar:star-line-duotone" width="18" height="18"/>
              </div>
              <div v-if="!showStar"></div>
              <!-- 自研定制：回收站来源标签。垃圾邮件的 type 也是 0，spam=1 时优先标「垃圾」，否则会误显示成「收件箱」 -->
              <span v-if="props.type === 'deleted'" class="source-tag"
                    :class="item.spam ? 'source-spam' : ('source-' + item.type)">
                {{ item.spam ? t('spamSourceTag') : (item.type === 1 ? t('sent') : (item.type === 2 ? t('drafts') : t('inbox'))) }}
              </span>
              <div class="title" :class="accountShow ? 'title-column' : 'title-column'">

                <div class="email-sender" :style=" (showStatus ? 'gap: 10px;' : '') + ((item.unread === EmailUnreadEnum.UNREAD && showUnread)  ? 'font-weight: bold' : '')">
                  <div class="email-status" v-if="showStatus">
                    <el-tooltip v-if="item.statusIcon" effect="dark" :content="item.statusIcon.content">
                      <Icon :icon="item.statusIcon.icon" :style="`color: ${item.statusIcon.color}`" width="20" height="20"/>
                    </el-tooltip>
                    <div class="del-status" v-if="item.isDel && item.status !== 6">
                      <el-tooltip effect="dark" :content="item.isDelContent">
                        <Icon class="icon" icon="mdi:email-remove" width="20" height="20"/>
                      </el-tooltip>
                    </div>
                  </div>
                  <div v-else></div>
                  <span class="name">
                    <span>
                      <div class="unread" v-if="isMobile && (item.unread === EmailUnreadEnum.UNREAD && showUnread) "/>
                      <slot name="name" :email="item"><span v-html="item.nameHtml"></span></slot>
                    </span>
                    <span>
                      <Icon v-if="item.isStar" icon="fluent-color:star-16" width="18" height="18"/>
                    </span>
                  </span>
                  <span class="phone-time">{{ item.formatCreateTime }}</span>
                </div>
                <div>
                  <div class="email-text">
                    <span class="email-subject" :style="(item.unread === EmailUnreadEnum.UNREAD && showUnread)  ? 'font-weight: bold' : ''">
                      <div class="unread" v-if="!isMobile && (item.unread === EmailUnreadEnum.UNREAD && showUnread) "/>
                      <span v-if="item.code" class="code-tag" @click.stop="copyCode(item.code)">[{{ t('codeLabel') }}{{ item.code }}]</span>
                      <!-- 自研定制：管理端「全部邮件」标出垃圾邮件（其它页面不显示，避免噪音） -->
                      <span v-if="props.type === 'all-email' && item.spam" class="spam-tag">{{ t('spamTag') }}</span>
                      <span class="subject-text">
                        <slot name="subject" :email="item" >
                          <span v-html="item.subjectHtml"></span>
                        </slot>
                      </span>
                    </span>
                    <span class="email-content" v-html="item.listHtml"></span>
                  </div>
                  <div class="user-info" v-if="showUserInfo">
                    <div class="user">
                      <span>
                        <Icon icon="mynaui:user" width="20" height="20"/>
                      </span>
                      <span v-html="item.userEmailHtml"></span>
                    </div>
                    <div class="account">
                      <span>
                        <Icon icon="mdi-light:email" width="20" height="20"/>
                      </span>
                      <span v-html="item.accountEmailHtml"></span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="email-right" :style="showUserInfo ? 'align-self: start;':''">
                <span class="email-time" :style="(item.unread === EmailUnreadEnum.UNREAD && showUnread) ? 'font-weight: bold' : ''">{{ item.formatCreateTime }}</span>
                <el-tooltip v-if="item.delCountdown" effect="dark" :content="item.delCountdown.tip" placement="top-end" :show-after="200">
                  <span class="del-count" :class="['lv-' + item.delCountdown.level, { overdue: item.delCountdown.overdue }]">{{ item.delCountdown.text }}</span>
                </el-tooltip>
              </div>
            </div>
            <skeletonBlock v-else-if="item.expand === 'loading'"
                           :rows="1"
                           :showStar="showStar"
                           :accountShow="accountShow"
                           :showStatus="showStatus"
                           :showUserInfo="showUserInfo"
                           :type="type"/>
            <div class="noLoading" v-else-if="item.expand === 'noMoreData'">
              <div>{{ $t('noMoreData') }}</div>
            </div>
          </template>
        </UseVirtualList>
      <skeletonBlock v-if="firstLoad && showFirstLoading"
                       :rows="20"
                       :showStar="showStar"
                       :accountShow="accountShow"
                       :showStatus="showStatus"
                       :showUserInfo="showUserInfo"
                       :type="type"/>
      <skeletonBlock v-if="loading"
                       :rows="skeletonRows"
                       :showStar="showStar"
                       :accountShow="accountShow"
                       :showStatus="showStatus"
                       :showUserInfo="showUserInfo"
                       :type="type"/>
      <div class="empty" v-if="noLoading && emailList.length === 0 && !loading">
        <el-empty :image-size="isMobile ? 120 : null" :description="$t('noMessagesFound')"/>
      </div>
    </div>
    <el-dropdown
        ref="dropdownRef"
        @visible-change="visibleChange"
        :virtual-ref="triggerRef"
        :show-arrow="false"
        :popper-options="{
      modifiers: [{ name: 'offset', options: { offset: [0, 0] } }],
    }"
        virtual-triggering
        trigger="contextmenu"
        placement="bottom-start"
    >
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item v-if="rightClickEmail.code" @click="copyCode(rightClickEmail.code)" >
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="fluent-color:clipboard-24" width="20" height="20" />
                <span>{{t('copyCode')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email'].includes(props.type) && hasPerm('email:delete')" @click="emailRead(rightClickEmail.emailId)" >
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="fluent:mail-read-20-regular" width="20" height="20" />
                <span>{{t('markAsRead')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','star'].includes(props.type) && hasPerm('email:send')" @click="openReply(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="fluent-mdl2:reply" width="19" height="19"  />
                <span>{{t('reply')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','send', 'star'].includes(props.type) && hasPerm('email:send')" @click="openForward(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:arrow-up-right" width="19" height="19"  />
                <span>{{t('forward')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','send', 'star'].includes(props.type)" @click="starChange(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon :icon="rightClickEmail.isStar ? 'fluent-color:star-16' : 'solar:star-line-duotone'" width="19" height="19"/>
                <span>{{ rightClickEmail.isStar ? t('cancelStar') : t('star') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email'" @click="handleSearch('user', rightClickEmail.userEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchUser')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email' " @click="handleSearch('account', rightClickEmail.toEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchEmail')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email' " @click="handleSearch('name', rightClickEmail.name)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchSender')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.emailRestore" @click="rightRestore(rightClickEmail.emailId)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="fluent:arrow-undo-20-regular" width="18" height="18" />
                <span>{{t('restore')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.emailSpam" @click="rightSpam(rightClickEmail.emailId)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="mdi:email-off-outline" width="19" height="19" />
                <span>{{t('markSpam')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.emailNotSpam" @click="rightNotSpam(rightClickEmail.emailId)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="mdi:inbox-arrow-down" width="19" height="19" />
                <span>{{t('notSpam')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.emailTop" @click="rightTop(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon :icon="rightClickEmail.top ? 'fluent:pin-off-20-regular' : 'fluent:pin-20-regular'" width="18" height="18" />
                <span>{{ rightClickEmail.top ? t('cancelTop') : t('top') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="hasPerm(deletePermKey)" @click="rightDelete(rightClickEmail.emailId)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="uiw:delete" width="16" height="20" style="margin-left: 1px;margin-right: 3px" />
                <span>{{t('delete')}}</span>
              </div>
            </template>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import skeletonBlock from "@/components/email-scroll/skeleton/index.vue"
import {computed, onActivated, reactive, ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import {useEmailStore} from "@/store/email.js";
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {sleep} from "@/utils/time-utils.js"
import {fromNow, tzDayjs} from "@/utils/day.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import { UseVirtualList } from '@vueuse/components'
import { useScroll } from '@vueuse/core'
import {hasPerm} from "@/perm/perm.js";
import {askBlockSender, askUnblockRules} from "@/utils/spam-block.js";
import {buildRestoreMessage} from "@/utils/restore-msg.js";

const props = defineProps({
  getEmailList: Function,
  emailDelete: Function,
  emailRestore: Function,
  // 自研定制：垃圾邮件（emailSpam=标为垃圾，emailNotSpam=移回收件箱）
  emailSpam: Function,
  emailNotSpam: Function,
  emailTop: Function,
  emailRead: Function,
  starAdd: Function,
  starCancel: Function,
  cancelSuccess: Function,
  starSuccess: Function,
  actionLeft: {
    type: String,
    default: '0'
  },
  timeSort: {
    type: Number,
    default: 0,
  },
  showStatus: {
    type: Boolean,
    default: false
  },
  showAccountIcon: {
    type: Boolean,
    default: true,
  },
  showUserInfo: {
    type: Boolean,
    default: false
  },
  showStar: {
    type: Boolean,
    default: true
  },
  allowStar: {
    type: Boolean,
    default: true
  },
  type: {
    type: String,
    default: 'email'
  },
  showFirstLoading: {
    type: Boolean,
    default: true
  },
  showUnread: {
    type: Boolean,
    default: false
  },
  highlightText: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['jump', 'refresh-before', 'refresh-success', 'delete-draft', 'right-search'])

const {t} = useI18n()
const settingStore = useSettingStore()
const uiStore = useUiStore();
const emailStore = useEmailStore();

// 自研定制：删除按钮的权限键按页面区分。
// 「全部邮件」页删除走 /allEmail/delete（要 all-email:delete），其余页面走 /email/*（要 email:delete）。
// 此前一律判 email:delete，导致有查看权限但没有全站删除权限的角色看到按钮、点了 403。
const deletePermKey = computed(() =>
    props.type === 'all-email' ? 'all-email:delete' : 'email:delete'
)

const loading = ref(false);
const followLoading = ref(false);
const noLoading = ref(false);
const emailList = reactive([])
const expandList = reactive([])
const total = ref(0);
const checkAll = ref(false);
const isIndeterminate = ref(false);
const scroll = ref(null)
const firstLoad = ref(true)
let scrollTop = 0
const latestEmail = ref(null)
const scrollbarRef = ref(null)
// iPad can report a Mac platform when requesting desktop websites.
const isMacOS = /Mac/.test(navigator.platform) && navigator.maxTouchPoints <= 1
let reqLock = false
let isMobile = ref(innerWidth < 1367)
let skeletonRows = 0
const timePaddingRight = ref('');
const keyCount = ref(0);
const dropdownRef = ref(null);
const dropdownCloseLock = ref(false);
const dropdownShow = ref(false);
const rightClickEmail = ref({});
const MAX_SELECT_COUNT = 95;
const checkedEmailCount = ref(0);
const isSelectMax = computed(() => checkedEmailCount.value >= MAX_SELECT_COUNT);
const firstSelectedTop = computed(() => {
  const ids = getSelectedMailsIds();
  if (ids.length === 0) return false;
  const first = emailList.find(e => e.emailId === ids[0]);
  return first ? first.top === 1 : false;
});
// 勾选的都是「已读」时，按钮语义翻转为「标未读」
const selectedAllRead = computed(() => {
  const selected = emailList.filter(item => item.checked);
  if (selected.length === 0) return false;
  return selected.every(item => item.unread === EmailUnreadEnum.READ);
});
// 勾选的都已是星标时，按钮语义翻转为「取消星标」；与行内星标、右键菜单保持同一状态
const selectedAllStar = computed(() => {
  const selected = emailList.filter(item => item.checked);
  if (selected.length === 0) return false;
  return selected.every(item => item.isStar);
});
let timer = null
const position = ref(
    DOMRect.fromRect({
      x: 0,
      y: 0,
    })
)

const triggerRef = ref({
  getBoundingClientRect() {
    return position.value;
  }
})

const queryParam = reactive({
  size: 50
});

defineExpose({
  refreshList,
  deleteEmail,
  addItem,
  handleList,
  emailList,
  firstLoad,
  latestEmail,
  noLoading,
  total
})

onActivated(() => {
  getEmailList(true);
  requestAnimationFrame(() => {
    const index = scrollTop / itemHeight.value
    scrollbarRef.value?.scrollTo(index);
  })
})

onMounted(() => {
  timer = setInterval(() => {
    emailList.forEach(email => {
      email.formatCreateTime = fromNow(email.createTime);
      email.delCountdown = buildDelCountdown(email);
    })
  }, 1000 * 60);
})

onUnmounted(() => {
  clearInterval(timer)
})

getEmailList()

window.onresize = () => {
  isMobile.value = innerWidth < 1367
}

function onScroll(e) {
  scrollTop = e.target.scrollTop;
}

const { arrivedState } = useScroll(scrollbarRef, {
  offset: { bottom: isMobile.value ? 2200 : 1500 }
})


const list = computed(() => {
  return [...emailList, ...expandList]
})

const itemHeight = computed(() => {
    if (props.type === 'all-email') {
      return isMobile.value ? 132 : 65;
    } else  {
      return isMobile.value ? 83 : 48;
    }
})

watch(emailList, () => {
  updateHasScrollbar();
})

watch(scrollbarRef, () => {
  updateHasScrollbar();
})

// 强制刷新 (itemHeight 更改后虚拟滚动列表不会自己更新)
watch(itemHeight, () => {
  keyCount.value ++
})

watch(followLoading, (isFollowLoading) => {
  if (isFollowLoading) {
    expandList.push({
      emailId: 0,
      expand: 'loading'
    })
  } else {
    const index = expandList.findIndex(item => item.expand === 'loading')
    expandList.splice(index, 1);
  }
});

watch(noLoading, (isNoLoading) => {
  if (isNoLoading) {
    expandList.push({
      emailId: 0,
      expand: 'noMoreData'
    })
  } else {
    const index = expandList.findIndex(item => item.expand === 'noMoreData')
    expandList.splice(index, 1);
  }
})


// 监听是否到达底部
watch(() => arrivedState.bottom, (isBottom) => {
  if (isBottom && !loading.value) {
    loadData();
  }
});

watch(
    () => emailList.map(item => item.checked),
    () => {
      checkedEmailCount.value = emailList.length
      if (emailList.length > 0) {
        updateCheckStatus();
      }
    },
    {deep: true}
);


watch(() => emailStore.deleteIds, () => {
  if (emailStore.deleteIds) {
    deleteEmail(emailStore.deleteIds)
  }
})

watch(() => emailStore.cancelStarEmailId, () => {
  emailList.forEach(email => {
    if (email.emailId === emailStore.cancelStarEmailId) {
      email.isStar = 0
    }
  })
})

watch(() => emailStore.addStarEmailId, () => {
  emailList.forEach(email => {
    if (email.emailId === emailStore.addStarEmailId) {
      email.isStar = 1
    }
  })
})

window.addEventListener('wheel', (event) => {
  if (dropdownShow.value) {
    dropdownRef.value.handleClose();
  }
})

function openReply(email) {
  const fullEmail = emailStore.detailMap[email.emailId]
  if (!fullEmail) return
  uiStore.writerRef.openReply(fullEmail)
}

function openForward(email) {
  const fullEmail = emailStore.detailMap[email.emailId]
  if (!fullEmail) return
  uiStore.writerRef.openForward(fullEmail)
}

function visibleChange(e) {
  dropdownShow.value = e;
  dropdownCloseLock.value = true;
  setTimeout(() => {
    dropdownCloseLock.value = false;
  },1500)

  if (!e && rightClickEmail.value.rightChecked) {
    rightClickEmail.value.rightChecked = false
  }
}

const handleContextmenu = (event, email) => {

  if (props.type === 'draft') {
    return
  }

  if (rightClickEmail.value.rightChecked) {
    rightClickEmail.value.rightChecked = false
  }

  const { clientX, clientY } = event
  position.value = DOMRect.fromRect({
    x: clientX,
    y: clientY,
  })
  event.preventDefault();
  dropdownRef.value?.handleOpen();

  rightClickEmail.value = email;
  rightClickEmail.value.rightChecked = true
}

function updateHasScrollbar() {
  nextTick(() => {

    if (isMacOS) {
      timePaddingRight.value = '15px'
      return
    }

    const doc = document.querySelector('.virtual');
    if (doc) {
      if (doc.scrollHeight > doc.clientHeight) {
        timePaddingRight.value = '6px';
      } else {
        timePaddingRight.value = '15px'
      }
    }
  })
}

function getSkeletonRows() {
  if (emailList.length > 20) return skeletonRows = 20
  if (emailList.length === 0) return skeletonRows = 1
  skeletonRows = emailList.length
}

const accountShow = computed(() => {
  return uiStore.accountShow && settingStore.settings.manyEmail === 0
})

function starChange(email) {

  if (!email.isStar) {

    if (!props.allowStar) return;

    email.isStar = 1;
    props.starAdd(email.emailId).then(() => {
      email.isStar = 1;
      // 未传 starSuccess 的页面（如星标页）不应因此回滚状态
      props.starSuccess?.(email)
    }).catch(e => {
      console.error(e)
      email.isStar = 0
    })
  } else {

    email.isStar = 0;
    props.starCancel(email.emailId).then(() => {
      email.isStar = 0;
      props.cancelSuccess?.(email)
    }).catch(e => {
      console.error(e)
      email.isStar = 1;
    })
  }
}

function changeAccountShow() {
  uiStore.accountShow = !uiStore.accountShow;
}

const handleRead = () => {
  const emailIds = getSelectedMailsIds();
  if (emailIds.length === 0) {
    ElMessage({ message: t('selectMailFirst'), type: 'warning', plain: true });
    return;
  }
  // 勾选的全是已读 → 标未读；否则（含混合）→ 标已读
  const unread = selectedAllRead.value ? EmailUnreadEnum.UNREAD : EmailUnreadEnum.READ;
  props.emailRead?.(emailIds, unread);
  localUnread(emailIds, unread);
}

function handleToolbarTop() {
  const ids = getSelectedMailsIds();
  if (ids.length === 0) {
    ElMessage({ message: t('selectMailFirst'), type: 'warning', plain: true });
    return;
  }
  // 取第一条邮件的置顶状态作为基准（批量操作统一取反）
  const first = emailList.find(e => e.emailId === ids[0]);
  if (!first) return;
  const top = first.top === 1 ? 0 : 1;
  props.emailTop(ids, top).then(() => {
    ElMessage({
      message: top ? t('topSuccessMsg') : t('cancelTopSuccessMsg'),
      type: 'success',
      plain: true
    })
    refreshList();
  })
}

function handleToolbarStar() {
  const ids = getSelectedMailsIds();
  if (ids.length === 0) {
    ElMessage({ message: t('selectMailFirst'), type: 'warning', plain: true });
    return;
  }
  // 与行内星标/右键菜单同一套语义：全部已星标 → 取消；否则（含混合勾选）→ 全部加星
  const star = !selectedAllStar.value;
  const applyLocal = () => {
    emailList.forEach(item => {
      if (ids.includes(item.emailId)) {
        item.isStar = star ? 1 : 0;
      }
    });
    ElMessage({
      message: star ? t('starSuccessMsg') : t('cancelStarSuccessMsg'),
      type: 'success',
      plain: true
    });
  };
  if (star) {
    props.starAdd(ids).then(applyLocal).catch(() => {});
  } else {
    props.starCancel(ids).then(applyLocal).catch(() => {});
  }
}

function handleToolbarReply() {
  const ids = getSelectedMailsIds();
  if (ids.length !== 1) {
    ElMessage({ message: t('selectOneMailFirst'), type: 'warning', plain: true });
    return;
  }
  const email = emailList.find(e => e.emailId === ids[0]);
  if (email) openReply(email);
}

function handleToolbarForward() {
  const ids = getSelectedMailsIds();
  if (ids.length !== 1) {
    ElMessage({ message: t('selectOneMailFirst'), type: 'warning', plain: true });
    return;
  }
  const email = emailList.find(e => e.emailId === ids[0]);
  if (email) openForward(email);
}

function emailRead(emailId) {
  props.emailRead([emailId])
  localRead([emailId]);
}

function localUnread(emailIds, unread) {
  emailIds.forEach(emailId => {
    const index = emailList.findIndex(email => email.emailId === emailId);
    if (index > -1) {
      emailList[index].unread = unread;
      emailList[index].checked = false;
    }
  })
  checkedEmailCount.value = emailList.filter(item => item.checked).length;
  checkAll.value = false;
  isIndeterminate.value = false;
}

function localRead(emailIds) {
  localUnread(emailIds, EmailUnreadEnum.READ);
}

function rightDelete(emailId) {
  // 右键删除同样要二次确认：草稿是本地删除、回收站与全部邮件是物理删除，文案必须说清后果
  if (props.type === 'draft') {
    ElMessageBox.confirm(t('delDraftsConfirm', { n: 1 }), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    }).then(() => {
      emit('delete-draft', [emailId])
    }).catch(() => {
    })
    return
  }

  const physics = props.type === 'deleted' || props.type === 'all-email'
  ElMessageBox.confirm(physics ? t('forceDelOneEmailConfirm') : t('delOneEmailConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    props.emailDelete([emailId]).then(() => {
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true
      })
      emailStore.deleteIds = [emailId]
    })
  }).catch(() => {
  })
}

function handleRestore() {
  const selected = emailList.filter(item => item.checked);
  if (selected.length === 0) {
    ElMessage({ message: t('selectMailFirst'), type: 'warning', plain: true });
    return;
  }
  const emailIds = selected.map(item => item.emailId);
  props.emailRestore(emailIds).then(() => {
    // 自研定制：按邮件来源提示「回到哪个文件夹」，混合时汇总数量
    ElMessage({
      message: buildRestoreMessage(selected),
      type: 'success',
      plain: true
    })
    emailStore.deleteIds = emailIds;
  })
}

function rightRestore(emailId) {
  const item = emailList.find(row => row.emailId === emailId);
  props.emailRestore([emailId]).then(() => {
    ElMessage({
      message: buildRestoreMessage(item ? [item] : []),
      type: 'success',
      plain: true
    })
    emailStore.deleteIds = [emailId];
  })
}

// 自研定制：标为垃圾 / 移回收件箱。即时生效（无二次确认），靠 toast + 列表移除反馈。

function handleSpam() {
  const ids = getSelectedMailsIds();
  if (ids.length === 0) {
    ElMessage({ message: t('selectMailFirst'), type: 'warning', plain: true });
    return;
  }
  props.emailSpam(ids).then((res) => {
    ElMessage({
      message: ids.length > 1 ? t('spamMarkedMany', { n: ids.length }) : t('spamMarked'),
      type: 'success',
      plain: true
    })
    emailStore.deleteIds = ids;
    askBlockSender(res?.senders)
  })
}

function rightSpam(emailId) {
  props.emailSpam([emailId]).then((res) => {
    ElMessage({ message: t('spamMarked'), type: 'success', plain: true })
    emailStore.deleteIds = [emailId];
    askBlockSender(res?.senders)
  })
}

function handleNotSpam() {
  const ids = getSelectedMailsIds();
  if (ids.length === 0) {
    ElMessage({ message: t('selectMailFirst'), type: 'warning', plain: true });
    return;
  }
  props.emailNotSpam(ids).then((res) => {
    ElMessage({
      message: ids.length > 1 ? t('spamUnmarkedMany', { n: ids.length }) : t('spamUnmarked'),
      type: 'success',
      plain: true
    })
    emailStore.deleteIds = ids;
    askUnblockRules(res?.blockedRules)
  })
}

function rightNotSpam(emailId) {
  props.emailNotSpam([emailId]).then((res) => {
    ElMessage({ message: t('spamUnmarked'), type: 'success', plain: true })
    emailStore.deleteIds = [emailId];
    askUnblockRules(res?.blockedRules)
  })
}

function rightTop(email) {
  const top = email.top === 1 ? 0 : 1;
  props.emailTop([email.emailId], top).then(() => {
    ElMessage({
      message: top ? t('topSuccessMsg') : t('cancelTopSuccessMsg'),
      type: 'success',
      plain: true
    })
    refreshList();
  })
}

function handleSearch(type, value) {
  emit('right-search', type, value);
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true
    })
  }
}

function handleDelete() {
  const selIds = props.type === 'draft' ? getSelectedDraftsIds() : getSelectedMailsIds();
  if (selIds.length === 0) {
    ElMessage({ message: t('selectMailFirst'), type: 'warning', plain: true });
    return;
  }

  const count = selIds.length
  let confirmText
  if (props.type === 'draft') {
    confirmText = t('delDraftsConfirm', { n: count })
  } else if (props.type === 'deleted' || props.type === 'all-email') {
    confirmText = t('forceDelEmailsConfirm', { n: count })
  } else {
    confirmText = t('delEmailsConfirm', { n: count })
  }

  ElMessageBox.confirm(confirmText, {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {

    if (props.type === 'draft') {
      const draftIds = getSelectedDraftsIds();
      emit('delete-draft', draftIds);
      return;
    }

    const emailIds = getSelectedMailsIds();
    props.emailDelete(emailIds).then(() => {
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true
      })
      emailStore.deleteIds = emailIds;
    })
  }).catch(() => {
  })
}

function deleteEmail(emailIds) {
  let removed = 0
  emailIds.forEach(emailId => {
    emailList.forEach((item, index) => {
      if (emailId === item.emailId) {
        emailList.splice(index, 1);
        removed++
      }
    })
  })
  // 自研定制：移除后同步递减总数，否则「共 N 封」在标记垃圾/删除后仍是旧数字
  if (removed) {
    total.value = Math.max(0, (total.value || 0) - removed)
  }
  if (emailList.length < queryParam.size && !noLoading.value) {
    getEmailList()
  }
}

function addItem(email) {

  const existIndex = emailList.findIndex(item => item.emailId === email.emailId)

  if (existIndex > -1) {
    return false;
  }

  email.formatCreateTime = fromNow(email.formatCreateTime);

  if (props.timeSort) {
    if (noLoading.value) {
      handleList([email]);
      emailList.push(email);
    }

    if (email.emailId > latestEmail.value?.emailId) {
      latestEmail.value = email
    }

    total.value++
    return true;
  }


  const index = emailList.findIndex(item => item.emailId < email.emailId)

  if (index !== -1) {
    handleList([email]);
    emailList.splice(index, 0, email);
  } else {
    if (noLoading.value) {
      handleList([email]);
      emailList.push(email);
    }
  }

  if (email.emailId > latestEmail.value?.emailId) {
    latestEmail.value = email
  }

  total.value++
  return true;
}

function handleCheckAllChange(val) {
  if (val) {
    let count = 0;
    emailList.forEach(item => {
      if (count < MAX_SELECT_COUNT) {
        item.checked = true;
        count++;
      } else {
        item.checked = false;
      }
    });
  } else {
    emailList.forEach(item => item.checked = false);
  }
  isIndeterminate.value = false;
}

// 获取选中的邮件列表id
function getSelectedMailsIds() {
  return emailList.filter(item => item.checked).map(item => item.emailId);
}

function getSelectedDraftsIds() {
  return emailList.filter(item => item.checked).map(item => item.draftId);
}

function updateCheckStatus() {
  const checkedCount = emailList.filter(item => item.checked).length;
  checkedEmailCount.value = checkedCount;
  const atMax = checkedCount >= MAX_SELECT_COUNT;
  checkAll.value = emailList.length > 0 && (checkedCount === emailList.length || atMax);
  isIndeterminate.value = checkedCount > 0 && !checkAll.value;
}

function toggleRowChecked(email) {
  if (!email.checked && isSelectMax.value) {
    return
  }
  email.checked = !email.checked
}

function jumpDetails(email) {

  if (dropdownShow.value) {
    dropdownRef.value.handleClose();
    return;
  }

  if (!dropdownCloseLock.value) {
    const sel = window.getSelection();
    if (sel.toString().trim()) {
      return
    }
  }

  if (checkedEmailCount.value > 0) {
    toggleRowChecked(email)
    return
  }

  emit('jump', email)
}


function getEmailList(refresh = false) {

  if (reqLock) return Promise.resolve(false);

  let emailId = emailList.length > 0 ? emailList.at(-1).emailId : 0;

  reqLock = true

  if (!refresh) {

    if (loading.value || noLoading.value) {
      reqLock = false
      return Promise.resolve(false)
    }

  } else {
    getSkeletonRows()
    emailId = 0
    loading.value = true
    scrollTop = 0
  }

  if (emailList.length === 0) {
    loading.value = true
  } else {
    followLoading.value = !refresh;
  }
  let start = Date.now();

  return props.getEmailList(emailId, queryParam.size).then(async data => {
    let end = Date.now();
    let duration = end - start;
    if (duration < 300 && !emailId) {
        await sleep(300 - duration)
    }
    firstLoad.value = false

    let list = data.list.map(item => ({
      ...item,
      checked: false
    }));


    if (refresh) {
      emailList.length = 0
    }

    latestEmail.value = data.latestEmail

    handleList(list);
    emailList.push(...list);
    if (refresh) scrollbarRef.value?.setScrollTop(0);

    noLoading.value = data.list.length < queryParam.size;
    followLoading.value = data.list.length >= queryParam.size;

    total.value = data.total;
    return true;
  }).finally(() => {
    loading.value = false
    reqLock = false
  })
}

// 回收站「还剩几天删除」：后端只对确实会被自动清理的邮件返回 autoDeleteAt，其余为 undefined → 不显示胶囊
function buildDelCountdown(email) {
  const at = email.autoDeleteAt;
  if (!at) {
    return null;
  }
  const left = at - Date.now();
  if (left <= 0) {
    return { level: 'danger', overdue: true, text: t('deleteSoon'), tip: t('deleteOverdueTip') };
  }
  const days = Math.ceil(left / 86400000);
  return {
    level: days <= 1 ? 'danger' : (days <= 7 ? 'warn' : 'normal'),
    overdue: false,
    text: t('deleteInDays', { n: days }),
    tip: t('deleteAtTip', { time: tzDayjs(at).format('YYYY-MM-DD HH:mm') })
  };
}

function handleList(list) {
  list.forEach(email => {
    email.formatCreateTime = fromNow(email.createTime);
    email.delCountdown = buildDelCountdown(email);
    email.test = t('received')
    const statusIconMap = {
      0: { icon: 'ic:round-mark-email-read', color: '#51C76B', content: t('received') },
      1: { icon: 'bi:send-arrow-up-fill',  color: '#51C76B', content: t('sent') },
      2: { icon: 'bi:send-check-fill',     color: '#51C76B', content: t('delivered') },
      3: { icon: 'bi:send-x-fill',         color: '#F56C6C', content: t('bounced') },
      8: { icon: 'bi:send-x-fill',         color: '#F56C6C', content: t('bounced') },
      4: { icon: 'bi:send-exclamation-fill', color: '#FBBD08', content: t('complained') },
      5: { icon: 'bi:send-arrow-up-fill',  color: '#FBBD08', content: t('delayed') },
      6: { icon: 'mdi:email-lock', color: '#909399', content: t('saving') },
      7: { icon: 'ic:round-mark-email-read', color: '#FBBD08', content: t('noRecipient') },
    };

    if (email.isDel) {
      email.isDelContent = t('selectDeleted');
    }
    email.statusIcon = statusIconMap[email.status];
    applyHighlight(email);
  })
}

function applyHighlight(email) {
  email.nameHtml = renderHighlight(email.name);
  email.subjectHtml = renderHighlight(email.subject);
  email.listHtml = renderHighlight(email.listText || email.text);
  email.userEmailHtml = renderHighlight(email.userEmail);
  email.accountEmailHtml = renderHighlight(email.type === 0 ? email.toEmail : email.sendEmail);
}

watch(() => props.highlightText, () => {
  emailList.forEach(applyHighlight);
})

function refresh() {
  emit('refresh-before')
  if (props.skeleton) {
    scrollbarRef.value.setScrollTop(0)
  }
  checkAll.value = false;
  isIndeterminate.value = false;
  getEmailList(true).then(ok => {
    if (ok) emit('refresh-success')
  }).catch(() => {})
}

function refreshList() {
  checkAll.value = false;
  isIndeterminate.value = false;
  getEmailList(true);
}

function loadData() {
  getEmailList()
}


function escapeHtml(value) {
  return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
}

function renderHighlight(value) {
  const text = value == null ? '' : String(value)
  if (!text) return '\u200B'
  const keyword = props.highlightText?.trim()
  if (!keyword) return escapeHtml(text)
  const pattern = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  let html = ''
  let lastIndex = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    html += escapeHtml(text.slice(lastIndex, index))
    html += `<mark class="search-hit">${escapeHtml(match[0])}</mark>`
    lastIndex = index + match[0].length
  }
  html += escapeHtml(text.slice(lastIndex))
  return html
}

</script>
<style lang="scss" scoped>
:deep(.search-hit) {
  background-color: var(--search-hit-background);
  color: inherit;
  padding: 0;
  border-radius: 2px;
}


.email-container {
  display: grid;
  grid-template-rows: auto 1fr;
  padding: 0;
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  height: 100%;
}

.scroll {
  margin: 0;
  height: 100%;
  overflow: hidden;

  .virtual {
    will-change: scroll-position;
  }

  .empty {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
  }

  .noLoading {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 15px 0 0 0;
    color: var(--secondary-text-color);
  }

  .follow-loading {
    height: 60px;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    background: var(--loadding-background);
    height: 100%;
    width: 100%;
    position: absolute;
    z-index: 1;
    top: 0;
    left: 0;
  }

  .loading-show {
    transition: all 200ms ease 200ms;
    opacity: 1;
  }

  .loading-hide {
    pointer-events: none;
    transition: var(--loading-hide-transition);
    opacity: 0;
  }
}

/* 复选框尺寸统一在全局 style.css 定义（外框 + 对钩 + 半选横杠），此处只放大垂直点击热区 */
:deep(.email-row) {
  display: flex;
  padding: 8px 0;
  justify-content: space-between;
  box-shadow: var(--header-actions-border);
  cursor: pointer;
  align-items: center;
  position: relative;
  transition: background 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
  height: 48px;
  @media (max-width: 1366px) {
    height: 83px;
  }

  @media (pointer: coarse) {
    /* 触屏 */
    user-select: none;
  }
  &.all-email {
    height: 65px;
    @media (max-width: 1366px) {
      height: 132px;
    }
  }
  .user-info {
    display: flex;
    flex-wrap: wrap;
    column-gap: 10px;
    margin-top: 5px;
    margin-bottom: 2px;
    color: var(--email-scroll-content-color);
    @media (max-width: 1366px) {
      flex-direction: column;
    }

    .user, .account {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      transition: all 300ms;
      line-height: 12px;
      max-width: 300px;
      min-width: 0;

      @media (max-width: 1223px) {
        max-width: 280px;
      }

      span:first-child {
        position: relative;
      }

      span:last-child {
        margin-left: 5px;
        position: relative;
        bottom: 5px;
      }
    }
  }

  /* 复选框尺寸统一在组件级定义（见下方 :deep(.el-checkbox__inner)），此处只放大垂直热区 */
  .checkbox,
  .all-email-checkbox {
    .el-checkbox {
      height: 100%;
      align-items: center;
    }
  }

  .checkbox {
    display: flex;
    padding-left: 15px;
    padding-right: 20px;
    justify-content: center;
  }

  .all-email-checkbox {
    display: flex;
    padding-left: 15px;
    padding-right: 20px;
    justify-content: center;
    @media (min-width: 1367px) {
      justify-content: start;
      height: 100%;
      align-self: start;
      padding-bottom: 30px;
    }
  }

  .title-column {
    @media (max-width: 1366px) {
      grid-template-columns: 1fr !important;
      gap: 4px !important;
    }
  }

  .title {
    flex: 1;
    display: grid;
    grid-template-columns: 240px 1fr;
    @media (max-width: 1366px) {
      padding-right: 15px;
    }
    @media (max-width: 1366px) {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .email-sender {
      color: var(--el-text-color-primary);
      display: grid;
      grid-template-columns: auto 1fr auto;

      .email-status {
        display: flex;
        flex-direction: column;
        align-content: center;
        @media (max-width: 1366px) {
          flex-direction: row;
          gap: 5px;
        }
      }

      .name {
        display: grid;
        gap: 5px;
        grid-template-columns: auto 1fr;

        > span:last-child {
          display: flex;
          align-items: center;
        }

        @media (min-width: 1366px) {
          grid-template-columns: 1fr;
          > span:last-child {
            display: none;
          }
        }

        > span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .name-skeleton {
          width: 150px;
          height: 1rem;
          @media (max-width: 767px) {
            width: 130px;
          }
        }
      }

      .phone-time {
        font-weight: normal;
        font-size: 12px;
        @media (min-width: 1367px) {
          display: none;
        }
      }
    }

    .email-text-skeleton {
      .text-skeleton-one {
        width: 80%;
        height: 16px;
        @media (max-width: 1366px) {
          width: 40%;
        }
        @media (max-width: 767px) {
          width: 70%;
        }
      }

      .text-skeleton-two {
        width: min(300px, 100%);
        height: 16px;
        @media (min-width: 1367px) {
          display: none;
        }
        @media (max-width: 1366px) {
          width: 100%;
        }
      }
    }

    .email-text {
      display: grid;
      grid-template-columns: auto 1fr;
      @media (max-width: 1366px) {
        grid-template-columns: 1fr;
      }

      .email-subject {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow: hidden;
        white-space: nowrap;
        min-width: 0;
        @media (min-width: 1367px) {
          padding-left: 5px;
        }
      }

      .code-tag {
        flex: 0 0 auto;
        max-width: 170px;
        height: 20px;
        line-height: 20px;
        font-size: 14px;
        color: var(--el-text-color-primary);
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        cursor: pointer;
      }

      .spam-tag {
        flex: 0 0 auto;
        margin-right: 6px;
        padding: 0 6px;
        height: 18px;
        line-height: 18px;
        font-size: 12px;
        border-radius: 4px;
        color: var(--el-color-danger);
        background: var(--el-color-danger-light-9);
      }

      .subject-text {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        min-width: 0;
      }

      .email-content {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        padding-left: 10px;
        color: var(--email-scroll-content-color);
        @media (max-width: 1366px) {
          padding-left: 0;
          margin-top: 0;
        }
      }
    }
  }


  .email-right {
    text-align: right;
    font-size: 12px;
    white-space: nowrap;
    display: flex;
    /* 回收站会在时间下方追加一行倒计时胶囊，故改为纵向排列；只有时间一项时与原效果一致 */
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;
    gap: 2px;
    padding-left: 15px;
    @media (max-width: 1366px) {
      display: none;
    }
  }

  .email-right-skeleton {
    @media (max-width: 1366px) {
      display: none;
    }
  }

  &:hover {
    background-color: var(--email-hover-background);
    z-index: 0;
  }

  &.right-checked,
  &.right-checked:hover {
    background-color: var(--email-right-click-background);
  }

  &.is-pinned {
    background-color: var(--email-pinned-background, #fdf6ec);
  }

  &.is-pinned:hover {
    background-color: var(--email-pinned-hover-background, #faecd8);
  }

  /* 官方 v3.5.0：选中行高亮（替换原先被注释掉的 #c2dbff） */
  &[data-checked="true"],
  &[data-checked="true"]:hover,
  &.right-checked[data-checked="true"],
  &.right-checked[data-checked="true"]:hover {
    background-color: var(--email-hover-background);
  }
}

.source-tag {
  flex: 0 0 auto;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 10px;
  line-height: 18px;
  white-space: nowrap;
  margin-right: 6px;
  &.source-0 {
    background-color: #ecf5ff;
    color: #409eff;
    border: 1px solid #d9ecff;
  }
  &.source-1 {
    background-color: #f0f9eb;
    color: #67c23a;
    border: 1px solid #e1f3d8;
  }
  &.source-2 {
    background-color: #fdf6ec;
    color: #e6a23c;
    border: 1px solid #faecd8;
  }
  // 自研定制：从垃圾邮件删进回收站的邮件，来源标签标红
  &.source-spam {
    background-color: #fef0f0;
    color: #f56c6c;
    border: 1px solid #fde2e2;
  }
}

.email-pin {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: auto;
  min-width: 20px;
  height: 20px;
  margin-right: 2px;
  cursor: pointer;
  color: #909399;
  border-radius: 4px;
  padding: 0 3px;
  &.pinned {
    color: #f56c6c;
  }
  &:hover {
    background-color: var(--email-hover-background);
  }
  .icon-label {
    font-size: 11px;
    @media (max-width: 767px) {
      display: none;
    }
  }
}


.phone-star {
  display: none;
}

.pc-star {
  display: flex;
  width: 40px;
}

@media (max-width: 1366px) {
  .pc-star {
    display: none;
  }
  .phone-star {
    display: block;
    align-self: end;
    padding-right: 16px;
    padding-top: 8px;
  }
  .star-pd {
    padding-top: 6px !important;
  }
}

.email-time {
  padding-right: v-bind(timePaddingRight);
}

/* 回收站倒计时胶囊：字号 11 / 行高 16，margin-right 与 .email-time 的 padding-right 取同一个动态值，
   保证「时间」与「胶囊」右边缘严格对齐（滚动条出现与否都在同一条竖线上） */
.del-count {
  display: inline-block;
  flex: 0 0 auto;
  font-size: 11px;
  line-height: 16px;
  padding: 0 6px;
  border-radius: 999px;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: v-bind(timePaddingRight);

  &.lv-normal {
    background: var(--del-count-bg);
    color: var(--del-count-color);
  }

  &.lv-warn {
    background: var(--del-count-warn-bg);
    color: var(--del-count-warn-color);
  }

  &.lv-danger {
    background: var(--del-count-danger-bg);
    color: var(--del-count-danger-color);
  }

  &.overdue {
    font-weight: 500;
  }
}

:deep(.el-scrollbar__view) {
  height: 100%;
}

.header-actions {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 15px;
  padding: 3px 15px;
  box-shadow: var(--header-actions-border);

  .header-left {
    display: flex;
    /* 工具栏必须单行：窄屏时横向滚动，不允许换行把功能挤到第二行 */
    flex-wrap: nowrap;
    align-items: center;
    position: relative;
    min-width: 0;
    /* [S41] 窄屏下允许收缩到容器宽度并由自身滚动，避免 grid 列宽压缩时子项互相压叠 */
    flex: 1 1 auto;
    overflow-x: auto;
    scrollbar-width: none;
    column-gap: 8px;
    row-gap: 6px;
    padding-left: 2px;
    color: var(--el-text-color-primary);;

    &::-webkit-scrollbar {
      display: none;
    }

    /* [S41] 必须用 :deep()：工具栏左区里既有组件自己的按钮，也有各页面通过
       <template #first> 插进来的按钮（如「最新在前」排序）。插槽内容属于父组件
       作用域，只带父组件的 data-v，组件 scoped 规则管不到它 —— 以前靠各页面自己
       的全局 .icon-btn 兜着，官方 v3.6.0 重写收件箱页时把那块样式删了，插槽按钮
       就退化成 inline 流：svg 底边贴在文字基线上，图标跑到文字上方、紧贴成一片。 */
    :deep(.icon-btn) {
      display: flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      color: var(--el-text-color-primary);
      white-space: nowrap;
      /* [S41] 窄屏防止被压缩：既不收缩也不拉伸，宽度始终由内容决定 */
      flex: 0 0 auto;
    }

    :deep(.icon-btn:hover) {
      color: var(--el-color-primary);
    }

    :deep(.icon) {
      font-size: 18px;
      cursor: pointer;
      flex-shrink: 0;
      display: block;
    }

    :deep(.icon-label) {
      font-size: 12px;
      font-weight: normal;
      line-height: 1;
      align-self: center;
      @media (max-width: 767px) {
        display: none;
      }
    }

    .more-icon {
      margin-top: 8px;
      margin-left: 15px;
    }
  }

  .header-right {
    display: grid;
    grid-template-columns: auto auto;
    align-items: start;
    height: 100%;
    color: var(--el-text-color-primary);;

    .email-count {
      white-space: nowrap;
      margin-top: 6px;
    }
  }

  .icon {
    font-size: 18px;
    cursor: pointer;
  }

  .reload {
    margin-left: 2px;
  }

  .more-icon {
    margin-top: 8px;
    margin-left: 15px;
  }
}

.del-status {
  color: var(--el-color-info);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  bottom: 1px;
}



.right-dropdown-item {
  display: flex;
  gap: 10px;
}

:deep(.el-dropdown-menu__item:last-child) {
  padding-bottom: 10px;
}

:deep(.el-dropdown-menu__item:first-child) {
  padding-top: 10px;
}

:deep(.el-dropdown-menu__item) {
  padding-right: 14px;
  padding-left: 14px;
}

.unread {
  height: 6px;
  width: 6px;
  background: var(--el-color-primary);
  margin-bottom: 2px;
  margin-right: 5px;
  border-radius: 50%;
  display: inline-block;
  justify-content: center;
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

</style>
