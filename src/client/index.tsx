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
import { registerOverlay, registerPanel } from './panel-seat.tsx'
import { injectStyles } from './styles.ts'

/** 跨插件面板互斥事件（与 task-board / ssh / 待办 同契约）。 */
const ACTIVATE_EVENT = 'dsh-panel-activate'
const PANEL_NAME = 'attention'
const ACTIVE_ATTR = 'data-dsh-attention-active'
const SIBLING_ATTRS = ['data-dsh-todo-active', 'data-dsh-ssh-active', 'data-dsh-taskboard-active']

/**
 * 中心列（对话列）候选，**按优先级逐个试**。
 * 注意：querySelector 的逗号列表是「文档顺序优先」而不是「选择器顺序优先」——别的插件的外层
 * 容器只要类名带 centerCol 就会被选中，而 inset:0 的面板挂上去会盖满整个 UI。
 * 0.1.6 起 data-pane 标记被移除，回退到 centerCol / _centerCol 类名。
 */
const COLUMN_CANDIDATES = ['[data-pane="conversation"]', '[class*="centerCol"]', '[class*="_centerCol"]']

/** 宿主标记：定位与隐藏兄弟都只作用于自己挂载的这个元素，避免误伤其他插件的同名容器。 */
const HOST_ATTR = 'data-dsh-att-host'

/** 应用外壳判定：含侧边栏（或本插件的侧边栏入口）的容器不是对话列，挂上去必然盖满整个 UI。 */
function looksLikeAppShell(el: HTMLElement): boolean {
  if (el === document.body || el === document.documentElement) return true
  return el.querySelector('[data-pane="sidebar"], [class*="sidebarCol"], [data-dsh-todo-entry], [data-dsh-att-entry]') !== null
}

/** 找对话列：按优先级 + 外壳校验；找不到就返回 undefined（宁可不挂，也不盖满 UI）。 */
function findConversationColumn(): HTMLElement | undefined {
  for (const selector of COLUMN_CANDIDATES) {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (!looksLikeAppShell(el)) return el
    }
  }
  return undefined
}

/**
 * 面板挂载：容器插进中心列，打开时占满它（独立页面式，与任务看板 / SSH 一致），
 * 中心列其余内容暂时隐藏；关闭后立刻回到对话。开合由 store 的 panelOpen 驱动。
 */
export const inject = ['sessions', 'uiWorkspace', 'slots', 'layout']

/** 客户端上下文最小接口。 */
export interface AttentionClientContext {
  readonly sessions?: unknown
  /** 官方座位服务（0.2 起）；缺席时退回 DOM 注入。 */
  readonly slots: { inject(key: string, callback: () => () => void): () => void, register(options: Record<string, unknown>, component: unknown): () => void }
  /** cordis 上下文取值（本插件只取 layout）。 */
  readonly get?: (name: string) => unknown
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
  /** 旧路径：DOM 注入（旧版外壳，或官方座位没生效时的兜底）。 */
  // 全局层（提醒层 / 右侧待办条 / 活动悬浮球）：与面板座位无关，独立挂载。

  // 面板 = 外壳官方座位（sidebar.panellist 行 + main 页面），单一实现。
  // 不再保留 DOM 注入回退：回退会静默接管，让人以为修好了，实际一直跑旧路径 ——
  // 重复入口、灰底、✕ 关不掉，全是它造成的。座位不可用时宁可不显示，也不假装正常。
  try { disposers.push(registerPanel(ctx)) } catch (error) { console.error('[dsh-session-attention] 面板座位注册失败:', error) }
  try { disposers.push(registerOverlay(ctx)) } catch (error) { console.error('[dsh-session-attention] 悬浮层注册失败:', error) }

  /** 统一清理：幂等（splice 后为空即无事），dispose 事件与返回值共用。 */
  const cleanup = (): void => {
    for (const dispose of disposers.splice(0)) {
      try { dispose() } catch { }
    }
  }

  // 外壳停用插件时不一定调用返回的清理函数（表现：关掉插件后右侧悬浮窗仍在），
  // 顺手订阅 cordis 的 dispose 事件兜住；上下文不支持就忽略。
  try {
    const onDispose = (ctx as any).on
    if (typeof onDispose === 'function') onDispose.call(ctx, 'dispose', cleanup)
  } catch { }

  return cleanup
}
