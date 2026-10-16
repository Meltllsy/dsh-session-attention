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
import { AttentionLayer } from './AttentionLayer.tsx'
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
  slots: SlotService
  layout?: LayoutService
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

/** 注册侧边栏行 + 主视图页面。 */
export function registerPanel(ctx: SeatContext): () => void {
  const slots = ctx.slots
  const disposers: Array<() => void> = []
  disposers.push(slots.inject('sidebar.panellist', () => slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: PANEL_ORDER,
    label: () => '提醒',
  }, PanelIcon)))
  const Page = (): ReactElement => (
    <div className="todo-panel-page" data-dsh-att-view="" data-dsh-plugin="session-attention-layer">
      <AttentionPanel onClose={() => closePanel(ctx)} />
    </div>
  )
  disposers.push(slots.inject('main', () => slots.register({ name: 'main', key: PANEL_ID }, Page as never)))
  return () => { for (const dispose of disposers.splice(0)) { try { dispose() } catch { /* 忽略清理异常 */ } } }
}

/**
 * 把本插件的面板开关与外壳「当前选中的面板」双向对齐：
 * 外壳那边切换 → 同步进 store（✕ / Esc 才有意义）；
 * store 这边关闭（点 ✕）→ 让外壳切回对话。两边都做等值判断，不会互相触发成环。
 */
/**
 * 单向绑定：面板里的 ✕ 关掉自己时，让外壳把主视图切回对话。
 * 刻意不做「外壳 → store」的反向同步：两个真相源互相写会形成死循环，
 * 表现就是高亮卡住、✕ 关不掉。选中态完全由外壳拥有。
 */
/**
 * 显式关闭：只在用户点面板里的 ✕ 时调用 —— 让外壳把主视图切回对话。
 * 刻意不做任何自动/订阅式的切换：之前那版订阅在挂载时就触发了一次，
 * 表现就是「插件一加载，界面自己跳回会话」，把你正在看的页面顶掉。
 */
export function closePanel(ctx: SeatContext): void {
  try { ctx.layout?.selectPanel?.(null) } catch (error) { console.warn('[dsh-session-attention] 切回对话失败:', error) }
}

/**
 * 悬浮层（待办条 / 活动悬浮球 / 提醒 toast）注册进外壳的 shell.overlay 座位：
 * 这是「整帧浮动层，位于所有列之上」。以前是自己 append 到 document.body ——
 * 于是外壳停用插件时只回收了它的座位内容，我们的节点留在页面上（悬浮窗不消失）。
 */
export function registerOverlay(ctx: SeatContext): () => void {
  const slots = ctx.slots
  return slots.inject('shell.overlay', () => slots.register({
    name: 'shell.overlay',
    id: 'session-attention-layer',
    order: 60,
  }, AttentionLayer as never))
}
