<template>
  <div class="theme-options" role="radiogroup" :aria-label="t('themeStyle')">
    <label
      v-for="option in themeOptions"
      :key="option.value"
      class="theme-card"
      :class="{ 'is-selected': isSelected(option.value) }"
    >
      <span class="theme-preview" :class="{ 'preview-dark': option.value === 'dark', 'preview-auto': option.value === 'auto' }" aria-hidden="true">
        <template v-if="option.value === 'auto'">
          <span class="preview-half preview-half-light">
            <span class="preview-sidebar"><i/><i/><i/></span>
            <span class="preview-main"><i/><i/><i/></span>
          </span>
          <span class="preview-half preview-half-dark">
            <span class="preview-sidebar"><i/><i/><i/></span>
            <span class="preview-main"><i/><i/><i/></span>
          </span>
        </template>
        <template v-else>
          <span class="preview-sidebar"><i/><i/><i/></span>
          <span class="preview-main"><i/><i/><i/></span>
        </template>
      </span>
      <span class="theme-caption">
        <span>{{ t(option.label) }}</span>
        <input
          type="radio"
          :name="groupName"
          :value="option.value"
          :checked="isSelected(option.value)"
          @change="selectTheme(option.value, $event)"
        >
      </span>
    </label>
  </div>
</template>

<script setup>
import {useId} from 'vue'
import {useI18n} from 'vue-i18n'
import {useUiStore} from '@/store/ui.js'
import {applyTheme, currentThemeMode, isSystemDark, THEME_MODE} from '@/utils/theme-utils.js'

const {t} = useI18n()
const uiStore = useUiStore()
const groupName = useId()
const themeOptions = [
  {label: 'lightTheme', value: THEME_MODE.LIGHT},
  {label: 'darkTheme', value: THEME_MODE.DARK},
  {label: 'autoTheme', value: THEME_MODE.AUTO},
]

function isSelected(value) {
  return currentThemeMode(uiStore.dark, uiStore.followSystem) === value
}

function selectTheme(value, event) {
  const bounds = event.currentTarget.closest('.theme-card')?.getBoundingClientRect()
  const origin = {
    x: bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2,
    y: bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2,
  }
  if (value === THEME_MODE.AUTO) {
    uiStore.followSystem = true
    changeDark(isSystemDark(), origin)
  } else {
    uiStore.followSystem = false
    changeDark(value === THEME_MODE.DARK, origin)
  }
}

function changeDark(nextIsDark, origin) {
  if (nextIsDark === uiStore.dark) {
    applyTheme(nextIsDark)
    return
  }

  const root = document.documentElement
  const apply = () => {
    applyTheme(nextIsDark)
    uiStore.dark = nextIsDark
  }

  if (!document.startViewTransition) {
    apply()
    return
  }

  const endRadius = Math.hypot(
    Math.max(origin.x, window.innerWidth - origin.x),
    Math.max(origin.y, window.innerHeight - origin.y)
  )
  root.setAttribute('data-theme-to', nextIsDark ? 'dark' : 'light')
  root.style.setProperty('--vt-x', `${origin.x}px`)
  root.style.setProperty('--vt-y', `${origin.y}px`)
  root.style.setProperty('--vt-end-radius', `${endRadius + 10}px`)
  const transition = document.startViewTransition(apply)
  transition.finished.finally(() => root.removeAttribute('data-theme-to'))
}
</script>

<style scoped lang="scss">
.theme-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  width: 100%;
  max-width: 540px;

  @media (max-width: 767px) {
    gap: 10px;
    max-width: 100%;
  }
}

.theme-card {
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  cursor: pointer;

  &:hover,
  &.is-selected {
    border-color: var(--el-color-primary);
  }

  &.is-selected {
    box-shadow: 0 0 0 1px var(--el-color-primary);
  }

  &:has(input:focus-visible) {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 3px;
  }
}

.theme-preview {
  display: flex;
  aspect-ratio: 1.6;
  overflow: hidden;
  border: 1px solid #dfe1e5;
  border-radius: 4px;
  background: #ffffff;

  i {
    display: block;
    height: 6px;
    border-radius: 2px;
    background: #e2e4e8;
  }

  .preview-sidebar {
    display: grid;
    align-content: start;
    gap: 8px;
    width: 28%;
    padding: 12px 6px;
    background: #f0f1f3;

    i:first-child {
      background: #91caff;
    }
  }

  .preview-main {
    display: grid;
    flex: 1;
    align-content: start;
    gap: 12px;
    padding: 12px;

    i:first-child {
      width: 55%;
    }
  }

  &.preview-dark {
    background: #202124;
    border-color: #45474b;

    i {
      background: #505359;
    }

    .preview-sidebar {
      background: #303236;

      i:first-child {
        background: #409eff;
      }
    }
  }

  // 跟随系统：左半浅色、右半深色，拼成一张对比预览
  &.preview-auto {
    background: #ffffff;
    align-items: stretch;

    .preview-half {
      display: flex;
      flex: 1;
      min-width: 0;
      background: #ffffff;
    }

    .preview-half-dark {
      background: #202124;
      border-left: 1px solid #45474b;

      i {
        background: #505359;
      }

      .preview-sidebar {
        background: #303236;

        i:first-child {
          background: #409eff;
        }
      }
    }
  }
}

.theme-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
  padding-top: 4px;
  font-size: 14px;
  color: var(--el-text-color-primary);

  input {
    flex-shrink: 0;
    margin: 0;
    accent-color: var(--el-color-primary);
    cursor: pointer;
  }
}
</style>
