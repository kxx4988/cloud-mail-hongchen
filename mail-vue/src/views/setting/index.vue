<template>
  <div class="settings-page">
    <el-scrollbar height="100%">
  <div class="box">
    <div class="container">
      <div class="title">{{$t('profile')}}</div>
      <div class="item setting-row">
        <div>{{$t('username')}}</div>
        <div>
          <span v-if="setNameShow" class="edit-name-input">
            <el-input v-model="accountName"  ></el-input>
            <span class="edit-name" @click="setName">
             {{$t('save')}}
            </span>
          </span>
          <span v-else class="user-name">
            <span >{{ userStore.user.name }}</span>
            <span class="edit-name" @click="showSetName">
             {{$t('change')}}
            </span>
          </span>
        </div>
      </div>
      <div class="item setting-row">
        <div>{{$t('emailAccount')}}</div>
        <div>{{ userStore.user.email }}</div>
      </div>
      <div class="item setting-row">
        <div>{{$t('password')}}</div>
        <div>
          <el-button type="primary" @click="pwdShow = true">{{$t('changePwdBtn')}}</el-button>
        </div>
      </div>
    </div>
    <div class="language">
      <div class="title">{{$t('language')}}</div>
      <div class="language-row setting-row">
        <div>{{$t('preferredLanguage')}}</div>
        <el-select
            :model-value="langSelect"
            class="language-select"
            placeholder="Select"
            @change="changeLang"
        >
          <el-option label="中文" value="zh" @pointerdown.prevent.stop="changeLang('zh')"/>
          <el-option label="English" value="en" @pointerdown.prevent.stop="changeLang('en')"/>
        </el-select>
      </div>
    </div>
    <div class="preference-item">
      <div class="title" id="theme-label">{{$t('themeStyle')}}</div>
      <ThemeSelector/>
    </div>
    <div class="preference-item">
      <div class="title">{{$t('spamRuleTitle')}}</div>
      <div class="spam-rule-desc">{{$t('spamRuleDesc')}}</div>
      <!-- [S35] 同通知区块：加载失败显示原因 + 重试 -->
      <div v-if="spamLoadError" class="notify-load-error">
        <span>{{ spamLoadError }}</span>
        <el-button link type="primary" @click="retrySpamLoad">{{$t('retryLoad')}}</el-button>
      </div>
      <div class="spam-rule-add">
        <el-input v-model="spamRuleInput" class="spam-rule-input" clearable
                  :placeholder="$t('spamRulePlaceholder')" @keyup.enter="addSpamRule"/>
        <el-button type="primary" :loading="spamRuleAdding" @click="addSpamRule">{{$t('spamRuleAdd')}}</el-button>
      </div>
      <div class="spam-rule-hint">{{$t('spamRuleFormatHint')}}</div>
      <div v-if="spamRuleList.length" class="spam-rule-filter">
        <el-input v-model="spamRuleKeyword" class="spam-rule-filter-input" clearable
                  :placeholder="$t('spamRuleFilterPlaceholder')"/>
        <span class="spam-rule-count">
          {{ spamRuleKeyword.trim()
            ? $t('spamRuleCountFiltered', {m: filteredSpamRuleList.length, n: spamRuleList.length})
            : $t('spamRuleCount', {n: spamRuleList.length}) }}
        </span>
      </div>
      <div v-if="filteredSpamRuleList.length" class="spam-rule-list">
        <div v-for="item in filteredSpamRuleList" :key="item.ruleId" class="spam-rule-row">
          <div class="spam-rule-main">
            <span class="spam-rule-text">{{ item.ruleValue }}</span>
            <span class="spam-rule-tag">{{ item.ruleType === 1 ? $t('spamRuleTypeDomain') : $t('spamRuleTypeEmail') }}</span>
            <span v-if="item.hitCount > 0" class="spam-rule-hit">{{ $t('spamRuleHit', {n: item.hitCount}) }}</span>
          </div>
          <el-button link type="danger" @click="removeSpamRule(item)">{{$t('delete')}}</el-button>
        </div>
      </div>
      <div v-else-if="spamRuleList.length" class="spam-rule-empty">{{$t('spamRuleFilterEmptyTip')}}</div>
      <div v-else class="spam-rule-empty">{{$t('spamRuleEmptyTip')}}</div>
    </div>
    <!-- [S23] 自研：通知设置（用自己的 Telegram 机器人收自己账号的新邮件） -->
    <div class="preference-item">
      <div class="title">{{$t('notifyBindTitle')}}</div>
      <div class="notify-desc">{{$t('notifyBindDesc')}}</div>
      <div class="notify-guide">
        <span>{{$t('notifyFollowStep')}}</span>
        <a v-if="siteBotUsername" class="notify-guide-link"
           :href="`https://t.me/${siteBotUsername}`" target="_blank" rel="noopener noreferrer">@{{ siteBotUsername }}</a>
        <span v-if="siteBotUsername" class="notify-guide-tip">{{$t('notifyFollowTip')}}</span>
        <span v-else class="notify-guide-missing">{{$t('notifySiteBotMissing')}}</span>
      </div>
      <!-- [S35] 列表加载失败不再静默吞掉：显示原因 + 重试，避免偶发失败只能靠刷新 -->
      <div v-if="notifyLoadError" class="notify-load-error">
        <span>{{ notifyLoadError }}</span>
        <el-button link type="primary" @click="retryNotifyLoad">{{$t('retryLoad')}}</el-button>
      </div>
      <!-- [S29] 管理员设了上限才提示；达到上限直接禁用输入与按钮 -->
      <div v-if="notifyLimit > 0" class="notify-hint">
        <template v-if="notifyLimitReached">{{ $t('notifyLimitReached', { n: notifyLimit }) }}</template>
        <template v-else>{{ $t('notifyLimitHint', { n: notifyLimit, c: notifyBinds.length }) }}</template>
      </div>
      <div class="notify-add">
        <el-input v-model="notifyToken" class="notify-input" clearable :disabled="notifyLimitReached"
                  :placeholder="$t('notifyTokenPlaceholder')"/>
        <el-input v-model="notifyChatId" class="notify-input" clearable :disabled="notifyLimitReached"
                  :placeholder="$t('notifyChatIdPlaceholder')" @keyup.enter="saveNotify"/>
        <el-button class="notify-submit" type="primary" :loading="notifySaving" :disabled="notifyLimitReached"
                   @click="saveNotify">{{$t('notifyBindBtn')}}</el-button>
      </div>
      <div v-if="notifyError" class="notify-error">{{ notifyError }}</div>
      <div v-if="notifyBinds.length" class="notify-list">
        <div v-for="item in notifyBinds" :key="item.bindId" class="notify-row">
          <div class="notify-body">
            <div class="notify-main">
              <span class="notify-text">{{ item.botUsername ? '@' + item.botUsername : $t('notifyChannelTelegram') }}</span>
              <span class="notify-tag">{{ item.target }}</span>
              <!-- [S28] 停用与失效只说一个：有失效原因就直接说「已失效」，避免「已停用 已失效」两个标签重复 -->
              <span class="notify-tag"
                    :class="{ 'notify-tag-off': !item.enabled, 'notify-tag-err': !item.enabled && item.lastError }">
                {{ item.enabled ? $t('notifyEnabled') : (item.lastError ? $t('notifyInvalidTag') : $t('notifyDisabled')) }}
              </span>
            </div>
            <div v-if="item.lastError" class="notify-fail">{{ $t('notifyFailPrefix') }}{{ item.lastError }}</div>
          </div>
          <div class="notify-actions">
            <el-switch :model-value="!!item.enabled" size="small" @change="(v) => toggleNotify(item, v)"/>
            <el-button link type="primary" @click="openEditNotify(item)">{{$t('notifyEdit')}}</el-button>
            <el-button link type="danger" @click="removeNotify(item)">{{$t('delete')}}</el-button>
          </div>
        </div>
      </div>
      <div v-else class="notify-empty">{{$t('notifyEmptyTip')}}</div>

      <!-- [S27] 编辑绑定：token 留空 = 不修改 token（接口永不返回明文，无法回填） -->
      <el-dialog v-model="notifyEditVisible" :title="$t('notifyEditTitle')" width="420px" append-to-body>
        <div class="notify-edit-row">
          <span class="notify-edit-label">{{ $t('notifyEditBot') }}</span>
          <span class="notify-edit-value">@{{ notifyEditItem?.botUsername }}</span>
        </div>
        <div class="notify-add notify-edit-add">
          <el-input v-model="notifyEditToken" class="notify-input" clearable
                    :placeholder="$t('notifyEditTokenPlaceholder')"/>
          <el-input v-model="notifyEditChatId" class="notify-input"
                    :placeholder="$t('notifyChatIdPlaceholder')" @keyup.enter="submitEditNotify"/>
        </div>
        <div v-if="notifyEditError" class="notify-error">{{ notifyEditError }}</div>
        <template #footer>
          <el-button @click="notifyEditVisible = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" :loading="notifyEditSaving" @click="submitEditNotify">{{ $t('save') }}</el-button>
        </template>
      </el-dialog>
    </div>
    <!-- [S32] 自研：Bot 查询命令（安装后可在自己的 Telegram bot 菜单里发命令查邮件） -->
    <div class="preference-item">
      <div class="title">{{$t('botCmdTitle')}}</div>
      <div class="botcmd-desc">{{$t('botCmdDesc')}}</div>
      <div v-if="!notifyBinds.length" class="botcmd-empty">{{$t('botCmdNoBind')}}</div>
      <div v-for="item in notifyBinds" :key="'cmd-' + item.bindId" class="botcmd-card">
        <div class="botcmd-head">
          <div class="botcmd-title">
            <span class="botcmd-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="currentColor" d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </span>
            <span class="botcmd-name">{{$t('botCmdName')}}</span>
            <span class="botcmd-tag" :class="{'botcmd-tag-on': item.cmdInstalled}">
              {{ item.cmdInstalled ? $t('botCmdInstalled') : $t('botCmdNotInstalled') }}
            </span>
          </div>
          <div class="botcmd-actions">
            <el-button type="primary" size="small" :loading="cmdBusyId === item.bindId"
                       @click="installCmd(item)">
              {{ item.cmdInstalled ? $t('botCmdReinstall') : $t('botCmdInstall') }}
            </el-button>
            <el-button link type="danger" size="small"
                       :disabled="!item.cmdInstalled || cmdBusyId === item.bindId"
                       @click="uninstallCmd(item)">
              {{$t('botCmdRemove')}}
            </el-button>
          </div>
        </div>
        <div class="botcmd-meta">
          <div class="botcmd-row">
            <span class="botcmd-label">{{$t('botCmdChat')}}</span>
            <span class="botcmd-value">{{ item.target }}</span>
          </div>
          <div class="botcmd-row">
            <span class="botcmd-label">{{$t('botCmdInstallTime')}}</span>
            <span class="botcmd-value">{{ item.cmdInstallTime ? shortTime(item.cmdInstallTime) : $t('botCmdNever') }}</span>
          </div>
          <div class="botcmd-row">
            <span class="botcmd-label">{{$t('botCmdLastUsed')}}</span>
            <span class="botcmd-value">{{ item.cmdLastUsed ? shortTime(item.cmdLastUsed) : $t('botCmdNever') }}</span>
          </div>
        </div>
        <!-- [S34] 停用只管推送，已装的命令仍可用，避免用户以为整个 bot 停了 -->
        <div v-if="!item.enabled" class="botcmd-tip">{{$t('botCmdDisabledTip')}}</div>
      </div>
    </div>
    <!-- [S37] 自研：第三方客户端（IMAP）应用密码 -->
    <div class="preference-item">
      <!-- [S37] 标题后跟一行括号小字，窄屏自动换行 -->
      <!-- [S51] 网关地址可信度三档：已配置 > 推断但连过 > 纯推断 -->
      <div class="title">
        {{$t('imapPwTitle')}}
        <span v-if="imapGwConfigured" class="imap-gw-hint is-on">{{ $t('imapPwGwBadgeConfigured', { h: imapGatewayHost }) }}</span>
        <span v-else-if="imapGwLastUsed" class="imap-gw-hint">{{ $t('imapPwGwBadgeConnected', { t: shortTime(imapGwLastUsed) }) }}</span>
        <span v-else class="imap-gw-hint">{{ $t('imapPwGwHintInferred') }}</span>
      </div>
      <div class="botcmd-desc">{{$t('imapPwDesc')}}</div>
      <!-- [S50] 服务器地址直接摊在卡片上：不用点「使用说明」也知道客户端该填什么 -->
      <div class="imap-server-line">{{ $t(imapGwNeedInferTag ? 'imapPwServerLineInferred' : 'imapPwServerLine', { h: imapGatewayHost }) }}</div>
      <div class="imap-head">
        <span class="imap-status" :class="{'imap-status-on': imapPwList.length}">
          {{ imapPwList.length ? $t('imapPwCount', {n: imapPwList.length}) : $t('imapPwNone') }}
        </span>
        <!-- [S37] 用独立的 .imap-actions：.botcmd-actions 是 TG bot 卡片的竖排容器，复用会挤成一列 -->
        <div class="imap-actions">
          <el-button size="small" @click="openImapPanel('help')">{{$t('imapPwHelpBtn')}}</el-button>
          <el-button type="primary" size="small" :disabled="imapCreateDisabled" @click="openImapPanel('create')">
            {{$t('imapPwCreateBtn')}}
          </el-button>
          <el-button v-if="imapPwList.length" size="small" @click="openImapPanel('manage')">{{$t('imapPwManageBtn')}}</el-button>
        </div>
      </div>
      <div v-if="imapCreateDisabled" class="botcmd-tip">{{$t('imapPwLimitTip')}}</div>
    </div>
    <!-- [S46] 网关部署卡片 2026-11-19 已搬到「系统设置」（普通用户不需要看到），此处不再有入口 -->
    <div class="preference-item">
      <div class="title">{{$t('noticeTitle')}}</div>
      <div class="language-row setting-row">
        <div>{{$t('noticeInfo')}}</div>
        <div>
          <el-button @click="uiStore.showNotice()">{{$t('viewNotice')}}</el-button>
        </div>
      </div>
    </div>
    <div class="del-email" v-perm="'my:delete'">
      <div class="title">{{$t('deleteUser')}}</div>
      <div style="color: var(--regular-text-color);">
        {{$t('delAccountMsg')}}
      </div>
      <div>
        <el-button type="primary" @click="deleteConfirm">{{$t('deleteUserBtn')}}</el-button>
      </div>
    </div>
    <!-- [S37] IMAP 应用密码：使用说明 / 生成 / 一次性密码 / 管理 -->
    <!-- [S37] IMAP 弹窗：说明 / 生成 / 一次性密码 / 管理统一到同一个 dialog。
         原先 4 个独立 el-dialog 只有最后一个能正常渲染，且模板里 imapAccounts 变量名写错会让生成弹窗直接渲染报错。 -->
    <!-- [S46] 弹窗标题不再用嵌套三元，改走 computed（install 面板已随卡片搬去系统设置） -->
    <el-dialog v-model="imapManageVisible" class="imap-dialog"
               :title="imapDialogTitle"
               width="min(620px, 94vw)" append-to-body>
      <!-- 使用说明 -->
      <div v-if="imapPanel === 'help'" class="imap-help">
        <div class="imap-help-lead">{{$t('imapHelpLead')}}</div>
        <div class="imap-help-box">
          <div class="imap-help-row">
            <span class="imap-help-key">{{$t('imapHelpImap')}}</span>
            <span class="imap-help-val">{{ imapGatewayHost }}<span v-if="!imapGwConfigured" class="imap-help-infer">{{ $t('imapPwInferredTag') }}</span></span>
          </div>
          <div class="imap-help-row">
            <span class="imap-help-key">{{$t('imapHelpPortRecv')}}</span>
            <span class="imap-help-val">993</span>
          </div>
          <div class="imap-help-row">
            <span class="imap-help-key">{{$t('imapHelpSmtp')}}</span>
            <span class="imap-help-val">{{ imapGatewayHost }}<span v-if="!imapGwConfigured" class="imap-help-infer">{{ $t('imapPwInferredTag') }}</span></span>
          </div>
          <div class="imap-help-row">
            <span class="imap-help-key">{{$t('imapHelpPortSend')}}</span>
            <span class="imap-help-val">2465</span>
          </div>
          <div class="imap-help-row">
            <span class="imap-help-key">{{$t('imapHelpEncrypt')}}</span>
            <span class="imap-help-val">{{$t('imapHelpEncryptVal')}}</span>
          </div>
          <div class="imap-help-row">
            <span class="imap-help-key">{{$t('imapHelpUser')}}</span>
            <span class="imap-help-val">{{ $t('imapHelpUserVal', { d: imapMailDomain }) }}</span>
          </div>
          <div class="imap-help-row">
            <span class="imap-help-key">{{$t('imapHelpPwd')}}</span>
            <span class="imap-help-val">{{ $t('imapHelpPwdVal') }}</span>
          </div>
        </div>
        <div class="imap-help-tips">
          <div class="imap-help-tip">{{$t('imapHelpTip1')}}</div>
          <div class="imap-help-tip">{{$t('imapHelpTip2')}}</div>
          <div class="imap-help-tip">{{$t('imapHelpTip3')}}</div>
        </div>
        <div v-if="!imapGwConfigured" class="imap-help-infer-tip">{{ $t('imapPwHelpInferTip') }}</div>
      </div>
      <!-- 生成应用密码 -->
      <div v-else-if="imapPanel === 'create'" class="imap-create">
        <div v-if="imapAccountsList.length > 1" class="imap-form-row">
          <span class="imap-form-label">{{$t('imapPwAccount')}}</span>
          <el-select v-model="imapCreateAccountId" style="width: 100%">
            <el-option v-for="a in imapAccountsList" :key="a.accountId" :value="a.accountId"
                       :label="a.email"/>
          </el-select>
        </div>
        <div class="imap-form-row">
          <span class="imap-form-label">{{$t('imapPwNameLabel')}}</span>
          <el-input v-model="imapCreateName" maxlength="50" :placeholder="$t('imapPwNamePlaceholder')"/>
        </div>
        <div class="imap-bind-hint">{{ $t('imapPwBindHint', { e: imapCreateAccountEmail }) }}</div>
      </div>
      <!-- 一次性密码 -->
      <div v-else-if="imapPanel === 'plain'" class="imap-plain">
        <div class="imap-plain-pwd">{{ imapPlainPwd }}</div>
        <div class="imap-plain-actions">
          <el-button type="primary" size="small" @click="copyImapPlain">{{ imapCopied ? $t('imapCopied') : $t('imapCopy') }}</el-button>
        </div>
        <div class="imap-plain-warn">{{$t('imapPwOnceWarn')}}</div>
      </div>
      <!-- 管理列表 -->
      <template v-else>
        <div v-if="!imapPwList.length" class="botcmd-empty">{{$t('imapPwNone')}}</div>
        <div v-for="item in imapPwList" :key="item.imapPasswordId" class="imap-manage-row">
          <div class="imap-manage-main">
            <div class="imap-manage-title">
              <template v-if="imapRenamingId === item.imapPasswordId">
                <!-- [S37] 行内改名：失焦/回车保存，Esc 或「取消」退出；取消按钮 mousedown.prevent
                     防止 input 先失焦触发保存（否则点取消会变成保存） -->
                <el-input class="imap-rename-input" v-model="imapRenameValue" size="small" maxlength="50"
                          :placeholder="$t('imapPwNamePlaceholder')"
                          @blur="submitImapRename(item)"
                          @keyup.enter="submitImapRename(item)"
                          @keyup.esc="cancelImapRename"/>
                <el-button link type="primary" size="small" @mousedown.prevent
                           @click="submitImapRename(item)">{{$t('confirm')}}</el-button>
                <el-button link size="small" @mousedown.prevent
                           @click="cancelImapRename">{{$t('cancel')}}</el-button>
              </template>
              <template v-else>
                <span class="imap-manage-name" :title="(item.name || item.accountEmail) + '（' + $t('imapPwRenameTip') + '）'"
                      @click="startImapRename(item)">{{ item.name || item.accountEmail }}</span>
                <span class="imap-rename-btn" :title="$t('imapPwRenameTip')" @click="startImapRename(item)">
                  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                    <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </span>
                <!-- [S37] 绑定邮箱常显，方便管理（list 接口已返回 accountEmail） -->
                <span class="imap-manage-email">{{ item.accountEmail }}</span>
                <span v-if="item.status === 1" class="imap-manage-tag-off">{{$t('imapPwDisabledTag')}}</span>
              </template>
            </div>
            <div class="imap-manage-meta">
              {{ $t('imapPwMeta', { c: shortTime(item.createTime), r: item.resetTime ? shortTime(item.resetTime) : '—', u: item.lastUsed ? shortTime(item.lastUsed) : $t('imapPwNeverUsed') }) }}
            </div>
          </div>
          <div class="imap-manage-actions">
            <el-button link type="primary" size="small" :disabled="imapBusyId === item.imapPasswordId"
                       @click="resetImapPw(item)">{{$t('imapPwReset')}}</el-button>
            <el-button v-if="item.status === 0" link type="warning" size="small"
                       :disabled="imapBusyId === item.imapPasswordId"
                       @click="disableImapPw(item)">{{$t('imapPwDisable')}}</el-button>
            <el-button v-else link type="success" size="small"
                       :disabled="imapBusyId === item.imapPasswordId"
                       @click="enableImapPw(item)">{{$t('imapPwEnable')}}</el-button>
            <el-button link type="danger" size="small" :disabled="imapBusyId === item.imapPasswordId"
                       @click="deleteImapPw(item)">{{$t('imapPwDelete')}}</el-button>
          </div>
        </div>
      </template>
      <template #footer>
        <el-button v-if="imapPanel === 'help'" type="primary" @click="imapManageVisible = false">{{ $t('confirm') }}</el-button>
        <template v-else-if="imapPanel === 'create'">
          <el-button @click="imapManageVisible = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" :loading="imapCreating" @click="submitImapCreate">{{ $t('confirm') }}</el-button>
        </template>
        <el-button v-else-if="imapPanel === 'plain'" type="primary" @click="imapManageVisible = false">{{ $t('imapSaved') }}</el-button>
        <el-button v-else @click="imapManageVisible = false">{{ $t('confirm') }}</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="pwdShow" :title="$t('changePassword')" width="340">
      <div class="update-pwd">
        <el-input type="password" :placeholder="$t('newPassword')" v-model="form.password" autocomplete="off" @keyup.enter="submitPwd"/>
        <el-input type="password" :placeholder="$t('confirmPassword')" v-model="form.newPwd" autocomplete="off" @keyup.enter="submitPwd"/>
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd">{{$t('save')}}</el-button>
      </div>
    </el-dialog>
  </div>
    </el-scrollbar>
  </div>
</template>
<script setup>
import {reactive, ref, computed, defineOptions, onMounted, nextTick} from 'vue'
import {ElMessage} from "element-plus";
import {resetPassword, userDelete} from "@/request/my.js";
import {spamRuleList as fetchSpamRules, spamRuleAdd, spamRuleDelete} from "@/request/spam.js";
import {notifyList as fetchNotifyBinds, notifySiteBot, notifySave, notifyDelete, notifyToggle, notifyUpdate, notifyCmdInstall, notifyCmdUninstall} from "@/request/notify.js";
import {imapAccounts as imapAccountsFn, imapPwList as imapPwListFn, imapPwCreate as imapPwCreateFn, imapPwReset as imapPwResetFn, imapPwSetStatus as imapPwSetStatusFn, imapPwRename as imapPwRenameFn, imapPwDelete as imapPwDeleteFn} from "@/request/imap.js"; // [S37]
import {useUserStore} from "@/store/user.js";
import router from "@/router/index.js";
import {accountSetName} from "@/request/account.js";
import {useAccountStore} from "@/store/account.js";
import {useI18n} from "vue-i18n";
import {useSettingStore} from "@/store/setting.js";
import {useUiStore} from "@/store/ui.js";
import ThemeSelector from "@/components/theme-selector/index.vue";

const { t } = useI18n()

// 自研定制：垃圾邮件发件人黑名单管理
const spamRuleList = ref([])
const spamRuleInput = ref('')
const spamRuleKeyword = ref('')
const spamRuleAdding = ref(false)

// 即时筛选：纯前端过滤，不发请求
const filteredSpamRuleList = computed(() => {
  const kw = spamRuleKeyword.value.trim().toLowerCase()
  if (!kw) {
    return spamRuleList.value
  }
  return spamRuleList.value.filter(item => String(item.ruleValue || '').toLowerCase().includes(kw))
})

function loadSpamRules() {
  fetchSpamRules().then((data) => {
    spamRuleList.value = data || []
    spamLoadError.value = ''
  }).catch((e) => {
    console.error(e)
    spamLoadError.value = e?.message || t('settingLoadFailed')
  })
}

function addSpamRule() {
  const value = spamRuleInput.value.trim()
  if (!value) {
    return
  }
  spamRuleAdding.value = true
  spamRuleAdd(value).then(() => {
    ElMessage({
      message: t('spamRuleAddedMsg'),
      type: 'success',
      plain: true
    })
    spamRuleInput.value = ''
    loadSpamRules()
  }).catch((e) => {
    console.error(e)
  }).finally(() => {
    spamRuleAdding.value = false
  })
}

function removeSpamRule(item) {
  spamRuleDelete(item.ruleId).then(() => {
    ElMessage({
      message: t('spamRuleRemovedMsg'),
      type: 'success',
      plain: true
    })
    loadSpamRules()
  }).catch((e) => {
    console.error(e)
  })
}

// [S23] 自研：通知设置（用户用自己的 Telegram 机器人收自己账号的新邮件）
const notifyBinds = ref([])
const notifyToken = ref('')
const notifyChatId = ref('')
const notifySaving = ref(false)
const notifyError = ref('')
const siteBotUsername = ref('')
// [S29] 每个用户可绑数量上限（0 = 不限制），由系统设置决定
const notifyLimit = ref(0)
const notifyLimitReached = computed(() => notifyLimit.value > 0 && notifyBinds.value.length >= notifyLimit.value)

// [S35] 加载失败不再静默（原 catch 只 console.error，偶发失败时页面空态、用户只能刷新碰运气）
const notifyLoadError = ref('')
const spamLoadError = ref('')

function loadNotifyBinds() {
  fetchNotifyBinds().then((data) => {
    notifyBinds.value = data || []
    notifyLoadError.value = ''
  }).catch((e) => {
    console.error(e)
    notifyLoadError.value = e?.message || t('settingLoadFailed')
  })
}

// 关注指引需要的站点机器人 @用户名；管理员没配置时为空，页面显示提示而不是坏链接
function loadSiteBot() {
  notifySiteBot().then((data) => {
    siteBotUsername.value = data?.username || ''
    notifyLimit.value = Number(data?.limit || 0)
  }).catch((e) => {
    console.error(e)
  })
}

// [S35] 失败后手动重试
function retryNotifyLoad() {
  notifyLoadError.value = ''
  loadNotifyBinds()
  loadSiteBot()
}

function retrySpamLoad() {
  spamLoadError.value = ''
  loadSpamRules()
}

function saveNotify() {
  const token = notifyToken.value.trim()
  const chatId = notifyChatId.value.trim()
  notifyError.value = ''
  if (!token) {
    notifyError.value = t('notifyTokenRequired')
    return
  }
  if (!chatId) {
    notifyError.value = t('notifyChatIdRequired')
    return
  }
  notifySaving.value = true
  notifySave(token, chatId).then(() => {
    ElMessage({
      message: t('notifyBoundMsg'),
      type: 'success',
      plain: true
    })
    notifyToken.value = ''
    notifyChatId.value = ''
    loadNotifyBinds()
  }).catch((e) => {
    // 拦截器已弹出具体原因，这里同时留在块内，方便对照「该先做哪一步」
    notifyError.value = e?.message || ''
  }).finally(() => {
    notifySaving.value = false
  })
}

function removeNotify(item) {
  // 删除后要重走「关注站点 bot + 填 token + 填 chat」，成本不低，必须二次确认
  ElMessageBox.confirm(t('notifyRemoveConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    notifyDelete(item.bindId).then(() => {
      ElMessage({
        message: t('notifyRemovedMsg'),
        type: 'success',
        plain: true
      })
      loadNotifyBinds()
    }).catch((e) => {
      console.error(e)
    })
  }).catch(() => {
    // 取消：什么都不做
  })
}

function toggleNotify(item, value) {
  const enabled = value ? 1 : 0
  notifyToggle(item.bindId, enabled).then(() => {
    item.enabled = enabled
  }).catch((e) => {
    console.error(e)
  })
}

// [S27] 编辑绑定：token 输入框故意留空，留空就是「不修改 token」
const notifyEditVisible = ref(false)
const notifyEditItem = ref(null)
const notifyEditToken = ref('')
const notifyEditChatId = ref('')
const notifyEditSaving = ref(false)
const notifyEditError = ref('')

function openEditNotify(item) {
  notifyEditItem.value = item
  notifyEditToken.value = ''
  notifyEditChatId.value = item?.target || ''
  notifyEditError.value = ''
  notifyEditVisible.value = true
}

function submitEditNotify() {
  const item = notifyEditItem.value
  if (!item) return
  const chatId = notifyEditChatId.value.trim()
  notifyEditError.value = ''
  if (!chatId) {
    notifyEditError.value = t('notifyChatIdRequired')
    return
  }
  notifyEditSaving.value = true
  notifyUpdate(item.bindId, notifyEditToken.value.trim(), chatId).then(() => {
    ElMessage({
      message: t('notifyUpdatedMsg'),
      type: 'success',
      plain: true
    })
    notifyEditVisible.value = false
    loadNotifyBinds()
  }).catch((e) => {
    notifyEditError.value = e?.message || ''
  }).finally(() => {
    notifyEditSaving.value = false
  })
}

// [S32] 自研：Bot 查询命令（安装 / 重新安装 / 删除）
const cmdBusyId = ref(0)

function installCmd(item) {
  // 安装会接管这个 bot 的消息推送（一个 bot 只能有一个 webhook），必须先讲清楚再动手
  ElMessageBox.confirm(t('botCmdInstallConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => doInstall(item, false)).catch(() => {
    // 取消：什么都不做
  })
}

function doInstall(item, force) {
  cmdBusyId.value = item.bindId
  notifyCmdInstall(item.bindId, force).then(() => {
    ElMessage({
      message: t('botCmdInstalledMsg'),
      type: 'success',
      plain: true
    })
    loadNotifyBinds()
  }).catch((e) => {
    // 409：这个 bot 已经在别处设置了 webhook。用户确认覆盖后才带 force 重试
    if (e?.code === 409) {
      ElMessageBox.confirm(`${e.message} ${t('botCmdWebhookConflict')}`, {
        confirmButtonText: t('confirm'),
        cancelButtonText: t('cancel'),
        type: 'warning'
      }).then(() => doInstall(item, true)).catch(() => {
        // 取消：什么都不做
      })
    }
  }).finally(() => {
    cmdBusyId.value = 0
  })
}

function uninstallCmd(item) {
  ElMessageBox.confirm(t('botCmdRemoveConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    cmdBusyId.value = item.bindId
    notifyCmdUninstall(item.bindId).then(() => {
      ElMessage({
        message: t('botCmdRemovedMsg'),
        type: 'success',
        plain: true
      })
      loadNotifyBinds()
    }).catch((e) => {
      console.error(e)
    }).finally(() => {
      cmdBusyId.value = 0
    })
  }).catch(() => {
    // 取消：什么都不做
  })
}

// [S37] 自研：第三方客户端（IMAP）应用密码
const imapPwList = ref([])
const imapAccountsList = ref([])
const imapPwLimit = 5
const imapCreateDisabled = computed(() => {
  // 每账号生效中（含停用）密码上限 5 个，任一账号达到即禁用创建按钮
  const cnt = {}
  for (const item of imapPwList.value) {
    cnt[item.accountId] = (cnt[item.accountId] || 0) + 1
  }
  const accounts = imapAccountsList.value.length ? imapAccountsList.value : (userStore.user?.account ? [userStore.user.account] : [])
  return accounts.some(a => (cnt[a.accountId] || 0) >= imapPwLimit)
})
// [S37] 弹窗合并：一个 dialog 承载 4 种面板，只用 imapManageVisible 控制显隐
const imapPanel = ref('manage')
const imapManageVisible = ref(false)
const imapCreateAccountId = ref(0)
const imapCreateName = ref('')
const imapCreating = ref(false)
const imapPlainPwd = ref('')
const imapCopied = ref(false)
const imapBusyId = ref(0)

const imapCreateAccountEmail = computed(() => {
  const acc = imapAccountsList.value.find(a => a.accountId === imapCreateAccountId.value)
  return acc ? acc.email : ''
})

function loadImapPw() {
  imapPwListFn().then((data) => {
    imapPwList.value = data || []
  }).catch((e) => {
    console.error(e)
  })
  imapAccountsFn().then((data) => {
    imapAccountsList.value = data || []
    if (!imapCreateAccountId.value && imapAccountsList.value.length) {
      imapCreateAccountId.value = imapAccountsList.value[0].accountId
    }
  }).catch((e) => {
    console.error(e)
  })
}

function openImapPanel(panel) {
  if (panel === 'create') {
    if (!imapCreateAccountId.value && imapAccountsList.value.length) {
      imapCreateAccountId.value = imapAccountsList.value[0].accountId
    }
    imapCreateName.value = ''
  }
  imapPanel.value = panel
  imapManageVisible.value = true
  // 与「管理」入口保持同构：顺带刷新一次数据，避免滚动容器内首帧不重渲染
  loadImapPw()
}

function submitImapCreate() {
  if (!imapCreateAccountId.value) {
    return
  }
  imapCreating.value = true
  imapPwCreateFn(imapCreateAccountId.value, imapCreateName.value.trim()).then((data) => {
    imapPlainPwd.value = data?.plain || ''
    imapCopied.value = false
    imapPanel.value = 'plain'
    loadImapPw()
  }).catch((e) => {
    console.error(e)
  }).finally(() => {
    imapCreating.value = false
  })
}

function copyImapPlain() {
  const text = imapPlainPwd.value
  const done = () => {
    imapCopied.value = true
    setTimeout(() => { imapCopied.value = false }, 2000)
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => {
      fallbackCopy(text)
      done()
    })
  } else {
    fallbackCopy(text)
    done()
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    document.execCommand('copy')
  } catch (e) {
    // 忽略
  }
  document.body.removeChild(ta)
}

// [S46] 网关部署（生成安装命令）2026-11-19 已搬到「系统设置」，仅管理员可见。
// [S50] 「使用说明」里的服务器域名改为读服务端配置（setting.imap_gateway_domain，
//   由 websiteConfig 下发），不再读 localStorage/写死推导值——这样普通用户、换设备看到的都一致；
//   管理员没配过时才回退 imap.<邮箱域名>。

const imapAccountDomain = computed(() => {
  // 只用 imapAccountsList：userStore 在本文件里声明得比这里晚，computed 会被 watch 立即求值，
  // 引 userStore 会踩 TDZ（Cannot access before initialization），整页渲染直接挂掉。
  const list = imapAccountsList.value
  const mail = (list[0] && (list[0].email || list[0].accountEmail)) || ''
  const at = mail.indexOf('@')
  return at >= 0 ? mail.slice(at + 1) : ''
})

const imapGwDefaultDomain = computed(() => imapAccountDomain.value ? 'imap.' + imapAccountDomain.value : '')
const imapGatewayHost = computed(() => String(settingStore.settings?.imapGatewayDomain || '').trim() || imapGwDefaultDomain.value)
// 邮箱域名（用户名示例用）：优先取首个邮箱账号的域名，取不到则去掉网关域名头段
const imapMailDomain = computed(() => {
  if (imapAccountDomain.value) {
    return imapAccountDomain.value
  }
  const host = imapGatewayHost.value
  const i = host.indexOf('.')
  return i >= 0 ? host.slice(i + 1) : host
})

// [S51] 网关地址可信度三档：管理员已在系统设置保存（最可靠）→ 没保存但客户端连过（证明可用）→ 纯推断
const imapGwConfigured = computed(() => !!String(settingStore.settings?.imapGatewayDomain || '').trim())
const imapGwLastUsed = computed(() => {
  // 取所有应用密码里最近的一次成功登录（UTC 裸串，直接字符串比较即可）
  let latest = ''
  for (const item of imapPwList.value) {
    if (item.lastUsed && String(item.lastUsed) > latest) {
      latest = String(item.lastUsed)
    }
  }
  return latest
})
const imapGwNeedInferTag = computed(() => !imapGwConfigured.value && !imapGwLastUsed.value)

const imapDialogTitle = computed(() => {
  const keys = {help: 'imapPwHelpBtn', create: 'imapPwCreateBtn', plain: 'imapPwCreatedTitle', manage: 'imapPwManageBtn'}
  return t(keys[imapPanel.value] || 'imapPwManageBtn')
})

function shortTime(v) {
  if (!v) {
    return ''
  }
  // [S47] 后端 now() = dayjs().format('YYYY-MM-DD HH:mm:ss')，Worker 运行在 UTC → 裸字符串按 UTC 解析再转浏览器本地时区；
  // 原先直接 slice(5,16) 把 UTC 当本地显示，比 UTC+8 少 8 小时。
  const s = String(v)
  const d = new Date(s.replace(' ', 'T') + (s.length <= 19 ? 'Z' : ''))
  if (Number.isNaN(d.getTime())) {
    return s.slice(5, 16)
  }
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// [S37] 行内改名：同一时间只允许一行进入编辑态
const imapRenamingId = ref(0)
const imapRenameValue = ref('')
const imapRenameBusy = ref(false)

function startImapRename(item) {
  if (imapRenameBusy.value || imapRenamingId.value) {
    return
  }
  imapRenamingId.value = item.imapPasswordId
  imapRenameValue.value = item.name || ''
  nextTick(() => {
    const el = document.querySelector('.imap-rename-input input')
    if (el) {
      el.focus()
      el.select()
    }
  })
}

function cancelImapRename() {
  imapRenamingId.value = 0
  imapRenameValue.value = ''
}

function submitImapRename(item) {
  // blur 与按钮 click 都会进来：非编辑态直接跳过，防重复提交
  if (imapRenamingId.value !== item.imapPasswordId) {
    return
  }
  const name = String(imapRenameValue.value || '').trim().slice(0, 50)
  if (!name) {
    ElMessage.warning(t('imapPwNameRequired'))
    return
  }
  // 未改动不发请求，直接退出编辑态
  if (name === (item.name || '')) {
    cancelImapRename()
    return
  }
  // 先退出编辑态再发请求，避免请求期间的 blur 重复触发
  imapRenamingId.value = 0
  imapRenameBusy.value = true
  imapPwRenameFn(item.imapPasswordId, name).then(() => {
    ElMessage.success(t('imapPwRenamed'))
    loadImapPw()
  }).catch((e) => {
    console.error(e)
  }).finally(() => {
    imapRenameBusy.value = false
  })
}

function resetImapPw(item) {
  ElMessageBox.confirm(t('imapPwResetConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    imapBusyId.value = item.imapPasswordId
    imapPwResetFn(item.imapPasswordId).then((data) => {
      imapPlainPwd.value = data?.plain || ''
      imapCopied.value = false
      imapPanel.value = 'plain'
      loadImapPw()
    }).catch((e) => {
      console.error(e)
    }).finally(() => {
      imapBusyId.value = 0
    })
  }).catch(() => {
    // 取消：什么都不做
  })
}

function disableImapPw(item) {
  ElMessageBox.confirm(t('imapPwDisableConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    imapBusyId.value = item.imapPasswordId
    imapPwSetStatusFn(item.imapPasswordId, 1).then(() => {
      loadImapPw()
    }).catch((e) => {
      console.error(e)
    }).finally(() => {
      imapBusyId.value = 0
    })
  }).catch(() => {
    // 取消：什么都不做
  })
}

function enableImapPw(item) {
  imapBusyId.value = item.imapPasswordId
  imapPwSetStatusFn(item.imapPasswordId, 0).then(() => {
    loadImapPw()
  }).catch((e) => {
    console.error(e)
  }).finally(() => {
    imapBusyId.value = 0
  })
}

function deleteImapPw(item) {
  ElMessageBox.confirm(t('imapPwDeleteConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    imapBusyId.value = item.imapPasswordId
    imapPwDeleteFn(item.imapPasswordId).then(() => {
      ElMessage({
        message: t('imapPwDeletedMsg'),
        type: 'success',
        plain: true
      })
      loadImapPw()
    }).catch((e) => {
      console.error(e)
    }).finally(() => {
      imapBusyId.value = 0
    })
  }).catch(() => {
    // 取消：什么都不做
  })
}

onMounted(() => {
  loadSpamRules()
  loadNotifyBinds()
  loadSiteBot()
  loadImapPw()
})
const accountStore = useAccountStore()
const settingStore = useSettingStore()
const uiStore = useUiStore()
const userStore = useUserStore();
const setPwdLoading = ref(false)
const setNameShow = ref(false)
const accountName = ref(null)
const langSelect = ref(settingStore.lang)

defineOptions({
  name: 'setting'
})

function showSetName() {
  accountName.value = userStore.user.name
  setNameShow.value = true
}

function setName() {

  if (!accountName.value) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  setNameShow.value = false
  let name = accountName.value

  if (name === userStore.user.name) {
    return
  }

  userStore.user.name = accountName.value

  accountSetName(userStore.user.account.accountId,name).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })

    accountStore.changeUserAccountName = name

  }).catch(() => {
    userStore.user.name = name
  })
}

function changeLang(lang) {
  let setting = {}
  try {
    setting = JSON.parse(localStorage.getItem('setting') || '{}')
  } catch (e) {
    setting = {}
  }
  localStorage.setItem('setting', JSON.stringify({...setting, lang}))
  window.location.reload()
}

const pwdShow = ref(false)
const form = reactive({
  password: '',
  newPwd: '',
})

const deleteConfirm = () => {
  ElMessageBox.confirm(t('delAccountConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete().then(() => {
      localStorage.removeItem('token');
      router.replace('/login');
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    })
  })
}


function submitPwd() {

  if (setPwdLoading.value) return

  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password !== form.newPwd) {
    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  setPwdLoading.value = true
  resetPassword(form.password).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
    pwdShow.value = false
    setPwdLoading.value = false
    form.password = ''
    form.newPwd = ''
  }).catch(() => {
    setPwdLoading.value = false
  })

}

</script>
<style scoped lang="scss">
.settings-page {
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.box {
  padding: 40px 40px;

  @media (max-width: 767px) {
    padding: 30px 30px;
  }

  .update-pwd {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .title {
    font-size: 18px;
    font-weight: bold;
  }

  .container {
    font-size: 14px;
    display: grid;
    gap: 20px;
    margin-bottom: 40px;

    .item {
      position: relative;
      .user-name {
        display: grid;
        grid-template-columns: minmax(0, auto) max-content;
        justify-content: start;
        align-items: center;
        span:first-child {
          min-width: 0;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      .edit-name-input {
        position: absolute;
        bottom: -6px;
        .el-input {
          width: min(200px,calc(100vw - 222px));
        }
      }

      .edit-name {
        color: #4dabff;
        padding-left: 10px;
        white-space: nowrap;
        cursor: pointer;
      }

    }
  }

  .preference-item,
  .language {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 40px;
    align-items: flex-start;

  }

  // 自研定制：垃圾邮件规则（屏蔽发件人）区块
  .spam-rule-desc,
  .spam-rule-hint,
  .spam-rule-empty {
    font-size: 13px;
    color: var(--regular-text-color);
  }

  .spam-rule-add {
    display: flex;
    gap: 10px;
    width: 100%;
    max-width: 460px;

    .spam-rule-input {
      flex: 1;
    }
  }

  // 即时筛选：纯前端过滤，只有列表有内容时才出现
  .spam-rule-filter {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    max-width: 460px;

    .spam-rule-filter-input {
      flex: 1;
    }
  }

  .spam-rule-count {
    flex: 0 0 auto;
    font-size: 13px;
    color: var(--regular-text-color);
  }

  // 固定显示 5 行（每行 41px），第 6 条起在列表内滚动，不再撑长整个设置页
  .spam-rule-list {
    width: 100%;
    max-width: 460px;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--el-border-color-lighter);
    max-height: 205px;
    overflow-y: auto;
    overscroll-behavior: contain;

    &::-webkit-scrollbar {
      width: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background: var(--el-border-color);
      border-radius: 2px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }
  }

  .spam-rule-row {
    flex: 0 0 auto;
    height: 41px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .spam-rule-main {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .spam-rule-text {
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .spam-rule-tag {
    flex: 0 0 auto;
    font-size: 12px;
    line-height: 18px;
    padding: 0 6px;
    border-radius: 4px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light);
  }

  .spam-rule-hit {
    flex: 0 0 auto;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  // [S23] 自研：通知设置区块（沿用垃圾邮件规则的排版节奏）
  .notify-desc,
  .notify-hint,
  .notify-empty {
    font-size: 13px;
    color: var(--regular-text-color);
  }

  // 「先关注站点机器人」是绑定前的硬前置动作，做成强调条：
  // 淡色底 + 左侧主色竖条 + 加粗放大，主色与文字色都用 Element Plus 变量，暗色模式自动跟随
  .notify-guide {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    width: 100%;
    max-width: 460px;
    box-sizing: border-box;
    padding: 12px 14px;
    border-radius: 10px;
    border-left: 3px solid var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    font-size: 15px;
    font-weight: 700;
    line-height: 1.5;
    color: var(--el-text-color-primary);

    .notify-guide-link {
      font-size: 16px;
      font-weight: 800;
      color: var(--el-color-primary);
      text-decoration: none;
      word-break: break-all;

      &:hover {
        color: var(--el-color-primary-dark-2);
        text-decoration: underline;
      }
    }

    .notify-guide-tip {
      font-size: 12px;
      font-weight: 400;
      color: var(--el-text-color-secondary);
    }

    .notify-guide-missing {
      font-size: 13px;
      font-weight: 400;
      color: var(--el-color-warning);
    }
  }

  .notify-add {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    max-width: 460px;

    .notify-input {
      width: 100%;
    }

    .notify-submit {
      align-self: flex-end;
    }
  }

  .notify-error {
    font-size: 13px;
    color: var(--el-color-danger);
    word-break: break-word;
    max-width: 460px;
  }

  // [S35] 列表加载失败的提示行：错误文案 + 重试按钮
  .notify-load-error {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 13px;
    color: var(--el-color-danger);
    word-break: break-word;
    max-width: 460px;

    .el-button {
      flex: 0 0 auto;
    }
  }

  // [S27] 编辑弹窗：只显示机器人用户名（token 不回显，也不用展示 chat 之外的东西）
  .notify-edit-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    font-size: 14px;
  }

  .notify-edit-label {
    flex: 0 0 auto;
    color: var(--el-text-color-secondary);
  }

  .notify-edit-value {
    color: var(--el-text-color-primary);
    font-weight: 600;
  }

  .notify-list {
    width: 100%;
    max-width: 460px;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--el-border-color-lighter);
    max-height: 205px;
    overflow-y: auto;
    overscroll-behavior: contain;

    &::-webkit-scrollbar {
      width: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background: var(--el-border-color);
      border-radius: 2px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }
  }

  .notify-row {
    flex: 0 0 auto;
    min-height: 41px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  /* [S28] 允许「失效原因」占第二行，正常行仍是 41px */
  .notify-body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .notify-fail {
    font-size: 12px;
    line-height: 16px;
    color: var(--el-color-danger);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .notify-main {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .notify-text {
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .notify-tag {
    flex: 0 0 auto;
    font-size: 12px;
    line-height: 18px;
    padding: 0 6px;
    border-radius: 4px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light);

    &.notify-tag-off {
      color: var(--el-text-color-placeholder);
    }

    /* [S28] 「已失效」标记：用危险色，和普通灰标签区分开 */
    &.notify-tag-err {
      color: var(--el-color-danger);
      background: var(--el-color-danger-light-9);
    }
  }

  .notify-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  // [S32] 自研：Bot 查询命令卡片（与通知区块同一套变量，暗色自动跟随）
  .botcmd-desc,
  .botcmd-empty {
    font-size: 13px;
    color: var(--regular-text-color);
  }

  .botcmd-card {
    width: 100%;
    max-width: 460px;
    box-sizing: border-box;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .botcmd-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .botcmd-title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding-top: 2px;
  }

  .botcmd-icon {
    flex: 0 0 auto;
    display: inline-flex;
    color: var(--el-color-primary);
  }

  .botcmd-name {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
  }

  .botcmd-tag {
    flex: 0 0 auto;
    font-size: 12px;
    line-height: 18px;
    padding: 0 6px;
    border-radius: 4px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light);

    /* 已安装：成功色标签，与「未安装」的灰区分 */
    &.botcmd-tag-on {
      color: var(--el-color-success);
      background: var(--el-color-success-light-9);
    }
  }

  .botcmd-actions {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    white-space: nowrap;
  }

  .botcmd-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
  }

  .botcmd-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .botcmd-label {
    flex: 0 0 auto;
    color: var(--el-text-color-secondary);
  }

  .botcmd-value {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--el-text-color-primary);
    word-break: break-all;
  }

  /* [S34] 停用提示：该绑定只停新邮件推送，已安装的命令仍可用（暗色跟随 Element 变量） */
  .botcmd-tip {
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light);
  }

  /* [S37] 第三方客户端（IMAP）应用密码 */
  .imap-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;

    @media (max-width: 767px) {
      flex-direction: column;
      align-items: stretch;

      .imap-actions {
        justify-content: flex-start;
      }
    }
  }

  /* [S37] IMAP 卡片按钮容器：横向排列，与官方卡片的右侧按钮行一致 */
  .imap-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* [S50] 卡片上的服务器地址：等宽显示域名，长域名/窄屏自动换行 */
  .imap-server-line {
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.7;
    color: var(--el-text-color-secondary);
    word-break: break-word;
    white-space: normal;
  }

  .imap-status {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    padding: 4px 10px;
    border-radius: 6px;
    background: var(--el-fill-color-light);

    &.imap-status-on {
      color: var(--el-color-success);
      background: var(--el-color-success-light-9);
    }
  }

  /* [S37] 标题后面的括号小字：跟在标题同一行；放不下时整段换到下一行（不再从括号中间断开） */
  .imap-gw-hint {
    display: inline-block;
    max-width: 100%;
    margin-left: 4px;
    font-size: 12px;
    font-weight: normal;
    line-height: 1.6;
    color: var(--el-text-color-secondary);
    white-space: normal;
    vertical-align: baseline;

    /* [S51] 已配置：绿底小徽标，与灰字推断明显区分 */
    &.is-on {
      padding: 0 6px;
      border-radius: 4px;
      color: var(--el-color-success);
      background: var(--el-color-success-light-9);
    }
  }

  /* [S51] 使用说明里服务器地址后的「推断」小标 + 底部说明 */
  .imap-help-infer {
    margin-left: 6px;
    padding: 0 5px;
    border-radius: 3px;
    font-size: 11px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light);
  }

  .imap-help-infer-tip {
    margin-top: 8px;
    font-size: 12px;
    line-height: 1.7;
    color: var(--el-text-color-secondary);
  }

  .setting-row {
    width: 100%;
    display: grid;
    grid-template-columns: 120px 220px;
    align-items: center;
    column-gap: 110px;
    font-size: 14px;

    > div:first-child {
      font-weight: bold;
      min-width: 0;
      text-align: left;
    }

    > div:last-child {
      min-width: 0;
      overflow: hidden;
      text-align: left;
    }

    @media (max-width: 767px) {
      grid-template-columns: 120px minmax(0, 1fr);
      column-gap: 24px;
    }
  }

  .language-select {
    width: 110px;
    max-width: 100%;
  }

  .del-email {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
}

/* [S37] IMAP 弹窗样式必须放顶层：el-dialog 用 append-to-body 渲染到 body，
   嵌在 .box 内时 scoped 会带祖先选择器 .box[data-v]，整块失效 ——
   弹窗内边距/间距全部不生效，表现为文字挤成一团、贴着左边缘。 */

.imap-help {
  line-height: 1.6;
}

.imap-help-lead {
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
  margin-bottom: 14px;
  white-space: normal;
}

.imap-help-box {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color-blank);
}

.imap-help-row {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  align-items: start;
  gap: 12px;
  padding: 11px 14px;
  border-top: 1px solid var(--el-border-color-lighter);

  &:first-child {
    border-top: none;
  }

  @media (max-width: 767px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
}

.imap-help-key {
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
  word-break: break-all;
  white-space: normal;
}

.imap-help-val {
  font-size: 13px;
  line-height: 1.7;
  font-weight: 500;
  color: var(--el-text-color-primary);
  word-break: break-all;
  white-space: normal;
}

.imap-help-tips {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.imap-help-tip {
  position: relative;
  padding-left: 13px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--el-text-color-secondary);
  white-space: normal;

  & + .imap-help-tip {
    margin-top: 6px;
  }

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 9px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--el-text-color-placeholder);
  }
}

.imap-create {
  line-height: 1.6;

  .imap-form-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;

    @media (max-width: 767px) {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
    }
  }

  .imap-form-label {
    width: 90px;
    flex-shrink: 0;
    font-size: 13px;
    color: var(--el-text-color-regular);
  }
}

.imap-bind-hint {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
  word-break: break-all;
  white-space: normal;
}


.imap-plain {
  text-align: center;

  .imap-plain-pwd {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 22px;
    letter-spacing: 2px;
    padding: 14px 10px;
    border-radius: 8px;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
    word-break: break-all;
  }

  .imap-plain-actions {
    margin-top: 12px;
  }

  .imap-plain-warn {
    margin-top: 10px;
    font-size: 12px;
    color: var(--el-color-danger);
    white-space: normal;
  }
}

.imap-manage-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  line-height: 1.6;

  &:first-child {
    padding-top: 4px;
  }

  &:last-child {
    border-bottom: none;
    padding-bottom: 4px;
  }

  @media (max-width: 767px) {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
}

.imap-manage-main {
  min-width: 0;
}

.imap-manage-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  line-height: 1.5;
  min-width: 0;
}

.imap-manage-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  max-width: 9em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  border-bottom: 1px dashed var(--el-border-color);

  &:hover {
    color: var(--el-color-primary);
    border-bottom-color: var(--el-color-primary);
  }
}

/* [S37] 改名入口小铅笔（内联 SVG，不依赖 icons 注册表） */
.imap-rename-btn {
  display: inline-flex;
  align-items: center;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    color: var(--el-color-primary);
  }
}

.imap-rename-input {
  flex: 1;
  min-width: 150px;
  max-width: 320px;
}

/* [S37] 绑定邮箱常显：名称与时间行之间，窄屏随 flex-wrap 自动换行 */
.imap-manage-email {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
  white-space: normal;
}

.imap-manage-tag-off {
  font-size: 11px;
  color: var(--el-color-warning);
  border: 1px solid var(--el-color-warning-light-5);
  border-radius: 4px;
  padding: 0 6px;
  flex-shrink: 0;
}

.imap-manage-meta {
  margin-top: 7px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
  word-break: break-all;
  white-space: normal;
}

.imap-manage-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>

<!-- [S37] 弹窗尺寸限制走非 scoped：el-dialog 的 class 落在组件根节点，
     拿不到 scoped 的 data-v 属性，写进 scoped 块里不会生效 -->
<style lang="scss">
.imap-dialog {
  display: flex;
  flex-direction: column;
  /* [S37] el-dialog 默认 margin-top:15vh，限高必须扣掉这段，否则窄屏下底部按钮被推出视口
     （390×844 实测：原本 100vh-96px 时 footer 底边 859 > 844，需滚动才能点到按钮） */
  max-height: calc(85vh - 24px);

  .el-dialog__body {
    min-height: 0;
    overflow-y: auto;
  }

  .el-dialog__header,
  .el-dialog__footer {
    flex: 0 0 auto;
  }
}
</style>
