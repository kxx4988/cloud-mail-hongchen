// 构建前强制检查：把所有 i18n 消息用 vue-i18n 运行时编译一遍。
// 背景（S37 事故）：消息里出现裸 @（如 name@example.com）会被当成「链接消息」语法，
// 运行时报 SyntaxError: 10，且只在那条文案被渲染时炸掉整个组件/弹窗，极难定位。
// 正确写法：把 @ 写成 {'@'}（本文件会拦下来）。同理也会拦下其它语法错误（未闭合花括号、| 复数非法用法等）。
// 用法：由 package.json 的 prebuild 钩子自动执行；也可手动 `node scripts/check-i18n.mjs`。
import { createI18n } from 'vue-i18n'
import zh from '../src/i18n/zh.js'
import en from '../src/i18n/en.js'

const errors = []
const origError = console.error
console.error = (...args) => { errors.push(args.map(String).join(' ')) }

function flatten(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, prefix + k + '.', out)
    else out.push([prefix + k, v])
  }
  return out
}

const problems = []
const sampleParams = { e: 'X', n: 1, c: 'X', r: 'X', u: 'X', m: 1, total: 1, size: '1MB', days: 1 }

for (const [locale, messages] of [['zh', zh], ['en', en]]) {
  const i18n = createI18n({
    legacy: true,
    locale,
    messages: { [locale]: messages },
    missingWarn: false,
    fallbackWarn: false
  })
  for (const [key, value] of flatten(messages)) {
    if (typeof value !== 'string') continue
    const before = errors.length
    try {
      i18n.global.t(key, sampleParams)
    } catch (e) {
      problems.push(`[${locale}] ${key} 抛异常：${e.message}\n    文案：${value}`)
      continue
    }
    if (errors.length > before) {
      // 排除「正常返回但伴随无关警告」的情况：只要编译报错就算失败
      const msg = errors.slice(before).join('\n    ')
      if (/compilation error|SyntaxError|Invalid|Unexpected|Unterminated/i.test(msg)) {
        problems.push(`[${locale}] ${key} 消息语法错误\n    文案：${value}\n    ${msg}`)
      }
    }
  }
}

console.error = origError

if (problems.length) {
  console.error('\n✖ i18n 消息语法检查未通过（构建已中止）：\n')
  problems.forEach(p => console.error('  - ' + p + '\n'))
  console.error('  提示：消息里的 @ 必须写成 {\'@\'}，例如 name{\'@\'}example.com\n')
  process.exit(1)
}
console.log('✔ i18n 消息语法检查通过（zh/en 全量编译无错误）')
