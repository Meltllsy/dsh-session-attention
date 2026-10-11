/**
 * 会话提醒的发布源：host 内 pub/sub，SSE 路由订阅它、把「需要用户操作」
 * 的事件实时推给浏览器。
 * @module dsh-todo-reminder/attention
 */
import type { AttentionEvent } from './types.js';
export declare class AttentionSource {
    private readonly listeners;
    subscribe(listener: (event: AttentionEvent) => void): () => void;
    emit(event: AttentionEvent): void;
}
