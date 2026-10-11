/**
 * DSH 多会话活动发布源：host 内维护「会话 id → 活动快照」的注册表，SSE 路由订阅它、
 * 把「当前活跃会话列表」（最多 5 个、按最近更新时间排序）实时推给浏览器。
 * @module dsh-todo-reminder/activity
 */

import type { SessionActivity } from './types.js'

const MAX_SESSIONS = 5

export class ActivitySource {
  private readonly sessions = new Map<string, SessionActivity>()
  private readonly listeners = new Set<(sessions: SessionActivity[]) => void>()

  subscribe(listener: (sessions: SessionActivity[]) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** 当前活跃会话列表（SSE 连接时立即推送用）。 */
  snapshot(): SessionActivity[] {
    return this.list()
  }

  /** 更新（或插入）一个会话的活动快照，并推送。 */
  update(activity: SessionActivity): void {
    this.sessions.set(activity.sessionId, { ...activity })
    this.emit()
  }

  /** 移除一个会话（turn 中止/失败，或会话被释放）。 */
  remove(sessionId: string): void {
    if (this.sessions.delete(sessionId)) this.emit()
  }

  private list(): SessionActivity[] {
    return [...this.sessions.values()]
      .sort((a, b) => b.changedAt - a.changedAt)
      .slice(0, MAX_SESSIONS)
  }

  private emit(): void {
    const list = this.list()
    for (const listener of this.listeners) {
      try {
        listener(list)
      } catch {
        // 单个订阅者异常不得拖垮其它推送。
      }
    }
  }
}
