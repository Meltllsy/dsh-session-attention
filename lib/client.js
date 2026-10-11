window.__ModuleLoader__.load({
	id: "dsh-session-attention",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_dom_client = require("react-dom/client");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/api.ts
		async function attentionFetch(path, body) {
			const response = await fetch(path, body === void 0 ? {} : {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body)
			});
			if (!response.ok) throw new Error(`attention ${path} failed: ${response.status}`);
			return await response.json();
		}
		const attentionApi = {
			/** 在文件管理器里打开数据目录（自定义音效放这里）。 */
			openDir: () => attentionFetch("/api/attention/open-dir", {}),
			state: () => attentionFetch("/api/attention/state"),
			setSettings: (settings) => attentionFetch("/api/attention/set-settings", { settings })
		};
		//#endregion
		//#region src/client/attention-store.ts
		/**
		* 浏览器端 store：单一实例，持有 host 状态快照（设置）+ DSH 活跃会话列表 +
		* 最近一条提醒 + 面板开合。React 组件经 useSyncExternalStore 订阅。
		* @module dsh-session-attention/client/attention-store
		*/
		var AttentionStore = class {
			state = {
				data: null,
				error: null,
				activity: [],
				latest: null,
				panelOpen: false
			};
			listeners = /* @__PURE__ */ new Set();
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			getSnapshot = () => this.state;
			set(patch) {
				this.state = {
					...this.state,
					...patch
				};
				for (const listener of this.listeners) listener();
			}
			/** host 状态（设置）推送。 */
			applyState(data) {
				this.set({
					data,
					error: null
				});
			}
			/** DSH 活跃会话列表推送。 */
			applyActivity(activity) {
				this.set({ activity });
			}
			/** 一条「需要你操作」提醒到达。 */
			applyAttention(latest) {
				this.set({ latest });
			}
			/** 拉取 host 状态（首次加载 / 回到前台兜底）。 */
			async refresh() {
				try {
					this.applyState(await attentionApi.state());
				} catch (error) {
					this.set({ error: error instanceof Error ? error.message : String(error) });
				}
			}
			/** 在文件管理器里打开数据目录（音效文件放这里）。失败静默。 */
			async openSoundDir() {
				try {
					await attentionApi.openDir();
				} catch {}
			}
			togglePanel() {
				this.set({ panelOpen: !this.state.panelOpen });
			}
			setPanel(open) {
				if (this.state.panelOpen !== open) this.set({ panelOpen: open });
			}
			async setAttention(patch) {
				await attentionApi.setSettings({ attention: patch });
				await this.refresh();
			}
			async setBall(patch) {
				await attentionApi.setSettings({ ball: patch });
				await this.refresh();
			}
		};
		/** 应用级单例（入口 / 面板 / 提醒层共用）。 */
		const attentionStore = new AttentionStore();
		//#endregion
		//#region src/client/session-nav.ts
		let opener = null;
		/**
		* 标题解析桥：host 推来的会话标题在 DSH 0.2 里已经拿不到（session/event 不再带
		* session/title），真正的标题源是**客户端的会话列表**（侧边栏显示的就是它）。
		* client 半在 apply 时把解析器登记进来，纯 React 组件经此取标题。
		*/
		let titleResolver = null;
		/** 登记标题解析器；返回注销 disposer。 */
		function setSessionTitleResolver(next) {
			titleResolver = next;
			return () => {
				if (titleResolver === next) titleResolver = null;
			};
		}
		/** 取某个会话的标题；解析器缺席或查不到时返回 undefined。 */
		function sessionTitleOf(sessionId) {
			if (titleResolver === null) return void 0;
			try {
				return titleResolver(sessionId);
			} catch {
				return;
			}
		}
		/**
		* 登记打开会话的实现。
		* @returns 注销该实现的 disposer（热重载 / 卸载时调用）。
		*/
		function setSessionOpener(next) {
			opener = next;
			return () => {
				if (opener === next) opener = null;
			};
		}
		/**
		* 当前是否具备跳转会话的能力。
		* 只反映「桥已登记」，不代表具体某个会话此刻一定能在侧边栏找到。
		*/
		function canOpenSession() {
			return opener !== null;
		}
		/** 会话行文本的归一化：折叠空白，便于跨渲染比对。 */
		function normalizeLabel(text) {
			return (text ?? "").replace(/\s+/g, " ").trim();
		}
		/**
		* 在侧边栏里找到目标会话行。
		*
		* 只认官方组件使用的 CSS-module 类名（`sessionRow` / `searchResultRow`），
		* 不依赖 hash 前缀，因此跨版本稳定；找不到返回 undefined。
		*/
		function findSessionRow(target) {
			const rows = Array.from(document.querySelectorAll("[class*=\"sessionRow\"], [class*=\"searchResultRow\"]"));
			if (rows.length === 0) return void 0;
			const wanted = normalizeLabel(target.title);
			if (wanted !== "") for (const row of rows) {
				const label = normalizeLabel(row.textContent);
				if (label === wanted || label.includes(wanted)) return row;
			}
			for (const row of rows) {
				const marker = row.getAttribute("data-session-id") ?? row.getAttribute("data-id");
				if (marker !== null && marker === target.sessionId) return row;
			}
		}
		/**
		* 跳到指定会话。
		*
		* 成功与否取决于该会话此刻是否能在侧边栏定位到（例如所属工作区被收起时无法定位）。
		* @returns 是否成功发起跳转
		*/
		function openSession(target) {
			const current = opener;
			if (current === null) return false;
			try {
				Promise.resolve(current(target)).catch(() => false);
				return true;
			} catch {
				return false;
			}
		}
		/** 供登记方使用的 DOM 定位能力（与 openSession 同源策略）。 */
		function resolveSessionRow(target) {
			return findSessionRow(target);
		}
		//#endregion
		//#region src/types.ts
		const REMINDER_STYLES = [
			"info",
			"success",
			"warning",
			"danger"
		];
		const DEFAULT_SETTINGS = {
			attention: {
				onTurnEnd: true,
				onQuestion: true,
				onApproval: true,
				sound: true,
				volume: .5,
				tone: "success"
			},
			ball: {
				enabled: true,
				snapToEdge: true
			}
		};
		//#endregion
		//#region src/client/ActivityBall.tsx
		/**
		* DSH 会话活动悬浮球：浮在页面上的可拖动小球，只展示 DSH 当前活跃会话
		* （思考中 / 执行工具 / 等待你，最多 5 个、按最近更新排序）；有活动时发光脉动。
		* 位置随窗口缩放自动夹回视口，松手可吸附边缘；Esc 或点击外部收起面板。
		*
		* 刻意**不提供画中画置顶小窗**：Chromium 的 Document PiP 窗口是操作系统级始终置顶，
		* 会干扰独占全屏游戏（LOL / 守望先锋等切全屏失败或被弹回窗口化）。球只活在 DSH 窗口内。
		* @module dsh-session-attention/client/ActivityBall
		*/
		const POS_KEY = "dsh.todoReminder.ballPos";
		const BALL_SIZE = 44;
		/** 与 styles.ts `.todo-ball-panel` 的 width / max-height 保持一致，否则贴边时会算错位置。 */
		const PANEL_WIDTH = 300;
		const PANEL_MAX_HEIGHT = 380;
		const EDGE = 8;
		const GAP = 12;
		const PHASE_META = {
			thinking: {
				icon: "💭",
				label: "思考中"
			},
			tool: {
				icon: "⚙️",
				label: "执行中"
			},
			done: {
				icon: "🔔",
				label: "等待你"
			}
		};
		const IDLE_META = {
			icon: "🌀",
			label: "空闲"
		};
		/** 汇总阶段：done > tool > thinking > idle。 */
		function summaryPhase(sessions) {
			if (sessions.length === 0) return "idle";
			if (sessions.some((s) => s.phase === "done")) return "done";
			if (sessions.some((s) => s.phase === "tool")) return "tool";
			return "thinking";
		}
		function sessionLabel(session) {
			const raw = session.sessionTitle !== void 0 && session.sessionTitle !== "" ? session.sessionTitle : sessionTitleOf(session.sessionId);
			if (raw !== void 0 && raw !== "") return raw.length > 18 ? `${raw.slice(0, 18)}…` : raw;
			return `会话 ${session.sessionId.slice(0, 8)}`;
		}
		function clamp(value, min, max) {
			return Math.min(Math.max(min, max), Math.max(min, value));
		}
		/** 把位置夹回当前视口内。 */
		function clampPos(pos) {
			return {
				x: clamp(pos.x, EDGE, window.innerWidth - BALL_SIZE - EDGE),
				y: clamp(pos.y, EDGE, window.innerHeight - BALL_SIZE - EDGE)
			};
		}
		function loadPos() {
			try {
				const raw = localStorage.getItem(POS_KEY);
				if (raw !== null) {
					const parsed = JSON.parse(raw);
					if (typeof parsed.x === "number" && typeof parsed.y === "number") return clampPos({
						x: parsed.x,
						y: parsed.y
					});
				}
			} catch {}
			return {
				x: EDGE,
				y: window.innerHeight - 160
			};
		}
		function savePos(pos) {
			try {
				localStorage.setItem(POS_KEY, JSON.stringify(pos));
			} catch {}
		}
		function ActivityBall() {
			const { activity, data } = (0, react.useSyncExternalStore)(attentionStore.subscribe, attentionStore.getSnapshot);
			const [expanded, setExpanded] = (0, react.useState)(false);
			const [pos, setPos] = (0, react.useState)(loadPos);
			const posRef = (0, react.useRef)(pos);
			const drag = (0, react.useRef)(null);
			const ballRef = (0, react.useRef)(null);
			const panelRef = (0, react.useRef)(null);
			const ball = data?.settings.ball ?? DEFAULT_SETTINGS.ball;
			const phase = summaryPhase(activity);
			const meta = phase === "idle" ? IDLE_META : PHASE_META[phase];
			const count = activity.length;
			const updatePos = (0, react.useCallback)((next) => {
				posRef.current = next;
				setPos(next);
			}, []);
			(0, react.useEffect)(() => {
				const onResize = () => {
					const next = clampPos(posRef.current);
					if (next.x !== posRef.current.x || next.y !== posRef.current.y) {
						updatePos(next);
						savePos(next);
					} else setPos({ ...posRef.current });
				};
				window.addEventListener("resize", onResize);
				return () => {
					window.removeEventListener("resize", onResize);
				};
			}, [updatePos]);
			(0, react.useEffect)(() => {
				if (!expanded) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") setExpanded(false);
				};
				const onPointerDown = (event) => {
					const target = event.target;
					if (target === null) return;
					if (ballRef.current?.contains(target) === true) return;
					if (panelRef.current?.contains(target) === true) return;
					setExpanded(false);
				};
				document.addEventListener("keydown", onKeyDown);
				document.addEventListener("pointerdown", onPointerDown, true);
				return () => {
					document.removeEventListener("keydown", onKeyDown);
					document.removeEventListener("pointerdown", onPointerDown, true);
				};
			}, [expanded]);
			const endDrag = (event) => {
				const state = drag.current;
				drag.current = null;
				try {
					event.currentTarget.releasePointerCapture(event.pointerId);
				} catch {}
				return state !== null && state.moved;
			};
			const onPointerDown = (event) => {
				drag.current = {
					startX: event.clientX,
					startY: event.clientY,
					moved: false
				};
				event.currentTarget.setPointerCapture(event.pointerId);
			};
			const onPointerMove = (event) => {
				if (drag.current === null) return;
				const dx = event.clientX - drag.current.startX;
				const dy = event.clientY - drag.current.startY;
				if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
				if (drag.current.moved) {
					updatePos({
						x: posRef.current.x + dx,
						y: posRef.current.y + dy
					});
					drag.current.startX = event.clientX;
					drag.current.startY = event.clientY;
				}
			};
			const onPointerUp = (event) => {
				if (!endDrag(event)) {
					setExpanded((value) => !value);
					return;
				}
				let next = clampPos(posRef.current);
				if (ball.snapToEdge) {
					const toLeft = next.x + BALL_SIZE / 2 < window.innerWidth / 2;
					next = {
						...next,
						x: toLeft ? EDGE : window.innerWidth - BALL_SIZE - EDGE
					};
				}
				updatePos(next);
				savePos(next);
			};
			const onPointerCancel = (event) => {
				endDrag(event);
				const next = clampPos(posRef.current);
				updatePos(next);
				savePos(next);
			};
			const panelStyle = {
				left: pos.x - PANEL_WIDTH - GAP >= EDGE ? pos.x - PANEL_WIDTH - GAP : clamp(pos.x + BALL_SIZE + GAP, EDGE, window.innerWidth - PANEL_WIDTH - EDGE),
				top: clamp(pos.y, EDGE, window.innerHeight - PANEL_MAX_HEIGHT - EDGE),
				maxHeight: Math.min(PANEL_MAX_HEIGHT, window.innerHeight - 16)
			};
			/**
			* 点一条会话就跳进去；桥缺席时降级为纯展示。
			* 标题一并传下去：0.1.6 的跳转是在侧边栏按标题定位该会话行再委托点击。
			*/
			const goToSession = (session) => {
				if (openSession({
					sessionId: session.sessionId,
					title: session.sessionTitle
				})) setExpanded(false);
			};
			const renderSession = (session) => {
				const sessionMeta = PHASE_META[session.phase];
				const navigable = canOpenSession();
				const task = session.phase === "tool" && session.tool !== void 0 ? session.tool : sessionMeta.label;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "todo-ball-row",
					"data-navigable": navigable ? "true" : void 0,
					role: navigable ? "button" : void 0,
					tabIndex: navigable ? 0 : void 0,
					title: navigable ? `${sessionLabel(session)} · ${task}\n点击进入这个会话` : `${sessionLabel(session)} · ${task}`,
					onClick: navigable ? () => goToSession(session) : void 0,
					onKeyDown: navigable ? (event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							goToSession(session);
						}
					} : void 0,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "todo-ball-row-icon",
							children: sessionMeta.icon
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "todo-ball-row-title",
							children: sessionLabel(session)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "todo-ball-row-state",
							children: task
						}),
						navigable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "todo-ball-row-go",
							"aria-hidden": "true",
							children: "›"
						}) : null
					]
				}, session.sessionId);
			};
			const tooltip = count > 0 ? `DSH：${activity.map((s) => `${PHASE_META[s.phase].label}·${sessionLabel(s)}`).join("；")}` : "DSH：空闲";
			if (!ball.enabled) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: ballRef,
				className: "todo-ball",
				role: "button",
				tabIndex: 0,
				"aria-label": tooltip,
				"aria-expanded": expanded,
				"data-phase": phase,
				"data-active": phase === "idle" ? void 0 : "true",
				style: {
					left: pos.x,
					top: pos.y
				},
				onPointerDown,
				onPointerMove,
				onPointerUp,
				onPointerCancel,
				onKeyDown: (event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						setExpanded((value) => !value);
					}
				},
				title: tooltip,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "todo-ball-icon",
					children: meta.icon
				}), count > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "todo-ball-badge",
					children: count
				}) : null]
			}), expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "todo-ball-panel",
				ref: panelRef,
				style: panelStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "todo-ball-panel-head",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
						className: "todo-ball-panel-title",
						children: ["DSH 活跃", count > 0 ? ` (${count})` : ""]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "todo-btn",
						"aria-label": "关闭",
						onClick: () => setExpanded(false),
						children: "✕"
					})]
				}), count === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "todo-ball-empty",
					children: "暂无进行中的对话"
				}) : activity.map(renderSession)]
			}) : null] });
		}
		//#endregion
		//#region src/client/sound.ts
		/** 每种音色的合成序列：[频率 Hz, 相对起始秒, 时长秒]。 */
		const TONES = {
			info: [[
				880,
				0,
				.12
			], [
				1174.7,
				.13,
				.18
			]],
			success: [
				[
					659.3,
					0,
					.1
				],
				[
					880,
					.1,
					.1
				],
				[
					1318.5,
					.2,
					.24
				]
			],
			warning: [[
				740,
				0,
				.16
			], [
				587.3,
				.19,
				.26
			]],
			danger: [
				[
					932.3,
					0,
					.1
				],
				[
					698.5,
					.12,
					.1
				],
				[
					932.3,
					.24,
					.1
				],
				[
					698.5,
					.36,
					.2
				]
			]
		};
		/** 自定义音效端点（host 侧先找本模块目录，再回退旧插件目录）。 */
		const SOUND_URL = "/api/attention/sound";
		/** 两次重复播放之间的间隔（秒）。 */
		const REPEAT_GAP = .14;
		let audioContext = null;
		let customBuffer = null;
		let probe = null;
		let unlocked = false;
		let gestureBound = false;
		function contextCtor() {
			const w = window;
			return w.AudioContext ?? w.webkitAudioContext;
		}
		function ensureContext() {
			if (audioContext !== null) return audioContext;
			const Ctor = contextCtor();
			if (Ctor === void 0) return null;
			try {
				audioContext = new Ctor();
			} catch {
				audioContext = null;
			}
			return audioContext;
		}
		/** 探测自定义音效文件；404 / 解码失败则继续用合成音。 */
		async function probeSound() {
			if (probe !== null) return probe;
			const ctx = ensureContext();
			if (ctx === null) return;
			probe = (async () => {
				try {
					const response = await fetch(SOUND_URL, { cache: "no-store" });
					if (!response.ok) return;
					customBuffer = await ctx.decodeAudioData(await response.arrayBuffer());
				} catch {
					customBuffer = null;
				}
			})();
			return probe;
		}
		function unlock() {
			const ctx = ensureContext();
			if (ctx === null) return;
			if (ctx.state === "suspended") ctx.resume().catch(() => {});
			unlocked = true;
			probeSound();
		}
		/**
		* 挂手势监听自动解锁音频（浏览器自动播放策略）。
		* @returns 解除监听的 disposer。
		*/
		function armSoundUnlock() {
			if (gestureBound) return () => {};
			gestureBound = true;
			const events = [
				"pointerdown",
				"keydown",
				"touchstart"
			];
			const onGesture = () => {
				unlock();
			};
			for (const event of events) document.addEventListener(event, onGesture, {
				capture: true,
				passive: true
			});
			return () => {
				for (const event of events) document.removeEventListener(event, onGesture, { capture: true });
				gestureBound = false;
			};
		}
		/** 调度一段合成音；返回这段音的总时长（秒）。 */
		function scheduleSynth(ctx, tone, volume, startAt) {
			let span = 0;
			for (const [frequency, offset, duration] of TONES[tone]) {
				const osc = ctx.createOscillator();
				const gain = ctx.createGain();
				osc.type = "sine";
				osc.frequency.value = frequency;
				const t0 = startAt + offset;
				const t1 = t0 + duration;
				gain.gain.setValueAtTime(1e-4, t0);
				gain.gain.exponentialRampToValueAtTime(Math.max(2e-4, volume), t0 + .012);
				gain.gain.exponentialRampToValueAtTime(1e-4, t1);
				osc.connect(gain).connect(ctx.destination);
				osc.start(t0);
				osc.stop(t1 + .02);
				span = Math.max(span, offset + duration);
			}
			return span;
		}
		/** 调度一次自定义音效播放；返回时长（秒）。 */
		function scheduleBuffer(ctx, buffer, volume, startAt) {
			const source = ctx.createBufferSource();
			const gain = ctx.createGain();
			source.buffer = buffer;
			gain.gain.value = volume;
			source.connect(gain).connect(ctx.destination);
			source.start(startAt);
			return buffer.duration;
		}
		/**
		* 播放一次会话提醒音。
		* @param tone - 音色（合成音时生效）。
		* @param volume - 音量 0..1。
		* @param repeat - 连响次数（1..5）。
		* @returns 是否已成功调度（音频未解锁 / 不支持时返回 false）。
		*/
		function playSound(tone, volume, repeat = 1) {
			const ctx = ensureContext();
			if (ctx === null) return false;
			if (ctx.state === "suspended") ctx.resume().catch(() => {});
			if (!unlocked && ctx.state !== "running") return false;
			const vol = Math.min(1, Math.max(0, volume));
			if (vol === 0) return false;
			const times = Math.min(5, Math.max(1, Math.round(repeat)));
			const buffer = customBuffer;
			let cursor = ctx.currentTime + .02;
			for (let i = 0; i < times; i += 1) {
				const span = buffer !== null ? scheduleBuffer(ctx, buffer, vol, cursor) : scheduleSynth(ctx, tone, vol, cursor);
				cursor += span + REPEAT_GAP;
			}
			return true;
		}
		/** 试听：立即解锁（本次调用来自用户点击，必定允许出声）并播放一次。 */
		function previewSound(tone, volume, repeat = 1) {
			unlock();
			probeSound().then(() => {
				playSound(tone, volume, repeat);
			});
		}
		/** 当前音源说明，用于设置面板提示。 */
		function soundSourceLabel() {
			if (!unlocked) return "未解锁（在页面里点一下即可）";
			return customBuffer !== null ? "自定义音效文件" : "内置合成音";
		}
		//#endregion
		//#region src/client/AttentionLayer.tsx
		/**
		* 提醒层：body 上的全局 React 根。经 SSE 订阅 host 的会话提醒与活动快照；
		* 标签页切到后台时，把「需要你操作」的提醒转成系统原生通知 + 提醒音。
		*
		* 只在标签页**不可见**时触发 —— 你正盯着屏幕时不必每轮都被打扰。这里不做
		* 页面内 toast：真在看你不需要它，切走了你也看不见它。
		* @module dsh-session-attention/client/AttentionLayer
		*/
		/**
		* 一条「需要你操作」提醒 → 提醒音 + 系统原生通知。
		* 开启提醒音后系统通知静音，由音效引擎单独出声，避免「系统叮 + 自定义音效」响两遍；
		* 音频未解锁时交回系统提示音兜底。
		*/
		function fireAttention(event) {
			const attention = (attentionStore.getSnapshot().data?.settings ?? DEFAULT_SETTINGS).attention;
			const played = attention.sound ? playSound(attention.tone, attention.volume, 1) : false;
			if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
			const body = event.sessionTitle !== void 0 && event.sessionTitle !== "" ? `${event.sessionTitle} —— ${event.body}` : event.body;
			try {
				const notification = new Notification(event.title, {
					body,
					tag: `dsh-attention-${event.kind}-${event.at}`,
					silent: played ? true : !attention.sound
				});
				notification.onclick = () => {
					window.focus();
					if (event.sessionId !== void 0) openSession({
						sessionId: event.sessionId,
						title: event.sessionTitle
					});
					notification.close();
				};
			} catch {}
		}
		function AttentionLayer() {
			(0, react.useEffect)(() => armSoundUnlock(), []);
			(0, react.useEffect)(() => {
				const source = new EventSource("/api/attention/events");
				source.onmessage = (message) => {
					try {
						const envelope = JSON.parse(message.data);
						if (envelope.type === "state" && envelope.state !== void 0) attentionStore.applyState(envelope.state);
						else if (envelope.type === "attention" && envelope.attention !== void 0) {
							attentionStore.applyAttention(envelope.attention);
							if (document.visibilityState === "hidden") fireAttention(envelope.attention);
						} else if (envelope.type === "activity" && envelope.activity !== void 0) attentionStore.applyActivity(envelope.activity);
					} catch {}
				};
				const onVisibility = () => {
					if (document.visibilityState === "visible") attentionStore.refresh();
				};
				document.addEventListener("visibilitychange", onVisibility);
				return () => {
					source.close();
					document.removeEventListener("visibilitychange", onVisibility);
				};
			}, []);
			(0, react.useEffect)(() => {
				if (typeof Notification === "undefined") return;
				if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivityBall, {});
		}
		//#endregion
		//#region src/client/styles.ts
		const STYLE_META = {
			info: {
				label: "提醒",
				icon: "ℹ️"
			},
			success: {
				label: "纪念",
				icon: "✅"
			},
			warning: {
				label: "注意",
				icon: "⚠️"
			},
			danger: {
				label: "紧急",
				icon: "🚨"
			}
		};
		const ATTENTION_CSS = `
/* --- 面板接管中心列（独立页面式，与任务看板 / SSH 一致） ------------------ */
/* DSH 0.1.6 移除了 data-pane 标记，中心列改用 CSS-module 类名（centerCol）；
   这里同时兼容旧标记与新类名，否则容器定位会失效。 */
[data-pane='conversation'], [class*='centerCol'], [class*='_centerCol'] { position: relative; }

[data-dsh-att-view] {
  position: absolute;
  inset: 0;
  display: none;
  z-index: 60;
  overflow: auto;
  background: var(--dsw-alias-bg-base);
}
html[data-dsh-attention-active] [data-dsh-att-view] { display: block; }
html[data-dsh-attention-active] [data-pane='conversation'] > :not([data-dsh-att-view]),
html[data-dsh-attention-active] [class*='centerCol'] > :not([data-dsh-att-view]),
html[data-dsh-attention-active] [class*='_centerCol'] > :not([data-dsh-att-view]) {
  display: none !important;
}
/* --- 侧边栏入口 ---------------------------------------------------------- */
[data-dsh-att-entry] {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  font-family: var(--dsw-font-family);
}
[data-dsh-att-entry]:hover {
  background: var(--dsw-specific-sidebar-nav-item-hover);
  color: var(--dsw-alias-label-primary);
}
[data-dsh-att-entry][data-active] {
  background: var(--dsw-specific-sidebar-nav-item-active);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
[data-dsh-att-entry] .todo-entry-icon { display: inline-flex; align-items: center; justify-content: center; flex: none; }
[data-dsh-att-entry] .todo-entry-label { overflow: hidden; text-overflow: ellipsis; }
/* 侧边栏收起态：0.1.6 把折叠标记从 [data-dsh-frame] 挪到了 [data-sidebar-collapsed]，
   两种祖先都匹配，避免收起后入口标签溢出。 */
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-att-entry],
[data-sidebar-collapsed] [data-dsh-att-entry] { justify-content: center; padding: 0; }
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-att-entry] .todo-entry-label,
[data-sidebar-collapsed] [data-dsh-att-entry] .todo-entry-label { display: none; }

/* --- 面板主体 ------------------------------------------------------------ */
.todo-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 14px 16px 16px;
  gap: 12px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
}
.todo-header { display: flex; align-items: center; gap: 10px; flex: none; }
.todo-title { margin: 0; font-size: 16px; font-weight: 700; color: var(--dsw-alias-label-primary); white-space: nowrap; }
.todo-count { flex: none; font-size: 12px; color: var(--dsw-alias-label-tertiary); background: var(--dsw-alias-interactive-bg-hover); border-radius: 999px; padding: 1px 8px; }

.todo-form { display: flex; flex-direction: column; gap: 8px; flex: none; }
.todo-form-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.todo-input { flex: 1; min-width: 160px; padding: 7px 10px; font-size: 13px; color: var(--dsw-alias-label-primary); background: var(--dsw-specific-input-major); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; outline: none; font-family: inherit; }
.todo-input:focus { border-color: var(--dsw-alias-state-business-primary); }
.todo-input::placeholder { color: var(--dsw-alias-label-tertiary); }
.todo-select { padding: 7px 8px; font-size: 12.5px; color: var(--dsw-alias-label-primary); background: var(--dsw-specific-input-major); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; outline: none; }
.todo-select:focus { border-color: var(--dsw-alias-state-business-primary); }
.todo-check { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--dsw-alias-label-primary); cursor: pointer; user-select: none; }
.todo-check input { accent-color: var(--dsw-alias-state-business-primary); margin: 0; }

/* --- 设置行（响铃 / 稍后提醒分钟数） ------------------------------------ */
.todo-settings { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: none; padding: 8px 10px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; }
.todo-settings-label { font-size: 12px; font-weight: 700; color: var(--dsw-alias-label-tertiary); }
.todo-settings-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary); }

.todo-list { display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0; overflow-y: auto; }
.todo-section-title { margin: 4px 0 0; font-size: 11px; font-weight: 700; color: var(--dsw-alias-label-tertiary); text-transform: none; letter-spacing: .02em; }
.todo-empty { padding: 24px 8px; text-align: center; font-size: 12px; color: var(--dsw-alias-label-tertiary); }

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
}
.todo-item:hover { border-color: var(--dsw-alias-border-l3); }
.todo-item[data-done] { opacity: .6; }
.todo-item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.todo-item-title { font-size: 13px; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
.todo-item[data-done] .todo-item-title { text-decoration: line-through; }
.todo-item-note { font-size: 12px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; white-space: pre-wrap; }
.todo-item-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.todo-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11px; border: 1px solid var(--todo-accent, var(--dsw-alias-border-l2)); color: var(--todo-accent, var(--dsw-alias-label-secondary)); background: transparent; }
.todo-badge[data-style='info'] { --todo-accent: var(--dsw-alias-state-business-primary); }
.todo-badge[data-style='success'] { --todo-accent: var(--dsw-alias-state-success-primary); }
.todo-badge[data-style='warning'] { --todo-accent: var(--dsw-alias-state-warn-primary); }
.todo-badge[data-style='danger'] { --todo-accent: var(--dsw-alias-state-error-primary); }

.todo-actions { display: flex; align-items: center; gap: 4px; flex: none; }
.todo-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 26px; padding: 0 10px;
  background: transparent; border: none; border-radius: 6px;
  color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 12px; white-space: nowrap;
}
.todo-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.todo-btn.primary { color: #fff; background: var(--dsw-alias-button-info-fill); padding: 0 12px; font-weight: 600; }
.todo-btn.primary:hover { background: var(--dsw-alias-button-info-hover); }
.todo-btn.danger:hover { color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-state-error-secondary); }
.todo-btn[disabled] { opacity: .5; cursor: default; }

/* --- 提醒 toast ---------------------------------------------------------- */
.todo-toast-stack {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 1400;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(360px, calc(100vw - 32px));
  pointer-events: none;
}
.todo-toast {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--todo-accent, var(--dsw-alias-border-l2));
  border-left-width: 4px;
  border-radius: 10px;
  box-shadow: var(--dsw-shadow-lv3);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  animation: todo-toast-in 220ms ease;
}
.todo-toast[data-style='info'] { --todo-accent: var(--dsw-alias-state-business-primary); }
.todo-toast[data-style='success'] { --todo-accent: var(--dsw-alias-state-success-primary); }
.todo-toast[data-style='warning'] { --todo-accent: var(--dsw-alias-state-warn-primary); }
.todo-toast[data-style='danger'] { --todo-accent: var(--dsw-alias-state-error-primary); animation: todo-toast-in 220ms ease, todo-toast-pulse 1.6s ease-in-out infinite; }
.todo-toast-head { display: flex; align-items: center; gap: 8px; }
.todo-toast-icon { font-size: 16px; line-height: 1; }
.todo-toast-title { flex: 1; min-width: 0; font-size: 13px; font-weight: 700; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.todo-toast-sub { font-size: 11px; color: var(--todo-accent, var(--dsw-alias-label-tertiary)); }
.todo-toast-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
@keyframes todo-toast-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
@keyframes todo-toast-pulse { 0%,100% { box-shadow: var(--dsw-shadow-lv3); } 50% { box-shadow: 0 0 0 3px var(--todo-accent, transparent); } }

/* --- 确认弹窗 ------------------------------------------------------------ */
.todo-modal-backdrop {
  position: fixed; inset: 0; z-index: 1500;
  display: flex; align-items: center; justify-content: center;
  background: var(--dsw-alias-bg-mask-1);
}
.todo-modal {
  display: flex; flex-direction: column; gap: 12px;
  width: min(440px, calc(100vw - 48px));
  padding: 18px;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  box-shadow: var(--dsw-shadow-lv3);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
}
.todo-modal-title { margin: 0; font-size: 15px; font-weight: 700; }
.todo-modal-message { margin: 0; font-size: 13px; line-height: 1.5; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.todo-modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }

/* --- DSH 会话活动悬浮球（独立模块，不含待办内容） ------------------------ */
.todo-ball {
  position: fixed;
  z-index: 1340;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: var(--dsw-shadow-lv2);
  cursor: grab;
  user-select: none;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  touch-action: none;
  --ball-accent: var(--dsw-alias-label-tertiary);
}
.todo-ball:active { cursor: grabbing; }
.todo-ball-icon { font-size: 18px; line-height: 1; pointer-events: none; }
.todo-ball-badge {
  position: absolute;
  top: -4px; right: -4px;
  min-width: 16px; height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--dsw-alias-state-business-primary);
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  font-weight: 700;
  pointer-events: none;
}
.todo-ball[data-phase='thinking'] { --ball-accent: var(--dsw-alias-state-business-primary); }
.todo-ball[data-phase='tool'] { --ball-accent: var(--dsw-alias-state-warn-primary); }
.todo-ball[data-phase='done'] { --ball-accent: var(--dsw-alias-state-success-primary); }
.todo-ball[data-active] {
  border-color: var(--ball-accent);
  animation: todo-ball-glow 1.6s ease-in-out infinite;
}
@keyframes todo-ball-glow {
  0%, 100% { box-shadow: var(--dsw-shadow-lv2); }
  50% { box-shadow: 0 0 0 4px var(--ball-accent); }
}
.todo-ball-panel {
  position: fixed;
  z-index: 1340;
  width: 300px;
  max-height: 380px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  box-shadow: var(--dsw-shadow-lv3);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  overflow-y: auto;
  /* 这是个控件面板而非文档：默认箭头指针，避免鼠标移到文字上变成输入光标。 */
  cursor: default;
  user-select: none;
}
.todo-ball-panel-head { display: flex; align-items: center; gap: 8px; }
.todo-ball-panel-title { margin: 0; font-size: 14px; font-weight: 700; flex: 1; }
.todo-ball-row { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.todo-ball-row:last-child { border-bottom: none; }
.todo-ball-row-icon { flex: none; font-size: 13px; }
.todo-ball-row-title { flex: 1; min-width: 0; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-ball-row-state { flex: none; font-size: 11px; color: var(--dsw-alias-label-tertiary); max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-ball-row[data-navigable] {
  margin: 0 -6px;
  padding: 6px;
  border-radius: 7px;
  cursor: pointer;
}
.todo-ball-row[data-navigable]:hover { background: var(--dsw-alias-fill-secondary); }
.todo-ball-row[data-navigable]:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
.todo-ball-row-go { flex: none; font-size: 14px; color: var(--dsw-alias-label-tertiary); }
.todo-ball-empty { padding: 16px 4px; text-align: center; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.todo-ball-actions { display: flex; gap: 6px; flex-wrap: wrap; padding-top: 4px; }
.todo-ball-mini { flex: none; padding: 2px 8px; font-size: 11px; }

/* --- 个人待办 Dock（右侧边缘吸附，可收起） ------------------------------- */
.todo-dock {
  position: fixed;
  right: 0;
  z-index: 1350;
  display: flex;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-right: none;
  box-shadow: var(--dsw-shadow-lv3);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  touch-action: none;
}
/* 收起态：贴边药丸，直接显示下一件要做的事。 */
.todo-dock[data-collapsed='true'] {
  flex-direction: row;
  align-items: center;
  gap: 7px;
  max-width: 268px;
  padding: 7px 10px 7px 13px;
  border-radius: 999px 0 0 999px;
  box-shadow: var(--dsw-shadow-lv2);
  cursor: pointer;
  user-select: none;
}
.todo-dock[data-collapsed='true']:hover { background: var(--dsw-alias-fill-secondary); }
/* 展开态：右侧待办面板。 */
.todo-dock[data-collapsed='false'] {
  flex-direction: column;
  gap: 8px;
  width: 320px;
  padding: 12px;
  border-radius: 12px 0 0 12px;
  /* 同上：控件面板用箭头指针，文字不做选中。 */
  cursor: default;
  user-select: none;
}
/* 表单控件恢复自身的输入光标与可选中，不受面板的 user-select: none 影响。 */
.todo-dock input, .todo-dock select, .todo-dock textarea { cursor: auto; user-select: auto; }
.todo-dock[data-overdue='true'] { border-color: var(--dsw-alias-state-error-primary); }
.todo-dock[data-collapsed='true'][data-overdue='true'] { animation: todo-dock-pulse 1.8s ease-in-out infinite; }
@keyframes todo-dock-pulse {
  0%, 100% { box-shadow: var(--dsw-shadow-lv2); }
  50% { box-shadow: 0 0 0 4px var(--dsw-alias-state-error-primary); }
}

.todo-dock-icon { flex: none; font-size: 14px; line-height: 1; }
.todo-dock-time { flex: none; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
.todo-dock-time[data-overdue='true'] { color: var(--dsw-alias-state-error-primary); }
.todo-dock-next { flex: 1; min-width: 0; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-dock-idle { flex: none; font-size: 12px; color: var(--dsw-alias-label-tertiary); }

.todo-dock-head { display: flex; align-items: center; gap: 8px; cursor: grab; user-select: none; }
.todo-dock-head:active { cursor: grabbing; }
.todo-dock-title { margin: 0; flex: 1; font-size: 14px; font-weight: 700; }
.todo-dock-add { display: flex; gap: 6px; }
.todo-dock-add .todo-input { flex: 1; min-width: 0; }
.todo-dock-when { flex: none; width: 96px; }
.todo-dock-body { display: flex; flex-direction: column; overflow-y: auto; max-height: 46vh; }
.todo-dock-section { padding: 6px 2px 2px; font-size: 11px; font-weight: 700; letter-spacing: .02em; color: var(--dsw-alias-label-tertiary); }
.todo-dock-row { display: flex; align-items: center; gap: 7px; padding: 6px 2px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.todo-dock-row:last-child { border-bottom: none; }
.todo-dock-check {
  flex: none;
  width: 17px; height: 17px;
  padding: 0;
  border: 1.5px solid var(--dsw-alias-border-l3);
  border-radius: 50%;
  background: transparent;
  color: transparent;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
}
.todo-dock-check:hover { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }
.todo-dock-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.todo-dock-row-title { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-dock-row-due { font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.todo-dock-row[data-overdue='true'] .todo-dock-row-due { color: var(--dsw-alias-state-error-primary); font-weight: 700; }
.todo-dock-row-actions { flex: none; display: flex; gap: 4px; opacity: 0; transition: opacity .12s ease; }
.todo-dock-row:hover .todo-dock-row-actions, .todo-dock-row:focus-within .todo-dock-row-actions { opacity: 1; }
.todo-dock-mini { flex: none; padding: 2px 7px; font-size: 11px; }
.todo-dock-empty { padding: 14px 4px; text-align: center; font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-tertiary); }
.todo-dock-foot { display: flex; gap: 6px; flex-wrap: wrap; }
.todo-settings-group {
  padding: 10px 2px 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--dsw-alias-label-secondary);
}
.todo-range { flex: none; width: 96px; accent-color: var(--dsw-alias-state-business-primary); cursor: pointer; }

@media (prefers-reduced-motion: reduce) {
  .todo-toast { animation: none; }
  .todo-toast[data-style='danger'] { animation: none; }
  .todo-dock[data-collapsed='true'][data-overdue='true'] { animation: none; }
  .todo-ball[data-active] { animation: none; }
}
`;
		/** 注入样式（幂等）。 */
		function injectStyles() {
			if (document.querySelector("style[data-dsh-att-css]") !== null) return;
			const style = document.createElement("style");
			style.dataset.dshAttCss = "";
			style.textContent = ATTENTION_CSS;
			document.head.appendChild(style);
		}
		//#endregion
		//#region src/client/AttentionPanel.tsx
		/**
		* 设置面板：挂在中心列（会话列）里，由侧边栏「提醒」入口开合。
		* 只管本模块 —— 三类提醒开关、提醒音（音量 / 音色 / 试听 / 音源）、活动悬浮球，
		* 外加系统通知权限状态与「最近一条提醒 / 活跃会话」的只读摘要。
		* @module dsh-session-attention/client/AttentionPanel
		*/
		const PHASE_LABEL = {
			thinking: "思考中",
			tool: "执行工具",
			done: "等待你"
		};
		function formatTime(ms) {
			const d = new Date(ms);
			const pad = (n) => String(n).padStart(2, "0");
			return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
		}
		function AttentionPanel() {
			const { data, error, activity, latest } = (0, react.useSyncExternalStore)(attentionStore.subscribe, attentionStore.getSnapshot);
			const { attention, ball } = data?.settings ?? DEFAULT_SETTINGS;
			const [volume, setVolume] = (0, react.useState)(null);
			const shownVolume = volume ?? Math.round(attention.volume * 100);
			const commitVolume = () => {
				if (volume === null) return;
				attentionStore.setAttention({ volume: volume / 100 });
				setVolume(null);
			};
			const [permission, setPermission] = (0, react.useState)(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
			const requestPermission = () => {
				if (typeof Notification === "undefined") return;
				Notification.requestPermission().then((value) => setPermission(value)).catch(() => {});
			};
			const [sourceLabel, setSourceLabel] = (0, react.useState)(soundSourceLabel());
			const refreshSource = () => {
				setSourceLabel(soundSourceLabel());
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "todo-panel",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "todo-header",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "todo-title",
								children: "🔔 DSH 会话提醒"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "todo-count",
								children: activity.length > 0 ? `${activity.length} 个活跃会话` : "无活跃会话"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "todo-btn",
								title: "关闭面板（Esc 也可以）",
								"aria-label": "关闭",
								onClick: () => attentionStore.setPanel(false),
								children: "✕"
							})
						]
					}),
					error !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "todo-empty",
						children: ["连接 host 失败：", error]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "todo-settings-group",
						children: "💬 什么时候提醒你（只在切出 DSH 时弹）"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "todo-settings",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "todo-check",
								title: "agent 完成一轮回复时提醒",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: attention.onTurnEnd,
									onChange: (e) => void attentionStore.setAttention({ onTurnEnd: e.target.checked })
								}), "完成一轮"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "todo-check",
								title: "agent 用 ask_user_question 提问时提醒",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: attention.onQuestion,
									onChange: (e) => void attentionStore.setAttention({ onQuestion: e.target.checked })
								}), "提问"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "todo-check",
								title: "有审批请求（approve/deny）时提醒",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: attention.onApproval,
									onChange: (e) => void attentionStore.setAttention({ onApproval: e.target.checked })
								}), "审批"]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "todo-settings-group",
						children: "🔊 提醒音"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "todo-settings",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "todo-settings-label",
								children: "响铃"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "todo-check",
								title: "关掉后只有系统通知，没有页面内音效",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: attention.sound,
									onChange: (e) => void attentionStore.setAttention({ sound: e.target.checked })
								}), "出声"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "todo-settings-hint",
								children: "音量"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "todo-range",
								type: "range",
								min: 0,
								max: 100,
								step: 5,
								value: shownVolume,
								onChange: (e) => setVolume(Number(e.target.value)),
								onPointerUp: commitVolume,
								onKeyUp: commitVolume,
								onBlur: commitVolume,
								title: "会话提醒音量"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "todo-settings-hint",
								children: [shownVolume, "%"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "todo-settings-hint",
								children: "音色"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								className: "todo-select",
								value: attention.tone,
								onChange: (e) => void attentionStore.setAttention({ tone: e.target.value }),
								title: "用哪种音色",
								children: REMINDER_STYLES.map((style) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
									value: style,
									children: [
										STYLE_META[style].icon,
										" ",
										STYLE_META[style].label
									]
								}, style))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "todo-btn",
								onClick: () => {
									previewSound(attention.tone, shownVolume / 100, 1);
									window.setTimeout(refreshSource, 400);
								},
								title: "试听提醒音",
								children: "🔈 试听"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "todo-btn",
								title: "在文件管理器里打开音效文件所在目录",
								onClick: () => void attentionStore.openSoundDir(),
								children: "📂 打开文件夹"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "todo-settings-hint",
								children: ["音源 ", sourceLabel]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "todo-settings-hint",
								children: "自定义音效：$DSH_HOME/session-attention/session.mp3（旧位置 todo-reminder/session.mp3 仍有效）"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "todo-settings-group",
						children: "🖥 系统通知"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "todo-settings",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "todo-settings-label",
								children: "权限"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "todo-settings-hint",
								children: permission === "granted" ? "已授权" : permission === "denied" ? "已被拒绝（需在浏览器/系统设置里放开）" : permission === "unsupported" ? "当前环境不支持" : "未授权"
							}),
							permission === "default" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "todo-btn",
								onClick: requestPermission,
								children: "开启系统通知"
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "todo-settings-group",
						children: "🫧 活动悬浮球"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "todo-settings",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "todo-settings-label",
								children: "悬浮球"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "todo-check",
								title: "显示 DSH 活跃会话的悬浮球；关闭后页面上不再出现",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: ball.enabled,
									onChange: (e) => void attentionStore.setBall({ enabled: e.target.checked })
								}), "显示"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "todo-check",
								title: "拖动松手后自动吸附到最近的左右边缘",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: ball.snapToEdge,
									onChange: (e) => void attentionStore.setBall({ snapToEdge: e.target.checked })
								}), "边缘吸附"]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "todo-settings-group",
						children: "📋 最近"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "todo-settings",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "todo-settings-label",
							children: "最近提醒"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "todo-settings-hint",
							children: latest === null ? "还没有提醒过" : `${formatTime(latest.at)} ${latest.title}${latest.sessionTitle !== void 0 ? " · " + latest.sessionTitle : ""}`
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "todo-settings",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "todo-settings-label",
							children: "活跃会话"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "todo-settings-hint",
							children: activity.length === 0 ? "空闲" : activity.map((item) => `${item.sessionTitle ?? item.sessionId.slice(0, 8)}：${PHASE_LABEL[item.phase] ?? item.phase}${item.tool !== void 0 ? "（" + item.tool + "）" : ""}`).join(" ｜ ")
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/sidebar-entry.ts
		/**
		* 侧边栏入口「提醒」：DOM 注入（shell 无对外侧边栏 slot），MutationObserver 自愈。
		* 与 task-board / ssh / 待办 的入口共处同一家族块，位置稳定、互斥开合。
		* @module dsh-session-attention/client/sidebar-entry
		*/
		/** 入口行稳定标识。 */
		const ENTRY_SELECTOR = "[data-dsh-att-entry]";
		/**
		* 当前存活实例的清理函数。
		*
		* 客户端被重复 apply（HMR / 双重注册）时，旧实例的 MutationObserver 会在新实例接管后
		* 把旧元素重新插回去 —— 表现就是侧边栏出现两个入口。这里让新实例先干掉旧实例。
		*/
		let activeDispose;
		const ICON = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.4 6.6a3.6 3.6 0 1 1 7.2 0c0 2.1.5 3.2 1 3.9H3.4c.5-.7 1-1.8 1-3.9Z"/><path d="M6.7 12.6a1.4 1.4 0 0 0 2.6 0"/></svg>`;
		function sidebarRoot() {
			const column = document.querySelector("[data-pane=\"sidebar\"], [class*=\"sidebarCol\"]");
			if (column === null) return void 0;
			return column.querySelector("[class*=\"logoRow\"]")?.parentElement ?? column.firstElementChild;
		}
		/**
		* 定位「新建会话」按钮（DSH 0.1.6 起它是 logoRow 的兄弟节点，不再是其子元素）；
		* 三级回退：全局 → root 内 → root 的第一个 button。
		*/
		function newSessionButton(root) {
			const scopes = [document, root];
			for (const scope of scopes) {
				const found = scope.querySelector("button[class*=\"newSession\"]");
				if (found !== null) return found;
			}
			for (const child of root.children) if (child.tagName === "BUTTON") return child;
		}
		/** `newSession` 按钮的宿主父元素（入口行的实际插入容器）。 */
		function entryHost(button, fallback) {
			return button.parentElement ?? button.closest("[class*=\"logoRow\"]")?.parentElement ?? fallback;
		}
		function createEntry() {
			const entry = document.createElement("button");
			entry.type = "button";
			entry.dataset.dshAttEntry = "";
			entry.setAttribute("aria-label", "提醒");
			entry.innerHTML = `<span class="todo-entry-icon">${ICON}</span><span class="todo-entry-label">提醒</span>`;
			entry.addEventListener("click", () => {
				attentionStore.togglePanel();
			});
			return entry;
		}
		/** 家族锚点：与这些兄弟入口排在同一处。 */
		const FAMILY_SELECTOR = "[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-todo-entry], [data-dsh-att-entry]";
		function placeEntry(root, entry) {
			const owners = document.querySelectorAll(ENTRY_SELECTOR);
			if (owners.length > 1 || owners.length === 1 && owners[0] !== entry) return false;
			const button = newSessionButton(root);
			if (button === void 0) return false;
			const host = entryHost(button, root);
			if (entry.parentElement !== host) {
				const family = Array.from(host.children).filter((el) => el instanceof HTMLElement && el.matches(FAMILY_SELECTOR));
				const anchor = family.length > 0 ? family[0] : button.nextElementSibling;
				host.insertBefore(entry, anchor);
			}
			return true;
		}
		/** 挂载入口行并绑定激活态高亮。 */
		function mountSidebarEntry() {
			activeDispose?.();
			activeDispose = void 0;
			document.querySelectorAll(ENTRY_SELECTOR).forEach((el) => el.remove());
			const entry = createEntry();
			let root;
			let placed = false;
			const tryPlace = () => {
				const owners = document.querySelectorAll(ENTRY_SELECTOR);
				if (owners.length > 1 || owners.length === 1 && owners[0] !== entry) return;
				if (root !== void 0 && !root.isConnected) {
					rootObserver.disconnect();
					root = void 0;
					placed = false;
				}
				if (placed) {
					if (document.body.contains(entry)) return;
					rootObserver.disconnect();
					root = void 0;
					placed = false;
				}
				root ??= sidebarRoot();
				if (root === void 0) return;
				placed = placeEntry(root, entry);
				if (placed) rootObserver.observe(root, {
					childList: true,
					subtree: true
				});
			};
			/**
			* 清掉场上不属于本实例的入口。
			* 上限 20 次：万一遇到更老的、没有守卫的实例反复插回，也不会陷入无限循环。
			*/
			let sweepBudget = 20;
			const sweepForeign = () => {
				if (sweepBudget <= 0) return;
				for (const el of document.querySelectorAll(ENTRY_SELECTOR)) {
					if (el === entry) continue;
					el.remove();
					sweepBudget -= 1;
				}
			};
			const waitObserver = new MutationObserver(() => {
				sweepForeign();
				tryPlace();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const rootObserver = new MutationObserver(() => {
				if (root === void 0 || !root.isConnected) {
					placed = false;
					tryPlace();
					return;
				}
				sweepForeign();
				if (!root.contains(entry)) placed = placeEntry(root, entry);
			});
			const syncActive = () => {
				if (attentionStore.getSnapshot().panelOpen) entry.dataset.active = "true";
				else delete entry.dataset.active;
			};
			const unsubscribe = attentionStore.subscribe(syncActive);
			syncActive();
			tryPlace();
			const dispose = () => {
				waitObserver.disconnect();
				rootObserver.disconnect();
				unsubscribe();
				entry.remove();
				if (activeDispose === dispose) activeDispose = void 0;
			};
			activeDispose = dispose;
			return dispose;
		}
		//#endregion
		//#region src/client/index.tsx
		/**
		* dsh-session-attention 浏览器半：注入样式，挂载侧边栏「提醒」入口、设置面板、
		* 全局提醒层（含活动悬浮球）。失败策略：DOM 挂载异常只记录、不抛出
		* （外部插件不得拖垮 GUI 启动）。
		* @module dsh-session-attention/client
		*/
		/** 跨插件面板互斥事件（与 task-board / ssh / 待办 同契约）。 */
		const ACTIVATE_EVENT = "dsh-panel-activate";
		const PANEL_NAME = "attention";
		const ACTIVE_ATTR = "data-dsh-attention-active";
		const SIBLING_ATTRS = [
			"data-dsh-todo-active",
			"data-dsh-ssh-active",
			"data-dsh-taskboard-active"
		];
		/** 中心列（对话列）容器选择器：0.1.6 起 data-pane 标记被移除，回退到 centerCol 类名。 */
		const CONVERSATION_SELECTOR = "[data-pane=\"conversation\"], [class*=\"centerCol\"], [class*=\"_centerCol\"]";
		/**
		* 面板挂载：容器插进中心列，打开时占满它（独立页面式，与任务看板 / SSH 一致），
		* 中心列其余内容暂时隐藏；关闭后立刻回到对话。开合由 store 的 panelOpen 驱动。
		*/
		function mountPanel() {
			document.querySelectorAll("[data-dsh-att-view]").forEach((el) => el.remove());
			let root;
			let container;
			const ensure = () => {
				if (container !== void 0) return;
				const column = document.querySelector(CONVERSATION_SELECTOR);
				if (column === null) return;
				container = document.createElement("div");
				container.dataset.dshAttView = "";
				column.appendChild(container);
				root = (0, react_dom_client.createRoot)(container);
				root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AttentionPanel, {}));
			};
			const waitObserver = new MutationObserver(() => {
				ensure();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const applyActive = () => {
				if (attentionStore.getSnapshot().panelOpen) {
					for (const attr of SIBLING_ATTRS) document.documentElement.removeAttribute(attr);
					document.documentElement.setAttribute(ACTIVE_ATTR, "");
					document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }));
				} else document.documentElement.removeAttribute(ACTIVE_ATTR);
			};
			const close = () => {
				if (attentionStore.getSnapshot().panelOpen) attentionStore.setPanel(false);
			};
			const onOtherActivate = (event) => {
				if (event.detail !== PANEL_NAME) close();
			};
			const onKeyDown = (event) => {
				if (event.key === "Escape") close();
			};
			const SIDEBAR_ROW_SELECTOR = "[class*=\"sessionRow\"], [class*=\"projectRow\"], [class*=\"searchResultRow\"], [class*=\"searchResultWorkspace\"], [class*=\"newSession\"]";
			const onClickSidebarRow = (event) => {
				const target = event.target;
				if (target === null) return;
				if (target.closest("[data-dsh-att-entry]") !== null) return;
				if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) close();
			};
			document.addEventListener("keydown", onKeyDown);
			document.addEventListener("click", onClickSidebarRow, true);
			document.addEventListener(ACTIVATE_EVENT, onOtherActivate);
			const unsubscribe = attentionStore.subscribe(applyActive);
			applyActive();
			ensure();
			return () => {
				document.removeEventListener("keydown", onKeyDown);
				document.removeEventListener("click", onClickSidebarRow, true);
				document.removeEventListener(ACTIVATE_EVENT, onOtherActivate);
				waitObserver.disconnect();
				unsubscribe();
				document.documentElement.removeAttribute(ACTIVE_ATTR);
				root?.unmount();
				root = void 0;
				container?.remove();
				container = void 0;
			};
		}
		/** 全局提醒层挂载（body 上的 React 根，跨会话常驻；内含活动悬浮球）。 */
		function mountLayer() {
			document.querySelectorAll("[data-dsh-att-layer]").forEach((el) => el.remove());
			const container = document.createElement("div");
			container.dataset.dshAttLayer = "";
			document.body.appendChild(container);
			const root = (0, react_dom_client.createRoot)(container);
			root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AttentionLayer, {}));
			return () => {
				root.unmount();
				container.remove();
			};
		}
		/**
		* 声明依赖 `sessions` 服务：它保证本插件在客户端会话控制器就绪之后才 apply，
		* 侧边栏/主视图此时已可被定位（跳转本身走 DOM 委托，不调用该服务）。
		*/
		const inject = ["sessions", "uiWorkspace"];
		function apply(ctx) {
			injectStyles();
			const disposers = [];
			disposers.push(setSessionTitleResolver((sessionId) => {
				const row = (ctx.sessions?.list)?.getSnapshot?.()?.byId?.[sessionId];
				if (row === void 0 || row.blank === true) return void 0;
				const title = typeof row.title === "string" ? row.title.trim() : "";
				return title === "" ? void 0 : title;
			}));
			disposers.push(setSessionOpener((target) => {
				let service;
				try {
					service = ctx.uiWorkspace;
				} catch {
					service = void 0;
				}
				if (service !== void 0 && typeof service.openSession === "function") try {
					service.openSession(target.sessionId);
					console.info("[dsh-session-attention] 已走官方接口跳转会话", target.sessionId);
					return true;
				} catch (error) {
					console.warn("[dsh-session-attention] uiWorkspace.openSession 失败，退回侧边栏点击", error);
				}
				return (async () => {
					for (let attempt = 0; attempt < 2; attempt += 1) {
						const row = resolveSessionRow(target);
						if (row !== void 0) {
							(row.querySelector("button, [role=\"button\"]") ?? row).click();
							return true;
						}
						await new Promise((resolve) => {
							window.setTimeout(resolve, 16);
						});
					}
					console.warn("[dsh-session-attention] 侧边栏里定位不到该会话行，跳转失败", target.sessionId, target.title);
					return false;
				})();
			}));
			try {
				disposers.push(mountSidebarEntry());
				disposers.push(mountPanel());
				disposers.push(mountLayer());
			} catch (error) {
				console.error("[dsh-session-attention] mount failed:", error);
			}
			return () => {
				for (const dispose of disposers.splice(0)) try {
					dispose();
				} catch {}
			};
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map