# dsh-session-attention

![npm](https://img.shields.io/npm/v/dsh-session-attention)
![license](https://img.shields.io/npm/l/dsh-session-attention)
![dsh](https://img.shields.io/badge/dsh-%3E%3D0.2.0--rc.2-blue)
![compat](https://github.com/Meltllsy/dsh-session-attention/actions/workflows/compat.yml/badge.svg)

DSH **会话注意力提醒**插件 —— 只管「DSH 会话」这一件事：

- **完成 / 提问 / 审批提醒**：agent 完成一轮回复（`turn/end` + `completed`）、用
  `ask_user_question` 提问、或有审批请求（`approval/asked`）时提醒你。三类可分别开关。
- **只在切出 DSH 时弹**：标签页可见时不打扰（你正看着屏幕，不需要提示）；切走时转成
  **系统原生通知** + **提醒音**，点通知回到 DSH。
- **活动悬浮球**：页面右下角可拖动的球，显示 DSH 当前活跃会话（思考中 / 执行工具 / 等待你，
  最多 5 个、按最近更新排序），有活动时发光脉动；点开可跳回对应会话；另有画中画悬浮窗。
- **侧边栏「提醒」入口**：开关、音量、音色、试听、系统通知授权、悬浮球设置。

> 本插件是 `dsh-todo-reminder` 拆出来的**会话模块**。个人待办（全局、与会话无关）留在
> `dsh-todo-reminder`，两者数据、设置、声效文件、接口全部独立，可单独安装、单独卸载。

## 安装

从 npm 装（推荐）：

```bash
dsh plugin --profile desktop add dsh-session-attention    # 桌面端
dsh plugin --profile web     add dsh-session-attention    # 浏览器版
```

从源码装（仓库里已带构建产物 `lib/`，克隆后可直接指过去）：

```bash
git clone https://github.com/Meltllsy/dsh-session-attention.git
dsh plugin --profile desktop add link:<克隆目录>
```

> 改了源码想重新构建：`npm install && npm run prepack`（host 半 `tsc` → `lib/`，client 半 `tsdown` → `lib/client.js`）。
## 设置与数据

| 项 | 位置 |
|---|---|
| 设置文件 | `$DSH_HOME/session-attention/settings.json`（原子写） |
| 自定义提醒音 | `$DSH_HOME/session-attention/session.{mp3,wav,ogg,m4a}` |
| 旧位置（仍然有效） | `$DSH_HOME/todo-reminder/session.*` |
| HTTP 接口 | `/api/attention/state`、`/api/attention/set-settings`、`/api/attention/events`（SSE）、`/api/attention/sound` |

**一次性迁移**：首次运行时若本模块的设置文件不存在，会从旧插件
`$DSH_HOME/todo-reminder/todos.json` 的 `settings.attention` / `settings.ball`
读一次当种子并立即落盘；旧文件不删，回滚安全。

## 音效怎么走

1. **自定义音效文件优先**：设置面板里点过试听/在页面点过任意位置后，音频解锁并探测
   `/api/attention/sound`，命中则解码为 AudioBuffer 使用。
2. **内置合成音兜底**：没有文件 / 解码失败时用 WebAudio 现场合成（info / success / warning / danger 四套音色）。
3. **系统通知兜底**：音频尚未解锁时，由系统通知自己出声（`silent: false`）。

音频解锁靠 document 上的手势监听自动完成（点 DSH 里任何地方即可），不需要专门操作。
页面内音效在前台/后台都会响；**页面完全关闭时不会响**，那时只有系统通知，而浏览器通知
只能用系统默认音（浏览器 API 不允许指定自定义音）。

## 限制

- 提醒需要 GUI 标签页存在（后台亦可）；页面完全关闭期间不会有任何提醒。
- 活动悬浮球、画中画、侧边栏入口都是 DOM 注入，依赖 DSH shell 的类名；shell 大改版可能需同步更新选择器。

## 构建

```bash
npm install          # 只需一次
npm run prepack      # host 半 tsc → lib/；client 半 tsdown → lib/client.js
```

host 半只依赖 `node:` 内置模块（自包含）；client 半经 tsdown 打包为 ModuleLoader 客户端，React 交给宿主运行时。

## 兼容性

本插件依赖 DSH 的一些**内部点**（服务名、事件名、DOM 类名、客户端包格式）。DSH 演进较快，
这些点在版本之间**会变** —— 插件断掉往往不是插件自己的 bug，而是这里变了。所以仓库里带了一个自检脚本：

```bash
npm run check:compat                        # 检查本机已装的 DSH
node scripts/check-compat.mjs --from <dir>  # 检查指定目录（CI 用）
```

实测结果：

| DSH 版本 | 结果 |
|---|---|
| `0.2.0-rc.2`（当前） | ✅ 15/15 |
| `0.2.1-alpha.2`（下一个） | ✅ 15/15 |

依赖点一览（断哪条、坏哪个功能，脚本输出里都写了）：

| 分类 | 依赖点 |
|---|---|
| 客户端 | `__ModuleLoader__` 加载器格式、`/plugins` 资源路由 |
| 服务 | `uiWorkspace.openSession`、会话列表 `byId` 快照、host 的 `webServer` / `systemPrompt` |
| DOM | 类名含 `sessionRow` / `newSession` / `centerCol` |
| 事件 | `session/event` / `turn/end` / `approval/asked` / `tool/call` |
| 工具 | `ask_user_question` |

**GitHub Actions 每周自动跑一次**（含 alpha 版本），不通过就自动开 issue —— 所以 DSH 更新导致的不兼容
会被提前发现，而不是等用户先撞上。

> 与 [dsh-todo-reminder](https://github.com/Meltllsy/dsh-todo-reminder) 是各自独立的插件，互不依赖，可单独安装。

## 截图

> 待补：截图放 `docs/` 下，然后把这一行换成 `![面板](docs/panel.png)`。
