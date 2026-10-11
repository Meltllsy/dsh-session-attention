/**
 * 浏览器端 store：单一实例，持有 host 状态快照（设置）+ DSH 活跃会话列表 +
 * 最近一条提醒 + 面板开合。React 组件经 useSyncExternalStore 订阅。
 * @module dsh-session-attention/client/attention-store
 */

import { attentionApi } from './api.ts'
import type { AttentionEvent, AttentionSettings, AttentionState, BallSettings, SessionActivity } from '../types.ts'

export interface AttentionClientState {
  data: AttentionState | null
  error: string | null
  /** DSH 活跃会话列表（活动悬浮球展示）。 */
  activity: SessionActivity[]
  /** 最近一条「需要你操作」提醒；用于悬浮球/面板闪示与「查看最近」。 */
  latest: AttentionEvent | null
  /** 设置面板是否展开（侧边栏「提醒」入口控制）。 */
  panelOpen: boolean
}

type Listener = () => void

class AttentionStore {
  private state: AttentionClientState = {
    data: null,
    error: null,
    activity: [],
    latest: null,
    panelOpen: false,
  }

  private readonly listeners = new Set<Listener>()

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): AttentionClientState => this.state

  private set(patch: Partial<AttentionClientState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  /** host 状态（设置）推送。 */
  applyState(data: AttentionState): void {
    this.set({ data, error: null })
  }

  /** DSH 活跃会话列表推送。 */
  applyActivity(activity: SessionActivity[]): void {
    this.set({ activity })
  }

  /** 一条「需要你操作」提醒到达。 */
  applyAttention(latest: AttentionEvent): void {
    this.set({ latest })
  }

  /** 拉取 host 状态（首次加载 / 回到前台兜底）。 */
  async refresh(): Promise<void> {
    try {
      this.applyState(await attentionApi.state())
    } catch (error) {
      this.set({ error: error instanceof Error ? error.message : String(error) })
    }
  }

  /** 在文件管理器里打开数据目录（音效文件放这里）。失败静默。 */
  async openSoundDir(): Promise<void> {
    try {
      await attentionApi.openDir()
    } catch { /* 忽略 */ }
  }

  togglePanel(): void {
    this.set({ panelOpen: !this.state.panelOpen })
  }

  setPanel(open: boolean): void {
    if (this.state.panelOpen !== open) this.set({ panelOpen: open })
  }

  async setAttention(patch: Partial<AttentionSettings>): Promise<void> {
    await attentionApi.setSettings({ attention: patch })
    await this.refresh()
  }

  async setBall(patch: Partial<BallSettings>): Promise<void> {
    await attentionApi.setSettings({ ball: patch })
    await this.refresh()
  }
}

/** 应用级单例（入口 / 面板 / 提醒层共用）。 */
export const attentionStore = new AttentionStore()
