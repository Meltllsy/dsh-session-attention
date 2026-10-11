#!/usr/bin/env node
/**
 * DSH 兼容性自检 —— 把本插件依赖的「DSH 内部点」逐条对着已安装（或指定）的 DSH 包核一遍。
 *
 * DSH 还在快速演进，插件断掉往往不是插件自己的 bug，而是这些内部点变了：服务改名、
 * DOM 类名重构、事件名调整、客户端包格式换代。这个脚本把它们显式化，让「需要跟版修复」
 * 变成一条命令的输出，而不是等用户先遇到故障。
 *
 * 用法：
 *   node scripts/check-compat.mjs                检查本机已装的 DSH（自动找 $DSH_HOME/profiles/*）
 *   node scripts/check-compat.mjs --from <dir>   检查指定目录（下面应有 @deepseek-ai/* 包；CI 用）
 *   node scripts/check-compat.mjs --json         机器可读输出
 *
 * 退出码：0 = 成立（或本次范围看不到）；1 = 有假设在**能看到**的范围内不再成立。
 * 只依赖 node: 内置模块。符号链接会被跟随（pnpm 布局下包都是软链）。
 */

import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 每条假设：scope 决定「在哪个范围里看」，看不到该范围就跳过而不是误报。 */
const CHECKS = [
  { id: 'client.loader', scope: 'client', what: '客户端插件加载器仍是 ModuleLoader', needles: ['__ModuleLoader__'], risk: '客户端插件整个不会挂载' },
  { id: 'client.route', scope: 'client', what: '插件资源路由前缀仍是 /plugins', needles: ['"/plugins"', "'/plugins'"], risk: '客户端 bundle 取不到' },
  { id: 'nav.service', scope: 'client', what: '主视图服务名仍是 uiWorkspace', needles: ['"uiWorkspace"', "'uiWorkspace'"], risk: '点会话行无法跳转' },
  { id: 'nav.openSession', scope: 'client', what: 'uiWorkspace 仍提供 openSession', needles: ['openSession'], risk: '点会话行无法跳转' },
  { id: 'session.list', scope: 'client', what: '会话列表仍以 byId 快照暴露', needles: ['byId'], risk: '取不到会话标题' },
  { id: 'dom.sessionRow', scope: 'client', what: '侧边栏会话行类名仍含 sessionRow', needles: ['sessionRow'], risk: '侧边栏入口 / 跳转兜底失效' },
  { id: 'dom.newSession', scope: 'client', what: '「新建会话」按钮类名仍含 newSession', needles: ['newSession'], risk: '侧边栏入口插不进去' },
  { id: 'dom.centerCol', scope: 'client', what: '中心列类名仍含 centerCol', needles: ['centerCol'], risk: '面板找不到落点' },
  { id: 'host.webServer', scope: 'host', what: 'host 仍提供 webServer 服务', needles: ['webServer'], risk: 'API / SSE 全挂' },
  { id: 'host.systemPrompt', scope: 'host', what: 'host 仍提供 systemPrompt 服务', needles: ['systemPrompt'], risk: '公告注入失效（不影响功能）' },
  { id: 'event.sessionEvent', scope: 'host', what: '会话事件通道仍叫 session/event', needles: ['session/event'], risk: '会话提醒完全不触发' },
  { id: 'event.turnEnd', scope: 'host', what: '回合结束事件仍是 turn/end', needles: ['turn/end'], risk: '「跑完」提醒不触发' },
  { id: 'event.approvalAsked', scope: 'host', what: '审批事件仍是 approval/asked', needles: ['approval/asked'], risk: '「审批」提醒不触发' },
  { id: 'event.toolCall', scope: 'host', what: '工具调用事件仍是 tool/call', needles: ['tool/call'], risk: '活动球与「提问」提醒不触发' },
  { id: 'tool.askUser', scope: 'host', what: '提问工具仍叫 ask_user_question', needles: ['ask_user_question'], risk: '「提问」提醒不触发' },
]

const SKIP_DIR = new Set(['.git', '.pnpm', 'node_modules'])

/** 跟随符号链接递归扫描；顺带记录遇到了哪些包，用来判断本次能看到哪些范围。 */
function scan(root, needles, budget = { files: 8000, bytes: 600 * 1024 * 1024, ms: 60_000 }) {
  const found = new Set()
  const seen = new Set()
  const packages = new Set()
  const state = { files: 0, bytes: 0, truncated: false }
  const started = Date.now()
  const stop = () => state.files >= budget.files || state.bytes >= budget.bytes || Date.now() - started > budget.ms
  const walk = (dir, depth) => {
    if (depth > 8 || stop()) { state.truncated = true; return }
    let real
    try { real = realpathSync(dir) } catch { return }
    if (seen.has(real)) return
    seen.add(real)
    const base = real.split(/[\\/]/).pop() ?? ''
    if (/^dsh(-|$)/.test(base)) packages.add(base)
    let entries
    try { entries = readdirSync(real, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (stop()) { state.truncated = true; return }
      const full = join(real, e.name)
      let st
      try { st = statSync(full) } catch { continue }
      if (st.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(full, depth + 1); continue }
      if (!/\.(js|cjs|mjs|json)$/.test(e.name) || st.size > 32 * 1024 * 1024) continue
      state.files += 1; state.bytes += st.size
      let text = ''
      try { text = readFileSync(full, 'utf8') } catch { continue }
      for (const n of needles) if (!found.has(n) && text.includes(n)) found.add(n)
    }
  }
  walk(root, 0)
  return { found, packages, state }
}

function resolveRoots(from) {
  if (from !== undefined) return [from]
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const roots = []
  try {
    for (const p of readdirSync(join(home, 'profiles'))) {
      const nm = join(home, 'profiles', p, 'node_modules', '@deepseek-ai')
      try { if (statSync(nm).isDirectory()) roots.push(nm) } catch { /* 没有这个目录 */ }
    }
  } catch { /* 没有 profiles */ }
  if (roots.length === 0) {
    console.error('找不到已安装的 DSH。用 --from <目录> 指定（该目录下应有 @deepseek-ai/* 包）。')
    process.exit(2)
  }
  return roots
}

const args = process.argv.slice(2)
const fromIndex = args.indexOf('--from')
const from = fromIndex >= 0 ? args[fromIndex + 1] : undefined
const asJson = args.includes('--json')
const roots = resolveRoots(from)

const all = new Set()
const packages = new Set()
let files = 0
let truncated = false
for (const root of roots) {
  const { found, packages: pkgs, state } = scan(root, CHECKS.flatMap((c) => c.needles))
  for (const f of found) all.add(f)
  for (const p of pkgs) packages.add(p)
  files += state.files
  truncated ||= state.truncated
}

const hasClient = [...packages].some((p) => p.startsWith('dsh-client-'))
const hasHost = [...packages].some((p) => p.startsWith('dsh-') && !p.startsWith('dsh-client-'))
const scopeSeen = (scope) => (scope === 'client' ? hasClient : hasHost)

const results = CHECKS.map((c) => {
  const seen = scopeSeen(c.scope)
  const ok = c.needles.some((n) => all.has(n))
  return { ...c, seen, ok, status: !seen ? 'skip' : ok ? 'ok' : 'fail' }
})
const failed = results.filter((r) => r.status === 'fail')
const skipped = results.filter((r) => r.status === 'skip')

if (asJson) {
  console.log(JSON.stringify({ roots, files, truncated, packages: [...packages].sort(), results: results.map(({ id, scope, what, status, risk }) => ({ id, scope, what, status, risk })) }, null, 2))
} else {
  console.log('DSH 兼容性自检')
  console.log('  扫描: ' + roots.join('  '))
  console.log('  范围: ' + files + ' 个文件，识别到包 ' + packages.size + ' 个（客户端=' + hasClient + '，host=' + hasHost + '）' + (truncated ? '，已达上限提前停止' : ''))
  console.log('')
  for (const r of results) {
    const mark = r.status === 'ok' ? '✅' : r.status === 'skip' ? '⊘ ' : '❌'
    console.log('  ' + mark + ' ' + r.id.padEnd(22) + r.what + (r.status === 'fail' ? '   ← 失效后果：' + r.risk : r.status === 'skip' ? '   （本次范围看不到，跳过）' : ''))
  }
  console.log('')
  if (failed.length > 0) console.log('有 ' + failed.length + ' 条不再成立 —— DSH 变了，需要跟版修复（见 README「兼容性」一节）。')
  else console.log('看到的范围内全部成立' + (skipped.length > 0 ? '（另有 ' + skipped.length + ' 条因范围不可见被跳过）' : '') + '。')
}
process.exit(failed.length === 0 ? 0 : 1)
