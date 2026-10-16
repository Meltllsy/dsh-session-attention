/**
 * 客户端样式：一段 CSS 字符串（apply 时注入 <style>），配色走 dsh 的
 * --dsw-alias-* token，自动适配明暗主题与皮肤。数据属性作用域隔离，不污染 shell。
 * @module dsh-session-attention/client/styles
 */

import type { ReminderStyle } from '../types.ts'

export const STYLE_META: Record<ReminderStyle, { label: string; icon: string }> = {
  info: { label: '提醒', icon: 'ℹ️' },
  success: { label: '纪念', icon: '✅' },
  warning: { label: '注意', icon: '⚠️' },
  danger: { label: '紧急', icon: '🚨' },
}

export const ATTENTION_CSS = `
/* --- 面板接管中心列（独立页面式，与任务看板 / SSH 一致） ------------------ */
/* DSH 0.1.6 移除了 data-pane 标记，中心列改用 CSS-module 类名（centerCol）；
   这里同时兼容旧标记与新类名，否则容器定位会失效。 */
/* 只给自己挂载的宿主定位：全局匹配 centerCol 会连带影响其他插件的容器。 */
[data-dsh-att-host] { position: relative; }

[data-dsh-att-view] {
  position: absolute;
  inset: 0;
  display: none;
  z-index: 60;
  overflow: auto;
  background: var(--dsw-alias-bg-base);
}
html[data-dsh-attention-active] [data-dsh-att-view] { display: block; }
html[data-dsh-attention-active] [data-dsh-att-host] > :not([data-dsh-att-view]) {
  display: none !important;
}
/* --- 侧边栏入口 ---------------------------------------------------------- */
[data-dsh-att-entry] {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  font-family: var(--dsw-font-family);
}
[data-dsh-att-entry]:hover {
  background: var(--dsw-specific-sidebar-nav-item-hover);
  color: var(--dsw-alias-label-primary);
}
[data-dsh-att-entry][data-active] {
  background: var(--dsw-specific-sidebar-nav-item-active);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
[data-dsh-att-entry] .todo-entry-icon { display: inline-flex; align-items: center; justify-content: center; flex: none; }
[data-dsh-att-entry] .todo-entry-label { overflow: hidden; text-overflow: ellipsis; }
/* 侧边栏收起态：0.1.6 把折叠标记从 [data-dsh-frame] 挪到了 [data-sidebar-collapsed]，
   两种祖先都匹配，避免收起后入口标签溢出。 */
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-att-entry],
[data-sidebar-collapsed] [data-dsh-att-entry] { justify-content: center; padding: 0; }
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-att-entry] .todo-entry-label,
[data-sidebar-collapsed] [data-dsh-att-entry] .todo-entry-label { display: none; }

/* --- 面板主体 ------------------------------------------------------------ */
.todo-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 14px 16px 16px;
  gap: 12px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
}
.todo-header { display: flex; align-items: center; gap: 10px; flex: none; }
.todo-title { margin: 0; font-size: 16px; font-weight: 700; color: var(--dsw-alias-label-primary); white-space: nowrap; }
.todo-count { flex: none; font-size: 12px; color: var(--dsw-alias-label-tertiary); background: var(--dsw-alias-interactive-bg-hover); border-radius: 999px; padding: 1px 8px; }

.todo-form { display: flex; flex-direction: column; gap: 8px; flex: none; }
.todo-form-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.todo-input { flex: 1; min-width: 160px; padding: 7px 10px; font-size: 13px; color: var(--dsw-alias-label-primary); background: var(--dsw-specific-input-major); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; outline: none; font-family: inherit; }
.todo-input:focus { border-color: var(--dsw-alias-state-business-primary); }
.todo-input::placeholder { color: var(--dsw-alias-label-tertiary); }
.todo-select { padding: 7px 8px; font-size: 12.5px; color: var(--dsw-alias-label-primary); background: var(--dsw-specific-input-major); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; outline: none; }
.todo-select:focus { border-color: var(--dsw-alias-state-business-primary); }
.todo-check { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--dsw-alias-label-primary); cursor: pointer; user-select: none; }
.todo-check input { accent-color: var(--dsw-alias-state-business-primary); margin: 0; }

/* --- 设置行（响铃 / 稍后提醒分钟数） ------------------------------------ */
.todo-settings { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: none; padding: 8px 10px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; }
.todo-settings-label { font-size: 12px; font-weight: 700; color: var(--dsw-alias-label-tertiary); }
.todo-settings-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary); }

.todo-list { display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0; overflow-y: auto; }
.todo-section-title { margin: 4px 0 0; font-size: 11px; font-weight: 700; color: var(--dsw-alias-label-tertiary); text-transform: none; letter-spacing: .02em; }
.todo-empty { padding: 24px 8px; text-align: center; font-size: 12px; color: var(--dsw-alias-label-tertiary); }

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
}
.todo-item:hover { border-color: var(--dsw-alias-border-l3); }
.todo-item[data-done] { opacity: .6; }
.todo-item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.todo-item-title { font-size: 13px; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
.todo-item[data-done] .todo-item-title { text-decoration: line-through; }
.todo-item-note { font-size: 12px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; white-space: pre-wrap; }
.todo-item-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.todo-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11px; border: 1px solid var(--todo-accent, var(--dsw-alias-border-l2)); color: var(--todo-accent, var(--dsw-alias-label-secondary)); background: transparent; }
.todo-badge[data-style='info'] { --todo-accent: var(--dsw-alias-state-business-primary); }
.todo-badge[data-style='success'] { --todo-accent: var(--dsw-alias-state-success-primary); }
.todo-badge[data-style='warning'] { --todo-accent: var(--dsw-alias-state-warn-primary); }
.todo-badge[data-style='danger'] { --todo-accent: var(--dsw-alias-state-error-primary); }

.todo-actions { display: flex; align-items: center; gap: 4px; flex: none; }
.todo-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 26px; padding: 0 10px;
  background: transparent; border: none; border-radius: 6px;
  color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 12px; white-space: nowrap;
}
.todo-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.todo-btn.primary { color: #fff; background: var(--dsw-alias-button-info-fill); padding: 0 12px; font-weight: 600; }
.todo-btn.primary:hover { background: var(--dsw-alias-button-info-hover); }
.todo-btn.danger:hover { color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-state-error-secondary); }
.todo-btn[disabled] { opacity: .5; cursor: default; }

/* --- 提醒 toast ---------------------------------------------------------- */
.todo-toast-stack {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 1400;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(360px, calc(100vw - 32px));
  pointer-events: none;
}
.todo-toast {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--todo-accent, var(--dsw-alias-border-l2));
  border-left-width: 4px;
  border-radius: 10px;
  box-shadow: var(--dsw-shadow-lv3);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  animation: todo-toast-in 220ms ease;
}
.todo-toast[data-style='info'] { --todo-accent: var(--dsw-alias-state-business-primary); }
.todo-toast[data-style='success'] { --todo-accent: var(--dsw-alias-state-success-primary); }
.todo-toast[data-style='warning'] { --todo-accent: var(--dsw-alias-state-warn-primary); }
.todo-toast[data-style='danger'] { --todo-accent: var(--dsw-alias-state-error-primary); animation: todo-toast-in 220ms ease, todo-toast-pulse 1.6s ease-in-out infinite; }
.todo-toast-head { display: flex; align-items: center; gap: 8px; }
.todo-toast-icon { font-size: 16px; line-height: 1; }
.todo-toast-title { flex: 1; min-width: 0; font-size: 13px; font-weight: 700; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.todo-toast-sub { font-size: 11px; color: var(--todo-accent, var(--dsw-alias-label-tertiary)); }
.todo-toast-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
@keyframes todo-toast-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
@keyframes todo-toast-pulse { 0%,100% { box-shadow: var(--dsw-shadow-lv3); } 50% { box-shadow: 0 0 0 3px var(--todo-accent, transparent); } }

/* --- 确认弹窗 ------------------------------------------------------------ */
.todo-modal-backdrop {
  position: fixed; inset: 0; z-index: 1500;
  display: flex; align-items: center; justify-content: center;
  background: var(--dsw-alias-bg-mask-1);
}
.todo-modal {
  display: flex; flex-direction: column; gap: 12px;
  width: min(440px, calc(100vw - 48px));
  padding: 18px;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  box-shadow: var(--dsw-shadow-lv3);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
}
.todo-modal-title { margin: 0; font-size: 15px; font-weight: 700; }
.todo-modal-message { margin: 0; font-size: 13px; line-height: 1.5; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.todo-modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }

/* --- DSH 会话活动悬浮球（独立模块，不含待办内容） ------------------------ */
.todo-ball {
  position: fixed;
  z-index: 1340;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: var(--dsw-shadow-lv2);
  cursor: grab;
  user-select: none;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  touch-action: none;
  --ball-accent: var(--dsw-alias-label-tertiary);
}
.todo-ball:active { cursor: grabbing; }
.todo-ball-icon { font-size: 18px; line-height: 1; pointer-events: none; }
.todo-ball-badge {
  position: absolute;
  top: -4px; right: -4px;
  min-width: 16px; height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--dsw-alias-state-business-primary);
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  font-weight: 700;
  pointer-events: none;
}
.todo-ball[data-phase='thinking'] { --ball-accent: var(--dsw-alias-state-business-primary); }
.todo-ball[data-phase='tool'] { --ball-accent: var(--dsw-alias-state-warn-primary); }
.todo-ball[data-phase='done'] { --ball-accent: var(--dsw-alias-state-success-primary); }
.todo-ball[data-active] {
  border-color: var(--ball-accent);
  animation: todo-ball-glow 1.6s ease-in-out infinite;
}
@keyframes todo-ball-glow {
  0%, 100% { box-shadow: var(--dsw-shadow-lv2); }
  50% { box-shadow: 0 0 0 4px var(--ball-accent); }
}
.todo-ball-panel {
  position: fixed;
  z-index: 1340;
  width: 300px;
  max-height: 380px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  box-shadow: var(--dsw-shadow-lv3);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  overflow-y: auto;
  /* 这是个控件面板而非文档：默认箭头指针，避免鼠标移到文字上变成输入光标。 */
  cursor: default;
  user-select: none;
}
.todo-ball-panel-head { display: flex; align-items: center; gap: 8px; }
.todo-ball-panel-title { margin: 0; font-size: 14px; font-weight: 700; flex: 1; }
.todo-ball-row { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.todo-ball-row:last-child { border-bottom: none; }
.todo-ball-row-icon { flex: none; font-size: 13px; }
.todo-ball-row-title { flex: 1; min-width: 0; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-ball-row-state { flex: none; font-size: 11px; color: var(--dsw-alias-label-tertiary); max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-ball-row[data-navigable] {
  margin: 0 -6px;
  padding: 6px;
  border-radius: 7px;
  cursor: pointer;
}
.todo-ball-row[data-navigable]:hover { background: var(--dsw-alias-fill-secondary); }
.todo-ball-row[data-navigable]:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
.todo-ball-row-go { flex: none; font-size: 14px; color: var(--dsw-alias-label-tertiary); }
.todo-ball-empty { padding: 16px 4px; text-align: center; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.todo-ball-actions { display: flex; gap: 6px; flex-wrap: wrap; padding-top: 4px; }
.todo-ball-mini { flex: none; padding: 2px 8px; font-size: 11px; }

/* --- 个人待办 Dock（右侧边缘吸附，可收起） ------------------------------- */
.todo-dock {
  position: fixed;
  right: 0;
  z-index: 1350;
  display: flex;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-right: none;
  box-shadow: var(--dsw-shadow-lv3);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  touch-action: none;
}
/* 收起态：贴边药丸，直接显示下一件要做的事。 */
.todo-dock[data-collapsed='true'] {
  flex-direction: row;
  align-items: center;
  gap: 7px;
  max-width: 268px;
  padding: 7px 10px 7px 13px;
  border-radius: 999px 0 0 999px;
  box-shadow: var(--dsw-shadow-lv2);
  cursor: pointer;
  user-select: none;
}
.todo-dock[data-collapsed='true']:hover { background: var(--dsw-alias-fill-secondary); }
/* 展开态：右侧待办面板。 */
.todo-dock[data-collapsed='false'] {
  flex-direction: column;
  gap: 8px;
  width: 320px;
  padding: 12px;
  border-radius: 12px 0 0 12px;
  /* 同上：控件面板用箭头指针，文字不做选中。 */
  cursor: default;
  user-select: none;
}
/* 表单控件恢复自身的输入光标与可选中，不受面板的 user-select: none 影响。 */
.todo-dock input, .todo-dock select, .todo-dock textarea { cursor: auto; user-select: auto; }
.todo-dock[data-overdue='true'] { border-color: var(--dsw-alias-state-error-primary); }
.todo-dock[data-collapsed='true'][data-overdue='true'] { animation: todo-dock-pulse 1.8s ease-in-out infinite; }
@keyframes todo-dock-pulse {
  0%, 100% { box-shadow: var(--dsw-shadow-lv2); }
  50% { box-shadow: 0 0 0 4px var(--dsw-alias-state-error-primary); }
}

.todo-dock-icon { flex: none; font-size: 14px; line-height: 1; }
.todo-dock-time { flex: none; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
.todo-dock-time[data-overdue='true'] { color: var(--dsw-alias-state-error-primary); }
.todo-dock-next { flex: 1; min-width: 0; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-dock-idle { flex: none; font-size: 12px; color: var(--dsw-alias-label-tertiary); }

.todo-dock-head { display: flex; align-items: center; gap: 8px; cursor: grab; user-select: none; }
.todo-dock-head:active { cursor: grabbing; }
.todo-dock-title { margin: 0; flex: 1; font-size: 14px; font-weight: 700; }
.todo-dock-add { display: flex; gap: 6px; }
.todo-dock-add .todo-input { flex: 1; min-width: 0; }
.todo-dock-when { flex: none; width: 96px; }
.todo-dock-body { display: flex; flex-direction: column; overflow-y: auto; max-height: 46vh; }
.todo-dock-section { padding: 6px 2px 2px; font-size: 11px; font-weight: 700; letter-spacing: .02em; color: var(--dsw-alias-label-tertiary); }
.todo-dock-row { display: flex; align-items: center; gap: 7px; padding: 6px 2px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.todo-dock-row:last-child { border-bottom: none; }
.todo-dock-check {
  flex: none;
  width: 17px; height: 17px;
  padding: 0;
  border: 1.5px solid var(--dsw-alias-border-l3);
  border-radius: 50%;
  background: transparent;
  color: transparent;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
}
.todo-dock-check:hover { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }
.todo-dock-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.todo-dock-row-title { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-dock-row-due { font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.todo-dock-row[data-overdue='true'] .todo-dock-row-due { color: var(--dsw-alias-state-error-primary); font-weight: 700; }
.todo-dock-row-actions { flex: none; display: flex; gap: 4px; opacity: 0; transition: opacity .12s ease; }
.todo-dock-row:hover .todo-dock-row-actions, .todo-dock-row:focus-within .todo-dock-row-actions { opacity: 1; }
.todo-dock-mini { flex: none; padding: 2px 7px; font-size: 11px; }
.todo-dock-empty { padding: 14px 4px; text-align: center; font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-tertiary); }
.todo-dock-foot { display: flex; gap: 6px; flex-wrap: wrap; }
.todo-settings-group {
  padding: 10px 2px 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--dsw-alias-label-secondary);
}
.todo-range { flex: none; width: 96px; accent-color: var(--dsw-alias-state-business-primary); cursor: pointer; }

@media (prefers-reduced-motion: reduce) {
  .todo-toast { animation: none; }
  .todo-toast[data-style='danger'] { animation: none; }
  .todo-dock[data-collapsed='true'][data-overdue='true'] { animation: none; }
  .todo-ball[data-active] { animation: none; }
}
`

/** 注入样式（幂等）。 */
export function injectStyles(): void {
  if (document.querySelector('style[data-dsh-att-css]') !== null) return
  const style = document.createElement('style')
  style.dataset.dshAttCss = ''
  style.textContent = ATTENTION_CSS
  document.head.appendChild(style)
}
