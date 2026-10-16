/**
 * 官方面板座位注册（DSH 0.2 起）。
 *
 * 以前是 DOM 注入：自己造一个 <button> 塞进侧边栏、再造一个绝对定位的浮层盖住对话列。
 * 那样行框、图标、高亮、折叠态、面板切换全得自己模仿，别插件一动布局就会错位甚至盖满界面。
 *
 * 现在改成往外壳自己的座位注册：
 *   sidebar.panellist —— 只画一个图标，行框/标签/高亮/折叠/点击切换都归外壳；
 *   main             —— 页面只在「本面板被选中」时才由外壳挂载，没选中时对话列完全不受影响。
 * 两者都走 slots.inject：外壳没声明该座位就什么都不做（不报错、不拖垮启动）。
 * @module dsh-session-attention/client
 */

import type { ReactElement } from 'react'
import { AttentionPanel } from './AttentionPanel.tsx'
import { attentionStore } from './attention-store.ts'

/** 面板 id：侧边栏行与主视图页面共用它，也是 layout.selectPanel 的取值。 */
export const PANEL_ID = 'session-attention'

/** 行序（外壳：插件页 0、定时页 10、任务看板 20）。 */
const PANEL_ORDER = 30

/** 座位接口（外部插件只能按约定结构调用，故这里用最小结构类型）。 */
interface SlotService {
  inject(key: string, callback: () => () => void): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
}

/** 布局服务：选中哪个面板 + 当前选中项的可订阅快照。 */
interface LayoutService {
  selectPanel?: (id: string | null) => void
  panelInfo?: {
    subscribe(listener: () => void): () => void
    getSnapshot(): { activePanelId: unknown }
  }
}

/** 客户端上下文里本插件用到的两样东西。 */
export interface SeatContext {
  slots?: SlotService
  get?: (name: string) => unknown
}

/** 外壳是否提供官方座位（旧版外壳没有，于是退回 DOM 注入）。 */
export function seatsAvailable(ctx: SeatContext): boolean {
  const slots = ctx.slots
  return slots !== undefined && typeof slots.inject === 'function' && typeof slots.register === 'function'
}

/** 行图标：外壳给尺寸与选中态，本组件只画 glyph。 */
function PanelIcon({ size }: { size: number, active: boolean }): ReactElement {
  return (
    <svg data-dsh-panel-entry={PANEL_ID} width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.2a4 4 0 0 0-4 4v2.4L3 11h10L11.9 8.6V6.2a4 4 0 0 0-4-4Z" /><path d="M6.6 12.8a1.5 1.5 0 0 0 2.8 0" />
    </svg>
  )
}

/** 主视图页面：外壳只在本面板被选中时挂载它。 */
export function PanelPage(): ReactElement {
  return (
    <div className="todo-panel-page" data-dsh-att-view="" data-dsh-plugin="session-attention">
      <AttentionPanel />
    </div>
  )
}

/** 注册侧边栏行 + 主视图页面。 */
export function registerPanel(ctx: SeatContext): () => void {
  const slots = ctx.slots!
  const disposers: Array<() => void> = []
  disposers.push(slots.inject('sidebar.panellist', () => slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: PANEL_ORDER,
    label: () => '提醒',
  }, PanelIcon)))
  disposers.push(slots.inject('main', () => slots.register({ name: 'main', key: PANEL_ID }, PanelPage as never)))
  return () => { for (const dispose of disposers.splice(0)) { try { dispose() } catch { /* 忽略清理异常 */ } } }
}

/**
 * 把本插件的面板开关与外壳「当前选中的面板」双向对齐：
 * 外壳那边切换 → 同步进 store（✕ / Esc 才有意义）；
 * store 这边关闭（点 ✕）→ 让外壳切回对话。两边都做等值判断，不会互相触发成环。
 */
export function syncPanelWithLayout(ctx: SeatContext): () => void {
  const layout = ctx.get?.('layout') as LayoutService | undefined
  const info = layout?.panelInfo
  if (info === undefined) return () => { /* 没有布局服务：面板开关只影响自身 */ }
  const pull = (): void => {
    const open = info.getSnapshot().activePanelId === PANEL_ID
    if (attentionStore.getSnapshot().panelOpen !== open) attentionStore.setPanel(open)
  }
  const unsubscribe = info.subscribe(pull)
  const push = attentionStore.subscribe(() => {
    const open = attentionStore.getSnapshot().panelOpen
    const active = info.getSnapshot().activePanelId === PANEL_ID
    if (open && !active) layout?.selectPanel?.(PANEL_ID)
    else if (!open && active) layout?.selectPanel?.(null)
  })
  pull()
  return () => { unsubscribe(); push() }
}
