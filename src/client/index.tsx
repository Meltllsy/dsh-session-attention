/**
 * dsh-session-attention 浏览器半：注入样式，挂载侧边栏「提醒」入口、设置面板、
 * 全局提醒层（含活动悬浮球）。失败策略：DOM 挂载异常只记录、不抛出
 * （外部插件不得拖垮 GUI 启动）。
 * @module dsh-session-attention/client
 */

import { createRoot, type Root } from 'react-dom/client'
import { attentionStore } from './attention-store.ts'
import { AttentionLayer } from './AttentionLayer.tsx'
import { AttentionPanel } from './AttentionPanel.tsx'
import { resolveSessionRow, setSessionOpener, setSessionTitleResolver, type SessionTarget } from './session-nav.ts'
import { mountSidebarEntry } from './sidebar-entry.ts'
import { injectStyles } from './styles.ts'

/** 跨插件面板互斥事件（与 task-board / ssh / 待办 同契约）。 */
const ACTIVATE_EVENT = 'dsh-panel-activate'
const PANEL_NAME = 'attention'
const ACTIVE_ATTR = 'data-dsh-attention-active'
const SIBLING_ATTRS = ['data-dsh-todo-active', 'data-dsh-ssh-active', 'data-dsh-taskboard-active']

/** 中心列（对话列）容器选择器：0.1.6 起 data-pane 标记被移除，回退到 centerCol 类名。 */
const CONVERSATION_SELECTOR = '[data-pane="conversation"], [class*="centerCol"], [class*="_centerCol"]'

/**
 * 面板挂载：容器插进中心列，打开时占满它（独立页面式，与任务看板 / SSH 一致），
 * 中心列其余内容暂时隐藏；关闭后立刻回到对话。开合由 store 的 panelOpen 驱动。
 */
function mountPanel(): () => void {
  document.querySelectorAll('[data-dsh-att-view]').forEach((el) => el.remove())

  let root: Root | undefined
  let container: HTMLDivElement | undefined

  const ensure = (): void => {
    if (container !== undefined) return
    const column = document.querySelector<HTMLElement>(CONVERSATION_SELECTOR)
    if (column === null) return
    container = document.createElement('div')
    container.dataset.dshAttView = ''
    column.appendChild(container)
    root = createRoot(container)
    root.render(<AttentionPanel />)
  }

  const waitObserver = new MutationObserver(() => { ensure() })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  const applyActive = (): void => {
    if (attentionStore.getSnapshot().panelOpen) {
      for (const attr of SIBLING_ATTRS) document.documentElement.removeAttribute(attr)
      document.documentElement.setAttribute(ACTIVE_ATTR, '')
      document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }))
    } else {
      document.documentElement.removeAttribute(ACTIVE_ATTR)
    }
  }
  const close = (): void => { if (attentionStore.getSnapshot().panelOpen) attentionStore.setPanel(false) }
  const onOtherActivate = (event: Event): void => {
    if ((event as CustomEvent).detail !== PANEL_NAME) close()
  }
  const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
  const SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]'
  const onClickSidebarRow = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null
    if (target === null) return
    // 点自己的侧边栏入口不算「点了会话行」：本监听在捕获阶段先跑，若在这里 close()，
    // 紧接着入口自身的 click 又 togglePanel() 开回来 —— 表现就是「点了关不掉」。
    if (target.closest('[data-dsh-att-entry]') !== null) return
    if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) close()
  }

  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('click', onClickSidebarRow, true)
  document.addEventListener(ACTIVATE_EVENT, onOtherActivate)
  const unsubscribe = attentionStore.subscribe(applyActive)
  applyActive()
  ensure()

  return () => {
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('click', onClickSidebarRow, true)
    document.removeEventListener(ACTIVATE_EVENT, onOtherActivate)
    waitObserver.disconnect()
    unsubscribe()
    document.documentElement.removeAttribute(ACTIVE_ATTR)
    root?.unmount()
    root = undefined
    container?.remove()
    container = undefined
  }
}
/** 全局提醒层挂载（body 上的 React 根，跨会话常驻；内含活动悬浮球）。 */
function mountLayer(): () => void {
  document.querySelectorAll('[data-dsh-att-layer]').forEach((el) => el.remove())

  const container = document.createElement('div')
  container.dataset.dshAttLayer = ''
  document.body.appendChild(container)
  const root = createRoot(container)
  root.render(<AttentionLayer />)
  return () => {
    root.unmount()
    container.remove()
  }
}

/**
 * 声明依赖 `sessions` 服务：它保证本插件在客户端会话控制器就绪之后才 apply，
 * 侧边栏/主视图此时已可被定位（跳转本身走 DOM 委托，不调用该服务）。
 */
export const inject = ['sessions', 'uiWorkspace']

/** 客户端上下文最小接口。 */
export interface AttentionClientContext {
  readonly sessions?: unknown
  /**
   * ui-workspace 客户端服务（DSH 0.2 起的官方主视图切换入口）。
   * 缺席时退回「委托侧边栏行点击」的老办法。
   */
  readonly uiWorkspace?: { openSession?: (target: string) => void }
}

export function apply(ctx: AttentionClientContext): () => void {
  injectStyles()

  const disposers: Array<() => void> = []

  // 会话标题：DSH 0.2 起 host 侧拿不到标题，真正的来源是客户端会话列表（侧边栏同源）。
  disposers.push(setSessionTitleResolver((sessionId: string): string | undefined => {
    const list = (ctx.sessions as {
      list?: { getSnapshot?: () => { byId?: Record<string, { title?: string, blank?: boolean }> } }
    } | undefined)?.list
    const row = list?.getSnapshot?.()?.byId?.[sessionId]
    if (row === undefined || row.blank === true) return undefined
    const title = typeof row.title === 'string' ? row.title.trim() : ''
    return title === '' ? undefined : title
  }))

  // 先登记跳转能力，再挂 UI，保证首帧就知道会话可点。
  disposers.push(setSessionOpener((target: SessionTarget): boolean | Promise<boolean> => {
    // 首选：官方 uiWorkspace.openSession(sessionId)。它内部走 replaceMain 并自行管理
    // 主视图引用，因此**不要求那个会话此刻能在侧边栏里被看见**（工作区收起也行）。
    // 服务未注册时读取本身也可能抛，所以连读取一起兜住。
    let service: { openSession?: (target: string) => void } | undefined
    try { service = ctx.uiWorkspace } catch { service = undefined }
    if (service !== undefined && typeof service.openSession === 'function') {
      try {
        service.openSession(target.sessionId)
        console.info('[dsh-session-attention] 已走官方接口跳转会话', target.sessionId)
        return true
      } catch (error) {
        console.warn('[dsh-session-attention] uiWorkspace.openSession 失败，退回侧边栏点击', error)
      }
    }
    // 兜底：委托官方侧边栏行点击（服务缺席 / 旧版本时）。
    return (async (): Promise<boolean> => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const row = resolveSessionRow(target)
        if (row !== undefined) {
          const clickable = row.querySelector<HTMLElement>('button, [role="button"]') ?? row
          clickable.click()
          return true
        }
        await new Promise((resolve) => { window.setTimeout(resolve, 16) })
      }
      console.warn('[dsh-session-attention] 侧边栏里定位不到该会话行，跳转失败', target.sessionId, target.title)
      return false
    })()
  }))
  try {
    disposers.push(mountSidebarEntry())
    disposers.push(mountPanel())
    disposers.push(mountLayer())
  } catch (error) {
    console.error('[dsh-session-attention] mount failed:', error)
  }

  return () => {
    for (const dispose of disposers.splice(0)) {
      try { dispose() } catch { /* 忽略清理异常 */ }
    }
  }
}
