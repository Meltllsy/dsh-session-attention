/**
 * 会话注意力模块的状态服务：持有设置，并把状态变化派发给 SSE 订阅者。
 * 本模块不调度任何定时任务 —— 提醒完全由会话事件驱动。
 * @module dsh-session-attention/service
 */

import { loadSettings, normalizeSettings, saveSettings } from './settings.js'
import type { AttentionModuleSettings, AttentionSettings, AttentionState, BallSettings } from './types.js'

/** setSettings 的补丁形态。 */
export interface SettingsPatch {
  attention?: Partial<AttentionSettings>
  ball?: Partial<BallSettings>
}

export class AttentionService {
  private doc: AttentionModuleSettings = loadSettings()
  private readonly listeners = new Set<(state: AttentionState) => void>()

  /** 当前完整状态（含服务器时间，供客户端对齐）。 */
  state(): AttentionState {
    return { settings: this.settings(), now: Date.now() }
  }

  /** 当前设置（深拷贝）。 */
  settings(): AttentionModuleSettings {
    return { attention: { ...this.doc.attention }, ball: { ...this.doc.ball } }
  }

  /** 更新设置并广播；返回更新后的设置。 */
  setSettings(patch: SettingsPatch): AttentionModuleSettings {
    this.doc = normalizeSettings({
      attention: { ...this.doc.attention, ...(patch.attention ?? {}) },
      ball: { ...this.doc.ball, ...(patch.ball ?? {}) },
    })
    saveSettings(this.doc)
    this.emit()
    return this.settings()
  }

  subscribe(listener: (state: AttentionState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    const state = this.state()
    for (const listener of this.listeners) {
      try {
        listener(state)
      } catch {
        // 单个订阅者异常不得拖垮其它推送。
      }
    }
  }
}
