/**
 * 会话跳转桥：client 半经 cordis 注入拿到 sessions 服务后把「打开会话」登记在这里，
 * 悬浮球等纯 React 组件（不持有 ctx）通过它跳进对应会话。服务缺席时优雅降级——
 * canOpenSession() 返回 false，UI 就不显示可点击的样子。
 *
 * DSH 0.1.6 起 `sessions` 客户端服务的 `open(id)` 已被移除（新公开接口是
 * `retain` / `using` / `retainInfo` / `subagentAddress`），旧调用会抛 TypeError
 * 并被静默吞掉，表现为「点会话行没反应」。而 `sessions.retain` 只保留引用、
 * 不切换主视图（切视图由 ui-workspace 内部 `replaceMain` 负责并管理引用生命周期），
 * 外部插件直接 retain 会泄漏引用且界面不动。
 *
 * 因此跳转改为委托官方组件：在侧边栏定位该会话行并触发它的原生点击，
 * 由 ui-workspace 自己完成主视图切换。无法定位时降级为不展示可点击态。
 * @module dsh-todo-reminder/client/session-nav
 */

/**
 * 跳转目标描述。
 * @property sessionId - 会话 id
 * @property title - 会话标题，用于在侧边栏匹配对应行；缺失时退化为用 id 匹配
 */
export interface SessionTarget {
  readonly sessionId: string
  readonly title?: string
}

type Opener = (target: SessionTarget) => Promise<boolean> | boolean

let opener: Opener | null = null

/**
 * 标题解析桥：host 推来的会话标题在 DSH 0.2 里已经拿不到（session/event 不再带
 * session/title），真正的标题源是**客户端的会话列表**（侧边栏显示的就是它）。
 * client 半在 apply 时把解析器登记进来，纯 React 组件经此取标题。
 */
let titleResolver: ((sessionId: string) => string | undefined) | null = null

/** 登记标题解析器；返回注销 disposer。 */
export function setSessionTitleResolver(next: (sessionId: string) => string | undefined): () => void {
  titleResolver = next
  return () => {
    if (titleResolver === next) titleResolver = null
  }
}

/** 取某个会话的标题；解析器缺席或查不到时返回 undefined。 */
export function sessionTitleOf(sessionId: string): string | undefined {
  if (titleResolver === null) return undefined
  try {
    return titleResolver(sessionId)
  } catch {
    return undefined
  }
}

/**
 * 登记打开会话的实现。
 * @returns 注销该实现的 disposer（热重载 / 卸载时调用）。
 */
export function setSessionOpener(next: Opener): () => void {
  opener = next
  return () => {
    if (opener === next) opener = null
  }
}

/**
 * 当前是否具备跳转会话的能力。
 * 只反映「桥已登记」，不代表具体某个会话此刻一定能在侧边栏找到。
 */
export function canOpenSession(): boolean {
  return opener !== null
}

/** 会话行文本的归一化：折叠空白，便于跨渲染比对。 */
function normalizeLabel(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * 在侧边栏里找到目标会话行。
 *
 * 只认官方组件使用的 CSS-module 类名（`sessionRow` / `searchResultRow`），
 * 不依赖 hash 前缀，因此跨版本稳定；找不到返回 undefined。
 */
function findSessionRow(target: SessionTarget): HTMLElement | undefined {
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>('[class*="sessionRow"], [class*="searchResultRow"]'),
  )
  if (rows.length === 0) return undefined

  const wanted = normalizeLabel(target.title)
  if (wanted !== '') {
    for (const row of rows) {
      const label = normalizeLabel(row.textContent)
      // 行内还含状态/时间等附属文本，故用「包含」而非全等。
      if (label === wanted || label.includes(wanted)) return row
    }
  }
  // 标题缺失或匹配不上：退化为匹配行上的 id 痕迹（部分版本会挂在属性里）。
  for (const row of rows) {
    const marker = row.getAttribute('data-session-id') ?? row.getAttribute('data-id')
    if (marker !== null && marker === target.sessionId) return row
  }
  return undefined
}

/**
 * 跳到指定会话。
 *
 * 成功与否取决于该会话此刻是否能在侧边栏定位到（例如所属工作区被收起时无法定位）。
 * @returns 是否成功发起跳转
 */
export function openSession(target: SessionTarget): boolean {
  const current = opener
  if (current === null) return false
  try {
    // 登记的实现可能是异步的（DOM 定位失败会重试一帧）；这里不阻塞点击。
    void Promise.resolve(current(target)).catch(() => false)
    return true
  } catch {
    return false
  }
}

/** 供登记方使用的 DOM 定位能力（与 openSession 同源策略）。 */
export function resolveSessionRow(target: SessionTarget): HTMLElement | undefined {
  return findSessionRow(target)
}
