#!/usr/bin/env node
/**
 * Workers AI 验证码提取模型体检
 *
 * 用途：合并官方版本后 / 换模型前，确认 ai-service.js 当前用的模型还能正常工作。
 * 只读操作：只发推理请求 + 读本地 wrangler 配置，不写任何线上资源。
 *
 * 用法：
 *   node tools/check-ai-model.mjs                          # 测 wrangler.toml 里当前配置的模型
 *   node tools/check-ai-model.mjs @cf/xxx/候选模型          # 测指定模型
 *   node tools/check-ai-model.mjs @cf/xxx/a @cf/yyy/b      # 一次测多个
 *
 * 凭证（按顺序尝试）：
 *   1. 环境变量 CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
 *   2. ~/Library/Preferences/.wrangler/config/default.toml   (macOS)
 *   3. ~/.config/.wrangler/config/default.toml               (Linux)
 *   4. %APPDATA%/.wrangler/config/default.toml               (Windows)
 *
 * 为什么需要这个脚本：
 *   CF 会不定期弃用模型（如 2026-11-20 停用 llama-3.1-8b-instruct-fp8）。
 *   直接换模型名有三个坑，这个脚本一次全查出来：
 *     坑1 推理模型会把 max_tokens 全用在思考上 → content 为空、不报错、静默失效
 *     坑2 部分模型会瞎编验证码（把订单号/发票号当验证码）→ 比漏抽更糟
 *     坑3 模型可能已不在官方目录（仅隐藏路由）→ 随时消失
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = path.resolve(__dirname, '..');
const AI_SERVICE = path.join(WORKER_DIR, 'src/service/ai-service.js');
const WRANGLER_TOML = path.join(WORKER_DIR, 'wrangler.toml');

// ───────────────────────────────────────────── 凭证

function readWranglerConfig() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    path.join(home, 'Library/Preferences/.wrangler/config/default.toml'),
    path.join(home, '.config/.wrangler/config/default.toml'),
    path.join(process.env.APPDATA || '', '.wrangler/config/default.toml'),
    path.join(home, '.wrangler/config/default.toml')
  ];
  for (const p of candidates) {
    if (!p || !fs.existsSync(p)) continue;
    const raw = fs.readFileSync(p, 'utf8');
    const token = raw.match(/^oauth_token = "(.*)"$/m)?.[1];
    if (token) {
      return {
        token,
        refreshToken: raw.match(/^refresh_token = "(.*)"$/m)?.[1] || '',
        expiresAt: raw.match(/^expiration_time = "(.*)"$/m)?.[1] || '',
        path: p
      };
    }
  }
  return null;
}

// OAuth token 有效期很短（通常 1 小时）。合并版本时经常已经过期，
// 这里用 refresh_token 就地换新并写回配置，避免脚本一跑就 401。
async function refreshOAuthToken(cfg) {
  if (!cfg.refreshToken) return cfg.token;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: cfg.refreshToken,
    client_id: '54d11594-84e4-41aa-b438-e81b8fa78ee7' // wrangler 公开 client_id
  });
  const res = await fetch('https://dash.cloudflare.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const j = await res.json().catch(() => ({}));
  if (!j.access_token) return cfg.token; // 刷新失败就退回原 token，让调用方报原始错误

  // 写回配置文件，同时让后续手动 wrangler 命令也能用
  try {
    let raw = fs.readFileSync(cfg.path, 'utf8');
    raw = raw.replace(/^oauth_token = ".*"$/m, `oauth_token = "${j.access_token}"`);
    if (j.refresh_token) raw = raw.replace(/^refresh_token = ".*"$/m, `refresh_token = "${j.refresh_token}"`);
    if (j.expires_in) {
      const exp = new Date(Date.now() + j.expires_in * 1000).toISOString();
      raw = raw.replace(/^expiration_time = ".*"$/m, `expiration_time = "${exp}"`);
    }
    fs.writeFileSync(cfg.path, raw);
  } catch { /* 写不进去也不影响本次调用 */ }

  return j.access_token;
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) ? t - Date.now() < 60_000 : false; // 留 1 分钟余量
}

async function resolveCredentials() {
  if (process.env.CLOUDFLARE_API_TOKEN) {
    let accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId) accountId = await fetchAccountId(process.env.CLOUDFLARE_API_TOKEN);
    if (!accountId) fail('设置了 CLOUDFLARE_API_TOKEN 但无法确定 account_id，请同时设置 CLOUDFLARE_ACCOUNT_ID');
    return { token: process.env.CLOUDFLARE_API_TOKEN, accountId, source: '环境变量 CLOUDFLARE_API_TOKEN' };
  }

  const cfg = readWranglerConfig();
  if (!cfg) {
    fail('找不到凭证。请设置 CLOUDFLARE_API_TOKEN，或先执行一次 `npx wrangler login`。');
  }

  let token = cfg.token;
  let note = '';

  // 过期就先刷新，否则必然 401
  if (isExpired(cfg.expiresAt)) {
    process.stdout.write('  OAuth token 已过期，正在刷新 … ');
    token = await refreshOAuthToken(cfg);
    note = '（已自动刷新）';
    console.log('完成');
  }

  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID || (await fetchAccountId(token));

  // 刷新后仍取不到 account，说明 token 确实失效，再强制刷一次
  if (!accountId) {
    token = await refreshOAuthToken(cfg);
    accountId = await fetchAccountId(token);
    note = '（已强制刷新）';
  }

  if (!accountId) {
    fail('凭证无效。请执行 `npx wrangler login` 重新登录，或设置 CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID。');
  }

  return { token, accountId, source: cfg.path + note };
}

async function fetchAccountId(token) {
  try {
    const res = await fetch('https://api.cloudflare.com/client/v4/accounts?per_page=1', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const j = await res.json();
    return j.result?.[0]?.id || '';
  } catch {
    return '';
  }
}

function fail(msg) {
  console.error('\n✗ ' + msg + '\n');
  process.exit(2);
}

// ───────────────────────────────────────────── 从源码取测试参数

function loadTestParams() {
  if (!fs.existsSync(AI_SERVICE)) fail(`找不到 ${AI_SERVICE}`);

  const src = fs.readFileSync(AI_SERVICE, 'utf8');
  // system prompt：与线上完全一致，避免 prompt 漂移导致测试结论失效
  const system = src.match(/content:\s*'(You extract verification codes[\s\S]*?)'/)?.[1];
  // max_tokens：线上实际值，模型能不能在这个额度内出结果才是关键
  const maxTokens = Number(src.match(/max_tokens:\s*(\d+)/)?.[1] || 96);
  // 代码里的兜底默认模型
  const fallbackModel = src.match(/c\.env\.ai_model\s*\|\|\s*'([^']+)'/)?.[1] || '';

  if (!system) fail('未能从 ai-service.js 提取到 system prompt，请确认该文件结构未变。');
  return { system, maxTokens, fallbackModel };
}

function loadConfiguredModel(fallback) {
  // 优先 wrangler.toml [vars] 里的 ai_model（线上实际生效的那个）
  if (fs.existsSync(WRANGLER_TOML)) {
    const raw = fs.readFileSync(WRANGLER_TOML, 'utf8');
    const m = raw.match(/^\s*ai_model\s*=\s*"([^"]*)"/m);
    if (m && m[1]) return m[1];
  }
  return fallback;
}

// ───────────────────────────────────────────── 用例

// 无验证码的邮件：正确答案一律为空。用来测「会不会瞎编」——最关键的一关。
const NEGATIVE = [
  { d: '订单号', s: '订单确认', b: '您的订单 20241107 已发货，预计 3 日内送达。物流单号 SF1234567890。' },
  { d: '会议通知', s: '会议纪要', b: '各位好，今天下午 3 点开会，地点 201 会议室。请准时参加。' },
  { d: '发票号', s: '发票通知', b: '您的发票已开具，发票号码 88731400，金额 1280.00 元，请查收附件。' },
  { d: '账单金额', s: 'Monthly statement', b: 'Your statement for November is ready. Total due: $1,284.00 by Dec 5.' },
  { d: '电话号码', s: 'Contact update', b: 'Please update your records. Our new support line is 400-820-8820, ext 3021.' },
  { d: '新闻简报', s: 'Weekly digest', b: 'Top stories this week: AI regulation, market rally, and 5 productivity tips.' },
  { d: '物流单号', s: 'Shipment', b: 'Your package tracking number is 7734091822 and will arrive Tuesday.' },
  { d: '年份日期', s: 'Year in review', b: 'Thanks for a great 2026. See you in 2027! Highlights: 12 launches, 48 releases.' }
];

// 有真实验证码的邮件：测「能不能抽对」，也测 token 额度够不够（推理模型会在这全挂）
const POSITIVE = [
  { d: '英文六位', s: 'Your verification code', b: 'Your verification code is 483920. It expires in 10 minutes.', e: '483920' },
  { d: '中文验证码', s: '【某某云】验证码', b: '您好，您正在登录某某云，验证码为 587204，5 分钟内有效。', e: '587204' },
  { d: '字母数字', s: 'Login code', b: 'Your one-time password is K3M7P9. Do not share it.', e: 'K3M7P9' },
  { d: '带干扰数字', s: 'Verify email address', b: 'Order #20241107 created. To confirm, enter code 739104 below. Support: 400-820-8820', e: '739104' }
];

// ───────────────────────────────────────────── 解析（复刻 ai-service.js 的逻辑）

// 与 ai-service.js 的 extractContent 保持一致
function extractContent(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  const resp = result.response;
  if (typeof resp === 'string') return resp;
  if (resp && typeof resp === 'object') {
    return typeof resp.code === 'string' ? JSON.stringify({ code: resp.code }) : '';
  }
  const m = result.choices?.[0]?.message;
  if (m) {
    if (typeof m.content === 'string' && m.content) return m.content;
    if (typeof m.reasoning_content === 'string' && m.reasoning_content) return m.reasoning_content;
  }
  return '';
}

// 与 ai-service.js 的 parseCode 保持一致
function parseCode(content) {
  if (!content || typeof content !== 'string') return '';
  const cands = [
    content,
    content.replace(/```(?:json)?/gi, '').trim(),
    (content.match(/\{[\s\S]*?\}/) || [null])[0]
  ].filter(Boolean);
  for (const c of cands) {
    try {
      const j = JSON.parse(c);
      if (j && typeof j.code === 'string' && j.code.length <= 8 && !/\s/.test(j.code)) return j.code;
    } catch { }
  }
  const m = content.match(/\b\d{4,8}\b/);
  return m ? m[0] : '';
}

function detectShape(result) {
  if (typeof result === 'string') return 'string';
  if (result?.response !== undefined) return typeof result.response === 'object' ? 'response{object}' : 'response{string}';
  if (result?.choices?.[0]?.message) return 'choices.content';
  return '未知';
}

// ───────────────────────────────────────────── 调用

async function callModel(cred, model, system, maxTokens, subject, body) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cred.accountId}/ai/run/${model}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${cred.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Subject: ${subject}\n\n${body}` }
        ],
        temperature: 0,
        max_tokens: maxTokens
      })
    }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const raw = JSON.stringify(json.errors || json);
    // 已弃用：把关键信息提出来，合并版本时最需要看到的就是「哪天停的」
    const dep = raw.match(/deprecated on (\d{4}-\d{2}-\d{2})/i);
    if (dep) return { error: `模型已于 ${dep[1]} 被官方停用`, deprecated: true };
    const notAllowed = raw.match(/not allowed to access ([^\s.]+)/i);
    if (notAllowed) return { error: `账号无权限访问该模型（需付费计划或申请开通）`, noAccess: true };
    const agree = raw.match(/prompt 'agree'/i);
    if (agree) return { error: `该模型需先在控制台同意条款（prompt 'agree'）`, needAgree: true };
    return { error: `HTTP ${res.status}：${raw.slice(0, 120)}` };
  }
  return { result: json.result };
}

async function checkCatalog() {
  try {
    const out = execSync('npx wrangler ai models', {
      cwd: WORKER_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 120000
    });
    return new Set((out.match(/@cf\/[a-zA-Z0-9./_-]+/g) || []).slice());
  } catch {
    return null; // 取不到目录就不做这项判定
  }
}

// 线上实况：最近 N 天实际抽出过多少验证码。
// 这是「CF 悄悄停用」最直接的证据 —— 模型挂了但你没收到通知时，
// 线上会表现为「收到邮件带验证码，但 code 列为空」，看这里的数就能发现。
function queryLiveStats(days = 7) {
  try {
    const sql = `SELECT COUNT(*) AS total, SUM(CASE WHEN code IS NOT NULL AND code != '' THEN 1 ELSE 0 END) AS with_code FROM email WHERE create_time > datetime('now', '-${days} days')`;
    const out = execSync(
      `npx wrangler d1 execute cloud-mail --remote --command "${sql}" --json`,
      { cwd: WORKER_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000 }
    );
    // 输出前面可能有 [WARNING] 等噪音，定位第一个 JSON 数组起始
    const m = out.match(/\[\s*\{/);
    if (!m) return null;
    const j = JSON.parse(out.slice(m.index));
    return j[0]?.results?.[0] || null;
  } catch {
    return null;
  }
}

async function inspectModel(cred, model, params, catalog) {
  const row = {
    model,
    shape: '-',
    fp: 0,
    fpDetail: [],
    hit: 0,
    neurons: 0,
    catalog: catalog ? (catalog.has(model) ? '在册' : '不在册') : '未查',
    verdict: '',
    note: ''
  };

  let totalNeurons = 0;
  let calls = 0;

  for (const c of NEGATIVE) {
    const r = await callModel(cred, model, params.system, params.maxTokens, c.s, c.b);
    if (r.error) {
      row.verdict = '✗ 调用失败';
      row.note = r.error;
      return row;
    }
    calls++;
    totalNeurons += r.result?.usage?.neurons ?? 0;
    row.shape = detectShape(r.result);
    const got = parseCode(extractContent(r.result));
    if (got) {
      row.fp++;
      if (row.fpDetail.length < 2) row.fpDetail.push(`${c.d}→${got}`);
    }
  }

  for (const c of POSITIVE) {
    const r = await callModel(cred, model, params.system, params.maxTokens, c.s, c.b);
    if (r.error) {
      row.verdict = '✗ 调用失败';
      row.note = r.error;
      return row;
    }
    calls++;
    totalNeurons += r.result?.usage?.neurons ?? 0;
    const got = parseCode(extractContent(r.result));
    if (got === c.e) row.hit++;
  }

  row.neurons = calls ? +(totalNeurons / calls).toFixed(2) : 0;

  // 判定顺序很关键：先看「抽不出来」，再看「假阳性」。
  // 推理模型会先把 max_tokens 耗在思考上、content 为空，
  // 此时 parseCode 会从思考片段里抓走订单号，表现为假阳性 ——
  // 根因是 token 不够，不是模型爱瞎编，所以要先报根因。
  if (row.hit === 0) {
    row.verdict = '✗ 抽不出来';
    row.note = `max_tokens=${params.maxTokens} 内无有效输出（推理模型把额度耗在思考上）`;
  } else if (row.fp > 0) {
    row.verdict = '✗ 假阳性';
    row.note = row.fpDetail.join('、');
  } else if (row.hit < POSITIVE.length) {
    row.verdict = '△ 部分通过';
    row.note = `抽对 ${row.hit}/${POSITIVE.length}`;
  } else if (row.catalog === '不在册') {
    row.verdict = '△ 不在目录';
    row.note = '可调用但已不在官方目录，随时可能消失';
  } else {
    row.verdict = '✓ 可用';
    row.note = '';
  }

  return row;
}

// ───────────────────────────────────────────── 主流程

function pad(s, n) {
  // 中文字符占两格
  let w = 0;
  for (const ch of String(s)) w += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 2 : 1;
  return String(s) + ' '.repeat(Math.max(0, n - w));
}

async function main() {
  const args = process.argv.slice(2);
  const params = loadTestParams();
  const cred = await resolveCredentials();

  let models = args.filter(a => a.startsWith('@cf/'));
  let sourceLabel = '命令行指定';
  if (models.length === 0) {
    const configured = loadConfiguredModel(params.fallbackModel);
    if (!configured) fail('wrangler.toml 未配置 ai_model，源码兜底值也未取到。');
    models = [configured];
    sourceLabel = 'wrangler.toml 当前配置';
  }

  console.log('');
  console.log('Workers AI 验证码提取模型体检');
  console.log('─'.repeat(78));
  console.log(`  凭证来源   ${cred.source}`);
  console.log(`  模型来源   ${sourceLabel}`);
  console.log(`  测试参数   max_tokens=${params.maxTokens}、temperature=0（与线上一致）`);
  console.log(`  用例       ${NEGATIVE.length} 个无验证码邮件（测假阳性）+ ${POSITIVE.length} 个有验证码邮件（测抽对）`);
  console.log('');

  const catalog = await checkCatalog();
  if (!catalog) console.log('  （未能获取官方模型目录，跳过在册检查）\n');

  // 线上实况放在最前面：模型能不能调是一回事，线上到底有没有在干活是另一回事
  const live = queryLiveStats(7);
  if (live && live.total !== null) {
    const total = Number(live.total || 0);
    const withCode = Number(live.with_code || 0);
    console.log(`  线上近 7 天  收信 ${total} 封，其中抽出验证码 ${withCode} 封`);
    if (total > 0 && withCode === 0) {
      console.log('  ⚠️  一封都没抽出来 —— 若近期确实收到过带验证码的邮件，说明模型很可能已经失效（且可能没通知）');
    }
    console.log('');
  }

  const rows = [];
  for (const m of models) {
    process.stdout.write(`  正在测试 ${m} … `);
    const row = await inspectModel(cred, m, params, catalog);
    rows.push(row);
    console.log(row.verdict);
  }

  console.log('');
  console.log('─'.repeat(78));
  console.log(
    pad('模型', 42) + pad('返回结构', 17) + pad('假阳性', 8) + pad('抽对', 7) + pad('neurons', 9) + '在册'
  );
  console.log('─'.repeat(78));
  for (const r of rows) {
    console.log(
      pad(r.model.replace('@cf/', ''), 42) +
      pad(r.shape, 17) +
      pad(`${r.fp}/${NEGATIVE.length}`, 8) +
      pad(`${r.hit}/${POSITIVE.length}`, 7) +
      pad(r.neurons, 9) +
      r.catalog
    );
  }
  console.log('─'.repeat(78));

  const bad = rows.filter(r => r.verdict.startsWith('✗'));
  const warn = rows.filter(r => r.verdict.startsWith('△'));

  if (bad.length || warn.length) {
    console.log('');
    for (const r of [...bad, ...warn]) {
      console.log(`  ${r.verdict}  ${r.model}`);
      if (r.note) console.log(`           ${r.note}`);
    }
  }

  console.log('');
  if (bad.length === 0 && warn.length === 0) {
    console.log('结论：全部通过，当前模型可正常提取验证码。\n');
    process.exit(0);
  } else if (bad.length === 0) {
    console.log('结论：可用但有提示项，见上。\n');
    process.exit(1);
  } else {
    console.log('结论：存在不可用模型，请更换后重测。\n');
    console.log('换模型步骤：');
    console.log('  1. wrangler.toml 的 [vars] 改 ai_model = "@cf/新模型"');
    console.log('  2. ai-service.js 的兜底默认值改成同一个');
    console.log('  3. 重新部署');
    console.log('  4. 再跑一次本脚本确认');
    console.log('');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('\n✗ 执行异常：', e?.message || e);
  process.exit(2);
});