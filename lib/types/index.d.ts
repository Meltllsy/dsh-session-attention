/**
 * dsh-session-attention host 半 —— 监听会话事件，把「agent 完成一轮 / 提问 /
 * 需要审批」变成提醒事件，并维护多会话活动快照；两者都经 SSE 推给浏览器。
 * 本模块与个人待办完全独立（待办在 dsh-todo-reminder）。host 半只依赖 node: 内置模块。
 * @module dsh-session-attention
 */
/** host 上下文最小接口（webServer / on / effect / systemPrompt 由 cordis 注入）。 */
export interface AttentionHostContext {
    webServer: {
        register(route: {
            kind: 'exact' | 'prefix';
            path: string;
            handler: unknown;
        }): () => void;
    };
    effect(fn: () => (() => void) | void, label?: string): () => void;
    on(event: string, listener: (...args: unknown[]) => void): () => void;
    systemPrompt?: {
        section(opts: {
            name: string;
            order: number;
            text: string;
        }): () => void;
    };
}
/** 稳定的 cordis 插件名（与 cordis.patch.yml insert id 一致）。 */
export declare const name = "session-attention";
/** host 半需要的注入服务。 */
export declare const inject: string[];
/** 面向模型的公告：本模块存在性、能力、边界（不含待办）。 */
export declare const ATTENTION_GUIDANCE = "\u672C\u673A\u5DF2\u5B89\u88C5 dsh-session-attention \u63D2\u4EF6\uFF08DSH \u4F1A\u8BDD\u63D0\u9192\u6A21\u5757\uFF09\u3002\u5B83\u53EA\u505A\u4E00\u4EF6\u4E8B\uFF1A\u5F53 agent \u5B8C\u6210\u4E00\u8F6E\u56DE\u590D\uFF08turn/end + completed\uFF09\u3001\u7528 ask_user_question \u63D0\u95EE\u3001\u6216\u6709\u5BA1\u6279\u8BF7\u6C42\uFF08approval/asked\uFF09\u65F6\uFF0C\u5728 DSH \u754C\u9762\u5F39\u63D0\u9192 \u2014\u2014 \u9875\u9762\u5185\u5BCC toast\uFF1B\u6807\u7B7E\u9875\u5728\u540E\u53F0\u65F6\u81EA\u52A8\u8F6C\u6210\u7CFB\u7EDF\u901A\u77E5\uFF1B\u53EF\u914D\u63D0\u793A\u97F3\uFF08\u97F3\u91CF/\u97F3\u8272\u53EF\u8C03\uFF0C\u81EA\u5B9A\u4E49\u97F3\u6548\u653E $DSH_HOME/session-attention/session.mp3\uFF0C\u65E7\u4F4D\u7F6E $DSH_HOME/todo-reminder/session.mp3 \u4ECD\u7136\u6709\u6548\uFF09\u3002\u4E09\u7C7B\u63D0\u9192\u53EF\u5206\u522B\u5F00\u5173\u3002\u53E6\u6709\uFF1A\u4FA7\u8FB9\u680F\u300C\u63D0\u9192\u300D\u5165\u53E3\uFF08\u5F00\u5173\u4E0E\u97F3\u91CF\u8BBE\u7F6E\u3001\u8BD5\u542C\uFF09\u3001\u4E00\u4E2A\u663E\u793A\u6D3B\u8DC3\u4F1A\u8BDD\uFF08\u601D\u8003\u4E2D / \u6267\u884C\u5DE5\u5177 / \u7B49\u5F85\u4F60\uFF09\u7684\u6D3B\u52A8\u60AC\u6D6E\u7403\uFF0C\u70B9\u63D0\u9192\u53EF\u8DF3\u56DE\u5BF9\u5E94\u4F1A\u8BDD\u3002\u672C\u63D2\u4EF6\u4E0D\u542B\u4EFB\u4F55\u5F85\u529E\u5185\u5BB9 \u2014\u2014 \u4E2A\u4EBA\u5F85\u529E\u662F\u53E6\u4E00\u4E2A\u72EC\u7ACB\u63D2\u4EF6 dsh-todo-reminder\u3002\u7528\u6237\u8BF4\u300C\u8DD1\u5B8C\u901A\u77E5\u6211 / \u5BA1\u6279\u63D0\u9192 / \u63D0\u9192\u8BBE\u7F6E\u300D\u65F6\u6307\u672C\u63D2\u4EF6\uFF1B\u8BF4\u300C\u5F85\u529E / todo / \u63D0\u9192\u6211\u505A\u4E8B\u300D\u65F6\u6307\u5F85\u529E\u63D2\u4EF6\u3002";
/**
 * host 装配：创建服务与两个发布源、注册路由、监听会话事件、注入公告。
 * @param ctx - host 上下文（webServer + systemPrompt 已注入）。
 */
export declare function apply(ctx: AttentionHostContext): void;
export { AttentionService } from './service.js';
export type { SettingsPatch } from './service.js';
export type { AttentionEvent, AttentionModuleSettings, AttentionSettings, AttentionState, BallSettings, SessionActivity } from './types.js';
