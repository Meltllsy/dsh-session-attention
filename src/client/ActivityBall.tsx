/**
 * DSH 会话活动悬浮球：浮在页面上的可拖动小球，只展示 DSH 当前活跃会话
 * （思考中 / 执行工具 / 等待你，最多 5 个、按最近更新排序）；有活动时发光脉动。
 * 位置随窗口缩放自动夹回视口，松手可吸附边缘；Esc 或点击外部收起面板。
 *
 * 刻意**不提供画中画置顶小窗**：Chromium 的 Document PiP 窗口是操作系统级始终置顶，
 * 会干扰独占全屏游戏（LOL / 守望先锋等切全屏失败或被弹回窗口化）。球只活在 DSH 窗口内。
 * @module dsh-session-attention/client/ActivityBall
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react'
import { attentionStore } from './attention-store.ts'
import { canOpenSession, openSession, sessionTitleOf } from './session-nav.ts'
import { DEFAULT_SETTINGS, type ActivityPhase, type SessionActivity } from '../types.ts'

const POS_KEY = 'dsh.todoReminder.ballPos'
const BALL_SIZE = 44
/** 与 styles.ts `.todo-ball-panel` 的 width / max-height 保持一致，否则贴边时会算错位置。 */
const PANEL_WIDTH = 300
const PANEL_MAX_HEIGHT = 380
const EDGE = 8
const GAP = 12

interface BallPos { x: number, y: number }

const PHASE_META: Record<ActivityPhase, { icon: string, label: string }> = {
  thinking: { icon: '💭', label: '思考中' },
  tool: { icon: '⚙️', label: '执行中' },
  done: { icon: '🔔', label: '等待你' },
}

const IDLE_META = { icon: '🌀', label: '空闲' }

/** 汇总阶段：done > tool > thinking > idle。 */
function summaryPhase(sessions: SessionActivity[]): ActivityPhase | 'idle' {
  if (sessions.length === 0) return 'idle'
  if (sessions.some((s) => s.phase === 'done')) return 'done'
  if (sessions.some((s) => s.phase === 'tool')) return 'tool'
  return 'thinking'
}

function sessionLabel(session: SessionActivity): string {
  // host 推来的标题在 DSH 0.2 里拿不到，回退问客户端会话列表（侧边栏同源）。
  const raw = session.sessionTitle !== undefined && session.sessionTitle !== ''
    ? session.sessionTitle
    : sessionTitleOf(session.sessionId)
  if (raw !== undefined && raw !== '') {
    return raw.length > 18 ? `${raw.slice(0, 18)}…` : raw
  }
  return `会话 ${session.sessionId.slice(0, 8)}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(min, max), Math.max(min, value))
}

/** 把位置夹回当前视口内。 */
function clampPos(pos: BallPos): BallPos {
  return {
    x: clamp(pos.x, EDGE, window.innerWidth - BALL_SIZE - EDGE),
    y: clamp(pos.y, EDGE, window.innerHeight - BALL_SIZE - EDGE),
  }
}

function loadPos(): BallPos {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<BallPos>
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return clampPos({ x: parsed.x, y: parsed.y })
    }
  } catch { /* 忽略损坏的本地记录 */ }
  return { x: EDGE, y: window.innerHeight - 160 }
}

function savePos(pos: BallPos): void {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos))
  } catch { /* 隐私模式下写不进去，忽略 */ }
}

export function ActivityBall(): ReactElement | null {
  const { activity, data } = useSyncExternalStore(attentionStore.subscribe, attentionStore.getSnapshot)
  const [expanded, setExpanded] = useState(false)
  const [pos, setPos] = useState<BallPos>(loadPos)
  const posRef = useRef(pos)
  const drag = useRef<{ startX: number, startY: number, moved: boolean } | null>(null)
  const ballRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const ball = data?.settings.ball ?? DEFAULT_SETTINGS.ball
  const phase = summaryPhase(activity)
  const meta = phase === 'idle' ? IDLE_META : PHASE_META[phase]
  const count = activity.length

  const updatePos = useCallback((next: BallPos): void => {
    posRef.current = next
    setPos(next)
  }, [])

  // 窗口缩放后把球夹回视口：否则缩小窗口会把球永久留在视口外，再也点不到。
  useEffect(() => {
    const onResize = (): void => {
      const next = clampPos(posRef.current)
      if (next.x !== posRef.current.x || next.y !== posRef.current.y) {
        updatePos(next)
        savePos(next)
      } else {
        // 面板定位依赖视口尺寸，缩放后需要重算一次。
        setPos({ ...posRef.current })
      }
    }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize) }
  }, [updatePos])

  // Esc / 点击面板外部收起。
  useEffect(() => {
    if (!expanded) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setExpanded(false)
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target === null) return
      if (ballRef.current?.contains(target) === true) return
      if (panelRef.current?.contains(target) === true) return
      setExpanded(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [expanded])

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>): boolean => {
    const state = drag.current
    drag.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch { /* 指针已释放，忽略 */ }
    return state !== null && state.moved
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    drag.current = { startX: event.clientX, startY: event.clientY, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag.current === null) return
    const dx = event.clientX - drag.current.startX
    const dy = event.clientY - drag.current.startY
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true
    if (drag.current.moved) {
      updatePos({ x: posRef.current.x + dx, y: posRef.current.y + dy })
      drag.current.startX = event.clientX
      drag.current.startY = event.clientY
    }
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!endDrag(event)) {
      setExpanded((value) => !value)
      return
    }
    let next = clampPos(posRef.current)
    if (ball.snapToEdge) {
      const toLeft = next.x + BALL_SIZE / 2 < window.innerWidth / 2
      next = { ...next, x: toLeft ? EDGE : window.innerWidth - BALL_SIZE - EDGE }
    }
    updatePos(next)
    savePos(next)
  }

  // 指针被系统手势 / 触屏中断：必须复位，否则球会一直黏着指针。
  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>): void => {
    endDrag(event)
    const next = clampPos(posRef.current)
    updatePos(next)
    savePos(next)
  }

  const panelStyle: CSSProperties = {
    left: pos.x - PANEL_WIDTH - GAP >= EDGE
      ? pos.x - PANEL_WIDTH - GAP
      : clamp(pos.x + BALL_SIZE + GAP, EDGE, window.innerWidth - PANEL_WIDTH - EDGE),
    top: clamp(pos.y, EDGE, window.innerHeight - PANEL_MAX_HEIGHT - EDGE),
    maxHeight: Math.min(PANEL_MAX_HEIGHT, window.innerHeight - EDGE * 2),
  }

  /**
   * 点一条会话就跳进去；桥缺席时降级为纯展示。
   * 标题一并传下去：0.1.6 的跳转是在侧边栏按标题定位该会话行再委托点击。
   */
  const goToSession = (session: SessionActivity): void => {
    if (openSession({ sessionId: session.sessionId, title: session.sessionTitle })) setExpanded(false)
  }

  const renderSession = (session: SessionActivity): ReactElement => {
    const sessionMeta = PHASE_META[session.phase]
    const navigable = canOpenSession()
    const task = session.phase === 'tool' && session.tool !== undefined ? session.tool : sessionMeta.label
    return (
      <div
        className="todo-ball-row"
        key={session.sessionId}
        data-navigable={navigable ? 'true' : undefined}
        role={navigable ? 'button' : undefined}
        tabIndex={navigable ? 0 : undefined}
        title={navigable ? `${sessionLabel(session)} · ${task}\n点击进入这个会话` : `${sessionLabel(session)} · ${task}`}
        onClick={navigable ? () => goToSession(session) : undefined}
        onKeyDown={navigable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                goToSession(session)
              }
            }
          : undefined}
      >
        <span className="todo-ball-row-icon">{sessionMeta.icon}</span>
        <span className="todo-ball-row-title">{sessionLabel(session)}</span>
        <span className="todo-ball-row-state">{task}</span>
        {navigable ? <span className="todo-ball-row-go" aria-hidden="true">›</span> : null}
      </div>
    )
  }

  const tooltip = count > 0
    ? `DSH：${activity.map((s) => `${PHASE_META[s.phase].label}·${sessionLabel(s)}`).join('；')}`
    : 'DSH：空闲'

  // 所有 hook 之上不做条件返回：关闭悬浮球在这里才短路。
  if (!ball.enabled) return null

  return (
    <>
      <div
        ref={ballRef}
        className="todo-ball"
        role="button"
        tabIndex={0}
        aria-label={tooltip}
        aria-expanded={expanded}
        data-phase={phase}
        data-active={phase === 'idle' ? undefined : 'true'}
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setExpanded((value) => !value)
          }
        }}
        title={tooltip}
      >
        <span className="todo-ball-icon">{meta.icon}</span>
        {count > 0 ? <span className="todo-ball-badge">{count}</span> : null}
      </div>

      {expanded ? (
        <div className="todo-ball-panel" ref={panelRef} style={panelStyle}>
          <div className="todo-ball-panel-head">
            <h3 className="todo-ball-panel-title">DSH 活跃{count > 0 ? ` (${count})` : ''}</h3>
            <button type="button" className="todo-btn" aria-label="关闭" onClick={() => setExpanded(false)}>✕</button>
          </div>
          {count === 0 ? <div className="todo-ball-empty">暂无进行中的对话</div> : activity.map(renderSession)}
        </div>
      ) : null}
    </>
  )
}
