/**
 * 会话提醒音引擎：在页面内播放提醒音，标签页在前台或后台都一致出声。
 *
 * 优先播放自定义音效文件 —— $DSH_HOME/session-attention/session.{mp3,wav,ogg,m4a}，
 * 旧位置 $DSH_HOME/todo-reminder/session.* 仍然有效（拆分前的文件不用搬家）；
 * 都没有时用 WebAudio 现场合成，因此零配置也有声。
 *
 * 浏览器自动播放策略要求先有用户手势才允许出声，所以这里在 document 上挂手势监听
 * 自动解锁：用户在 DSH 里点任何地方即完成解锁，不需要专门操作。
 * @module dsh-session-attention/client/sound
 */

import type { ReminderStyle } from '../types.ts'

/** 每种音色的合成序列：[频率 Hz, 相对起始秒, 时长秒]。 */
const TONES: Record<ReminderStyle, ReadonlyArray<readonly [number, number, number]>> = {
  info: [[880, 0, 0.12], [1174.7, 0.13, 0.18]],
  success: [[659.3, 0, 0.1], [880, 0.1, 0.1], [1318.5, 0.2, 0.24]],
  warning: [[740, 0, 0.16], [587.3, 0.19, 0.26]],
  danger: [[932.3, 0, 0.1], [698.5, 0.12, 0.1], [932.3, 0.24, 0.1], [698.5, 0.36, 0.2]],
}

/** 自定义音效端点（host 侧先找本模块目录，再回退旧插件目录）。 */
const SOUND_URL = '/api/attention/sound'

/** 两次重复播放之间的间隔（秒）。 */
const REPEAT_GAP = 0.14

type AudioContextCtor = new () => AudioContext

let audioContext: AudioContext | null = null
let customBuffer: AudioBuffer | null = null
let probe: Promise<void> | null = null
let unlocked = false
let gestureBound = false

function contextCtor(): AudioContextCtor | undefined {
  const w = window as unknown as { AudioContext?: AudioContextCtor, webkitAudioContext?: AudioContextCtor }
  return w.AudioContext ?? w.webkitAudioContext
}

function ensureContext(): AudioContext | null {
  if (audioContext !== null) return audioContext
  const Ctor = contextCtor()
  if (Ctor === undefined) return null
  try {
    audioContext = new Ctor()
  } catch {
    audioContext = null
  }
  return audioContext
}

/** 探测自定义音效文件；404 / 解码失败则继续用合成音。 */
async function probeSound(): Promise<void> {
  if (probe !== null) return probe
  const ctx = ensureContext()
  if (ctx === null) return
  probe = (async () => {
    try {
      const response = await fetch(SOUND_URL, { cache: 'no-store' })
      if (!response.ok) return
      customBuffer = await ctx.decodeAudioData(await response.arrayBuffer())
    } catch {
      customBuffer = null
    }
  })()
  return probe
}

function unlock(): void {
  const ctx = ensureContext()
  if (ctx === null) return
  if (ctx.state === 'suspended') void ctx.resume().catch(() => { /* 用户尚未授权，下次手势再试 */ })
  unlocked = true
  void probeSound()
}

/**
 * 挂手势监听自动解锁音频（浏览器自动播放策略）。
 * @returns 解除监听的 disposer。
 */
export function armSoundUnlock(): () => void {
  if (gestureBound) return () => { /* 已挂载，交给首个调用方清理 */ }
  gestureBound = true
  const events: ReadonlyArray<keyof DocumentEventMap> = ['pointerdown', 'keydown', 'touchstart']
  const onGesture = (): void => { unlock() }
  for (const event of events) document.addEventListener(event, onGesture, { capture: true, passive: true })
  return () => {
    for (const event of events) document.removeEventListener(event, onGesture, { capture: true })
    gestureBound = false
  }
}

/** 调度一段合成音；返回这段音的总时长（秒）。 */
function scheduleSynth(ctx: AudioContext, tone: ReminderStyle, volume: number, startAt: number): number {
  let span = 0
  for (const [frequency, offset, duration] of TONES[tone]) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = frequency
    const t0 = startAt + offset
    const t1 = t0 + duration
    // 指数包络：避免起停爆音（gain 不能取 0，故用极小值）。
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t0 + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t1)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t1 + 0.02)
    span = Math.max(span, offset + duration)
  }
  return span
}

/** 调度一次自定义音效播放；返回时长（秒）。 */
function scheduleBuffer(ctx: AudioContext, buffer: AudioBuffer, volume: number, startAt: number): number {
  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  source.buffer = buffer
  gain.gain.value = volume
  source.connect(gain).connect(ctx.destination)
  source.start(startAt)
  return buffer.duration
}

/**
 * 播放一次会话提醒音。
 * @param tone - 音色（合成音时生效）。
 * @param volume - 音量 0..1。
 * @param repeat - 连响次数（1..5）。
 * @returns 是否已成功调度（音频未解锁 / 不支持时返回 false）。
 */
export function playSound(tone: ReminderStyle, volume: number, repeat = 1): boolean {
  const ctx = ensureContext()
  if (ctx === null) return false
  if (ctx.state === 'suspended') void ctx.resume().catch(() => { /* 未解锁，静默失败 */ })
  if (!unlocked && ctx.state !== 'running') return false
  const vol = Math.min(1, Math.max(0, volume))
  if (vol === 0) return false
  const times = Math.min(5, Math.max(1, Math.round(repeat)))
  const buffer = customBuffer
  let cursor = ctx.currentTime + 0.02
  for (let i = 0; i < times; i += 1) {
    const span = buffer !== null
      ? scheduleBuffer(ctx, buffer, vol, cursor)
      : scheduleSynth(ctx, tone, vol, cursor)
    cursor += span + REPEAT_GAP
  }
  return true
}

/** 试听：立即解锁（本次调用来自用户点击，必定允许出声）并播放一次。 */
export function previewSound(tone: ReminderStyle, volume: number, repeat = 1): void {
  unlock()
  // 自定义音效可能仍在探测中：探测完再播，保证试听到的就是实际提醒音。
  void probeSound().then(() => {
    playSound(tone, volume, repeat)
  })
}

/** 音频是否已解锁可用；未就绪时调用方应让系统通知自己出声兜底。 */
export function isSoundReady(): boolean {
  return unlocked
}

/** 当前音源说明，用于设置面板提示。 */
export function soundSourceLabel(): string {
  if (!unlocked) return '未解锁（在页面里点一下即可）'
  return customBuffer !== null ? '自定义音效文件' : '内置合成音'
}
