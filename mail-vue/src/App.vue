<template>
  <el-config-provider :locale="settingStore.lang === 'zh' ? zhCn : null">
    <router-view />
  </el-config-provider>
</template>
<script setup>
import { useI18n } from "vue-i18n";
import { onBeforeUnmount, onMounted, watch } from "vue";
import {useSettingStore} from "@/store/setting.js";
const settingStore = useSettingStore()
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import('@/icons/index.js')
import { useUiStore } from "@/store/ui.js";
import { applyTheme, isSystemDark, systemThemeQuery } from "@/utils/theme-utils.js";
const { locale } = useI18n()
locale.value = settingStore.lang
watch(() => settingStore.lang, () => locale.value = settingStore.lang)

// 自研：主题「跟随系统」——系统切换深/浅色时实时同步
const uiStore = useUiStore()
let themeQuery = null

function syncSystemTheme() {
  if (!uiStore.followSystem) return
  const dark = isSystemDark()
  applyTheme(dark)
  uiStore.dark = dark
}

onMounted(() => {
  themeQuery = systemThemeQuery()
  // addListener 兜底旧版 Safari
  if (themeQuery.addEventListener) {
    themeQuery.addEventListener('change', syncSystemTheme)
  } else if (themeQuery.addListener) {
    themeQuery.addListener(syncSystemTheme)
  }
  // 上次会话到现在系统主题可能已变化，进入时先对齐一次
  syncSystemTheme()
})

onBeforeUnmount(() => {
  if (!themeQuery) return
  if (themeQuery.removeEventListener) {
    themeQuery.removeEventListener('change', syncSystemTheme)
  } else if (themeQuery.removeListener) {
    themeQuery.removeListener(syncSystemTheme)
  }
})
</script>
