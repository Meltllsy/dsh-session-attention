/**
 * 会话提醒的发布源：host 内 pub/sub，SSE 路由订阅它、把「需要用户操作」
 * 的事件实时推给浏览器。
 * @module dsh-todo-reminder/attention
 */
export class AttentionSource {
    listeners = new Set();
    subscribe(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    emit(event) {
        for (const listener of this.listeners) {
            try {
                listener(event);
            }
            catch {
                // 单个订阅者异常不得拖垮其它推送。
            }
        }
    }
}
//# sourceMappingURL=attention.js.map