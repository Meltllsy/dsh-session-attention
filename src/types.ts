/**
 * dsh-session-attention 共享类型（host 与 client 都引用；纯类型 + 少量纯函数）。
 * 本包只管「DSH 会话」一件事：agent 完成一轮 / 提问 / 需要审批时提醒，
 * 外加一个只显示活跃会话的活动悬浮球。不含任何待办概念。
 * @module dsh-session-attention/types
 */

/** 提醒音色（合成音用）与通知配色共用的样式。 */
export type ReminderStyle = 'info' | 'success' | 'warning' | 'danger'

export const REMINDER_STYLES: readonly ReminderStyle[] = ['info', 'success', 'warning', 'danger']

export function isReminderStyle(value: unknown): value is ReminderStyle {
  return typeof value === 'string' && (REMINDER_STYLES as readonly string[]).includes(value)
}

/** 夹紧数值到 [min,max]；非有限数回退 fallback。 */
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** 「需要你操作」的提醒设置。 */
export interface AttentionSettings {
  /** agent 完成一轮回复时提醒。 */
  onTurnEnd: boolean
  /** agent 用 ask_user_question 提问时提醒。 */
  onQuestion: boolean
  /** 有审批请求（approve/deny）时提醒。 */
  onApproval: boolean
  /** 这类提醒是否响铃（页面内音效）。 */
  sound: boolean
  /** 音量 0..1。 */
  volume: number
  /** 合成音音色。 */
  tone: ReminderStyle
}

/** 活动悬浮球设置。 */
export interface BallSettings {
  /** 是否显示活动悬浮球。 */
  enabled: boolean
  /** 拖动松手后吸附到最近的左右边缘。 */
  snapToEdge: boolean
}

/** 本模块持久化的全部设置。 */
export interface AttentionModuleSettings {
  attention: AttentionSettings
  ball: BallSettings
}

export const DEFAULT_SETTINGS: AttentionModuleSettings = {
  attention: { onTurnEnd: true, onQuestion: true, onApproval: true, sound: true, volume: 0.5, tone: 'success' },
  ball: { enabled: true, snapToEdge: true },
}

/** 一条「需要用户操作」的会话提醒（host → 浏览器 SSE）。 */
export interface AttentionEvent {
  kind: 'turn-end' | 'question' | 'approval'
  title: string
  body: string
  at: number
  /** 触发它的会话 id；点击提醒可直接跳回该会话。 */
  sessionId?: string
  /** 会话标题（通知里显示是哪个会话）。 */
  sessionTitle?: string
}

/** 单个会话的活动阶段（不在活动列表里 = 空闲）。 */
export type ActivityPhase = 'thinking' | 'tool' | 'done'

/** 单个会话的活动快照（多会话追踪）。 */
export interface SessionActivity {
  sessionId: string
  sessionTitle?: string
  phase: ActivityPhase
  /** phase === 'tool' 时的当前工具名。 */
  tool?: string
  changedAt: number
}

/** host 返回给浏览器的完整状态。 */
export interface AttentionState {
  settings: AttentionModuleSettings
  now: number
}

/** SSE 推送信封。 */
export type PushMessage =
  | { type: 'state'; state: AttentionState }
  | { type: 'attention'; attention: AttentionEvent }
  | { type: 'activity'; activity: SessionActivity[] }
