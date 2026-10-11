/**
 * 会话注意力 HTTP 路由：/api/attention/* JSON 端点，外加 /api/attention/events
 * SSE 事件流（请求状态 / 会话提醒 / 活动快照实时推送）与会话声道自定义音效文件。
 * host 用 ctx.webServer.register 注册这些 exact 路由。
 * @module dsh-session-attention/routes
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ActivitySource } from './activity.js';
import type { AttentionSource } from './attention.js';
import type { AttentionService } from './service.js';
/** webServer 路由描述（局部类型，避免 host 运行时依赖 @deepseek-ai/dsh-host-webserver）。 */
export interface WebRoute {
    kind: 'exact' | 'prefix';
    path: string;
    handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>;
}
/** Browser-facing base path. */
export declare const ATTENTION_API_PREFIX = "/api/attention";
/** 构建完整路由族。 */
export declare function makeAttentionRoutes(service: AttentionService, attention: AttentionSource, activity: ActivitySource): WebRoute[];
