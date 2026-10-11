/**
 * DSH 多会话活动发布源：host 内维护「会话 id → 活动快照」的注册表，SSE 路由订阅它、
 * 把「当前活跃会话列表」（最多 5 个、按最近更新时间排序）实时推给浏览器。
 * @module dsh-todo-reminder/activity
 */
import type { SessionActivity } from './types.js';
export declare class ActivitySource {
    private readonly sessions;
    private readonly listeners;
    subscribe(listener: (sessions: SessionActivity[]) => void): () => void;
    /** 当前活跃会话列表（SSE 连接时立即推送用）。 */
    snapshot(): SessionActivity[];
    /** 更新（或插入）一个会话的活动快照，并推送。 */
    update(activity: SessionActivity): void;
    /** 移除一个会话（turn 中止/失败，或会话被释放）。 */
    remove(sessionId: string): void;
    private list;
    private emit;
}
