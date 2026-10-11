/**
 * 本模块设置的磁盘持久化：$DSH_HOME/session-attention/settings.json
 * （原子写 tmp+rename；容错读：损坏 → 默认值）。
 *
 * 兼容迁移：本模块拆自 dsh-todo-reminder，旧版把 attention / ball 设置存在
 * $DSH_HOME/todo-reminder/todos.json 的 settings 里。本模块自己的文件不存在时
 * 会从那里读一次当种子并立即落盘，此后不再看旧文件；旧文件不删，回滚安全。
 * @module dsh-session-attention/settings
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { clampNumber, DEFAULT_SETTINGS, isReminderStyle, type AttentionModuleSettings } from './types.js'

/** DSH 数据根：$DSH_HOME（优先）或 ~/.dsh。 */
export function attentionHomeDir(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** 本模块的数据目录。 */
export function attentionDir(): string {
  return join(attentionHomeDir(), 'session-attention')
}

/** 本模块的设置文件。 */
export function settingsFile(): string {
  return join(attentionDir(), 'settings.json')
}

/** 旧插件的数据目录：迁移种子来源，也是会话自定义音效的回退位置。 */
export function legacyTodoReminderDir(): string {
  return join(attentionHomeDir(), 'todo-reminder')
}

/** 归一化设置（缺省回退）。 */
export function normalizeSettings(raw: unknown): AttentionModuleSettings {
  const base: AttentionModuleSettings = {
    attention: { ...DEFAULT_SETTINGS.attention },
    ball: { ...DEFAULT_SETTINGS.ball },
  }
  if (typeof raw !== 'object' || raw === null) return base
  const record = raw as Record<string, unknown>
  if (typeof record.attention === 'object' && record.attention !== null) {
    const att = record.attention as Record<string, unknown>
    if (typeof att.onTurnEnd === 'boolean') base.attention.onTurnEnd = att.onTurnEnd
    if (typeof att.onQuestion === 'boolean') base.attention.onQuestion = att.onQuestion
    if (typeof att.onApproval === 'boolean') base.attention.onApproval = att.onApproval
    if (typeof att.sound === 'boolean') base.attention.sound = att.sound
    base.attention.volume = clampNumber(att.volume, 0, 1, base.attention.volume)
    if (isReminderStyle(att.tone)) base.attention.tone = att.tone
  }
  if (typeof record.ball === 'object' && record.ball !== null) {
    const ball = record.ball as Record<string, unknown>
    if (typeof ball.enabled === 'boolean') base.ball.enabled = ball.enabled
    if (typeof ball.snapToEdge === 'boolean') base.ball.snapToEdge = ball.snapToEdge
  }
  return base
}

/** 从旧插件 todos.json 的 settings 里取迁移种子；读不到返回 undefined。 */
function seedFromLegacy(): AttentionModuleSettings | undefined {
  try {
    const parsed = JSON.parse(readFileSync(join(legacyTodoReminderDir(), 'todos.json'), 'utf8')) as { settings?: unknown }
    if (typeof parsed.settings !== 'object' || parsed.settings === null) return undefined
    return normalizeSettings(parsed.settings)
  } catch {
    return undefined
  }
}

/** 读取设置：自己的文件 → 旧数据迁移一次 → 默认值。 */
export function loadSettings(): AttentionModuleSettings {
  try {
    return normalizeSettings(JSON.parse(readFileSync(settingsFile(), 'utf8')))
  } catch {
    const seed = seedFromLegacy()
    if (seed !== undefined) {
      saveSettings(seed)
      return seed
    }
    return normalizeSettings(undefined)
  }
}

/** 原子写设置；失败静默（内存态继续可用）。 */
export function saveSettings(settings: AttentionModuleSettings): void {
  try {
    mkdirSync(attentionDir(), { recursive: true })
    const file = settingsFile()
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8')
    renameSync(tmp, file)
  } catch {
    // 持久化失败静默。
  }
}
