/**
 * 提醒层：body 上的全局 React 根。经 SSE 订阅 host 的会话提醒与活动快照；
 * 标签页切到后台时，把「需要你操作」的提醒转成系统原生通知 + 提醒音。
 *
 * 只在标签页**不可见**时触发 —— 你正盯着屏幕时不必每轮都被打扰。这里不做
 * 页面内 toast：真在看你不需要它，切走了你也看不见它。
 * @module dsh-session-attention/client/AttentionLayer
 */

import { useEffect, type ReactElement } from 'react'
import { ActivityBall } from './ActivityBall.tsx'
import { attentionStore } from './attention-store.ts'
import { openSession } from './session-nav.ts'
import { armSoundUnlock, playSound } from './sound.ts'
import { DEFAULT_SETTINGS, type AttentionEvent, type AttentionState, type SessionActivity } from '../types.ts'

/**
 * 一条「需要你操作」提醒 → 提醒音 + 系统原生通知。
 * 开启提醒音后系统通知静音，由音效引擎单独出声，避免「系统叮 + 自定义音效」响两遍；
 * 音频未解锁时交回系统提示音兜底。
 */
function fireAttention(event: AttentionEvent): void {
  const attention = (attentionStore.getSnapshot().data?.settings ?? DEFAULT_SETTINGS).attention
  const played = attention.sound ? playSound(attention.tone, attention.volume, 1) : false
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const body = event.sessionTitle !== undefined && event.sessionTitle !== ''
    ? `${event.sessionTitle} —— ${event.body}`
    : event.body
  try {
    const notification = new Notification(event.title, {
      body,
      tag: `dsh-attention-${event.kind}-${event.at}`,
      silent: played ? true : !attention.sound,
    })
    notification.onclick = (): void => {
      window.focus()
      // 点通知直接跳到触发它的那个会话（官方 uiWorkspace 接口，见 session-nav）。
      if (event.sessionId !== undefined) openSession({ sessionId: event.sessionId, title: event.sessionTitle })
      notification.close()
    }
  } catch {
    // 个别环境不支持，忽略。
  }
}

/** SSE 消息信封（与 host 的 PushMessage 对应）。 */
interface PushEnvelope {
  type?: string
  state?: AttentionState
  attention?: AttentionEvent
  activity?: SessionActivity[]
}

export function AttentionLayer(): ReactElement {
  // 音频解锁：浏览器要求先有用户手势才允许出声，这里在首个手势时自动完成。
  useEffect(() => armSoundUnlock(), [])

  // SSE 实时订阅 + 回到前台时兜底轮询。
  useEffect(() => {
    const source = new EventSource('/api/attention/events')
    source.onmessage = (message) => {
      try {
        const envelope = JSON.parse(message.data) as PushEnvelope
        if (envelope.type === 'state' && envelope.state !== undefined) {
          attentionStore.applyState(envelope.state)
        } else if (envelope.type === 'attention' && envelope.attention !== undefined) {
          attentionStore.applyAttention(envelope.attention)
          if (document.visibilityState === 'hidden') fireAttention(envelope.attention)
        } else if (envelope.type === 'activity' && envelope.activity !== undefined) {
          attentionStore.applyActivity(envelope.activity)
        }
      } catch {
        // 解析失败忽略，等待下一条或轮询兜底。
      }
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void attentionStore.refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      source.close()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // 首次请求系统通知权限（用户点「允许」后，切出也能收到通知）。
  useEffect(() => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => { /* 拒绝静默 */ })
    }
  }, [])

  return <ActivityBall />
}
