/**
 * 本模块设置的磁盘持久化：$DSH_HOME/session-attention/settings.json
 * （原子写 tmp+rename；容错读：损坏 → 默认值）。
 *
 * 兼容迁移：本模块拆自 dsh-todo-reminder，旧版把 attention / ball 设置存在
 * $DSH_HOME/todo-reminder/todos.json 的 settings 里。本模块自己的文件不存在时
 * 会从那里读一次当种子并立即落盘，此后不再看旧文件；旧文件不删，回滚安全。
 * @module dsh-session-attention/settings
 */
import { type AttentionModuleSettings } from './types.js';
/** DSH 数据根：$DSH_HOME（优先）或 ~/.dsh。 */
export declare function attentionHomeDir(): string;
/** 本模块的数据目录。 */
export declare function attentionDir(): string;
/** 本模块的设置文件。 */
export declare function settingsFile(): string;
/** 旧插件的数据目录：迁移种子来源，也是会话自定义音效的回退位置。 */
export declare function legacyTodoReminderDir(): string;
/** 归一化设置（缺省回退）。 */
export declare function normalizeSettings(raw: unknown): AttentionModuleSettings;
/** 读取设置：自己的文件 → 旧数据迁移一次 → 默认值。 */
export declare function loadSettings(): AttentionModuleSettings;
/** 原子写设置；失败静默（内存态继续可用）。 */
export declare function saveSettings(settings: AttentionModuleSettings): void;
