/*
 * dsh-tendedero client half — a clothesline for DSH follow-up questions.
 * Inspired by alejandrobujan/tendedero: cards hang from a line above the
 * window, rest the pointer on the top edge and the line glides down.
 *
 * Built as a lazy-CJS module-loader bundle (no build step, no externals).
 * All side effects run inside apply(), at materialization.
 */
window.__ModuleLoader__.load({
	id: "dsh-tendedero",
	factory: (require) => {
		var module = { exports: {} };

		const inject = ["sessions", "remote", "remote.userQuestions", "uiWorkspace", "uiSession"];

		/** Descriptor for the host-side tendedero/suggest Remote method. */
		const TYPERT_REMOTE = {
			package: "dsh-tendedero",
			descriptors: [{
				id: "dsh-tendedero#tendedero/suggest",
				namespace: "tendedero",
				service: "tendedero",
				method: "suggest",
				implementation: "suggest",
				invocation: { kind: "direct" },
				parameters: [{ name: "sessionId", wire: "sessionId", source: "json", codec: { mode: "strict", typeSymbol: "SessionId", create: () => undefined } }],
				result: { mode: "strict", typeSymbol: "TendederoSuggestions", create: () => undefined }
			}]
		};

		function apply(ctx) {
			ctx.effect(async () => {
				let disposeSuggest = () => {};
				try {
					disposeSuggest = await ctx.remote.$mount(TYPERT_REMOTE);
				} catch (error) {
					console.warn("[dsh-tendedero] suggest remote unavailable:", error);
				}
				const disposeLine = mount(ctx);
				return () => {
					disposeLine();
					disposeSuggest();
				};
			}, "dsh-tendedero: clothesline");
		}

		// How deep from the top edge the hover trigger reaches (covers the title bar and both corners).
		const TRIGGER_DEPTH = 48;
		const PIN_SVG = '<svg viewBox="0 0 24 36" aria-hidden="true"><path d="M8.6 1.5 h6.8 l1.1 12.5 l3.2 19.5 h-4.4 l-2.9 -15.5 h-0.8 l-2.9 15.5 h-4.4 l3.2 -19.5 z" fill="#c9a06a" stroke="#8a6a3f" stroke-width="1.1" stroke-linejoin="round"/><rect x="8.2" y="11.2" width="7.6" height="3.4" rx="1.2" fill="#9aa0a8" stroke="#6b7078" stroke-width="0.8"/></svg>';

		const ROOT_HTML =
			'<div class="td-yard">' +
			'<div class="td-ropebar" data-window-drag></div>' +
			'<svg class="td-rope" viewBox="0 0 1000 30" preserveAspectRatio="none" aria-hidden="true"><path d="M0 8 Q 500 26 1000 8"></path></svg>' +
			'<div class="td-cards" role="list"></div>' +
			'</div>' +
			'<button class="td-peek" type="button">' + PIN_SVG + '<span class="td-count">0</span></button>';

		const CSS = `
#dsh-tendedero {
	position: fixed; top: 0; left: 0; right: 0; z-index: 99999; pointer-events: none;
	--td-bg: var(--dsw-alias-bg-layer-1, light-dark(#ffffff, #23262c));
	--td-bg2: var(--dsw-alias-bg-layer-2, light-dark(#f6f4ee, #2c3038));
	--td-fg: var(--dsw-alias-label-primary, light-dark(#23262c, #e9ebef));
	--td-fg2: var(--dsw-alias-label-secondary, light-dark(#70757e, #9aa1ab));
	--td-line: var(--dsw-alias-border-l1, light-dark(#ded9cd, #3d424b));
	--td-brand: var(--dsw-alias-brand-primary, light-dark(#2f6fed, #7cabff));
	--td-rope: light-dark(#b3a488, #6e6455);
	font-family: var(--dsh-font-family-text, system-ui, -apple-system, "Segoe UI", sans-serif);
	color: var(--td-fg);
}
#dsh-tendedero .td-yard {
	position: relative; transform: translateY(calc(-100% - 40px));
	transition: transform .55s cubic-bezier(.3, 1.25, .4, 1);
	pointer-events: none; will-change: transform;
}
#dsh-tendedero[data-state="deployed"] .td-yard { transform: translateY(0); pointer-events: auto; }
#dsh-tendedero .td-rope { position: absolute; top: 12px; left: 0; width: 100%; height: 30px; pointer-events: none; }
#dsh-tendedero .td-rope path { stroke: var(--td-rope); stroke-width: 2; fill: none; stroke-linecap: round; }
#dsh-tendedero .td-ropebar { position: absolute; top: 0; left: 15%; right: 15%; height: 34px; }
#dsh-tendedero .td-cards {
	display: flex; justify-content: safe center; align-items: flex-start; gap: 34px;
	padding: 42px 48px 30px; overflow-x: auto; scrollbar-width: thin;
}
#dsh-tendedero .td-hanger { flex: 0 0 auto; }
#dsh-tendedero .td-hanger.td-enter { animation: td-drop .8s cubic-bezier(.25, 1.35, .4, 1) both; }
#dsh-tendedero .td-hanger.td-letgo { animation: td-fall .65s cubic-bezier(.45, -.15, .75, .4) forwards; pointer-events: none; }
@keyframes td-drop { 0% { transform: translateY(-70px); opacity: 0; } 60% { opacity: 1; } 100% { transform: translateY(0); opacity: 1; } }
@keyframes td-fall { to { transform: translateY(75vh) rotate(14deg); opacity: 0; } }
#dsh-tendedero .td-card {
	position: relative; width: 236px; transition: width .3s ease;
	transform-origin: 50% -14px;
	animation: td-sway var(--td-sway-dur, 3.2s) ease-in-out var(--td-sway-delay, 0s) infinite alternate;
}
@keyframes td-sway { from { transform: rotate(-2.1deg); } to { transform: rotate(2.3deg); } }
#dsh-tendedero .td-pin { position: absolute; top: -27px; left: 50%; width: 22px; height: 34px; transform: translateX(-50%); z-index: 2; filter: drop-shadow(0 2px 2px rgba(0,0,0,.25)); }
#dsh-tendedero .td-pin svg { width: 100%; height: 100%; }
#dsh-tendedero .td-body {
	position: relative; background: linear-gradient(180deg, var(--td-bg), var(--td-bg2));
	border: 1px solid var(--td-line); border-radius: 10px;
	box-shadow: 0 12px 28px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.12);
	padding: 12px 14px; cursor: pointer;
}
#dsh-tendedero .td-card.td-open .td-body { cursor: default; }
#dsh-tendedero .td-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--td-fg2); margin-bottom: 6px; }
#dsh-tendedero .td-dot { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: var(--td-brand); }
#dsh-tendedero .td-dot.td-waiting { background: var(--dsw-alias-state-warn-primary, #e5a13c); animation: td-blink 1.6s ease-in-out infinite; }
@keyframes td-blink { 50% { opacity: .35; } }
#dsh-tendedero .td-session { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#dsh-tendedero .td-x { flex: 0 0 auto; border: none; background: none; color: var(--td-fg2); font-size: 14px; line-height: 1; padding: 2px 4px; border-radius: 5px; cursor: pointer; opacity: .65; }
#dsh-tendedero .td-x:hover { opacity: 1; background: color-mix(in srgb, var(--td-fg) 10%, transparent); }
#dsh-tendedero .td-q { font-size: 13px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
#dsh-tendedero .td-card.td-open .td-q { display: block; -webkit-line-clamp: unset; }
#dsh-tendedero .td-tags { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; font-size: 11px; color: var(--td-fg2); }
#dsh-tendedero .td-tag { border: 1px solid var(--td-line); border-radius: 99px; padding: 1px 8px; }
#dsh-tendedero .td-detail { display: none; margin-top: 10px; border-top: 1px dashed var(--td-line); padding-top: 10px; max-height: min(52vh, 460px); overflow-y: auto; scrollbar-width: thin; }
#dsh-tendedero .td-card.td-open { width: 330px; }
#dsh-tendedero .td-card.td-open .td-detail { display: block; }
#dsh-tendedero .td-qblock { margin-bottom: 10px; }
#dsh-tendedero .td-qhead { font-size: 11px; color: var(--td-fg2); margin-bottom: 4px; }
#dsh-tendedero .td-qtext { font-size: 13px; line-height: 1.5; margin-bottom: 8px; overflow-wrap: anywhere; }
#dsh-tendedero .td-opt { display: block; width: 100%; text-align: left; border: 1px solid var(--td-line); background: transparent; color: var(--td-fg); border-radius: 8px; padding: 7px 10px; margin-bottom: 6px; cursor: pointer; font: inherit; font-size: 12.5px; }
#dsh-tendedero .td-opt:hover:not(:disabled) { border-color: var(--td-brand); }
#dsh-tendedero .td-opt.td-sel { border-color: var(--td-brand); background: color-mix(in srgb, var(--td-brand) 12%, transparent); }
#dsh-tendedero .td-opt .td-odesc { display: block; font-size: 11px; color: var(--td-fg2); margin-top: 2px; }
#dsh-tendedero .td-opt:disabled { opacity: .6; cursor: default; }
#dsh-tendedero .td-custom { width: 100%; box-sizing: border-box; font: inherit; font-size: 12px; color: var(--td-fg); background: transparent; border: 1px solid var(--td-line); border-radius: 8px; padding: 6px 9px; margin: 2px 0 8px; resize: vertical; min-height: 32px; }
#dsh-tendedero .td-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
#dsh-tendedero .td-btn { font: inherit; font-size: 12px; border-radius: 8px; padding: 6px 12px; cursor: pointer; border: 1px solid var(--td-line); background: transparent; color: var(--td-fg); }
#dsh-tendedero .td-btn.td-primary { background: var(--td-brand); border-color: var(--td-brand); color: #fff; }
#dsh-tendedero .td-btn:hover:not(:disabled) { filter: brightness(1.08); }
#dsh-tendedero .td-btn:disabled { opacity: .6; cursor: default; }
#dsh-tendedero .td-hint { font-size: 11px; color: var(--td-fg2); margin-top: 6px; line-height: 1.5; }
#dsh-tendedero .td-err { color: var(--dsw-alias-state-error-primary, #d64545); font-size: 11px; margin-top: 6px; }
#dsh-tendedero .td-shake { animation: td-shake .35s; }
@keyframes td-shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
#dsh-tendedero .td-peek {
	position: absolute; top: -4px; left: 50%; transform: translateX(-50%);
	display: flex; flex-direction: column; align-items: center;
	background: none; border: none; padding: 0; cursor: pointer;
	opacity: 0; pointer-events: none; transition: opacity .35s; z-index: 3;
}
#dsh-tendedero[data-state="tucked"][data-has="1"] .td-peek { opacity: 1; pointer-events: auto; }
#dsh-tendedero .td-peek svg { width: 18px; height: 28px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.3)); animation: td-peek-sway 3s ease-in-out infinite alternate; transform-origin: 50% 0; }
@keyframes td-peek-sway { from { transform: rotate(-4deg); } to { transform: rotate(4deg); } }
#dsh-tendedero .td-count { margin-top: -6px; min-width: 18px; height: 18px; border-radius: 99px; background: var(--td-brand); color: #fff; font-size: 11px; line-height: 18px; text-align: center; padding: 0 5px; box-sizing: border-box; box-shadow: 0 2px 6px rgba(0,0,0,.25); }
#dsh-tendedero .td-hanger.td-fading { opacity: 0; transition: opacity .35s; pointer-events: none; }
#dsh-tendedero .td-hanger.td-unhook { animation: td-unhook .62s cubic-bezier(.5,.02,.72,.28) forwards; pointer-events: none; }
#dsh-tendedero .td-hanger.td-unhook-picked { animation: td-unhook-picked .5s cubic-bezier(.55,0,.85,.25) forwards; pointer-events: none; }
@keyframes td-unhook { 0% { transform: translateX(0); opacity: 1; } 32% { transform: translateX(16px) rotate(4deg); } 100% { transform: translateX(300px) translateY(-14px) rotate(15deg); opacity: 0; } }
@keyframes td-unhook-picked { 0% { transform: translateX(0); opacity: 1; } 100% { transform: translateX(420px) translateY(-6px) rotate(11deg); opacity: 0; } }
#dsh-tendedero .td-card.td-fu { width: 212px; cursor: pointer; }
#dsh-tendedero .td-card.td-fu .td-body { transition: border-color .18s ease, box-shadow .18s ease; }
#dsh-tendedero .td-card.td-fu:hover .td-body, #dsh-tendedero .td-card.td-fu:focus-visible .td-body { border-color: var(--td-brand); box-shadow: 0 14px 30px rgba(0,0,0,.22), 0 0 0 3px color-mix(in srgb, var(--td-brand) 22%, transparent); }
#dsh-tendedero .td-card.td-fu.td-busy { opacity: .5; pointer-events: none; }
#dsh-tendedero .td-fu-index { flex: 0 0 auto; font-family: var(--dsh-font-family-code, ui-monospace, "SFMono-Regular", monospace); font-size: 10.5px; letter-spacing: .06em; color: var(--td-fg2); }
#dsh-tendedero .td-fu-q { font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; color: var(--td-fg); }
#dsh-tendedero .td-fu-cta { margin-top: 9px; font-size: 11px; color: var(--td-brand); }
#dsh-tendedero .td-fu-cta.td-failed { color: var(--dsw-alias-state-error-primary, #d64545); }
#dsh-tendedero .td-fu-tools { flex: 0 0 auto; display: flex; gap: 2px; margin-left: auto; }
#dsh-tendedero .td-mini { border: none; background: none; color: var(--td-fg2); font: inherit; font-size: 12px; line-height: 1; padding: 2px 5px; border-radius: 5px; cursor: pointer; opacity: .6; }
#dsh-tendedero .td-mini:hover { opacity: 1; background: color-mix(in srgb, var(--td-fg) 10%, transparent); }
#dsh-tendedero .td-card.td-fu-error { width: 240px; cursor: pointer; }
#dsh-tendedero .td-card.td-fu-error .td-fu-index { color: var(--dsw-alias-state-error-primary, #d64545); font-weight: 700; }
#dsh-tendedero .td-card.td-fu-error .td-fu-q { font-size: 12px; line-height: 1.5; color: var(--td-fg2); }
#dsh-tendedero .td-card.td-fu-error .td-fu-cta { color: var(--td-brand); }
@media (prefers-reduced-motion: reduce) {
	#dsh-tendedero .td-card, #dsh-tendedero .td-peek svg, #dsh-tendedero .td-dot.td-waiting { animation: none; }
	#dsh-tendedero .td-hanger.td-unhook, #dsh-tendedero .td-hanger.td-unhook-picked { animation: none; opacity: 0; }
	#dsh-tendedero .td-card.td-fu .td-body, #dsh-tendedero .td-card.td-fu.td-busy { transition: none; }
	#dsh-tendedero .td-yard { transition: none; }
	#dsh-tendedero .td-hanger.td-enter { animation: none; }
}
`;

		const DISMISS_KEY = "dsh-tendedero.dismissed.v1";
		function loadDismissed() {
			try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]")); } catch { return new Set(); }
		}
		function saveDismissed(set) {
			try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...set])); } catch {}
		}
		const BATCH_KEY = "dsh-tendedero.batch.v1";
		const BATCH_TTL = 6 * 60 * 1000;
		const BATCH_HANG = 150000;
		/** A batch survives a page reload or a session re-entry; stale entries are dropped. */
		function loadBatches() {
			let all;
			try { all = JSON.parse(localStorage.getItem(BATCH_KEY) ?? "{}"); } catch { return {}; }
			if (all === null || typeof all !== "object" || Array.isArray(all)) return {};
			const now = Date.now();
			let pruned = false;
			for (const [key, value] of Object.entries(all)) {
				const fresh = value !== null && typeof value === "object" && Array.isArray(value.questions)
					&& value.questions.every((q) => typeof q === "string")
					&& typeof value.ts === "number" && now - value.ts < BATCH_TTL;
				if (!fresh) { delete all[key]; pruned = true; }
			}
			// Drop what aged out from storage as well, so records cannot pile up.
			if (pruned) { try { localStorage.setItem(BATCH_KEY, JSON.stringify(all)); } catch {} }
			return all;
		}
		function saveBatch(sessionId, questions, title, ts) {
			const all = loadBatches();
			all[sessionId] = { questions, title, ts: ts ?? Date.now() };
			try { localStorage.setItem(BATCH_KEY, JSON.stringify(all)); } catch {}
		}
		function clearBatch(sessionId) {
			const all = loadBatches();
			if (all[sessionId] === void 0) return;
			delete all[sessionId];
			try { localStorage.setItem(BATCH_KEY, JSON.stringify(all)); } catch {}
		}

		function mount(ctx) {
			if (document.getElementById("dsh-tendedero")) return () => {};
			const sessions = ctx.sessions;
			const uiWorkspace = ctx.uiWorkspace;
			const uiSession = ctx.uiSession;
			/**
			 * Cordis only answers a property read on `remote` for keys the plugin
			 * declared in `inject`. `remote.tendedero` is mounted at apply time and
			 * `remote.session` is not declared here either, so both go through ctx.get().
			 */
			const ns = (key) => {
				try { return ctx.get?.(key) ?? null; } catch { return null; }
			};
			const cards = new Map();
			const followups = new Map();
			const generating = new Set();
			const settling = new Set();
			const stopProjections = new Map();
			const dismissed = loadDismissed();
			let deployed = false, destroyed = false, pointerInYard = false;
			let tuckTimer = null, announceTimer = null, expandedKey = null, tuckHoldUntil = 0, hanging = 0;

			const style = document.createElement("style");
			style.id = "dsh-tendedero-style";
			style.textContent = CSS;
			document.head.appendChild(style);
			const root = document.createElement("div");
			root.id = "dsh-tendedero";
			root.dataset.state = "tucked";
			root.dataset.has = "0";
			root.innerHTML = ROOT_HTML;
			document.body.appendChild(root);
			const yard = root.querySelector(".td-yard");
			const cardsEl = root.querySelector(".td-cards");
			const peek = root.querySelector(".td-peek");
			const countEl = root.querySelector(".td-count");

			function currentSessionId() {
				try { return uiWorkspace?.selection?.getSnapshot?.().sessionId; } catch { return undefined; }
			}
			function deploy() {
				if (destroyed || deployed) return;
				clearTimeout(tuckTimer); tuckTimer = null;
				clearTimeout(announceTimer); announceTimer = null;
				deployed = true; root.dataset.state = "deployed";
			}
			function collapseExpanded() {
				if (expandedKey === null) return;
				cards.get(expandedKey)?.card.classList.remove("td-open");
				expandedKey = null;
			}
			function tuck() {
				clearTimeout(tuckTimer); tuckTimer = null;
				if (!deployed) return;
				deployed = false; root.dataset.state = "tucked";
				collapseExpanded();
			}
			function scheduleTuck() {
				if (tuckTimer !== null) return;
				tuckTimer = setTimeout(() => {
					tuckTimer = null;
					if (!pointerInYard && !yard.matches(":focus-within")) tuck();
				}, 500);
			}
			function announce() {
				deploy();
				clearTimeout(announceTimer);
				announceTimer = setTimeout(() => {
					announceTimer = null;
					if (!pointerInYard && !yard.matches(":focus-within")) tuck();
				}, 3200);
			}
			function total() {
				let n = 0;
				for (const rec of cards.values()) if (!rec.gone) n++;
				for (const group of followups.values()) for (const item of group.items) if (!item.gone) n++;
				return n;
			}
			function updateCount() {
				const n = total();
				hanging = n;
				countEl.textContent = String(n);
				root.dataset.has = n > 0 ? "1" : "0";
				peek.setAttribute("aria-label", n > 0 ? "展开悬挂的追问（" + n + "）" : "展开悬挂的追问");
				peek.title = n > 0 ? "有 " + n + " 个追问挂在这里，点击展开" : "";
				if (n === 0 && Date.now() >= tuckHoldUntil) tuck();
			}
			function letgo(rec) {
				if (!cards.has(rec.key)) return;
				rec.gone = true;
				cards.delete(rec.key);
				if (expandedKey === rec.key) expandedKey = null;
				rec.hanger.classList.add("td-letgo");
				setTimeout(() => rec.hanger.remove(), 720);
				updateCount();
			}
			function mkMini(label, title, onClick) {
				const b = document.createElement("button");
				b.type = "button"; b.className = "td-mini"; b.title = title; b.textContent = label;
				b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
				return b;
			}
			function mkBtn(label, cls, onClick) {
				const b = document.createElement("button");
				b.type = "button"; b.className = "td-btn" + (cls ? " " + cls : "");
				b.textContent = label;
				b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
				return b;
			}
			function showErr(rec, text) {
				if (!rec.errEl) return;
				rec.errEl.textContent = text;
				rec.errEl.style.display = "block";
			}
			function setBusy(rec, busy) {
				for (const b of rec.card.querySelectorAll(".td-detail button, .td-detail textarea")) b.disabled = busy || rec.row.state === "open" && b.classList.contains("td-opt");
				const primary = rec.card.querySelector(".td-actions .td-primary");
				if (primary) primary.textContent = busy ? "提交中…" : (rec.row.state === "open" ? "在输入框中回答" : "提交回答");
			}

			function renderDetail(rec) {
				const row = rec.row;
				const detail = rec.card.querySelector(".td-detail");
				detail.innerHTML = "";
				rec.errEl = null;
				const live = row.state === "open";
				for (const q of row.questions) {
					const block = document.createElement("div");
					block.className = "td-qblock";
					if (q.header) {
						const h = document.createElement("div"); h.className = "td-qhead"; h.textContent = q.header; block.appendChild(h);
					}
					const qt = document.createElement("div"); qt.className = "td-qtext"; qt.textContent = q.question; block.appendChild(qt);
					let draft = rec.draft.get(q.id);
					if (!draft) { draft = { selected: new Set(), custom: "" }; rec.draft.set(q.id, draft); }
					const refresh = () => {
						for (const b of block.querySelectorAll(".td-opt")) b.classList.toggle("td-sel", draft.selected.has(b.dataset.label));
					};
					for (const opt of q.options ?? []) {
						const b = document.createElement("button");
						b.type = "button"; b.className = "td-opt"; b.dataset.label = opt.label;
						const lbl = document.createElement("span"); lbl.textContent = opt.label; b.appendChild(lbl);
						if (opt.description) {
							const d = document.createElement("span"); d.className = "td-odesc"; d.textContent = opt.description; b.appendChild(d);
						}
						if (live) b.disabled = true;
						else b.addEventListener("click", (e) => {
							e.stopPropagation();
							if (q.multiSelect) {
								if (draft.selected.has(opt.label)) draft.selected.delete(opt.label);
								else draft.selected.add(opt.label);
								refresh();
							} else {
								draft.selected = new Set([opt.label]);
								refresh();
								if (row.questions.length === 1) submit(rec);
							}
						});
						block.appendChild(b);
					}
					refresh();
					const ta = document.createElement("textarea");
					ta.className = "td-custom"; ta.rows = 1;
					ta.placeholder = "其他回答（可选）";
					ta.value = draft.custom;
					if (live) ta.disabled = true;
					ta.addEventListener("input", () => { draft.custom = ta.value; });
					ta.addEventListener("click", (e) => e.stopPropagation());
					block.appendChild(ta);
					detail.appendChild(block);
				}
				if (live) {
					const hint = document.createElement("div"); hint.className = "td-hint";
					hint.textContent = "Agent 正在等待这个回答，请在输入框的提问卡片里作答；这里仅作预览。";
					detail.appendChild(hint);
				}
				const actions = document.createElement("div"); actions.className = "td-actions";
				if (live) {
					actions.appendChild(mkBtn("在输入框中回答", "td-primary", () => reveal(rec)));
				} else {
					actions.appendChild(mkBtn("提交回答", "td-primary", () => submit(rec)));
					actions.appendChild(mkBtn("跳过", "", () => skip(rec)));
					actions.appendChild(mkBtn("在输入框打开", "", () => reveal(rec)));
				}
				detail.appendChild(actions);
				const err = document.createElement("div"); err.className = "td-err"; err.style.display = "none";
				detail.appendChild(err);
				rec.errEl = err;
			}

			function expand(rec) {
				if (expandedKey !== null && expandedKey !== rec.key) cards.get(expandedKey)?.card.classList.remove("td-open");
				expandedKey = rec.key;
				rec.card.classList.add("td-open");
				renderDetail(rec);
				deploy();
			}

			async function sendAnswers(rec, answers) {
				if (rec.sending) return;
				rec.sending = true;
				setBusy(rec, true);
				try {
					const result = await ctx.remote.userQuestions.answer(rec.sessionId, rec.row.callId, { answers });
					if (result && result.ok === false) throw new Error(result.error?.message ?? "回答未被接受");
					settling.add(rec.key);
					letgo(rec);
				} catch (error) {
					rec.sending = false;
					setBusy(rec, false);
					showErr(rec, String(error?.message ?? error));
				}
			}
			function submit(rec) {
				const answers = [];
				for (const q of rec.row.questions) {
					const d = rec.draft.get(q.id) ?? { selected: new Set(), custom: "" };
					const selected = [...d.selected];
					const custom = (d.custom ?? "").trim();
					if (selected.length === 0 && custom === "") {
						showErr(rec, "还有问题没有作答：" + q.question.slice(0, 40));
						const body = rec.card.querySelector(".td-body");
						body.classList.remove("td-shake"); void body.offsetWidth; body.classList.add("td-shake");
						return;
					}
					answers.push({ id: q.id, selected, ...(custom !== "" ? { custom } : {}) });
				}
				void sendAnswers(rec, answers);
			}
			function skip(rec) {
				void sendAnswers(rec, rec.row.questions.map((q) => ({ id: q.id, selected: [] })));
			}
			function reveal(rec) {
				try {
					const current = currentSessionId();
					const switchNeeded = current !== rec.sessionId;
					if (switchNeeded) uiWorkspace?.openSession?.(rec.sessionId);
					setTimeout(() => {
						try { ctx.get("userQuestionPanels")?.reveal(rec.sessionId, rec.row.callId); } catch {}
					}, switchNeeded ? 450 : 0);
				} catch {}
				tuck();
			}
			function dismiss(rec) {
				dismissed.add(rec.key);
				saveDismissed(dismissed);
				letgo(rec);
			}
			/** Take every card of one batch off the line: the chosen one first, then the rest pulled to the right. */
			function pullOff(group, pickedIndex) {
				if (group.removed) return;
				group.removed = true;
				followups.delete(group.sessionId);
				clearTimeout(group.timer);
				clearBatch(group.sessionId);
				const ordered = group.items.slice().sort((a, b) => (a.index === pickedIndex ? -1 : b.index === pickedIndex ? 1 : a.index - b.index));
				ordered.forEach((item, n) => {
					item.gone = true;
					item.hanger.style.animationDelay = (n === 0 ? 0 : 70 + n * 60) + "ms";
					item.hanger.classList.add(n === 0 ? "td-unhook-picked" : "td-unhook");
				});
				tuckHoldUntil = Date.now() + 1250;
			setTimeout(() => { for (const item of group.items) item.hanger.remove(); tuckHoldUntil = 0; updateCount(); }, 1150);
			updateCount();
			}
			/** Quiet fade-out: auto expiry, dismissal, and a newer batch replacing this one. */
			function quietFollowup(sessionId, keepStored) {
				const group = followups.get(sessionId);
				if (group === void 0) return;
				group.removed = true;
				followups.delete(sessionId);
				clearTimeout(group.timer);
				if (!keepStored) clearBatch(sessionId);
				for (const item of group.items) { item.gone = true; item.hanger.classList.add("td-fading"); }
				setTimeout(() => { for (const item of group.items) item.hanger.remove(); }, 420);
				updateCount();
			}
			function removeFollowup(sessionId) {
				quietFollowup(sessionId);
			}
						/** One hanging card per suggested question; the batch shares one group. */
			function makeSuggestionCard(group, index, question) {
				const hanger = document.createElement("div");
				hanger.className = "td-hanger td-enter";
				hanger.setAttribute("role", "listitem");
				const card = document.createElement("article");
				card.className = "td-card td-fu";
				card.tabIndex = 0;
				card.setAttribute("aria-label", "建议追问：" + question);
				card.style.setProperty("--td-sway-dur", (2.7 + Math.random() * 1.3).toFixed(2) + "s");
				card.style.setProperty("--td-sway-delay", (-Math.random() * 3).toFixed(2) + "s");
				card.innerHTML =
				'<div class="td-pin">' + PIN_SVG + '</div>' +
				'<div class="td-body">' +
				'<div class="td-meta"><span class="td-fu-index"></span><span class="td-session"></span><span class="td-fu-tools"></span></div>' +
				'<div class="td-fu-q"></div>' +
				'<div class="td-fu-cta">点击提问 →</div>' +
				'</div>';
				card.querySelector(".td-fu-index").textContent = String(index + 1).padStart(2, "0");
				card.querySelector(".td-session").textContent = group.title;
				card.querySelector(".td-fu-q").textContent = question;
				const tools = card.querySelector(".td-fu-tools");
				tools.appendChild(mkMini("\u21bb", "换一批追问", () => void generateSuggestions(group.sessionId, true)));
				tools.appendChild(mkMini("\u00d7", "先收起来（下次回答结束后会再挂新的）", () => quietFollowup(group.sessionId)));
				const item = { key: "fu:" + group.sessionId + ":" + index, sessionId: group.sessionId, hanger, card, question, index, gone: false, sending: false };
				card.addEventListener("click", () => pickQuestion(group, item));
				card.addEventListener("keydown", (e) => {
					if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickQuestion(group, item); }
				});
				hanger.appendChild(card);
				return item;
			}
			/** Hang one batch: three questions, three cards on the line. */
			function showSuggestions(sessionId, questions, title, options = {}) {
				quietFollowup(sessionId);
				clearBatch(sessionId);
				const group = { sessionId, title, items: [], timer: null, removed: false };
				const frag = document.createDocumentFragment();
				for (const [index, question] of questions.entries()) {
					const item = makeSuggestionCard(group, index, question);
					frag.appendChild(item.hanger);
					group.items.push(item);
				}
				cardsEl.insertBefore(frag, cardsEl.firstChild);
				setTimeout(() => { for (const item of group.items) item.hanger.classList.remove("td-enter"); }, 900);
				followups.set(sessionId, group);
				group.timer = setTimeout(() => quietFollowup(sessionId), options.remainingMs ?? BATCH_HANG);
				saveBatch(sessionId, questions, title, options.ts);
				return group;
			}
			/** Choosing a card asks that question and pulls the whole batch off the line. */
			function pickQuestion(group, item) {
				if (group.removed || item.gone || item.sending) return;
				item.sending = true;
				for (const other of group.items) other.card.classList.add("td-busy");
				void (async () => {
					try {
							const session = ns("remote.session");
							if (typeof session?.prompt !== "function") throw new Error("远程 session/prompt 不可用");
							const response = await session.prompt({
								requestId: "tendedero-" + Math.random().toString(36).slice(2) + Date.now().toString(36),
								sessionId: group.sessionId,
								mode: "queue",
								content: [{ type: "text", text: item.question }]
							});
							if (response?.ok === false) throw new Error(String(response.error?.message ?? "消息未能发送"));
							pullOff(group, item.index);
					} catch (error) {
							console.warn("[dsh-tendedero] send failed", error);
							item.sending = false;
							for (const other of group.items) other.card.classList.remove("td-busy");
							const cta = item.card.querySelector(".td-fu-cta");
							if (cta !== null) { cta.textContent = "发送失败，再点一次重试"; cta.classList.add("td-failed"); }
					}
				})();
			}
			/** A failed generation hangs a card too, so the line is never silently broken. */
			function showSuggestError(sessionId, message) {
				const status = uiSession?.sessionStatus?.getSnapshot?.().get(sessionId);
				if (status?.running === true) return;
				for (const rec of cards.values()) if (rec.sessionId === sessionId && !rec.gone) return;
				quietFollowup(sessionId);
				const group = { sessionId, title: "追问生成失败", items: [], timer: null, removed: false };
				const hanger = document.createElement("div");
				hanger.className = "td-hanger td-enter";
				const card = document.createElement("article");
				card.className = "td-card td-fu td-fu-error";
				card.tabIndex = 0;
				card.setAttribute("aria-label", "追问生成失败：" + message);
				card.style.setProperty("--td-sway-dur", "3.1s");
				card.innerHTML =
					'<div class="td-pin">' + PIN_SVG + '</div>' +
					'<div class="td-body">' +
					'<div class="td-meta"><span class="td-fu-index">!</span><span class="td-session">追问生成失败</span><span class="td-fu-tools"></span></div>' +
					'<div class="td-fu-q"></div>' +
					'<div class="td-fu-cta">点此重试 →</div>' +
					'</div>';
				card.querySelector(".td-fu-q").textContent = message;
				card.querySelector(".td-fu-tools").appendChild(mkMini("\u00d7", "先收起来", () => quietFollowup(sessionId)));
				const item = { key: "fu:" + sessionId + ":error", sessionId, hanger, card, index: 0, gone: false };
				const retry = () => { if (!group.removed) void generateSuggestions(sessionId, true); };
				card.addEventListener("click", retry);
				card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); retry(); } });
				hanger.appendChild(card);
				cardsEl.appendChild(hanger);
				setTimeout(() => hanger.classList.remove("td-enter"), 900);
				group.items.push(item);
				followups.set(sessionId, group);
				group.timer = setTimeout(() => quietFollowup(sessionId), 90000);
				updateCount();
				announce();
			}
			async function generateSuggestions(sessionId, manual) {
				const token = sessionId + (manual ? ":manual" : ":auto");
				if (generating.has(token)) return;
				generating.add(token);
				try {
					const binding = sessions.binding(sessionId);
					if (binding === void 0) return;
					const suggested = ns("remote.tendedero");
					if (typeof suggested?.suggest !== "function") throw new Error("宿主侧 dsh-tendedero/remote 未加载（重启 DSH 后生效）");
					// Remote methods resolve to an { ok, value | error } envelope, not the business value.
					const response = await suggested.suggest(sessionId);
					if (response?.ok === false) throw new Error(String(response.error?.message ?? "tendedero/suggest 调用失败"));
					const payload = response?.ok === true ? response.value : response;
					const questions = Array.isArray(payload?.questions) ? payload.questions.filter((q) => typeof q === "string" && q.length > 1) : [];
					if (questions.length === 0) throw new Error("模型没有返回可用的追问");
					const status = uiSession?.sessionStatus?.getSnapshot?.().get(sessionId);
					if (status?.running === true) return;
					if (!manual) {
						for (const rec of cards.values()) if (rec.sessionId === sessionId && !rec.gone) return;
					}
					let title = sessionId;
					try { title = sessions.list.getSnapshot().byId[sessionId]?.displayTitle ?? sessionId; } catch {}
					showSuggestions(sessionId, questions.slice(0, 3), title);
					updateCount();
					announce();
				} catch (error) {
					console.warn("[dsh-tendedero] suggest failed", error);
					showSuggestError(sessionId, String(error?.message ?? error));
				} finally {
					generating.delete(token);
				}
			}

			function createCard(entry) {
				const row = entry.row;
				const hanger = document.createElement("div");
				hanger.className = "td-hanger td-enter";
				hanger.setAttribute("role", "listitem");
				const card = document.createElement("article");
				card.className = "td-card";
				card.style.setProperty("--td-sway-dur", (2.7 + Math.random() * 1.3).toFixed(2) + "s");
				card.style.setProperty("--td-sway-delay", (-Math.random() * 3).toFixed(2) + "s");
				card.innerHTML =
					'<div class="td-pin">' + PIN_SVG + '</div>' +
					'<div class="td-body">' +
					'<div class="td-meta"><span class="td-dot"></span><span class="td-session"></span><button class="td-x" type="button" title="收起来（不回答，仍可在输入框作答）">×</button></div>' +
					'<div class="td-q"></div><div class="td-tags"></div><div class="td-detail"></div>' +
					'</div>';
				card.querySelector(".td-session").textContent = entry.title;
				card.querySelector(".td-q").textContent = row.questions[0]?.question ?? "";
				hanger.appendChild(card);
				cardsEl.appendChild(hanger);
				const rec = { ...entry, hanger, card, draft: new Map(), sending: false, errEl: null };
				paintState(rec);
				card.querySelector(".td-x").addEventListener("click", (e) => { e.stopPropagation(); dismiss(rec); });
				card.querySelector(".td-body").addEventListener("click", (e) => {
					if (card.classList.contains("td-open")) return;
					if (e.target.closest("button, textarea, input")) return;
					expand(rec);
				});
				setTimeout(() => hanger.classList.remove("td-enter"), 900);
				return rec;
			}
			function paintState(rec) {
				const row = rec.row;
				const dot = rec.card.querySelector(".td-dot");
				dot.classList.toggle("td-waiting", row.state === "open");
				const tags = rec.card.querySelector(".td-tags");
				tags.innerHTML = "";
				const t1 = document.createElement("span"); t1.className = "td-tag";
				t1.textContent = row.state === "open" ? "等待回答" : "回合已结束 · 可作答";
				tags.appendChild(t1);
				if (row.questions.length > 1) {
					const t2 = document.createElement("span"); t2.className = "td-tag";
					t2.textContent = row.questions.length + " 个问题";
					tags.appendChild(t2);
				}
				if (rec.sessionId === currentSessionId()) {
					const t3 = document.createElement("span"); t3.className = "td-tag";
					t3.textContent = "当前会话";
					tags.appendChild(t3);
				}
			}

			function reconcile() {
				if (destroyed) return;
				try {
					const snapshot = sessions.list.getSnapshot();
					const byId = snapshot?.byId ?? {};
					const bound = new Map();
					for (const summary of Object.values(byId)) {
						const binding = sessions.binding(summary.id);
						if (binding !== undefined) bound.set(summary.id, binding);
					}
					for (const [sid, stop] of stopProjections) {
						if (bound.has(sid)) continue;
						stop(); stopProjections.delete(sid);
						removeFollowup(sid);
					}
					for (const [sid, binding] of bound) {
						if (stopProjections.has(sid)) continue;
						const stopQ = binding.session.projections.faceOf("userQuestions").subscribe(reconcile);
						const stopI = binding.session.projections.faceOf("inbox").subscribe(reconcile);
						stopProjections.set(sid, () => { stopQ(); stopI(); });
					}
					const rows = new Map();
					for (const [sid, binding] of bound) {
						const projected = binding.session.projections.faceOf("userQuestions").getSnapshot();
						const inbox = binding.session.projections.faceOf("inbox").getSnapshot();
						const queued = new Set();
						for (const message of [...inbox?.["next-step"] ?? [], ...inbox?.["next-turn"] ?? []]) {
							if (typeof message !== "object" || message === null || Array.isArray(message)) continue;
							const source = message.source;
							if (typeof source !== "object" || source === null || Array.isArray(source)) continue;
							if (source.kind === "user-question-reply" && typeof source.callId === "string") queued.add(source.callId);
						}
						for (const row of projected?.active ?? []) {
							if (row.state === "continued" && queued.has(row.callId)) continue;
							const key = sid + ":" + row.callId;
							rows.set(key, { key, sessionId: sid, row, title: byId[sid]?.displayTitle ?? "会话" });
						}
					}
					for (const key of [...settling]) if (!rows.has(key)) settling.delete(key);
					for (const key of [...dismissed]) if (!rows.has(key)) { dismissed.delete(key); saveDismissed(dismissed); }
					let added = false;
					for (const [key, entry] of rows) {
						if (settling.has(key) || dismissed.has(key)) continue;
						const existing = cards.get(key);
						if (existing) {
							if (existing.row.state !== entry.row.state || existing.row.questions !== entry.row.questions) {
								existing.row = entry.row;
								existing.title = entry.title;
								existing.card.querySelector(".td-session").textContent = entry.title;
								existing.card.querySelector(".td-q").textContent = entry.row.questions[0]?.question ?? "";
								paintState(existing);
								if (expandedKey === key) renderDetail(existing);
							}
							continue;
						}
						cards.set(key, createCard(entry));
						added = true;
					}
					for (const rec of [...cards.values()]) if (!rows.has(rec.key)) letgo(rec);
					if (rows.size > 0) {
						const seen = new Set();
						for (const { sessionId } of rows.values()) seen.add(sessionId);
						for (const sessionId of seen) removeFollowup(sessionId);
					}
					sweepRunning(uiSession?.sessionStatus?.getSnapshot?.());
					updateCount();
					if (added) announce();
				} catch (error) {
					console.warn("[dsh-tendedero] reconcile failed", error);
				}
			}

			const onPointerMove = (e) => {
				if (destroyed || hanging === 0) return;
				const x = e.clientX, y = e.clientY;
				if (!deployed) {
					// Full width, generous depth: the whole top strip (title bar + both corners) recalls the line.
					if (y <= TRIGGER_DEPTH) deploy();
					return;
				}
				const r = yard.getBoundingClientRect();
				const inside = x >= r.left - 30 && x <= r.right + 30 && y >= 0 && y <= r.bottom + 40;
				if (inside) { clearTimeout(tuckTimer); tuckTimer = null; }
				else scheduleTuck();
			};
			const onKeydown = (e) => { if (e.key === "Escape") tuck(); };
			const onBlur = () => { if (yard.matches(":hover")) return; pointerInYard = false; tuck(); };
			const onYardEnter = () => { pointerInYard = true; clearTimeout(tuckTimer); tuckTimer = null; };
			const onYardLeave = () => { pointerInYard = false; scheduleTuck(); };
			const onPeekClick = () => { if (deployed) tuck(); else deploy(); };
			document.addEventListener("pointermove", onPointerMove, { passive: true });
			document.addEventListener("mousemove", onPointerMove, { passive: true });
			document.addEventListener("keydown", onKeydown);
			window.addEventListener("blur", onBlur);
			yard.addEventListener("pointerenter", onYardEnter);
			yard.addEventListener("pointerleave", onYardLeave);
			peek.addEventListener("click", onPeekClick);

			const onReset = () => {
				for (const sessionId of [...followups.keys()]) quietFollowup(sessionId, true);
				statusArmed = false;
				wasRunning.clear();
				onStatus();
				reconcile();
				restoreBatches();
			};
			const stopReset = ctx.on?.("connection/reset", onReset) ?? (() => {});
			const stopList = sessions.list.subscribe(reconcile);
			const wasRunning = new Map();
			let statusArmed = false;
			const onStatus = () => {
				if (!statusArmed) {
					// 首次装载只记录基线：启动/重连时不把历史回合的问题重新生成一遍
					for (const [id, entry] of uiSession?.sessionStatus?.getSnapshot?.() ?? []) wasRunning.set(id, entry?.running === true);
					statusArmed = true;
					return;
				}
				const snapshot = uiSession?.sessionStatus?.getSnapshot?.();
				if (snapshot === void 0) return;
				for (const [id, entry] of snapshot) {
					const running = entry?.running === true;
					const previous = wasRunning.get(id);
					wasRunning.set(id, running);
					if (running && previous === false) quietFollowup(id);
					if (previous === true && running === false && entry?.pendingInteraction === void 0) {
						void generateSuggestions(id, false);
					}
				}
				sweepRunning(snapshot);
			};
			/** A hanging batch dies the moment its Session starts working again. */
			const sweepRunning = (snapshot) => {
				if (snapshot === void 0) return;
				for (const sessionId of [...followups.keys()]) {
					if (snapshot.get(sessionId)?.running === true) quietFollowup(sessionId);
				}
			};
			/** A batch still inside its window comes back after a reload or a reconnect. */
			const restoreBatches = () => {
				const snapshot = uiSession?.sessionStatus?.getSnapshot?.();
				for (const [sessionId, value] of Object.entries(loadBatches())) {
					if (followups.has(sessionId)) continue;
					if (sessions.binding(sessionId) === void 0) { clearBatch(sessionId); continue; }
					if (snapshot?.get(sessionId)?.running === true) { clearBatch(sessionId); continue; }
					let liveQuestion = false;
					for (const rec of cards.values()) if (rec.sessionId === sessionId && !rec.gone) liveQuestion = true;
					if (liveQuestion) { clearBatch(sessionId); continue; }
					const remaining = BATCH_TTL - (Date.now() - value.ts);
					if (remaining <= 0) { clearBatch(sessionId); continue; }
					showSuggestions(sessionId, value.questions.slice(0, 3), value.title ?? sessionId, { remainingMs: Math.min(remaining, BATCH_HANG), ts: value.ts });
				}
				updateCount();
			};
			const stopStatus = uiSession?.sessionStatus?.subscribe?.(onStatus) ?? (() => {});
			onStatus();
			reconcile();
			restoreBatches();

			return () => {
				destroyed = true;
				for (const group of followups.values()) { clearTimeout(group.timer); for (const item of group.items) item.hanger.remove(); }
				followups.clear();
				stopStatus();
				stopReset();
				stopList();
				for (const stop of stopProjections.values()) stop();
				stopProjections.clear();
				clearTimeout(tuckTimer); clearTimeout(announceTimer);
				document.removeEventListener("pointermove", onPointerMove);
				document.removeEventListener("mousemove", onPointerMove);
				document.removeEventListener("keydown", onKeydown);
				window.removeEventListener("blur", onBlur);
				yard.removeEventListener("pointerenter", onYardEnter);
				yard.removeEventListener("pointerleave", onYardLeave);
				peek.removeEventListener("click", onPeekClick);
				root.remove(); style.remove();
				cards.clear();
			};
		}

		module.exports = { apply, inject };
		return module.exports;
	}
});
