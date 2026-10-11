/**
 * 会话注意力模块的状态服务：持有设置，并把状态变化派发给 SSE 订阅者。
 * 本模块不调度任何定时任务 —— 提醒完全由会话事件驱动。
 * @module dsh-session-attention/service
 */
import type { AttentionModuleSettings, AttentionSettings, AttentionState, BallSettings } from './types.js';
/** setSettings 的补丁形态。 */
export interface SettingsPatch {
    attention?: Partial<AttentionSettings>;
    ball?: Partial<BallSettings>;
}
export declare class AttentionService {
    private doc;
    private readonly listeners;
    /** 当前完整状态（含服务器时间，供客户端对齐）。 */
    state(): AttentionState;
    /** 当前设置（深拷贝）。 */
    settings(): AttentionModuleSettings;
    /** 更新设置并广播；返回更新后的设置。 */
    setSettings(patch: SettingsPatch): AttentionModuleSettings;
    subscribe(listener: (state: AttentionState) => void): () => void;
    private emit;
}
