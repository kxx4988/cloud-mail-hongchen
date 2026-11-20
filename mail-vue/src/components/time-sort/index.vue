<template>
  <div class="icon-btn" @click="emit('change')">
    <Icon class="icon" :icon="sortIcon" :width="size" :height="size"/>
    <span class="icon-label">{{ label }}</span>
  </div>
</template>

<script setup>
// [S43] 排序按钮公共组件：收件箱 / 已发送 / 回收站 / 垃圾邮件 / 全部邮件 五页共用。
// 以前每页各写一份，图标尺寸 18 / 28 不统一（用户 2026-11-19 截图：全部邮件页是大的、
// 其余四页是小的，「看着很别扭」）。现在只留这一处，图标尺寸、图标名、文案都在这里改，
// 五个页面同时生效，不再出现「改一处漏几处」。
import {computed} from 'vue';
import {Icon} from '@iconify/vue';
import {useI18n} from 'vue-i18n';

const props = defineProps({
  timeSort: {type: Number, default: 0},
  size: {type: [Number, String], default: 28}
});
const emit = defineEmits(['change']);
const {t} = useI18n();

const sortIcon = computed(() => props.timeSort === 0
  ? 'material-symbols-light:timer-arrow-down-outline'
  : 'material-symbols-light:timer-arrow-up-outline');
const label = computed(() => props.timeSort === 0 ? t('latestFirst') : t('oldestFirst'));
</script>
