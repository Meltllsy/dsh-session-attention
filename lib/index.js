/**
 * dsh-session-attention host 半 —— 监听会话事件，把「agent 完成一轮 / 提问 /
 * 需要审批」变成提醒事件，并维护多会话活动快照；两者都经 SSE 推给浏览器。
 * 本模块与个人待办完全独立（待办在 dsh-todo-reminder）。host 半只依赖 node: 内置模块。
 * @module dsh-session-attention
 */
import { ActivitySource } from './activity.js';
import { AttentionSource } from './attention.js';
import { AttentionService } from './service.js';
import { makeAttentionRoutes } from './routes.js';
/** 稳定的 cordis 插件名（与 cordis.patch.yml insert id 一致）。 */
export const name = 'session-attention';
/** host 半需要的注入服务。 */
export const inject = ['webServer', 'systemPrompt'];
/** 面向模型的公告：本模块存在性、能力、边界（不含待办）。 */
export const ATTENTION_GUIDANCE = '本机已安装 dsh-session-attention 插件（DSH 会话提醒模块）。它只做一件事：当 agent 完成一轮回复（turn/end + completed）、用 ask_user_question 提问、或有审批请求（approval/asked）时，在 DSH 界面弹提醒 —— 页面内富 toast；标签页在后台时自动转成系统通知；可配提示音（音量/音色可调，自定义音效放 $DSH_HOME/session-attention/session.mp3，旧位置 $DSH_HOME/todo-reminder/session.mp3 仍然有效）。三类提醒可分别开关。另有：侧边栏「提醒」入口（开关与音量设置、试听）、一个显示活跃会话（思考中 / 执行工具 / 等待你）的活动悬浮球，点提醒可跳回对应会话。本插件不含任何待办内容 —— 个人待办是另一个独立插件 dsh-todo-reminder。用户说「跑完通知我 / 审批提醒 / 提醒设置」时指本插件；说「待办 / todo / 提醒我做事」时指待办插件。';
/** 公告 section 在工具引导带的顺序。 */
const SECTION_ORDER = 202;
/**
 * host 装配：创建服务与两个发布源、注册路由、监听会话事件、注入公告。
 * @param ctx - host 上下文（webServer + systemPrompt 已注入）。
 */
export function apply(ctx) {
    const service = new AttentionService();
    const attention = new AttentionSource();
    const activity = new ActivitySource();
    // 路由（含 SSE 事件流）：fiber dispose 自动注销。
    ctx.effect(() => {
        const disposers = makeAttentionRoutes(service, attention, activity).map((route) => ctx.webServer.register(route));
        return () => {
            for (const dispose of disposers)
                dispose();
        };
    }, 'session-attention: routes');
    // 会话事件 → 活动进度 + 「需要你操作」提醒。
    ctx.effect(() => {
        /** 从 session 日志折叠出最新标题（session/title 事件）。 */
        const readSessionTitle = (session) => {
            try {
                const events = session.events;
                if (Array.isArray(events)) {
                    for (let i = events.length - 1; i >= 0; i--) {
                        const ev = events[i];
                        if (ev?.type === 'session/title' && typeof ev.data?.title === 'string' && ev.data.title !== '') {
                            return ev.data.title;
                        }
                    }
                }
            }
            catch { /* 忽略 */ }
            return undefined;
        };
        const onEvent = (session, event) => {
            const e = event;
            const now = Date.now();
            const sessionId = typeof session?.id === 'string' ? session.id : undefined;
            const sessionTitle = sessionId !== undefined ? readSessionTitle(session) : undefined;
            // 活动进度（多会话注册表）：step/start → 思考中，tool/call → 执行工具，
            // turn/end → 完成（等你）或移除（中止/失败）。
            if (sessionId !== undefined) {
                if (e.type === 'step/start') {
                    activity.update({ phase: 'thinking', sessionId, sessionTitle, changedAt: now });
                }
                else if (e.type === 'tool/call') {
                    activity.update({ phase: 'tool', tool: e.data?.name, sessionId, sessionTitle, changedAt: now });
                }
                else if (e.type === 'turn/end') {
                    if (e.data?.reason?.kind === 'completed') {
                        activity.update({ phase: 'done', sessionId, sessionTitle, changedAt: now });
                    }
                    else {
                        activity.remove(sessionId);
                    }
                }
            }
            // 「需要你操作」提醒（三类可分别开关）。
            const att = service.settings().attention;
            if (e.type === 'turn/end' && e.data?.reason?.kind === 'completed' && att.onTurnEnd) {
                attention.emit({ kind: 'turn-end', title: 'DSH 已完成', body: 'agent 已回复完，等你回应', at: now, sessionId, sessionTitle });
            }
            else if (e.type === 'tool/call' && e.data?.name === 'ask_user_question' && att.onQuestion) {
                attention.emit({ kind: 'question', title: 'DSH 有问题问你', body: '点击回到 DSH 回答', at: now, sessionId, sessionTitle });
            }
            else if (e.type === 'approval/asked' && att.onApproval) {
                attention.emit({ kind: 'approval', title: 'DSH 需要你的审批', body: '有操作需要你确认', at: now, sessionId, sessionTitle });
            }
        };
        const onDisposed = (session) => {
            const id = typeof session?.id === 'string' ? session.id : undefined;
            if (id !== undefined)
                activity.remove(id);
        };
        const disposeEvent = ctx.on('session/event', onEvent);
        const disposeDisposed = ctx.on('session/disposed', onDisposed);
        return () => {
            disposeEvent();
            disposeDisposed();
        };
    }, 'session-attention: session-events');
    // 公告：让 agent 知道本模块存在（systemPrompt 可选注入，缺失时静默）。
    ctx.effect(() => {
        if (ctx.systemPrompt === undefined)
            return;
        return ctx.systemPrompt.section({
            name: 'plugin:session-attention',
            order: SECTION_ORDER,
            text: ATTENTION_GUIDANCE,
        });
    }, 'session-attention: guidance');
}
export { AttentionService } from './service.js';
//# sourceMappingURL=index.js.map