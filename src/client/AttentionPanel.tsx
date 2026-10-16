/**
 * 设置面板：挂在中心列（会话列）里，由侧边栏「提醒」入口开合。
 * 只管本模块 —— 三类提醒开关、提醒音（音量 / 音色 / 试听 / 音源）、活动悬浮球，
 * 外加系统通知权限状态与「最近一条提醒 / 活跃会话」的只读摘要。
 * @module dsh-session-attention/client/AttentionPanel
 */

import { useState, useSyncExternalStore, type ReactElement } from 'react'
import { attentionStore } from './attention-store.ts'
import { STYLE_META } from './styles.ts'
import { previewSound, soundSourceLabel } from './sound.ts'
import { DEFAULT_SETTINGS, REMINDER_STYLES, type ReminderStyle } from '../types.ts'

const PHASE_LABEL: Record<string, string> = { thinking: '思考中', tool: '执行工具', done: '等待你' }

function formatTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function AttentionPanel(props: { onClose?: () => void }): ReactElement {
  const onClose = props.onClose
  const { data, error, activity, latest } = useSyncExternalStore(attentionStore.subscribe, attentionStore.getSnapshot)
  const settings = data?.settings ?? DEFAULT_SETTINGS
  const { attention, ball } = settings

  // 滑杆用本地态拖动、松手才落盘，避免每移动一格都打一次接口。
  const [volume, setVolume] = useState<number | null>(null)
  const shownVolume = volume ?? Math.round(attention.volume * 100)
  const commitVolume = (): void => {
    if (volume === null) return
    void attentionStore.setAttention({ volume: volume / 100 })
    setVolume(null)
  }

  const [permission, setPermission] = useState<string>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const requestPermission = (): void => {
    if (typeof Notification === 'undefined') return
    void Notification.requestPermission().then((value) => setPermission(value)).catch(() => { /* 拒绝静默 */ })
  }

  const [sourceLabel, setSourceLabel] = useState<string>(soundSourceLabel())
  const refreshSource = (): void => { setSourceLabel(soundSourceLabel()) }

  return (
    <div className="todo-panel">
      <div className="todo-header">
        <span className="todo-title">🔔 DSH 会话提醒</span>
        <span className="todo-count">{activity.length > 0 ? `${activity.length} 个活跃会话` : '无活跃会话'}</span>
              <button
          type="button"
          className="todo-btn"
          title="关闭面板（Esc 也可以）"
          aria-label="关闭"
          onClick={() => { attentionStore.setPanel(false); onClose?.() }}
        >
          ✕
        </button>
      </div>

      {error !== null ? <div className="todo-empty">连接 host 失败：{error}</div> : null}

      <div className="todo-settings-group">💬 什么时候提醒你（只在切出 DSH 时弹）</div>
      <div className="todo-settings">
        <label className="todo-check" title="agent 完成一轮回复时提醒">
          <input type="checkbox" checked={attention.onTurnEnd} onChange={(e) => void attentionStore.setAttention({ onTurnEnd: e.target.checked })} />
          完成一轮
        </label>
        <label className="todo-check" title="agent 用 ask_user_question 提问时提醒">
          <input type="checkbox" checked={attention.onQuestion} onChange={(e) => void attentionStore.setAttention({ onQuestion: e.target.checked })} />
          提问
        </label>
        <label className="todo-check" title="有审批请求（approve/deny）时提醒">
          <input type="checkbox" checked={attention.onApproval} onChange={(e) => void attentionStore.setAttention({ onApproval: e.target.checked })} />
          审批
        </label>
      </div>

      <div className="todo-settings-group">🔊 提醒音</div>
      <div className="todo-settings">
        <span className="todo-settings-label">响铃</span>
        <label className="todo-check" title="关掉后只有系统通知，没有页面内音效">
          <input type="checkbox" checked={attention.sound} onChange={(e) => void attentionStore.setAttention({ sound: e.target.checked })} />
          出声
        </label>
        <span className="todo-settings-hint">音量</span>
        <input
          className="todo-range"
          type="range"
          min={0}
          max={100}
          step={5}
          value={shownVolume}
          onChange={(e) => setVolume(Number(e.target.value))}
          onPointerUp={commitVolume}
          onKeyUp={commitVolume}
          onBlur={commitVolume}
          title="会话提醒音量"
        />
        <span className="todo-settings-hint">{shownVolume}%</span>
        <span className="todo-settings-hint">音色</span>
        <select
          className="todo-select"
          value={attention.tone}
          onChange={(e) => void attentionStore.setAttention({ tone: e.target.value as ReminderStyle })}
          title="用哪种音色"
        >
          {REMINDER_STYLES.map((style) => (
            <option key={style} value={style}>{STYLE_META[style].icon} {STYLE_META[style].label}</option>
          ))}
        </select>
        <button
          type="button"
          className="todo-btn"
          onClick={() => { previewSound(attention.tone, shownVolume / 100, 1); window.setTimeout(refreshSource, 400) }}
          title="试听提醒音"
        >
          🔈 试听
        </button>
        <button
          type="button"
          className="todo-btn"
          title="在文件管理器里打开音效文件所在目录"
          onClick={() => void attentionStore.openSoundDir()}
        >
          📂 打开文件夹
        </button>
        <span className="todo-settings-hint">音源 {sourceLabel}</span>
        <span className="todo-settings-hint">自定义音效：$DSH_HOME/session-attention/session.mp3（旧位置 todo-reminder/session.mp3 仍有效）</span>
      </div>

      <div className="todo-settings-group">🖥 系统通知</div>
      <div className="todo-settings">
        <span className="todo-settings-label">权限</span>
        <span className="todo-settings-hint">
          {permission === 'granted' ? '已授权' : permission === 'denied' ? '已被拒绝（需在浏览器/系统设置里放开）' : permission === 'unsupported' ? '当前环境不支持' : '未授权'}
        </span>
        {permission === 'default' ? (
          <button type="button" className="todo-btn" onClick={requestPermission}>开启系统通知</button>
        ) : null}
      </div>

      <div className="todo-settings-group">🫧 活动悬浮球</div>
      <div className="todo-settings">
        <span className="todo-settings-label">悬浮球</span>
        <label className="todo-check" title="显示 DSH 活跃会话的悬浮球；关闭后页面上不再出现">
          <input type="checkbox" checked={ball.enabled} onChange={(e) => void attentionStore.setBall({ enabled: e.target.checked })} />
          显示
        </label>
        <label className="todo-check" title="拖动松手后自动吸附到最近的左右边缘">
          <input type="checkbox" checked={ball.snapToEdge} onChange={(e) => void attentionStore.setBall({ snapToEdge: e.target.checked })} />
          边缘吸附
        </label>
      </div>

      <div className="todo-settings-group">📋 最近</div>
      <div className="todo-settings">
        <span className="todo-settings-label">最近提醒</span>
        <span className="todo-settings-hint">
          {latest === null ? '还没有提醒过' : `${formatTime(latest.at)} ${latest.title}${latest.sessionTitle !== undefined ? ' · ' + latest.sessionTitle : ''}`}
        </span>
      </div>
      <div className="todo-settings">
        <span className="todo-settings-label">活跃会话</span>
        <span className="todo-settings-hint">
          {activity.length === 0
            ? '空闲'
            : activity.map((item) => `${item.sessionTitle ?? item.sessionId.slice(0, 8)}：${PHASE_LABEL[item.phase] ?? item.phase}${item.tool !== undefined ? '（' + item.tool + '）' : ''}`).join(' ｜ ')}
        </span>
      </div>
    </div>
  )
}
