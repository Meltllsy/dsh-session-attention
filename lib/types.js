/**
 * dsh-session-attention 共享类型（host 与 client 都引用；纯类型 + 少量纯函数）。
 * 本包只管「DSH 会话」一件事：agent 完成一轮 / 提问 / 需要审批时提醒，
 * 外加一个只显示活跃会话的活动悬浮球。不含任何待办概念。
 * @module dsh-session-attention/types
 */
export const REMINDER_STYLES = ['info', 'success', 'warning', 'danger'];
export function isReminderStyle(value) {
    return typeof value === 'string' && REMINDER_STYLES.includes(value);
}
/** 夹紧数值到 [min,max]；非有限数回退 fallback。 */
export function clampNumber(value, min, max, fallback) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n))
        return fallback;
    return Math.min(max, Math.max(min, n));
}
export const DEFAULT_SETTINGS = {
    attention: { onTurnEnd: true, onQuestion: true, onApproval: true, sound: true, volume: 0.5, tone: 'success' },
    ball: { enabled: true, snapToEdge: true },
};
//# sourceMappingURL=types.js.map