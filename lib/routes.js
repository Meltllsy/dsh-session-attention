/**
 * 会话注意力 HTTP 路由：/api/attention/* JSON 端点，外加 /api/attention/events
 * SSE 事件流（请求状态 / 会话提醒 / 活动快照实时推送）与会话声道自定义音效文件。
 * host 用 ctx.webServer.register 注册这些 exact 路由。
 * @module dsh-session-attention/routes
 */
import { existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { attentionDir, legacyTodoReminderDir } from './settings.js';
/** Browser-facing base path. */
export const ATTENTION_API_PREFIX = '/api/attention';
function json(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
}
function requireMethod(req, res, method) {
    if (req.method === method)
        return true;
    json(res, 405, { ok: false, error: 'method-not-allowed' });
    return false;
}
function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > 64 * 1024) {
                reject(new Error('body-too-large'));
                queueMicrotask(() => req.destroy());
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (chunks.length === 0) {
                resolve({});
                return;
            }
            try {
                const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                resolve(typeof parsed === 'object' && parsed !== null ? parsed : {});
            }
            catch {
                reject(new Error('invalid-json'));
            }
        });
        req.on('error', reject);
    });
}
/** GET 路由封装。 */
function getRoute(path, run) {
    return {
        kind: 'exact',
        path,
        handler: (req, res) => {
            if (!requireMethod(req, res, 'GET'))
                return;
            try {
                json(res, 200, run());
            }
            catch (error) {
                json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
            }
        },
    };
}
/** POST 路由封装（body 传入 run）。 */
function postRoute(path, run) {
    return {
        kind: 'exact',
        path,
        handler: (req, res) => {
            if (!requireMethod(req, res, 'POST'))
                return Promise.resolve();
            return readJsonBody(req).then((body) => {
                try {
                    json(res, 200, run(body));
                }
                catch (error) {
                    json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
                }
            }, (error) => {
                json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
            });
        },
    };
}
/** SSE 事件流：连接即推送状态 + 活动快照，之后状态 / 会话提醒 / 活动变化实时推送。 */
function sseRoute(service, attention, activity) {
    return {
        kind: 'exact',
        path: `${ATTENTION_API_PREFIX}/events`,
        handler: (req, res) => {
            if (req.method !== 'GET') {
                json(res, 405, { ok: false, error: 'method-not-allowed' });
                return;
            }
            res.writeHead(200, {
                'content-type': 'text/event-stream; charset=utf-8',
                'cache-control': 'no-cache, no-transform',
                'connection': 'keep-alive',
            });
            res.write(': connected\n\n');
            const send = (message) => {
                try {
                    res.write(`data: ${JSON.stringify(message)}\n\n`);
                }
                catch {
                    // 连接已断，忽略。
                }
            };
            send({ type: 'state', state: service.state() });
            send({ type: 'activity', activity: activity.snapshot() });
            const unsubscribeState = service.subscribe((state) => send({ type: 'state', state }));
            const unsubscribeAttention = attention.subscribe((attentionEvent) => send({ type: 'attention', attention: attentionEvent }));
            const unsubscribeActivity = activity.subscribe((activityState) => send({ type: 'activity', activity: activityState }));
            const cleanup = () => {
                unsubscribeState();
                unsubscribeAttention();
                unsubscribeActivity();
            };
            req.on('close', cleanup);
            res.on('close', cleanup);
        },
    };
}
/** 自定义音效文件扩展名 → mime，按顺序取第一个存在的。 */
const SOUND_EXTENSIONS = [
    { ext: 'mp3', mime: 'audio/mpeg' },
    { ext: 'wav', mime: 'audio/wav' },
    { ext: 'ogg', mime: 'audio/ogg' },
    { ext: 'm4a', mime: 'audio/mp4' },
];
/**
 * 会话声道自定义音效路由：先找本模块目录 `$DSH_HOME/session-attention/session.*`，
 * 再回退到旧插件目录 `$DSH_HOME/todo-reminder/session.*`（拆分前放的文件继续有效），
 * 都没有则 404 —— 客户端会退回内置合成音。
 */
function soundRoute() {
    const candidates = SOUND_EXTENSIONS.map((e) => ({ file: `session.${e.ext}`, mime: e.mime }));
    return {
        kind: 'exact',
        path: `${ATTENTION_API_PREFIX}/sound`,
        handler: (req, res) => {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                res.writeHead(405);
                res.end();
                return;
            }
            const dirs = [attentionDir(), legacyTodoReminderDir()];
            for (const dir of dirs) {
                for (const candidate of candidates) {
                    const file = join(dir, candidate.file);
                    if (!existsSync(file))
                        continue;
                    return readFile(file).then((body) => {
                        res.writeHead(200, {
                            'content-type': candidate.mime,
                            'content-length': String(body.byteLength),
                            'cache-control': 'no-cache',
                        });
                        if (req.method === 'HEAD') {
                            res.end();
                            return;
                        }
                        res.end(body);
                    }, () => {
                        res.writeHead(404);
                        res.end();
                    });
                }
            }
            res.writeHead(404);
            res.end();
        },
    };
}
/**
 * 打开本插件的数据目录（自定义音效就放这里）。
 * 只打开插件自己的固定目录，不接受任何入参，因此没有路径注入面。
 */
function openDirRoute() {
    return {
        kind: 'exact',
        path: `${ATTENTION_API_PREFIX}/open-dir`,
        handler: (req, res) => {
            if (!requireMethod(req, res, 'POST'))
                return;
            const dir = attentionDir();
            try {
                mkdirSync(dir, { recursive: true });
                const opener = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
        spawn(opener, [dir], { detached: true, stdio: 'ignore' }).unref();
                json(res, 200, { ok: true, dir });
            }
            catch (error) {
                json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
            }
        },
    };
}
/** 构建完整路由族。 */
export function makeAttentionRoutes(service, attention, activity) {
    return [
        getRoute(`${ATTENTION_API_PREFIX}/state`, () => service.state()),
        sseRoute(service, attention, activity),
        openDirRoute(),
        soundRoute(),
        postRoute(`${ATTENTION_API_PREFIX}/set-settings`, (body) => {
            const raw = (typeof body.settings === 'object' && body.settings !== null ? body.settings : {});
            const settings = service.setSettings({
                ...(typeof raw.attention === 'object' && raw.attention !== null
                    ? { attention: raw.attention }
                    : {}),
                ...(typeof raw.ball === 'object' && raw.ball !== null
                    ? { ball: raw.ball }
                    : {}),
            });
            return { ok: true, settings };
        }),
    ];
}
//# sourceMappingURL=routes.js.map