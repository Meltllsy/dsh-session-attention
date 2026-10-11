/**
 * 浏览器 → host 的同源 JSON API 封装（与 dsh-pet 的 /api/pet/* 同模式）。
 * @module dsh-session-attention/client/api
 */

import type { AttentionSettings, AttentionState, BallSettings } from '../types.ts'

async function attentionFetch<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined
    ? {}
    : {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
  if (!response.ok) {
    throw new Error(`attention ${path} failed: ${response.status}`)
  }
  return (await response.json()) as T
}

export const attentionApi = {
  /** 在文件管理器里打开数据目录（自定义音效放这里）。 */
  openDir: () => attentionFetch<{ ok: boolean, dir?: string }>('/api/attention/open-dir', {}),
  state: () => attentionFetch<AttentionState>('/api/attention/state'),
  setSettings: (settings: {
    attention?: Partial<AttentionSettings>
    ball?: Partial<BallSettings>
  }) => attentionFetch<{ ok: boolean }>('/api/attention/set-settings', { settings }),
}
