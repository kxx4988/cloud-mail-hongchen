<template>
  <div class="settings-container">
    <div class="loading" :class="firstLoading ? 'loading-show' : 'loading-hide'">
      <loading/>
    </div>
    <el-scrollbar class="scroll" v-if="!firstLoading">
      <div class="scroll-body">
        <div class="card-grid">
          <!-- Basic Settings Card -->
          <div class="settings-card">
            <div class="card-title">{{ $t('websiteSetting') }}</div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('websiteReg') }}</span></div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.register"/>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('loginDomain') }}</span></div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="1" :inactive-value="0"
                             v-model="setting.loginDomain"/>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('regKey') }}</span></div>
                <div>
                  <el-select
                      @change="change"
                      :style="`width: ${ locale === 'en' ?  100 : 80 }px;`"
                      v-model="setting.regKey"
                      placeholder="Select"
                  >
                    <el-option
                        v-for="item in regKeyOptions"
                        :key="item.value"
                        :label="item.label"
                        :value="item.value"
                    />
                  </el-select>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('addAccount') }}</span></div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.addEmail"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('multipleEmail') }}</span>
                  <el-tooltip effect="dark" :content="$t('multipleEmailDesc')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.manyEmail"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('syncDelete') }}</span>
                  <el-tooltip effect="dark" :content="$t('syncDeleteDesc')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.syncDelete"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('emailPrefix') }}</span>
                </div>
                <div class="forward">
                  <el-button class="opt-button" size="small" type="primary" @click="openEmailPrefix">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- Personalization Settings Card -->
          <div class="settings-card">
            <div class="card-title">{{ $t('customization') }}</div>
            <div class="card-content">
              <div class="setting-item">
                <div class="title-item"><span>{{ $t('websiteTitle') }}</span></div>
                <div class="email-title">
                  <span>{{ setting.title }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="editTitleShow = true">
                    <Icon icon="lsicon:edit-outline" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div class="title-item"><span>{{ $t('loginBoxOpacity') }}</span></div>
                <div>
                  <el-input-number size="small" v-model="loginOpacity" @change="opacityChange" :precision="2"
                                   :step="0.01" :max="1" :min="0"/>
                </div>
              </div>
              <div class="setting-item personalized">
                <div><span>{{ $t('loginBackground') }}</span></div>
                <div>
                  <el-image
                      class="background"
                      :src="cvtR2Url(setting.background)"
                      :preview-src-list="[cvtR2Url(setting.background)]"
                      show-progress
                      fit="cover"
                  >
                    <template #error>
                      <div class="error-image">
                        <Icon icon="ph:image" width="24" height="24"/>
                      </div>
                    </template>
                  </el-image>
                  <div class="background-btn">
                    <el-button class="opt-button" size="small" type="primary" @click="openSetBackground">
                      <Icon icon="lsicon:edit-outline" width="16" height="16"/>
                    </el-button>
                    <el-button class="opt-button" size="small" type="primary" @click="delBackground">
                      <Icon icon="material-symbols:delete-outline-rounded" width="16" height="16"/>
                    </el-button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Email Sending Settings Card -->
          <div class="settings-card">
            <div class="card-title">{{ $t('emailSetting') }}</div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('receiveEmail') }}</span></div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.receive"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('autoRefresh') }}</span>
                  <el-tooltip effect="dark" :content="$t('autoRefreshDesc')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="2" :inactive-value="1"
                             v-model="setting.autoRefresh"/>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('sendEmail') }}</span></div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.send"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('noRecipientTitle') }}</span>
                  <el-tooltip effect="dark" :content="$t('noRecipientDesc')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.noRecipient"/>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ setting.hasCfEmail ? $t('cloudflareEmailSending') : $t('resendToken') }}</span></div>
                <div v-if="setting.hasCfEmail">
                  <span>{{ $t('enabled') }}</span>
                </div>
                <div v-else>
                  <el-button class="opt-button" style="margin-top: 0" @click="openResendList" size="small"
                             type="primary">
                    <Icon icon="ic:round-list" width="18" height="18"/>
                  </el-button>
                  <el-button class="opt-button" style="margin-top: 0" @click="openResendForm" size="small"
                             type="primary">
                    <Icon icon="material-symbols:add-rounded" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('blackList') }}</span></div>
                <div>
                  <el-button class="opt-button" style="margin-top: 0" @click="openBlackListForm" size="small"
                             type="primary">
                    <Icon icon="fluent:settings-48-regular" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('autoClean') }}</span>
                  <el-tooltip effect="dark" :content="$t('autoCleanDesc')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div class="forward">
                  <span>{{ setting.autoCleanDays > 0 ? $t('autoCleanRetain', { days: setting.autoCleanDays }) : $t('disabled') }}</span>
                  <el-button class="opt-button" style="margin-top: 0" @click="openAutoClean" size="small"
                             type="primary">
                    <Icon icon="fluent:settings-48-regular" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
              <!-- 自研定制：垃圾邮件自动清理，与上一项完全独立（各用各的天数字段） -->
              <div class="setting-item">
                <div>
                  <span>{{ $t('spamClean') }}</span>
                  <el-tooltip effect="dark" :content="$t('spamCleanDesc')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div class="forward">
                  <!-- 直接读 setting（与上一行 autoCleanDays 一致）；spamCleanDays 只是弹窗的编辑草稿，不能在列表里当显示值 -->
                  <span>{{ Number(setting.spamCleanDays) > 0 ? $t('spamCleanRetain', { days: Number(setting.spamCleanDays) }) : $t('disabled') }}</span>
                  <el-button class="opt-button" style="margin-top: 0" @click="openSpamClean" size="small"
                             type="primary">
                    <Icon icon="fluent:settings-48-regular" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- [S46] 网关部署：原在个人设置，2026-11-19 搬到系统设置（普通用户不需要看到），生成逻辑不变 -->
          <div class="settings-card">
            <div class="card-title">{{ $t('imapGwTitle') }}</div>
            <div class="card-content">
              <div class="setting-item">
                <div>
                  <span>{{ $t('imapGwRowLabel') }}</span>
                  <el-tooltip effect="dark" :content="$t('imapGwDesc')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div class="forward">
                  <!-- [S52] 卡片只显示服务端已保存值（没有则推导值），绝不读弹窗里的草稿 —— 否则点「取消」后草稿会留在这行 -->
                  <span>{{ gwSavedHost }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="openGwInstall">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
              <!-- [S55] 网关心跳状态：只读，点「详情」看版本 / 证书 / 自报域名 -->
              <div class="setting-item">
                <div>
                  <span>{{ $t('imapHbRowLabel') }}</span>
                  <el-tooltip effect="dark" :content="$t('imapHbRowDesc')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div class="forward">
                  <span class="gw-hb" :class="'is-' + gwHbKind">
                    <span class="gw-hb-dot"></span>{{ gwHbShortText }}
                  </span>
                  <el-button class="opt-button" size="small" type="primary" @click="openGwHb">
                    <Icon icon="fluent:info-24-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-card">
            <div class="card-title">{{ $t('emailPush') }}</div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('tgBot') }}</span></div>
                <div class="forward">
                  <span>{{ setting.tgBotStatus === 0 ? $t('enabled') : $t('disabled') }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="openTgSetting">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
              <!-- [S30] 群发公告：独立一行，沿用官方卡片行样式（左标题 + 右状态 + 齿轮按钮） -->
              <div class="setting-item">
                <div><span>{{ $t('notifyBroadcast') }}</span></div>
                <div class="forward">
                  <span>{{ broadcastCount > 0 ? $t('notifyBroadcastFollowers', { n: broadcastCount }) : $t('notifyBroadcastNoFollowers') }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="openBroadcast">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('otherEmail') }}</span></div>
                <div class="forward">
                  <span>{{ setting.forwardStatus === 0 ? $t('enabled') : $t('disabled') }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="openThirdEmailSetting">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('webhook') }}</span></div>
                <div class="forward">
                  <span>{{ setting.webhookStatus === 0 ? $t('enabled') : $t('disabled') }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="openWebhookSetting">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('forwardingRules') }}</span></div>
                <div class="forward">
                  <span>{{ setting.ruleType === 0 ? $t('forwardAll') : $t('rules') }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="openForwardRules">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- Object Storage Card -->
          <div class="settings-card">
            <div class="card-title">{{ $t('oss') }}</div>
            <div class="card-content">
              <div class="setting-item">
                <div>
                  <span>{{ $t('s3Configuration') }}</span>
                </div>
                <div class="r2domain">
                  <el-button class="opt-button" size="small" type="primary" @click="addS3Show = true">
                    <Icon icon="fluent:settings-48-regular" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('storageType') }}</span>
                </div>
                <div class="r2domain">
                  <div class="storage-type">
                    <el-tag>{{ setting.storageType }}</el-tag>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Turnstile Verification Card -->
          <div class="settings-card">
            <div class="card-title">{{ $t('turnstileSetting') }}</div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('signUpVerification') }}</span></div>
                <div>
                  <el-button class="opt-button" size="small" type="primary" @click="openRegVerifyCount">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                  <el-select
                      @change="change"
                      :style="`width: ${ locale === 'en' ? 100 : 80 }px;`"
                      v-model="setting.registerVerify"
                      placeholder="Select"
                      class="bot-verify-select"
                  >
                    <el-option key="1" :value="0" :label="$t('enable')"/>
                    <el-option key="1" :value="1" :label="$t('disable')"/>
                    <el-option key="1" :value="2" :label="$t('rulesVerify')"/>
                  </el-select>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('loginVerification') }}</span></div>
                <div>
                  <el-button class="opt-button" size="small" type="primary"
                             :aria-label="$t('rulesVerify')" @click="openLoginVerifyCount">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                  <el-select
                      :model-value="setting.loginVerify"
                      @change="changeField('loginVerify', $event)"
                      :style="`width: ${ locale === 'en' ? 100 : 80 }px;`"
                      class="bot-verify-select"
                  >
                    <el-option :value="0" :label="$t('enable')"/>
                    <el-option :value="1" :label="$t('disable')"/>
                    <el-option :value="2" :label="$t('rulesVerify')"/>
                  </el-select>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('addEmailVerification') }}</span></div>
                <div>
                  <el-button class="opt-button" size="small" type="primary" @click="openAddVerifyCount">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                  <el-select
                      @change="change"
                      :style="`width: ${ locale === 'en' ? 100 : 80 }px;`"
                      v-model="setting.addEmailVerify"
                      placeholder="Select"
                      class="bot-verify-select"
                  >
                    <el-option key="1" :value="0" :label="$t('enable')"/>
                    <el-option key="1" :value="1" :label="$t('disable')"/>
                    <el-option key="1" :value="2" :label="$t('rulesVerify')"/>
                  </el-select>
                </div>
              </div>
              <div class="setting-item">
                <div><span>Site key</span></div>
                <div class="bot-verify">
                  <span>{{ maskSiteKey(setting.siteKey) }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="turnstileShow = true">
                    <Icon icon="lsicon:edit-outline" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>Secret key</span></div>
                <div class="bot-verify">
                  <span> {{ setting.secretKey }} </span>
                  <el-button class="opt-button" size="small" type="primary" @click="turnstileShow = true">
                    <Icon icon="lsicon:edit-outline" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-card">
            <div class="card-title">{{ $t('noticeTitle') }}</div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('noticePopup') }}</span></div>
                <div class="forward">
                  <span>{{ setting.notice === 0 ? $t('enabled') : $t('disabled') }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="openNoticePopupSetting">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('popUp') }}</span></div>
                <div class="forward">
                  <el-button class="opt-button" size="small" type="primary" @click="openNoticePopup">
                    <Icon icon="mynaui:click-solid" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-card">
            <div class="card-title">Workers AI</div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('codeRecognition') }}</span></div>
                <div>
                  <el-switch @change="changeField('aiCode', $event)" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.aiCode"/>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('codeRecognitionRules') }}</span></div>
                <div class="forward">
                  <el-button class="opt-button" size="small" type="primary" @click="openAiCodeFilter">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- OAuth Login Card -->
          <div class="settings-card">
            <div class="card-title">{{ $t('oauthLogin') }}</div>
            <div class="card-content">
              <div class="setting-item" v-for="p in oauthPlatforms" :key="p.key">
                <div>
                  <el-avatar v-if="p.iconType === 'image'" :src="p.icon" :size="22" class="oauth-icon"/>
                  <Icon v-else :icon="p.icon" width="22" height="22" class="oauth-icon"/>
                  <span>{{ p.label }}</span>
                </div>
                <div class="forward">
                  <span>{{ setting[p.key + 'Switch'] === 0 ? $t('enabled') : $t('disabled') }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="openOauthSetting(p)">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-card about">
            <div class="card-title">{{ $t('about') }}</div>
            <div class="card-content">
              <div class="concerning-item">
                <span>{{ $t('version') }} :</span>
                <el-badge is-dot :hidden="!hasUpdate">
                  <el-button @click="jump('https://github.com/kxx4988/cloud-mail-hongchen/releases')">
                    {{ currentVersion }}
                    <template #icon>
                      <Icon icon="qlementine-icons:version-control-16" style="font-size: 20px" color="#1890FF"/>
                    </template>
                  </el-button>
                </el-badge>
              </div>
              <div class="concerning-item">
                <span>{{ $t('community') }} : </span>
                <div class="community">
                  <el-button @click="jump('https://github.com/kxx4988/cloud-mail-hongchen')">
                    Github
                    <template #icon>
                      <Icon icon="codicon:github-inverted" width="22" height="22"/>
                    </template>
                  </el-button>
                </div>
              </div>
              <div class="concerning-item">
                <span>{{ $t('support') }} : </span>
                <el-button>
                  {{ t('supportDesc') }}
                  <template #icon>
                    <Icon color="#79D6B5" icon="simple-icons:buymeacoffee" width="20" height="20"/>
                  </template>
                </el-button>
              </div>
              <div class="concerning-item">
                <span>{{ $t('help') }} : </span>
                <el-button @click="jump('https://docs.skymail.ink')">
                  {{ t('document') }}
                  <template #icon>
                    <Icon color="#79D6B5" icon="fluent-color:document-32" width="18" height="18"/>
                  </template>
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Dialogs remain the same -->
      <!-- [S46] 生成网关安装命令（原在个人设置的 IMAP 四合一弹窗里，搬到系统设置后独立成一个弹窗） -->
      <el-dialog v-model="gwInstallVisible" class="gw-install-dialog" :title="$t('imapGwPanelTitle')"
                 width="min(620px, 94vw)" append-to-body @closed="resetGwInstall">
        <div class="gw-install">
          <div class="gw-row">
            <span class="gw-label">{{ $t('imapGwSite') }}</span>
            <span class="gw-site">{{ gwSite }}</span>
            <span class="gw-auto">{{ $t('imapGwSiteAuto') }}</span>
          </div>
          <div class="gw-row">
            <span class="gw-label">{{ $t('imapGwDomain') }}</span>
            <el-input v-model="gwDomain" maxlength="253" :placeholder="gwDomainPlaceholder"/>
          </div>
          <!-- [S51] 框里有值 ≠ 已保存：把当前状态直接写出来，避免「看一眼就关掉」 -->
          <div class="gw-state" :class="'is-' + gwDomainState.kind">{{ gwDomainState.text }}</div>
          <div class="gw-row">
            <span class="gw-label">{{ $t('imapGwMail') }}</span>
            <el-input v-model="gwMail" maxlength="100" :placeholder="gwMailPlaceholder"/>
          </div>
          <div class="gw-note">{{ $t('imapGwMailNote') }}</div>
          <div v-if="!gwMailValid" class="gw-err">{{ $t('imapGwMailInvalid') }}</div>
          <div v-if="!gwDomainValid" class="gw-err">{{ $t('imapGwInvalid') }}</div>
          <div class="gw-cmd">{{ gwInstallCmdMasked }}</div>
          <!-- [S55] 上报密钥：命令里已带上，这里给出可复制的完整串（预览打码） -->
          <div class="gw-key">
            <div class="gw-key-main">
              <span class="gw-key-label">{{ $t('imapHbKeyLabel') }}</span>
              <span class="gw-key-val">{{ gwHbKeyMasked || $t('imapHbKeyEmpty') }}</span>
              <el-button v-if="gwHb.key" size="small" link type="primary" @click="copyGwKey">
                {{ gwKeyCopied ? $t('imapHbKeyCopied') : $t('imapHbKeyCopy') }}
              </el-button>
            </div>
            <div class="gw-key-note">{{ $t('imapHbKeyNote') }}</div>
          </div>
          <div class="gw-tips">
            <div class="gw-tip">{{ $t('imapGwTip1') }}</div>
            <div class="gw-tip">{{ $t('imapGwTip2', { d: gwHost }) }}</div>
            <div class="gw-tip">{{ $t('imapGwTip3') }}</div>
            <div class="gw-tip">{{ $t('imapGwTip4') }}</div>
          </div>
        </div>
        <template #footer>
          <el-button @click="gwInstallVisible = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" plain :disabled="!gwDomainValid || !gwDomainDirty()" :loading="settingLoading" @click="saveGwDomain">
            {{ $t('save') }}
          </el-button>
          <el-button type="primary" :disabled="!gwDomainValid || !gwMailValid" @click="copyGwCmd">
            {{ gwCopied ? $t('imapGwCopied') : $t('imapGwCopy') }}
          </el-button>
        </template>
      </el-dialog>

      <!-- [S55] 网关状态：纯只读，只有「关闭」，没有任何能改数据的东西 -->
      <el-dialog v-model="gwHbVisible" :title="$t('imapHbPanelTitle')" width="min(440px, 94vw)" append-to-body>
        <div class="gw-hb-panel">
          <div class="gw-hb-head" :class="'is-' + gwHbKind">
            <span class="gw-hb-dot"></span>
            <span class="gw-hb-title">{{ gwHbKind === 'on' ? $t('imapHbOnline') : gwHbKind === 'off' ? $t('imapHbOffline') : $t('imapHbNever') }}</span>
          </div>
          <div class="gw-hb-sub">
            <template v-if="gwHbKind === 'never'">{{ $t('imapHbNeverHint') }}</template>
            <template v-else>{{ $t('imapHbLastReport', { t: gwHbAgo }) }}</template>
          </div>

          <div class="gw-hb-list">
            <div class="gw-hb-row">
              <span class="gw-hb-key">{{ $t('imapHbVersion') }}</span>
              <span class="gw-hb-val">{{ gwHb.version ? 'v' + gwHb.version : $t('imapHbNone') }}</span>
            </div>
            <div class="gw-hb-row">
              <span class="gw-hb-key">{{ $t('imapHbCert') }}</span>
              <span class="gw-hb-val" :class="'is-' + gwHbCertKind">
                {{ Number(gwHb.certDays) >= 0 ? $t('imapHbCertDaysShort', { n: Number(gwHb.certDays) }) : $t('imapHbNone') }}
              </span>
            </div>
            <div class="gw-hb-row">
              <span class="gw-hb-key">{{ $t('imapHbDomain') }}</span>
              <span class="gw-hb-val">{{ gwHb.domain || $t('imapHbNone') }}</span>
              <span v-if="gwHb.domain && gwHbDomainDiff" class="gw-hb-flag is-warn">{{ $t('imapHbDomainDiff') }}</span>
              <span v-else-if="gwHb.domain && gwHb.gatewayDomain" class="gw-hb-flag">{{ $t('imapHbDomainSame') }}</span>
            </div>
            <div class="gw-hb-row">
              <span class="gw-hb-key">{{ $t('imapHbFirstReport') }}</span>
              <span class="gw-hb-val">{{ gwHb.firstTime ? hbLocalTime(gwHb.firstTime) : $t('imapHbNone') }}</span>
            </div>
          </div>
        </div>
        <template #footer>
          <el-button @click="gwHbVisible = false">{{ $t('imapHbClose') }}</el-button>
        </template>
      </el-dialog>
      <el-dialog v-model="editTitleShow" :title="$t('changeTitle')" width="340" @closed="editTitle = setting.title">
        <form @submit.prevent>
          <el-input type="text" :placeholder="$t('websiteTitle')" v-model="editTitle" @keyup.enter="saveTitle"/>
          <el-button type="primary" :loading="settingLoading" @click="saveTitle">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="resendTokenFormShow" :title="$t('resendToken')" width="340" @closed="cleanResendTokenForm">
        <form @submit.prevent>
          <el-select style="margin-bottom: 15px" v-model="resendTokenForm.domain" placeholder="Select">
            <el-option
                v-for="item in settingStore.domainList"
                :key="item"
                :label="item"
                :value="item"
            />
          </el-select>
          <el-input type="text" :placeholder="$t('addResendTokenDesc')" v-model="resendTokenForm.token" @keyup.enter="saveResendToken"/>
          <el-button type="primary" :loading="settingLoading" @click="saveResendToken">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="turnstileShow" :title="$t('addTurnstileSecret')" width="340"
                 @closed="turnstileForm.secretKey = '';turnstileForm.siteKey = ''">
        <form @submit.prevent>
          <el-input type="text" placeholder="Site key" v-model="turnstileForm.siteKey" @keyup.enter="saveTurnstileKey"/>
          <el-input type="text" style="margin-top: 15px" placeholder="Secret key" v-model="turnstileForm.secretKey" @keyup.enter="saveTurnstileKey"/>
          <el-button type="primary" :loading="settingLoading" @click="saveTurnstileKey">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="oauthSettingShow" :title="$t('oauthSetting') + ' - ' + oauthForm.label" width="340"
                 @closed="oauthForm.clientId = ''; oauthForm.clientSecret = ''; oauthForm.switch = 1">
        <div class="dialog-content">
          <el-input type="text" :placeholder="$t('clientId')" v-model="oauthForm.clientId"/>
          <el-input type="text" style="margin-top: 15px" :placeholder="$t('clientSecret')" v-model="oauthForm.clientSecret"/>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <el-switch v-model="oauthForm.switch" :active-value="0" :inactive-value="1" :active-text="$t('enable')"
                       :inactive-text="$t('disable')"/>
            <el-button type="primary" :loading="settingLoading" @click="saveOauth">{{ $t('save') }}</el-button>
          </div>
        </template>
      </el-dialog>
      <el-dialog
          v-model="showSetBackground"
          class="cut-dialog"
          @closed="closedSetBackground"
      >
        <template #header>
          <span style="font-size: 18px">
            {{ $t('backgroundTitle') }}
            <el-tooltip>
              <template #content>
                <span>{{ $t('backgroundWarning') }}</span>
              </template>
              <Icon class="title-icon  warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </span>
        </template>
        <el-input :placeholder="$t('backgroundUrlDesc')" v-model="backgroundUrl" v-if="!localUpShow"
                  class="background-url" @keyup.enter="saveBackground"/>
        <el-image
            v-if="localUpShow"
            :preview-src-list="[backgroundImage]"
            show-progress
            class="cropper"
            fit="cover"
            :src="backgroundImage"
        ></el-image>
        <div class="cut-button">
          <el-button type="primary" link @click="openCut" v-if="!localUpShow">
            {{ $t('localUpload') }}
          </el-button>
          <el-button type="primary" link @click="localUpShow = false" v-if="localUpShow">
            {{ $t('imageLink') }}
          </el-button>
          <el-button type="primary" :loading="settingLoading" @click="saveBackground">{{ $t('save') }}</el-button>
        </div>
      </el-dialog>
      <el-dialog
          v-model="tgSettingShow"
          class="forward-dialog"
      >
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('tgBot') }}</span>
            <el-tooltip effect="dark" :content="$t('tgBotDesc')">
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <div class="forward-set-body">
          <el-input :placeholder="setting.tgBotToken || $t('tgBotToken')" v-model="tgBotToken" @keyup.enter="tgBotSave"></el-input>
          <el-input-tag tag-type="warning" :placeholder="$t('toBotTokenDesc')" v-model="tgChatId"
                        @add-tag="addChatTag"></el-input-tag>
          <el-input tag-type="warning" :placeholder="$t('customDomainDesc')" v-model="customDomain" @keyup.enter="tgBotSave"></el-input>
          <div class="tg-msg-label">
            <span>{{t('from')}}</span>
            <el-select  v-model="tgMsgFrom" >
              <el-option
                  v-for="item in tgMsgFromOption"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
              />
            </el-select>
          </div>
          <div class="tg-msg-label">
            <span>{{t('recipient')}}</span>
            <el-select  v-model="tgMsgTo" >
              <el-option
                  v-for="item in tgMsgToOption"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
              />
            </el-select>
          </div>
          <div class="tg-msg-label">
            <span>{{t('emailText')}}</span>
            <el-select  v-model="tgMsgText" >
              <el-option
                  v-for="item in tgMsgTextOption"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
              />
            </el-select>
          </div>
          <!-- 自研定制：垃圾邮件是否推送 Telegram（0=推送 1=不推送） -->
          <div class="tg-msg-label">
            <el-tooltip effect="dark" :content="t('tgSpamNotifyDesc')" placement="top">
              <span>{{ t('tgSpamNotify') }}</span>
            </el-tooltip>
            <el-switch v-model="tgSpamNotify" :active-value="0" :inactive-value="1"/>
          </div>
          <!-- [S23] 自研：接收全站推送（1=开，全站所有用户的邮件都推；0=只推管理员本人名下账号） -->
          <div class="tg-msg-label">
            <el-tooltip effect="dark" :content="t('tgBroadcastDesc')" placement="top">
              <span>{{ t('tgBroadcast') }}</span>
            </el-tooltip>
            <el-switch v-model="tgBroadcast" :active-value="1" :inactive-value="0"/>
          </div>
          <!-- [S29] 每个用户最多绑定几个通知（0 = 不限制） -->
          <div class="tg-msg-label">
            <el-tooltip effect="dark" :content="t('notifyBindLimitDesc')" placement="top">
              <span>{{ t('notifyBindLimit') }}</span>
            </el-tooltip>
            <el-input-number v-model="notifyBindLimit" :min="0" :max="50" :step="1" size="small"
                             controls-position="right" style="width: 120px;"/>
          </div>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <el-switch v-model="tgBotStatus" :active-value="0" :inactive-value="1" :active-text="$t('enable')"
                       :inactive-text="$t('disable')"/>
            <div class="webhook-footer-right">
              <el-button :loading="tgSetupLoading" @click="tgSetupMenu">
                {{ $t('tgSetupMenu') }}
              </el-button>
              <el-button :loading="settingLoading" type="primary" @click="tgBotSave">
                {{ $t('save') }}
              </el-button>
            </div>
          </div>
        </template>
      </el-dialog>
      <!-- [S30] 自研：管理员群发公告（站点 bot → 关注名单，分批发送） -->
      <el-dialog
          v-model="notifyBroadcastShow"
          class="forward-dialog"
          width="480"
          @closed="resetBroadcast"
      >
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('notifyBroadcast') }}</span>
            <el-tooltip effect="dark" :content="$t('notifyBroadcastDesc')">
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <div class="forward-set-body">
          <div class="broadcast-audience">{{ $t('notifyBroadcastAudience', { n: broadcastCount }) }}</div>
          <el-input v-model="broadcastText" type="textarea" :rows="5" maxlength="2000" show-word-limit
                    :placeholder="$t('notifyBroadcastPlaceholder')"/>
          <el-progress v-if="broadcastSending" :percentage="broadcastPercent" :stroke-width="8"/>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <div class="webhook-footer-right">
              <el-button @click="notifyBroadcastShow = false">{{ $t('cancel') }}</el-button>
              <el-button type="primary" :loading="broadcastSending" :disabled="!broadcastText.trim()"
                         @click="sendBroadcast">
                {{ $t('notifyBroadcastSend') }}
              </el-button>
            </div>
          </div>
        </template>
      </el-dialog>
      <el-dialog
          v-model="thirdEmailShow"
          class="forward-dialog"
      >
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('otherEmail') }}</span>
            <el-tooltip effect="dark" :content="$t('otherEmailDesc')">
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <div class="forward-set-body">
          <el-input-tag tag-type="warning" :placeholder="$t('otherEmailInputDesc')" v-model="forwardEmail"
                        @add-tag="emailAddTag"></el-input-tag>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <el-switch v-model="forwardStatus" :active-value="0" :inactive-value="1" :active-text="$t('enable')"
                       :inactive-text="$t('disable')"/>
            <el-button :loading="settingLoading" type="primary" @click="forwardEmailSave">
              {{ $t('save') }}
            </el-button>
          </div>
        </template>
      </el-dialog>
      <el-dialog
          v-model="webhookShow"
          class="forward-dialog"
          @closed="webhookFormatShow = false"
      >
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('webhook') }}</span>
            <el-tooltip effect="dark" :content="$t('webhookDesc')">
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <div class="forward-set-body">
          <el-input :placeholder="$t('webhookUrl')" v-model="webhookUrl" @keyup.enter="webhookSave"></el-input>
          <el-input :placeholder="$t('webhookSecret')" v-model="webhookSecret" @keyup.enter="webhookSave"></el-input>
          <div class="tg-msg-label">
            <span>{{ t('webhookRetry') }}</span>
            <el-input-number v-model="webhookRetry" :min="0" :max="5" controls-position="right"/>
          </div>
          <div v-show="webhookFormatShow" class="webhook-format">
            <pre>Content-Type: application/json
Authorization: &lt;secret&gt;</pre>
            <pre>{{ webhookPayloadExample }}</pre>
          </div>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <el-switch v-model="webhookStatus" :active-value="0" :inactive-value="1" :active-text="$t('enable')"
                       :inactive-text="$t('disable')"/>
            <div class="webhook-footer-right">
              <div class="webhook-format-title" @click="webhookFormatShow = !webhookFormatShow">
                <span>{{ $t('webhookFormat') }}</span>
                <Icon class="webhook-format-icon" :class="{ open: webhookFormatShow }" icon="mingcute:down-small-fill" width="18" height="18"/>
              </div>
              <el-button :loading="settingLoading" type="primary" @click="webhookSave">
                {{ $t('save') }}
              </el-button>
            </div>
          </div>
        </template>
      </el-dialog>
      <el-dialog
          v-model="forwardRulesShow"
          class="forward-dialog"
      >
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('forwardingRules') }}</span>
            <el-tooltip effect="dark" :content="$t('forwardingRulesDesc')">
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <div class="forward-set-body">
          <el-input-tag :placeholder="$t('ruleUsersInputDesc')" tag-type="warning" v-model="ruleEmail"
                        @add-tag="ruleEmailAddTag"/>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <el-radio-group v-model="ruleType">
              <el-radio :value="0">{{ $t('forwardAll') }}</el-radio>
              <el-radio :value="1">{{ $t('rules') }}</el-radio>
            </el-radio-group>
            <el-button :loading="settingLoading" type="primary" @click="ruleEmailSave">
              {{ $t('save') }}
            </el-button>
          </div>
        </template>
      </el-dialog>
      <el-dialog class="resend-table" v-model="showResendList" :title="$t('resendTokenList')">
        <el-table :data="resendList">
          <el-table-column :min-width="emailColumnWidth" property="key" :label="$t('domain')"
                           :show-overflow-tooltip="true"/>
          <el-table-column :width="tokenColumnWidth" property="value" label="Token" fixed="right"
                           :show-overflow-tooltip="true"/>
        </el-table>
      </el-dialog>
      <el-dialog v-model="regVerifyCountShow" :title="$t('rulesVerifyTitle',{count: regVerifyCount})"
                 @closed="regVerifyCount = setting.regVerifyCount">
        <form @submit.prevent>
          <el-input-number type="text" v-model="regVerifyCount" :min="1" @keyup.enter="saveRegVerifyCount">
          </el-input-number>
          <el-button type="primary" :loading="settingLoading" @click="saveRegVerifyCount">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="loginVerifyCountShow" :title="$t('rulesVerifyTitle',{count: loginVerifyCount})"
                 @closed="loginVerifyCount = setting.loginVerifyCount">
        <form @submit.prevent="saveLoginVerifyCount">
          <el-input-number v-model="loginVerifyCount" :min="1" :precision="0"/>
          <el-button native-type="submit" type="primary" :loading="settingLoading">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="addVerifyCountShow" :title="$t('rulesVerifyTitle',{count: addVerifyCount})"
                 @closed="addVerifyCount = setting.addVerifyCount">
        <form @submit.prevent>
          <el-input-number type="text" v-model="addVerifyCount" :min="1" @keyup.enter="saveAddVerifyCount"/>
          <el-button type="primary" :loading="settingLoading" @click="saveAddVerifyCount">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog top="5vh" v-model="noticePopupShow" :title="$t('noticePopup')" class="notice-popup"
                 @closed="resetNoticeForm">
        <form @submit.prevent>
          <el-input v-model="noticeForm.noticeTitle" :placeholder="t('titleDesc')" @keyup.enter="saveNoticePopup"/>
          <div class="notice-line-item">
            <el-select v-model="noticeForm.noticeType">
              <template #prefix>
                <span style="margin-right: 10px">{{ $t('icon') }}</span>
              </template>
              <el-option key="none" label="None" value="none"/>
              <el-option key="primary" label="Primary" value="primary"/>
              <el-option key="success" label="Success" value="success"/>
              <el-option key="warning" label="Warning" value="warning"/>
              <el-option key="info" label="Info" value="info"/>
            </el-select>
            <el-select v-model="noticeForm.noticePosition">
              <template #prefix>
                <span style="margin-right: 10px">{{ $t('position') }}</span>
              </template>
              <el-option key="top-left" :label="t('topLeft')" value="top-left"/>
              <el-option key="top-right" :label="t('topRight')" value="top-right"/>
              <el-option key="bottom-left" :label="t('bottomLeft')" value="bottom-left"/>
              <el-option key="bottom-right" :label="t('bottomRight')" value="bottom-right"/>
            </el-select>
            <el-input-number v-model="noticeForm.noticeWidth">
              <template #prefix>
                {{ $t('width') }}
              </template>
              <template #suffix>
                px
              </template>
            </el-input-number>
            <el-input-number v-model="noticeForm.noticeOffset">
              <template #prefix>
                {{ $t('offset') }}
              </template>
              <template #suffix>
                px
              </template>
            </el-input-number>
            <el-input-number v-model="noticeForm.noticeDuration">
              <template #prefix>
                {{ $t('duration') }}
              </template>
              <template #suffix>
                ms
              </template>
            </el-input-number>
          </div>
          <div class="notice-popup-item">
            <el-input
                v-model="noticeForm.noticeContent"
                :autosize="{ minRows: 15, maxRows: 25 }"
                type="textarea"
                :placeholder="t('noticeContentDesc')"
            />
          </div>
        </form>
        <template #footer>
          <div class="dialog-footer">
            <el-switch v-model="noticeForm.notice" :active-value="0" :inactive-value="1" :active-text="$t('enable')"
                       :inactive-text="$t('disable')"/>
            <div>
              <el-button @click="previewNoticePopup">
                {{ $t('preview') }}
              </el-button>
              <el-button :loading="settingLoading" type="primary" @click="saveNoticePopup">
                {{ $t('save') }}
              </el-button>
            </div>
          </div>
        </template>
      </el-dialog>
      <el-dialog v-model="addS3Show" :title="t('s3Configuration')" width="340" @closed="resetAddS3Form">
        <form @submit.prevent>
          <el-input class="dialog-input" type="text" placeholder="Bucket" v-model="s3.bucket" @keyup.enter="saveS3"/>
          <el-input class="dialog-input" type="text" placeholder="Endpoint" v-model="s3.endpoint" @keyup.enter="saveS3"/>
          <el-input class="dialog-input" type="text" placeholder="Region" v-model="s3.region" @keyup.enter="saveS3"/>
          <el-input class="dialog-input" type="text" :placeholder="setting.s3AccessKey || 'Access key'"
                    v-model="s3.s3AccessKey" @keyup.enter="saveS3"/>
          <el-input style="margin-bottom: 10px" type="text" :placeholder="setting.s3SecretKey || 'Secret key'" v-model="s3.s3SecretKey" @keyup.enter="saveS3"/>
          <div class="force-path-style">
            <div class="force-path-style-left">
              <span>ForcePathStyle</span>
              <el-tooltip effect="dark" :content="$t('forcePathStyleDesc')">
                <Icon class="warning" icon="fe:warning" width="18" height="18"/>
              </el-tooltip>
            </div>
            <el-switch :before-change="beforeChange" :active-value="0" :inactive-value="1"
                       v-model="s3.forcePathStyle"/>
          </div>
          <div class="s3-button">
            <el-button :loading="clearS3Loading" @click="clearS3">{{ t('clear') }}</el-button>
            <el-button type="primary" :loading="settingLoading && !clearS3Loading" @click="saveS3">{{ t('save') }}</el-button>
          </div>
        </form>
      </el-dialog>
      <el-dialog v-model="emailPrefixShow" :title="t('emailPrefix')"  @closed="resetEmailPrefix"  >
        <div class="email-prefix">
          <div>{{ t('atLeast') }}</div>
          <el-input-number v-model="minEmailPrefix" :min="1" :max="20" style="width: 150px" @keyup.enter="saveEmailPrefix" >
            <template #suffix>
              <span>{{ t('character') }}</span>
            </template>
          </el-input-number>
        </div>
        <div class="prefix-filter">
          <div style="margin-bottom: 10px;">{{ t('mustNotContain') }}</div>
          <el-input-tag style="margin-bottom: 10px;" v-model="emailPrefixFilter"  />
        </div>
        <el-button type="primary" style="width: 100%;" :loading="settingLoading" @click="saveEmailPrefix">{{ $t('save') }}</el-button>
      </el-dialog>
      <el-dialog v-model="blackFormShow" class="forward-dialog" @closed="resetBlackList">
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('blackList') }}</span>
            <el-tooltip effect="dark" :content="$t('blackListDesc')">
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <el-form>
          <el-form-item :label="t('blackFromDesc')" label-position="top">
            <el-input-tag v-model="blackListForm.blackFrom" @add-tag="banEmailAddTag"  />
          </el-form-item>
          <el-form-item :label="t('blackSubjectDesc')" label-position="top">
            <el-input-tag v-model="blackListForm.blackSubject"/>
          </el-form-item>
          <el-form-item :label="t('blackContentDesc')" label-position="top">
            <el-input-tag v-model="blackListForm.blackContent"/>
          </el-form-item>
        </el-form>
        <el-button type="primary" style="width: 100%;" :loading="settingLoading" @click="saveBlackList">{{ $t('save') }}</el-button>
      </el-dialog>
      <el-dialog v-model="autoCleanShow" :title="t('autoClean')" class="forward-dialog" @closed="resetAutoClean">
        <el-form>
          <el-form-item :label="t('autoCleanDays')" label-position="top">
            <el-input-number v-model="autoCleanDays" :min="0" :max="3650" style="width: 100%"/>
          </el-form-item>
          <el-form-item :label="t('autoCleanExclude')" label-position="top">
            <el-input-tag
                tag-type="warning"
                :placeholder="$t('autoCleanExcludeDesc')"
                v-model="autoCleanExclude"
                @add-tag="autoCleanExcludeAddTag"
            />
          </el-form-item>
          <el-form-item label-position="top">
            <div class="auto-clean-deleted">
              <span class="auto-clean-deleted-label">{{ $t('autoCleanDeletedOnly') }}</span>
              <el-switch v-model="autoCleanDeletedOnly" />
            </div>
            <div class="auto-clean-deleted-desc">{{ $t('autoCleanDeletedOnlyDesc') }}</div>
          </el-form-item>
        </el-form>
        <el-button type="primary" style="width: 100%;" :loading="settingLoading" @click="saveAutoClean">{{ $t('save') }}</el-button>
      </el-dialog>
      <el-dialog v-model="spamCleanShow" :title="t('spamClean')" class="forward-dialog" @closed="resetSpamClean">
        <el-form>
          <el-form-item :label="t('autoCleanDays')" label-position="top">
            <el-input-number v-model="spamCleanDays" :min="0" :max="3650" style="width: 100%"/>
          </el-form-item>
          <div class="auto-clean-deleted-desc">{{ t('spamCleanDesc') }}</div>
        </el-form>
        <el-button type="primary" style="width: 100%;" :loading="settingLoading" @click="saveSpamClean">{{ $t('save') }}</el-button>
      </el-dialog>
      <el-dialog v-model="aiCodeFilterShow" class="forward-dialog" @closed="resetAiCodeFilter">
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('codeRecognitionRules') }}</span>
            <el-tooltip effect="dark" :content="$t('codeRecognitionRulesDesc')">
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <el-form>
          <el-form-item :label="t('senderRules')" label-position="top">
            <el-input-tag v-model="aiCodeFilter" @add-tag="aiCodeFilterAddTag"/>
          </el-form-item>
        </el-form>
        <el-button type="primary" style="width: 100%;" :loading="settingLoading" @click="saveAiCodeFilter">{{ $t('save') }}</el-button>
      </el-dialog>
    </el-scrollbar>
  </div>
</template>

<script setup>
import {computed, defineOptions, nextTick, reactive, ref, watch} from "vue";
import {deleteBackground, imapHbState, setBackground, setBlackList, settingQuery, settingSet, telegramSetup} from "@/request/setting.js";
import {notifyBroadcastCount, notifyBroadcastSend} from "@/request/notify.js";
import {useSettingStore} from "@/store/setting.js";
import {useUiStore} from "@/store/ui.js";
import {useUserStore} from "@/store/user.js";
import {useAccountStore} from "@/store/account.js";
import {Icon} from "@iconify/vue";
import {cvtR2Url, toOssDomain} from "@/utils/convert.js";
import {storeToRefs} from "pinia";
import {debounce} from 'lodash-es'
import {isDomain, isEmail, isIpUrl} from "@/utils/verify-utils.js";
import loading from "@/components/loading/index.vue";
import {getTextWidth} from "@/utils/text.js";
import {fileToBase64} from "@/utils/file-utils.js"
import {useI18n} from 'vue-i18n';
import axios from "axios";

defineOptions({
  name: 'sys-setting'
})

const currentVersion = 'v3.6.0'
const hasUpdate = ref(false)
let getUpdateErrorCount = 1;
const {t, locale} = useI18n();
const firstLoading = ref(true)
const settingReady = ref(false)
const backgroundImage = ref('')
const localUpShow = ref(false)
const accountStore = useAccountStore();
const userStore = useUserStore();
const editTitleShow = ref(false)
const resendTokenFormShow = ref(false)
const blackFormShow = ref(false)
const autoCleanShow = ref(false)
const aiCodeFilterShow = ref(false)
const turnstileShow = ref(false)
const tgSettingShow = ref(false)
const noticePopupShow = ref(false)
const thirdEmailShow = ref(false)
const webhookShow = ref(false)
const forwardRulesShow = ref(false)
const emailPrefixShow = ref(false)
const showResendList = ref(false)
const settingStore = useSettingStore();
const uiStore = useUiStore();
const {settings: setting} = storeToRefs(settingStore);
const editTitle = ref('')
const settingLoading = ref(false)
const clearS3Loading = ref(false)
const loginOpacity = ref(0)
const minEmailPrefix = ref(0)
const emailPrefixFilter = ref([])
const autoCleanDays = ref(0)
const autoCleanExclude = ref([])
const autoCleanDeletedOnly = ref(false)
// 自研定制：垃圾邮件自动清理（独立字段 spamCleanDays，0=关闭）
const spamCleanShow = ref(false)
const spamCleanDays = ref(0)
const backgroundUrl = ref('')
let backgroundFile = {}
const showSetBackground = ref(false)
let regVerifyCount = ref(1)
const loginVerifyCount = ref(1)
let addVerifyCount = ref(1)
let backup = '{}'
const addS3Show = ref(false)
const addVerifyCountShow = ref(false)
const regVerifyCountShow = ref(false)
const loginVerifyCountShow = ref(false)
const resendTokenForm = reactive({
  domain: '',
  token: '',
})
const turnstileForm = reactive({
  siteKey: '',
  secretKey: ''
})

const oauthPlatforms = [
  { key: 'google', label: 'Google', icon: 'devicon:google', iconType: 'iconify' },
  { key: 'github', label: 'GitHub', icon: 'codicon:github-inverted', iconType: 'iconify' },
  { key: 'linuxdo', label: 'LinuxDo', icon: '/image/linuxdo.webp', iconType: 'image' },
]
const oauthSettingShow = ref(false)
const oauthForm = reactive({
  key: '',
  label: '',
  clientId: '',
  clientSecret: '',
  switch: 1,
})

const s3 = reactive({
  bucket: '',
  endpoint: '',
  region: '',
  s3AccessKey: '',
  s3SecretKey: '',
  forcePathStyle: 1
})

const noticeForm = reactive({
  noticeTitle: '',
  noticeContent: '',
  noticeType: '',
  noticeDuration: '',
  noticePosition: '',
  noticeOffset: 0,
  notice: 0,
  noticeWidth: 0
})

const regKeyOptions = computed(() => [
  {label: t('enable'), value: 0},
  {label: t('disable'), value: 1},
  {label: t('optional'), value: 2},
])

const blackListForm = ref({
  blackSubject: [],
  blackContent: [],
  blackFrom: []
})
const aiCodeFilter = ref([])

const tgChatId = ref([])
const customDomain = ref('')
const tgBotStatus = ref(0)
// 自研定制：垃圾邮件是否推送 Telegram（0=推送 1=不推送），默认推送
const tgSpamNotify = ref(0)
// [S23] 自研：接收全站推送（1=开＝全站所有用户的邮件，0=只收管理员本人名下账号），默认开
const tgBroadcast = ref(1)
// [S29] 自研：每个用户最多绑定几个通知（0 = 不限制）
const notifyBindLimit = ref(0)
const tgBotToken = ref('')
const tgSetupLoading = ref(false)
const forwardEmail = ref([])
const forwardStatus = ref(0)
const webhookUrl = ref('')
const webhookStatus = ref(1)
const webhookRetry = ref(0)
const webhookSecret = ref('')
const webhookFormatShow = ref(false)
const webhookPayloadExample = `{
  "emailId": 1,
  "sendEmail": "hello@example.com",
  "sendName": "hello",
  "toEmail": "admin@example.com",
  "toName": "admin",
  "subject": "Hello",
  "text": "Hello",
  "content": "<div>Hello</div>",
  "code": "123456",
  "createTime": "2099-12-30 23:59:59"
}`
const emailColumnWidth = ref(0)
const tokenColumnWidth = ref(0)
const ruleType = ref(0)
const ruleEmail = ref([])
const tgMsgFrom = ref('')
const tgMsgTo = ref('')
const tgMsgText = ref('')

const tgMsgFromOption = [{label: t('show'), value: 'show'}, {label: t('hide'), value: 'hide'}, {label: t('onlyName'), value:'only-name'}]
const tgMsgToOption = [{label: t('show'), value: 'show'}, {label: t('hide'), value: 'hide'}]
const tgMsgTextOption = [{label: t('show'), value: 'show'}, {label: t('hide'), value: 'hide'}]
const tgMsgLabelWidth = computed(() => locale.value === 'en' ? '120px' : '100px');

getSettings()
getUpdate()

function maskSiteKey(value) {
  return value ? `${String(value).slice(0, 6)}******` : ''
}

function getSettings() {
  settingReady.value = false
  settingQuery().then(settingData => {
    setting.value = settingData
    settingStore.domainList = settingData.domainList;
    resendTokenForm.domain = setting.value.domainList[0]
    loginOpacity.value = setting.value.loginOpacity
    minEmailPrefix.value = setting.value.minEmailPrefix
    firstLoading.value = false
    backgroundUrl.value = setting.value.background?.startsWith('http') ? setting.value.background : ''
    editTitle.value = setting.value.title
    addVerifyCount.value = setting.value.addVerifyCount
    regVerifyCount.value = setting.value.regVerifyCount
    loginVerifyCount.value = setting.value.loginVerifyCount
    loadGwHb()
    resetNoticeForm()
    resetAddS3Form()
    resetEmailPrefix()
    resetBlackList()
    resetAiCodeFilter()
    nextTick(() => {
      settingReady.value = true
    })
  })
}


function openNoticePopup() {
  uiStore.showNotice()
}

function openAddVerifyCount() {
  if (settingLoading.value) return
  addVerifyCountShow.value = true
}

function openRegVerifyCount() {
  if (settingLoading.value) return
  regVerifyCountShow.value = true
}

function openLoginVerifyCount() {
  if (settingLoading.value) return
  loginVerifyCountShow.value = true
}

function resetAddS3Form() {
  s3.bucket = setting.value.bucket
  s3.endpoint = setting.value.endpoint
  s3.region = setting.value.region
  s3.s3AccessKey = ''
  s3.s3SecretKey = ''
  s3.forcePathStyle = setting.value.forcePathStyle
}

const resendList = computed(() => {

  let list = Object.keys(setting.value.resendTokens).map(key => {
    return {
      key: key,
      value: setting.value.resendTokens[key]
    };
  })

  if (list.length > 0) {

    const key = list.reduce((a, b) => compareByLengthAndUpperCase(a, b, 'key')).key;
    emailColumnWidth.value = getTextWidth(key) + 30;

    const value = list.reduce((a, b) => compareByLengthAndUpperCase(a, b, 'value')).value;
    tokenColumnWidth.value = getTextWidth(value) + 30;

  }

  return list;
});

function getUpdate() {
  if (getUpdateErrorCount > 5 || !getUpdateErrorCount) return
  axios.get('https://api.github.com/repos/kxx4988/cloud-mail-hongchen/releases/latest').then(({data}) => {
    hasUpdate.value = data.name !== currentVersion
    getUpdateErrorCount = 0
  }).catch(e => {
    getUpdateErrorCount++
    setTimeout(() => {
      getUpdate()
    }, 2000)
    console.error('检查更新失败：', e)
  })
}

function saveAddVerifyCount() {
  if (!addVerifyCount.value) {
    addVerifyCount.value = 1
  }
  editSetting({addVerifyCount: addVerifyCount.value})
}

function saveRegVerifyCount() {
  if (!regVerifyCount.value) {
    regVerifyCount.value = 1
  }
  editSetting({regVerifyCount: regVerifyCount.value})
}

function saveLoginVerifyCount() {
  editSetting({loginVerifyCount: loginVerifyCount.value || 1})
}

const compareByLengthAndUpperCase = (a, b, key) => {
  const getUpperCaseCount = (str) => (str.match(/[A-Z]/g) || []).length;
  if (a[key].length === b[key].length) {
    return getUpperCaseCount(a[key]) > getUpperCaseCount(b[key]) ? a : b;
  }
  return a[key].length > b[key].length ? a : b;
};


function closedSetBackground() {
  backgroundImage.value = ''
  localUpShow.value = false
  backgroundUrl.value = setting.value.background?.startsWith('http') ? setting.value.background : ''
}

function openTgSetting() {
  tgBotStatus.value = setting.value.tgBotStatus
  // 字段缺失（旧数据）时按「推送」处理
  tgSpamNotify.value = setting.value.tgSpamNotify === undefined || setting.value.tgSpamNotify === null
      ? 0
      : Number(setting.value.tgSpamNotify)
  // [S23] 字段缺失（KV 还是加列前的旧缓存）时按「开」处理，避免误显示成关闭
  tgBroadcast.value = setting.value.tgBroadcast === undefined || setting.value.tgBroadcast === null
      ? 1
      : Number(setting.value.tgBroadcast)
  // [S29] 绑定数量上限：字段缺失按 0（不限制）
  notifyBindLimit.value = Number(setting.value.notifyBindLimit) > 0 ? Number(setting.value.notifyBindLimit) : 0
  tgBotToken.value = ''
  customDomain.value = setting.value.customDomain
  tgMsgFrom.value = setting.value.tgMsgFrom
  tgMsgText.value = setting.value.tgMsgText
  tgMsgTo.value = setting.value.tgMsgTo
  tgChatId.value = []
  if (setting.value.tgChatId) {
    const list = setting.value.tgChatId.split(',')
    tgChatId.value.push(...list)
  }
  tgSettingShow.value = true
}

function openNoticePopupSetting() {
  noticePopupShow.value = true
}

function openResendList() {
  showResendList.value = true
}

function resetNoticeForm() {
  noticeForm.notice = setting.value.notice
  noticeForm.noticeContent = setting.value.noticeContent
  noticeForm.noticeDuration = setting.value.noticeDuration
  noticeForm.noticeTitle = setting.value.noticeTitle
  noticeForm.noticePosition = setting.value.noticePosition
  noticeForm.noticeType = setting.value.noticeType
  noticeForm.noticeOffset = setting.value.noticeOffset
  noticeForm.noticeWidth = setting.value.noticeWidth
}

function saveNoticePopup() {
  noticeForm.noticeOffset = noticeForm.noticeOffset || 0
  noticeForm.noticeWidth = noticeForm.noticeWidth || 0
  noticeForm.noticeDuration = noticeForm.noticeDuration || 0
  editSetting({...noticeForm})
}

function previewNoticePopup() {
  uiStore.previewNotice({...noticeForm})
}

function openThirdEmailSetting() {
  forwardEmail.value = []
  forwardStatus.value = setting.value.forwardStatus
  if (setting.value.forwardEmail) {
    const list = setting.value.forwardEmail.split(',')
    forwardEmail.value.push(...list)
  }
  thirdEmailShow.value = true
}

function openWebhookSetting() {
  webhookStatus.value = setting.value.webhookStatus
  webhookUrl.value = setting.value.webhookUrl || ''
  webhookRetry.value = setting.value.webhookRetry ?? 0
  webhookSecret.value = setting.value.webhookSecret || ''
  webhookShow.value = true
}

function openEmailPrefix() {
  emailPrefixShow.value = true
}

function openAutoClean() {
  autoCleanDays.value = setting.value.autoCleanDays ?? 0
  autoCleanExclude.value = setting.value.autoCleanExclude
      ? setting.value.autoCleanExclude.split(',').filter(Boolean)
      : []
  autoCleanDeletedOnly.value = Number(setting.value.autoCleanDeletedOnly) === 1
  autoCleanShow.value = true
}

function openForwardRules() {
  ruleType.value = setting.value.ruleType
  ruleEmail.value = []
  if (setting.value.ruleEmail) {
    const list = setting.value.ruleEmail.split(',')
    ruleEmail.value.push(...list)
  }
  forwardRulesShow.value = true
}

function emailAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  forwardEmail.value.splice(forwardEmail.value.length - 1, 1)

  emails.forEach(email => {
    if (isEmail(email) && !forwardEmail.value.includes(email)) {
      forwardEmail.value.push(email)
    }
  })
}

function ruleEmailAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  ruleEmail.value.splice(ruleEmail.value.length - 1, 1)

  emails.forEach(email => {
    if (isEmail(email) && !ruleEmail.value.includes(email)) {
      ruleEmail.value.push(email)
    }
  })
}

function addChatTag(val) {

  const chatIds = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  tgChatId.value.splice(tgChatId.value.length - 1, 1)

  chatIds.forEach(id => {
    if (!isNaN(Number(id))) {
      tgChatId.value.push(id)
    }
  })
}

function clearS3() {

  const form = {
    bucket: '',
    endpoint: '',
    region: '',
    s3AccessKey: '',
    s3SecretKey: '',
    forcePathStyle: 1
  }
  clearS3Loading.value = true
  editSetting(form)
}

function saveS3() {

  const form = {
    bucket: s3.bucket,
    endpoint: s3.endpoint,
    region: s3.region,
    forcePathStyle: s3.forcePathStyle
  }

  if (s3.s3AccessKey) form.s3AccessKey = s3.s3AccessKey
  if (s3.s3SecretKey) form.s3SecretKey = s3.s3SecretKey

  editSetting(form)
}

function tgBotSave() {
  const form = {
    customDomain: customDomain.value,
    tgBotStatus: tgBotStatus.value,
    tgChatId: tgChatId.value + '',
    tgMsgFrom: tgMsgFrom.value,
    tgMsgText: tgMsgText.value,
    tgMsgTo: tgMsgTo.value,
    // 自研定制：垃圾邮件是否推送 Telegram（0=推送 1=不推送）
    tgSpamNotify: tgSpamNotify.value,
    // [S23] 自研：接收全站推送（1=开 0=只收自己名下账号）
    tgBroadcast: tgBroadcast.value,
    // [S29] 每个用户最多绑定几个通知（0 = 不限制）
    notifyBindLimit: notifyBindLimit.value
  }
  if (tgBotToken.value) form.tgBotToken = tgBotToken.value
  editSetting(form)
}

// 重设 Telegram 菜单：重新下发 8 条机器人命令 / 底部菜单按钮 / 重注册 webhook。
// 只影响机器人侧配置，不会生成或作废任何邮件深链（深链永久有效）。
function tgSetupMenu() {
  ElMessageBox.confirm(t('tgSetupConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    tgSetupLoading.value = true
    telegramSetup().then(data => {
      const r = data?.results || {}
      const cmdsOk = r.commands?.ok === true
      const menuOk = r.menuButton?.ok === true
      const hookOk = r.webhook ? r.webhook.ok === true : null
      const parts = [
        `${t('tgSetupCommands')}: ${cmdsOk ? '✓' : '✗'}`,
        `${t('tgSetupMenuButton')}: ${menuOk ? '✓' : '✗'}`,
        hookOk === null ? `Webhook: ${t('tgSetupSkipped')}` : `Webhook: ${hookOk ? '✓' : '✗'}`
      ]
      const failed = !cmdsOk || !menuOk || hookOk === false
      ElMessage({
        message: `${failed ? t('tgSetupPartial') : t('tgSetupSuccess')}（${parts.join(' · ')}）`,
        type: failed ? 'warning' : 'success',
        plain: true,
        duration: 5000
      })
    }).finally(() => {
      tgSetupLoading.value = false
    })
  }).catch(() => {
  })
}

// [S46] 网关部署：生成 install.sh 安装命令。2026-11-19 按要求搬到系统设置（仅管理员可见）。
// [S50] 网关域名不再只存浏览器 localStorage：改为 setting.imap_gateway_domain（服务端），
// 个人设置「使用说明」与这里的安装命令读同一个值 —— 否则普通用户/换设备只能看到推导值。
const IMAP_GW_INSTALL_URL = 'https://raw.githubusercontent.com/kxx4988/cloud-mail-imap/main/install.sh'
const gwInstallVisible = ref(false)
// 取值顺序：服务端已保存的 > 当前输入框（打开弹窗时按服务端/推导值填）
const gwDomain = ref('')
const gwMail = ref('')
const gwCopied = ref(false)

const gwMailDomainSource = computed(() => {
  const mail = userStore.user?.account?.email || ''
  const at = String(mail).indexOf('@')
  return at >= 0 ? String(mail).slice(at + 1) : ''
})
const gwDefaultDomain = computed(() => gwMailDomainSource.value ? 'imap.' + gwMailDomainSource.value : '')
// [S52] 卡片行专用：只认「服务端已保存 → 邮箱域名推导」，永不读弹窗里的输入框。
//   踩过的坑：原先卡片读 gwHost（输入框优先），点「取消」不还原草稿，卡片就会一直显示没保存的值。
const gwSavedHost = computed(() => String(setting.value?.imapGatewayDomain || '').trim() || gwDefaultDomain.value)
// 弹窗内用：提示里的域名、证书邮箱 placeholder 要跟着输入框走，才有三处联动。
const gwHost = computed(() => gwDomain.value.trim() || gwSavedHost.value)
const gwDomainPlaceholder = computed(() => gwDefaultDomain.value || 'imap.example.com')
// 证书邮箱 placeholder：与 install.sh 的回退规则对齐（admin@${DOMAIN#*.}），
// 即「去掉网关域名的第一段」。原先取的是管理员邮箱域名，导致改了网关域名这一栏不跟着变。
// 边界：域名只剩两段时（example.com → com）不剥，避免显示 admin@com。
const gwMailDomain = computed(() => {
  const host = gwHost.value.trim()
  const i = host.indexOf('.')
  if (i < 0) {
    return host
  }
  const rest = host.slice(i + 1)
  return rest.indexOf('.') >= 0 ? rest : host
})
const gwMailPlaceholder = computed(() => t('imapGwMailPlaceholder', { d: gwMailDomain.value || 'example.com' }))
const gwDomainValid = computed(() => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(gwDomain.value.trim()));
// [S51] 域名状态提示：未保存的推断值 / 有未保存修改 / 已保存，三种说法不同
const gwDomainState = computed(() => {
  const saved = String(setting.value?.imapGatewayDomain || '').trim()
  if (!saved) {
    return {kind: 'inferred', text: t('imapGwDomainStateInferred')}
  }
  if (gwDomain.value.trim() !== saved) {
    return {kind: 'dirty', text: t('imapGwDomainStateDirty')}
  }
  return {kind: 'saved', text: t('imapGwDomainStateSaved')}
})

// 证书邮箱可选：留空合法；填了就必须像个邮箱，否则禁用复制——避免把错地址带进命令还以为填对了
const gwMailValid = computed(() => {
  const v = gwMail.value.trim()
  return !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
})
// [S49] 站点地址：优先用后台配置的「自定义域名」（custom_domain，TG 的 webhook / 链接也用它），
// 空着就回退到当前浏览器地址栏——不用 TG 的人不会填这个字段，回退保证不炸。
// 只取 origin：配置里若带了路径（如 https://mail.example.com/app），路径必须丢掉——
// 网关是用 WORKER_BASE + '/api/imap/auth' 拼地址的，带路径会拼成 /app/api/imap/auth 全部 404。
const gwSite = computed(() => {
  const fallback = typeof window === 'undefined' ? '' : window.location.origin
  const raw = String(setting.value?.customDomain || '').trim()
  if (!raw) {
    return fallback
  }
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw
    return new URL(withProto).origin
  } catch (e) {
    return fallback
  }
})
// [S55] 网关心跳状态：密钥懒生成在后端，前端只负责取与展示
const GW_HB_ONLINE_MS = 2 * 3600 * 1000
const gwHb = ref({key: '', hbTime: '', firstTime: '', version: '', certDays: -1, domain: '', gatewayDomain: ''})
const gwHbVisible = ref(false)
const gwKeyCopied = ref(false)

function loadGwHb() {
  imapHbState().then(data => {
    gwHb.value = data || {}
  }).catch(() => {})
}

function hbDate(v) {
  const str = String(v || '').trim()
  if (!str) {
    return null
  }
  // 库里是 UTC 裸串（S48 口径），补 Z 再解析
  const d = new Date(str.replace(' ', 'T') + (str.length <= 19 ? 'Z' : ''))
  return Number.isNaN(d.getTime()) ? null : d
}

// UTC 裸串 → 浏览器本地 MM-DD HH:mm（库内一律 UTC，展示必须转本地）
function hbLocalTime(v) {
  const d = hbDate(v)
  if (!d) {
    return ''
  }
  const pad = n => String(n).padStart(2, '0')
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

// 三态：on 在线（2 小时内）/ off 离线（有记录但超时）/ never 从未上报
const gwHbKind = computed(() => {
  if (!String(gwHb.value.hbTime || '').trim()) {
    return 'never'
  }
  const d = hbDate(gwHb.value.hbTime)
  return d && (Date.now() - d.getTime()) < GW_HB_ONLINE_MS ? 'on' : 'off'
})

const gwHbAgo = computed(() => {
  const d = hbDate(gwHb.value.hbTime)
  if (!d) {
    return ''
  }
  const min = Math.floor((Date.now() - d.getTime()) / 60000)
  if (min < 1) {
    return t('imapHbJustNow')
  }
  if (min < 60) {
    return t('imapHbMinAgo', {n: min})
  }
  const hour = Math.floor(min / 60)
  if (hour < 24) {
    return t('imapHbHourAgo', {n: hour})
  }
  return t('imapHbDayAgo', {n: Math.floor(hour / 24)})
})

// 卡片第二行的一句话结论
const gwHbShortText = computed(() => {
  const ver = String(gwHb.value.version || '').trim()
  const days = Number(gwHb.value.certDays)
  if (gwHbKind.value === 'never') {
    return t('imapHbNever')
  }
  if (gwHbKind.value === 'off') {
    return t('imapHbOffline') + ' · ' + t('imapHbLastReport', {t: gwHbAgo.value})
  }
  let text = t('imapHbOnline')
  if (ver) {
    text += ' · v' + ver
  }
  if (Number.isFinite(days) && days >= 0) {
    text += ' · ' + t('imapHbCertDays', {n: days})
  }
  return text
})

// 证书颜色：<14 红、14~29 黄、>=30 绿；未上报为灰
const gwHbCertKind = computed(() => {
  const days = Number(gwHb.value.certDays)
  if (!Number.isFinite(days) || days < 0) {
    return 'none'
  }
  if (days < 14) {
    return 'danger'
  }
  return days < 30 ? 'warning' : 'ok'
})

// 自报域名与配置比对：不一致说明管理员填的跟实际部署的对不上
const gwHbDomainDiff = computed(() => {
  const reported = String(gwHb.value.domain || '').trim().toLowerCase()
  const configured = String(gwHb.value.gatewayDomain || '').trim().toLowerCase()
  return !!reported && !!configured && reported !== configured
})

const gwHbKeyMasked = computed(() => {
  const key = String(gwHb.value.key || '')
  return key.length > 10 ? key.slice(0, 4) + '…' + key.slice(-4) : key
})

function openGwHb() {
  loadGwHb()
  gwHbVisible.value = true
}

function copyGwKey() {
  const text = String(gwHb.value.key || '')
  if (!text) {
    return
  }
  const done = () => {
    gwKeyCopied.value = true
    setTimeout(() => { gwKeyCopied.value = false }, 2000)
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(done)
  } else {
    done()
  }
}

const gwInstallCmd = computed(() => {
  // 拆三行：URL 独占一行，粘贴时反斜杠续行有效
  let cmd = 'curl -fsSL \\\n  ' + IMAP_GW_INSTALL_URL + ' \\\n'
    + '  | sudo bash -s --'
    + ' --worker ' + gwSite.value
    + ' --domain ' + gwDomain.value.trim()
  const mail = gwMail.value.trim()
  if (mail) {
    cmd += ' --email ' + mail
  }
  // [S55] 上报参数（正式版直接带上；网关 v0.2.33 起支持）
  const key = String(gwHb.value.key || '').trim()
  if (key) {
    cmd += ' \\\n    --hb-url ' + gwSite.value + ' --hb-key ' + key
  }
  return cmd
})

// 预览用：密钥打码，避免截图外泄；复制仍给完整串
const gwInstallCmdMasked = computed(() => gwInstallCmd.value.replace(/(--hb-key\s+)([0-9a-f]{4})[0-9a-f]+([0-9a-f]{4})/i, '$1$2…$3'))

// [S50] 打开弹窗时按「服务端已保存 → 邮箱域名推导」填；不再往 localStorage 写副本，
// 否则又会出现「管理员那台知道、别人不知道」的老问题。
function gwDomainInit() {
  return String(setting.value?.imapGatewayDomain || '').trim() || gwDefaultDomain.value
}

// 保存到服务端：走官方 /setting/set（需要 setting:set 权限），保存后 KV 缓存会刷新
function gwDomainDirty() {
  return gwDomain.value.trim() !== String(setting.value?.imapGatewayDomain || '').trim()
}

function saveGwDomain() {
  if (!gwDomainValid.value || !gwDomainDirty()) {
    return
  }
  editSetting({imapGatewayDomain: gwDomain.value.trim()})
}

function openGwInstall() {
  gwDomain.value = gwDomainInit()
  gwCopied.value = false
  loadGwHb()
  gwInstallVisible.value = true
}

// [S52] 关闭即放弃修改：把草稿还原成服务端值，证书邮箱与复制态一并清掉。
//   卡片已经不读草稿了，这里是第二层保险，顺带修「上次填的邮箱下次还在」。
function resetGwInstall() {
  gwDomain.value = gwDomainInit()
  gwMail.value = ''
  gwCopied.value = false
}

function copyGwCmd() {
  if (!gwDomainValid.value) {
    return
  }
  const text = gwInstallCmd.value
  const done = () => {
    gwCopied.value = true
    setTimeout(() => { gwCopied.value = false }, 2000)
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => { fallbackGwCopy(text); done() })
  } else {
    fallbackGwCopy(text)
    done()
  }
}

function fallbackGwCopy(text) {
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

// [S30] 管理员群发公告：站点 bot → 关注名单。分批调用直到 done，前端累计进度
const notifyBroadcastShow = ref(false)
const broadcastLoading = ref(false)
const broadcastSending = ref(false)
const broadcastCount = ref(0)
const broadcastText = ref('')
const broadcastSent = ref(0)
const broadcastFailed = ref(0)
const broadcastPercent = computed(() => {
  if (!broadcastCount.value) return 0
  return Math.min(100, Math.round((broadcastSent.value + broadcastFailed.value) / broadcastCount.value * 100))
})

// 卡片行先显示关注人数（非管理员 403 静默忽略，行内落到「暂无关注用户」文案）
function loadBroadcastCount() {
  notifyBroadcastCount().then((data) => {
    broadcastCount.value = Number(data?.count || 0)
  }).catch(() => {
  })
}

loadBroadcastCount()

// [S30] 与官方各行一致：本地赋值立即开弹窗，人数直接用进页面时缓存的值；
// 点开的同时后台静默刷新人数，避免「点击 → 等接口 → 才弹窗」的慢半拍
function openBroadcast() {
  if (broadcastCount.value > 0) {
    notifyBroadcastShow.value = true
    notifyBroadcastCount().then((data) => {
      const count = Number(data?.count || 0)
      if (count > 0) broadcastCount.value = count
    }).catch(() => {
      // 拦截器已弹出具体原因；弹窗已开，保持不动
    })
    return
  }
  // 本地人数为 0（首次没取到或确实无人关注）时才等接口，命中空名单给提示
  broadcastLoading.value = true
  notifyBroadcastCount().then((data) => {
    broadcastCount.value = Number(data?.count || 0)
    if (!broadcastCount.value) {
      ElMessage({
        message: t('notifyBroadcastEmpty'),
        type: 'warning',
        plain: true
      })
      return
    }
    notifyBroadcastShow.value = true
  }).catch(() => {
    // 拦截器已弹出具体原因
  }).finally(() => {
    broadcastLoading.value = false
  })
}

function resetBroadcast() {
  broadcastText.value = ''
  broadcastSent.value = 0
  broadcastFailed.value = 0
}

async function sendBroadcast() {
  const text = broadcastText.value.trim()
  if (!text) return
  // 二次确认：删错名单/发错人代价不小，且消息发出去收不回
  try {
    await ElMessageBox.confirm(t('notifyBroadcastConfirm', { n: broadcastCount.value }), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    })
  } catch (e) {
    return
  }
  broadcastSending.value = true
  broadcastSent.value = 0
  broadcastFailed.value = 0
  let offset = 0
  try {
    while (true) {
      const data = await notifyBroadcastSend(text, offset)
      broadcastSent.value += Number(data?.sent || 0)
      broadcastFailed.value += Number(data?.failed || 0)
      offset = Number(data?.nextOffset || 0)
      if (data?.done) break
    }
    ElMessage({
      message: t('notifyBroadcastDone', { s: broadcastSent.value, f: broadcastFailed.value }),
      type: broadcastFailed.value ? 'warning' : 'success',
      plain: true,
      duration: 5000
    })
    notifyBroadcastShow.value = false
  } catch (e) {
    // 拦截器已弹出具体原因（如站点 bot 未配置），进度条停在当前位置便于理解
  } finally {
    broadcastSending.value = false
  }
}

function forwardEmailSave() {
  const form = {
    forwardStatus: forwardStatus.value,
    forwardEmail: forwardEmail.value + ''
  }
  editSetting(form)
}

function webhookSave() {
  let retry = Number(webhookRetry.value)
  if (isNaN(retry) || retry < 0) {
    retry = 0
  }
  const url = toOssDomain(webhookUrl.value.trim())
  if (isIpUrl(url)) {
    ElMessage({
      message: t('webhookIpNotSupported'),
      type: 'warning',
      plain: true
    })
    return
  }
  const form = {
    webhookStatus: webhookStatus.value,
    webhookUrl: url,
    webhookRetry: retry,
    webhookSecret: webhookSecret.value.trim()
  }
  editSetting(form)
}


function ruleEmailSave() {
  const form = {
    ruleEmail: ruleEmail.value + '',
    ruleType: ruleType.value
  }
  editSetting(form)
}

function doOpacityChange() {
  if (!settingReady.value) return
  const form = {}
  form.loginOpacity = loginOpacity.value
  editSetting(form, true)
}

function resetEmailPrefix() {
  minEmailPrefix.value = setting.value.minEmailPrefix
  emailPrefixFilter.value = setting.value.emailPrefixFilter
}

function resetBlackList() {
  blackListForm.value.blackFrom = setting.value.blackFrom ? setting.value.blackFrom.split(',') : []
  blackListForm.value.blackContent = setting.value.blackContent ? setting.value.blackContent.split(',') : []
  blackListForm.value.blackSubject = setting.value.blackSubject ? setting.value.blackSubject.split(',') : []
}

function resetAutoClean() {
  autoCleanDays.value = setting.value.autoCleanDays ?? 0
  autoCleanExclude.value = setting.value.autoCleanExclude
      ? setting.value.autoCleanExclude.split(',').filter(Boolean)
      : []
  autoCleanDeletedOnly.value = Number(setting.value.autoCleanDeletedOnly) === 1
}

function resetAiCodeFilter() {
  aiCodeFilter.value = setting.value.aiCodeFilter ? setting.value.aiCodeFilter.split(',') : []
}

function saveEmailPrefix() {
  const form = {}
  form.minEmailPrefix = minEmailPrefix.value
  form.emailPrefixFilter = emailPrefixFilter.value
  editSetting(form, true)
}

function saveAutoClean() {
  editSetting({
    autoCleanDays: autoCleanDays.value,
    autoCleanExclude: autoCleanExclude.value.join(','),
    autoCleanDeletedOnly: autoCleanDeletedOnly.value ? 1 : 0
  }, true)
}

// 自研定制：垃圾邮件自动清理（与自动清理完全独立，互不影响）
function openSpamClean() {
  spamCleanDays.value = Number(setting.value.spamCleanDays) || 0
  spamCleanShow.value = true
}

function resetSpamClean() {
  spamCleanDays.value = Number(setting.value.spamCleanDays) || 0
}

function saveSpamClean() {
  editSetting({spamCleanDays: Number(spamCleanDays.value) || 0}, true)
}

function saveAiCodeFilter() {
  editSetting({aiCodeFilter: aiCodeFilter.value + ''})
}

const opacityChange = debounce(doOpacityChange, 1000, {
  leading: false,
  trailing: true
})

function saveBlackList() {

  let form = {
    blackContent: blackListForm.value.blackContent + '',
    blackSubject: blackListForm.value.blackSubject + '',
    blackFrom: blackListForm.value.blackFrom + ''
  }

  settingLoading.value = true

  setBlackList(form).then(() => {
    getSettings()
    ElMessage({
      message: t('setSuccess'),
      type: "success",
      plain: true
    })
    blackFormShow.value = false;
  }).finally(() => {
    settingLoading.value = false;
  })
}

function banEmailAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  blackListForm.value.blackFrom.splice(blackListForm.value.blackFrom.length - 1, 1)

  emails.forEach(email => {
    if ((isEmail(email) || isDomain(email)) && !blackListForm.value.blackFrom.includes(email)) {
      blackListForm.value.blackFrom.push(email)
    }
  })
}

function autoCleanExcludeAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  autoCleanExclude.value.splice(autoCleanExclude.value.length - 1, 1)

  emails.forEach(email => {
    if (isEmail(email) && !autoCleanExclude.value.includes(email)) {
      autoCleanExclude.value.push(email)
    }
  })
}

function aiCodeFilterAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  aiCodeFilter.value.splice(aiCodeFilter.value.length - 1, 1)

  emails.forEach(email => {
    if ((isEmail(email) || isDomain(email)) && !aiCodeFilter.value.includes(email)) {
      aiCodeFilter.value.push(email)
    }
  })
}


function delBackground() {
  ElMessageBox.confirm(t('delBackgroundConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    deleteBackground().then(() => {
      backgroundUrl.value = ''
      setting.value.background = null
      ElMessage({
        message: t('delSuccessMsg'),
        type: "success",
        plain: true
      })
    })
  })
}

function openOauthSetting(p) {
  oauthForm.key = p.key
  oauthForm.label = p.label
  oauthForm.clientId = setting.value[p.key + 'ClientId'] || ''
  oauthForm.clientSecret = setting.value[p.key + 'ClientSecret'] || ''
  oauthForm.switch = setting.value[p.key + 'Switch'] ?? 1
  oauthSettingShow.value = true
}

function saveOauth() {
  const form = {}
  form[oauthForm.key + 'ClientId'] = oauthForm.clientId
  form[oauthForm.key + 'ClientSecret'] = oauthForm.clientSecret
  form[oauthForm.key + 'Switch'] = oauthForm.switch
  editSetting(form)
}

function saveTurnstileKey() {
  const settingForm = {}
  settingForm.siteKey = turnstileForm.siteKey
  settingForm.secretKey = turnstileForm.secretKey
  editSetting(settingForm)
}

async function saveBackground() {

  if (settingLoading.value) return

  let image = ''

  if (localUpShow.value) {
    image = await fileToBase64(backgroundFile, true);
  } else {
    if (backgroundUrl.value && !backgroundUrl.value.startsWith('http')) {
      ElMessage({
        message: t('imageLinkErrorMsg'),
        type: "error",
        plain: true
      })
      return
    }
    image = backgroundUrl.value
  }
  settingLoading.value = true

  setBackground(image).then(key => {
    setting.value.background = key
    showSetBackground.value = false
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
    localUpShow.value = false
    backgroundImage.value = ''
  }).finally(() => {
    settingLoading.value = false
  })

}

function openSetBackground() {
  showSetBackground.value = true
}

function openCut() {
  const doc = document.createElement('input')
  doc.setAttribute('type', 'file')
  doc.setAttribute('accept', 'image/*')
  doc.click()
  doc.onchange = async (e) => {
    backgroundFile = e.target.files[0]
    backgroundImage.value = URL.createObjectURL(e.target.files[0])
    localUpShow.value = true
  }
}

function openResendForm() {
  resendTokenFormShow.value = true
}

function openBlackListForm() {
  blackFormShow.value = true
}

function openAiCodeFilter() {
  aiCodeFilterShow.value = true
}

function saveResendToken() {
  const settingForm = {
    resendTokens: {}
  }
  const domain = resendTokenForm.domain.slice(1)
  settingForm.resendTokens[domain] = resendTokenForm.token
  editSetting(settingForm)
}

function backupSetting() {
  const settingForm = {...setting.value}
  delete settingForm.resendTokens
  delete settingForm.siteKey
  delete settingForm.secretKey
  backup = JSON.stringify(setting.value)
}

function cleanResendTokenForm() {
  resendTokenForm.token = ''
}

function beforeChange() {
  if (!settingReady.value || settingLoading.value) return false
  backupSetting()
  return true
}

function change(e) {
  if (!settingReady.value) return
  const settingForm = {...setting.value}
  delete settingForm.siteKey
  delete settingForm.secretKey
  delete settingForm.s3AccessKey
  delete settingForm.s3SecretKey
  delete settingForm.tgBotToken
  delete settingForm.resendTokens
  editSetting(settingForm, false)
}

function changeField(key, value) {
  if (!settingReady.value || settingLoading.value) return
  setting.value[key] = value
  editSetting({[key]: value}, false)
}

function saveTitle() {
  editSetting({title: editTitle.value})
}

function jump(href) {
  const doc = document.createElement('a')
  doc.href = href
  doc.target = '_blank'
  doc.click()
}

function editSetting(settingForm, refreshStatus = true) {
  if (settingLoading.value) return
  settingLoading.value = true

  settingSet(settingForm).then(() => {
    settingLoading.value = false
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
    if (setting.value.manyEmail === 1) {
      accountStore.currentAccountId = userStore.user.account.accountId;
    }
    // 自研定制：把「无人收件」开关同步到全局 store，侧栏入口据此实时显示/隐藏，无需刷新页面。
    // 同时写入 localStorage 作为跨标签页广播通道（storage 事件只会在其它标签页触发）。
    if ('noRecipient' in setting.value) {
      settingStore.settings.noRecipient = Number(setting.value.noRecipient)
      localStorage.setItem('cm-no-recipient', String(settingStore.settings.noRecipient))
    }
    if (refreshStatus) {
      getSettings()
    }
    editTitleShow.value = false
    resendTokenFormShow.value = false
    turnstileShow.value = false
    tgSettingShow.value = false
    thirdEmailShow.value = false
    webhookShow.value = false
    forwardRulesShow.value = false
    addVerifyCountShow.value = false
    regVerifyCountShow.value = false
    loginVerifyCountShow.value = false
    noticePopupShow.value = false
    addS3Show.value = false
    emailPrefixShow.value = false
    aiCodeFilterShow.value = false
    autoCleanShow.value = false
    spamCleanShow.value = false
    oauthSettingShow.value = false
  }).catch((e) => {
    loginOpacity.value = setting.value.loginOpacity
    setting.value = {...setting.value, ...JSON.parse(backup)}
  }).finally(() => {
    settingLoading.value = false
    clearS3Loading.value = false
  })
}
</script>

<style scoped lang="scss">
.settings-container {
  height: 100%;
  overflow: hidden;
  background: var(--extra-light-fill) !important;
  position: relative;

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    z-index: 2;
    width: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }

  .loading-show {
    transition: all 200ms ease 200ms;
    opacity: 1;
  }

  .loading-hide {
    transition: var(--loading-hide-transition);
    pointer-events: none;
    opacity: 0;
  }
}

.scroll {
  width: 100%;
  min-height: 100%;

  :deep(.el-scrollbar__view) {
    height: 100%;
  }

  .scroll-body {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
}

.card-grid {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  gap: 20px;
  @media (max-width: 1023px) {
    gap: 15px;
    padding: 15px;
  }
}

.background {
  width: 249px;
  height: 140px;
  border-radius: 4px;
  border: 1px solid var(--light-border);
  @media (max-width: 500px) {
    width: 160px;
    height: 90px;
  }
}

.background-btn {
  display: flex;
  gap: 10px;
  flex-direction: column;
}

.bot-verify-select {
  margin-left: 10px;
}

.settings-card {
  background-color: var(--el-bg-color);
  border-radius: 6px;
  border: 1px solid var(--el-border-color);
  transition: all 300ms;
  overflow: hidden;
  max-width: 900px;
  width: 100%;
}


.card-title {
  font-size: 15px;
  font-weight: bold;
  padding: 15px 20px 12px;
  border-bottom: 1px solid var(--el-border-color);
}

.card-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.setting-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  font-weight: normal;

  > div:first-child {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  > div:last-child {
    display: grid;
    grid-template-columns: 1fr auto;
    justify-items: flex-end;
    font-weight: normal;
  }
}

.oauth-icon {
  width: 22px !important;
  height: 22px !important;
  min-width: 22px;
  flex-shrink: 0;
  margin-right: 2px;
}

.title-icon.warning {
  position: relative;
  top: 2px;
  cursor: pointer;
  margin-left: 2px;
}

.warning {
  margin-left: 2px;
  color: grey;
  cursor: pointer;
}

.cropper {
  border-radius: 4px;
  border: 1px solid #D4D7DE;
  height: 397px;
  width: 705px;
  @media (max-width: 767px) {
    width: calc(100vw - 60px);
    height: calc((100vw - 60px) * 9 / 16);
  }
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.webhook-footer-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.webhook-format-title {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  color: var(--el-color-primary);
  font-size: 13px;
}

.webhook-format-icon {
  transition: transform 0.2s;
  &.open {
    transform: rotate(180deg);
  }
}

.notice-popup-item {
  margin-top: 15px;
}

.notice-line-item {
  margin-top: 15px;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 15px;

  > * {
    width: 100%;
  }

  @media (max-width: 840px) {
    grid-template-columns: 1fr 1fr;
  }
  @media (max-width: 580px) {
    grid-template-columns: 1fr;
  }
}

.background-url {
  width: min(calc(100vw - 70px), 500px);
}


:deep(.el-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.resend-table.el-dialog) {
  min-height: 300px;
  width: 500px !important;
  @media (max-width: 540px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.notice-popup.el-dialog) {
  min-height: 300px;
  width: 820px !important;
  @media (max-width: 860px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.resend-table .el-dialog__header) {
  padding-bottom: 5px;
}

:deep(.el-table__inner-wrapper:before) {
  background: var(--el-bg-color);
}

:deep(.cut-dialog.el-dialog) {
  width: fit-content !important;
  height: fit-content !important;
}


:deep(.forward-dialog.el-dialog) {
  width: 500px !important;
  @media (max-width: 540px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.forward-dialog {
  .forward-head {
    display: flex;
    align-items: center;

    .forward-set-title {
      top: 1px;
      padding-right: 5px;
      position: relative;
      font-size: 16px;
      font-weight: bold;;
    }
  }
}

.error-image {
  background: var(--light-ill);
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.cut-button {
  padding-top: 15px;
  width: 100%;
  display: flex;
  justify-content: space-between;

  .el-button {
    width: fit-content;
  }
}

.bot-verify {
  display: grid;
  grid-template-columns: 1fr auto;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;

  span {
    display: flex;
    align-items: center;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .el-button {
    width: 48px;
    margin: 0 0 0 10px;
  }
}

.forward-set-body {
  display: flex;
  flex-direction: column;

  .el-switch {
    align-self: end;
  }

  > *:nth-child(-n+2) {
    margin-bottom: 15px;
  }

  .tg-msg-label {
    margin-top: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    .el-select {
      width: v-bind(tgMsgLabelWidth);
    }
    .el-input-number {
      width: 120px;
    }
  }

  .webhook-format pre {
    margin: 8px 0 0;
    padding: 10px;
    font-size: 12px;
    line-height: 1.5;
    overflow-x: auto;
    border-radius: 4px;
    background: var(--el-fill-color-light);
  }

  // [S30] 群发公告：名单人数行 + 进度条间距，弱化色跟随 Element Plus 主题变量
  .broadcast-audience {
    margin-bottom: 10px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  .el-progress {
    margin-top: 12px;
  }
}

.forward {
  span {
    display: flex;
    align-items: center;
  }

  .el-button {
    width: 48px;
    margin: 0 0 0 10px;
  }
}

.opt-button {
  width: fit-content !important;
}

.email-prefix {
  display: flex;
  justify-content: space-between;
}

.prefix-filter {
  display: flex;
  flex-direction: column;
}

.s3-button {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 15px;

  .el-button {
    margin-left: 0;
  }
}

.r2domain {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;

  .storage-type {
    margin-right: 3px;
  }

  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .el-button {
    width: 48px;
    margin: 0 0 0 10px;
  }
}

.personalized {
  align-items: start;

  > div:last-child {
    display: flex;
    justify-content: end;

    .el-button {
      margin-left: 10px;
      margin-top: 0;
    }
  }
}

.dialog-input {
  margin-bottom: 15px;
}

.force-path-style {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  .force-path-style-left {
    padding-left: 2px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 5px;
  }
}

.concerning-item {
  display: flex;
  align-items: center;

  .community {
    display: flex;
    row-gap: 10px;
    flex-wrap: wrap;
  }

  :deep(.el-button) {
    padding: 0 10px;
    font-weight: normal;

    i {
      font-size: 22px;
    }
  }

  > span:first-child {
    font-weight: normal;
    padding-right: 20px;
    white-space: nowrap;
  }
}

.email-title {
  font-weight: normal !important;
  display: grid;
  gap: 10px;
  grid-template-columns: 1fr auto;
  align-items: center;

  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .el-button {
    margin-top: 0;
  }
}

.token-item {
  padding-top: 0;

  div:last-child {
    font-weight: normal;
  }
}

form .el-button {
  margin-top: 10px;
  width: 100%;
}

.el-switch {
  height: 28px;
}


:deep(.el-button--small) {
  margin-top: 2px !important;
  margin-bottom: 2px !important;
  height: 24px;
}

:deep(.el-select__wrapper) {
  min-height: 28px;
}

/* [S46] 生成网关安装命令弹窗（样式随组件搬到系统设置；弹窗内元素仍带 data-v，scoped 可命中） */
.gw-install {
  line-height: 1.6;

  .gw-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;

    @media (max-width: 767px) {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
    }
  }

  .gw-label {
    width: 90px;
    flex-shrink: 0;
    font-size: 13px;
    color: var(--el-text-color-regular);
  }

  .gw-site {
    flex: 1;
    min-width: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    color: var(--el-text-color-secondary);
    word-break: break-all;
  }

  .gw-state {
    margin: -6px 0 12px 102px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--el-text-color-placeholder);

    &.is-dirty {
      color: var(--el-color-warning);
    }

    &.is-saved {
      color: var(--el-color-success);
    }

    @media (max-width: 767px) {
      margin-left: 0;
    }
  }

  .gw-auto {
    flex: 0 0 auto;
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }

  .gw-note {
    margin: -4px 0 12px 102px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--el-text-color-placeholder);

    @media (max-width: 767px) {
      margin-left: 0;
    }
  }

  .gw-err {
    margin: -6px 0 12px 102px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--el-color-danger);

    @media (max-width: 767px) {
      margin-left: 0;
    }
  }

  .gw-cmd {
    margin-bottom: 14px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--el-fill-color-light);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.9;
    color: var(--el-text-color-primary);
    white-space: pre-wrap;
    word-break: break-word;
    user-select: all;
  }

  .gw-tips {
    padding: 12px 14px;
    border-radius: 8px;
    background: var(--el-fill-color-light);
  }

  /* [S55] 上报密钥块：与命令块（灰底）区分开，浅蓝底表示「这是凭证，要保管」 */
  .gw-key {
    margin-bottom: 14px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--el-color-primary-light-7);
    background: var(--el-color-primary-light-9);
  }

  .gw-key-main {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .gw-key-label {
    flex: none;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .gw-key-val {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    color: var(--el-text-color-primary);
  }

  .gw-key-note {
    margin-top: 5px;
    font-size: 11px;
    line-height: 1.6;
    color: var(--el-text-color-secondary);
  }


  .gw-tip {
    position: relative;
    padding-left: 13px;
    font-size: 12px;
    line-height: 1.8;
    color: var(--el-text-color-secondary);
    white-space: normal;

    & + .gw-tip {
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
}


/* [S55] 卡片第二行：在线状态。点用形状区分（实心=有上报，空心=从未） */
.gw-hb {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  white-space: normal;
  word-break: break-word;

  &.is-on {
    color: var(--el-color-success);
  }

  &.is-off,
  &.is-never {
    color: var(--el-text-color-placeholder);
  }
}

.gw-hb-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.gw-hb.is-never .gw-hb-dot {
  background: transparent;
  border: 1px solid currentColor;
}

/* [S55] 状态弹窗内部 */
.gw-hb-panel {
  padding-bottom: 4px;
}

.gw-hb-head {
  display: flex;
  align-items: center;
  gap: 8px;

  .gw-hb-dot {
    width: 9px;
    height: 9px;
  }
}

.gw-hb-head.is-on .gw-hb-title {
  color: var(--el-color-success);
}

.gw-hb-head.is-off .gw-hb-title,
.gw-hb-head.is-never .gw-hb-title {
  color: var(--el-text-color-secondary);
}

.gw-hb-title {
  font-size: 15px;
  font-weight: 500;
}

.gw-hb-sub {
  margin: 4px 0 16px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.gw-hb-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.gw-hb-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 13px;
}

.gw-hb-key {
  flex: none;
  width: 76px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.gw-hb-val {
  color: var(--el-text-color-primary);

  &.is-ok {
    color: var(--el-color-success);
  }

  &.is-warning {
    color: var(--el-color-warning);
  }

  &.is-danger {
    color: var(--el-color-danger);
  }

  &.is-none {
    color: var(--el-text-color-placeholder);
  }
}

.gw-hb-flag {
  padding: 0 5px;
  border-radius: 3px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);

  &.is-warn {
    color: var(--el-color-warning);
    background: var(--el-color-warning-light-9);
  }
}
</style>

<style>
.el-popper.is-dark {
}

/* [S55] 安装弹窗内容变多（多了密钥块），窄屏会顶出视口。
   限高 + body 内部滚动，页头页脚固定；margin-top 与限高之和控制在 90vh 内。 */
.gw-install-dialog {
  margin-top: 10vh !important;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.gw-install-dialog .el-dialog__header,
.gw-install-dialog .el-dialog__footer {
  flex: none;
}

.gw-install-dialog .el-dialog__body {
  flex: 1;
  overflow-y: auto;
}
</style>
