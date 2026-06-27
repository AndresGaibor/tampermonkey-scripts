// ==UserScript==
// @name            Better ChatGPT Assistant (asistente multifunción mejorado para ChatGPT web)
// @namespace       https://github.com/3150214587/chatgpt-virtual-scrollGPT-
// @version         8.2.3.5
// @author          3150214587
// @description     Better ChatGPT Assistant con Virtual Scroll Engine 6.0: chats largos ultra fluidos, exportación, monitor de tokens, i18n y más.
// @description:es  Asistente multifunción estable para ChatGPT: virtualización de conversaciones largas + indicador superior minimalista (verde/amarillo/rojo) + panel con 3 modos / pausa / optimización forzada / nueva conversación / ayuda + atenuación al escribir + Ctrl+F + resize + exportación Markdown (UTF-8 BOM) + plegado de código + estimación de tokens + cambio ES/EN
// @license         MIT
// @homepageURL     https://github.com/3150214587/chatgpt-virtual-scrollGPT-
// @supportURL      https://github.com/3150214587/chatgpt-virtual-scrollGPT-/issues
// @downloadURL     https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/better-chatgpt-assistant.user.js
// @updateURL       https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/better-chatgpt-assistant.user.js
// @match           https://chat.openai.com/*
// @match           https://chatgpt.com/*
// @run-at          document-idle
// ==/UserScript==

(function() {
	"use strict";
	function clamp(value, min, max) {
		return Math.max(min, Math.min(max, value));
	}
	var MEM_STABLE_MB = 220;
	var MEM_WARNING_MB = 520;
	var DOM_OK = 7e3;
	var DOM_WARN = 15e3;
	function memoryLevel$1(usedMB, lang) {
		if (usedMB == null) return {
			label: lang === "zh" ? "No disponible" : "N/A",
			level: "na"
		};
		if (usedMB < MEM_STABLE_MB) return {
			label: `${usedMB.toFixed(0)}MB${lang === "zh" ? " (estable y fluido)" : " (OK)"}`,
			level: "ok"
		};
		if (usedMB < MEM_WARNING_MB) return {
			label: `${usedMB.toFixed(0)}MB${lang === "zh" ? " (alto, puede ir lento)" : " (High)"}`,
			level: "warn"
		};
		return {
			label: `${usedMB.toFixed(0)}MB${lang === "zh" ? " (riesgo de bloqueo)" : " (Warn)"}`,
			level: "bad"
		};
	}
	function domLevel$1(domNodes) {
		if (domNodes < DOM_OK) return {
			label: `${domNodes}`,
			level: "ok"
		};
		if (domNodes < DOM_WARN) return {
			label: `${domNodes}`,
			level: "warn"
		};
		return {
			label: `${domNodes}`,
			level: "bad"
		};
	}
	function estimateRemainingTurns$1(usedMB, turns) {
		if (usedMB == null || !turns || turns < 12) return null;
		const avg = usedMB / turns;
		if (!isFinite(avg) || avg <= 0) return null;
		const headroom = MEM_WARNING_MB - usedMB;
		return Math.max(0, Math.min(9999, Math.floor(headroom / avg)));
	}
	function modeLabel$1(mode, lang) {
		if (lang === "en") return mode;
		if (mode === "conservative") return "Conservador c";
		if (mode === "balanced") return "Equilibrado b";
		return "Rendimiento a";
	}
	function suggestionText$1(input) {
		const mem = memoryLevel$1(input.usedMB, input.lang).level;
		const dom = domLevel$1(input.domNodes).level;
		if (!input.virtualizationEnabled) return input.lang === "zh" ? "Consejo: la virtualización está pausada. El historial completo queda visible, pero los chats largos pueden ponerse lentos. Actívala cuando necesites fluidez." : "Tip: Virtualization is paused. Full history is visible, but long chats may lag. Enable it for smooth scrolling.";
		if (input.ctrlFFreeze) return input.lang === "zh" ? "Consejo: estás usando la búsqueda del navegador (Ctrl+F). La virtualización se pausó para permitir buscar en todo el historial. Se restaurará automáticamente al salir de la búsqueda." : "Tip: Browser Find (Ctrl+F) is active. Virtualization is paused so you can search all history. It will resume after you exit Find.";
		if (mem === "bad" || dom === "bad") return input.lang === "zh" ? "Consejo: la página entró en zona de lentitud. Pulsa “Optimizar ahora” para reducir la carga; exporta o respalda el contenido importante antes de refrescar o abrir una nueva conversación." : "Tip: Near lag zone. Click “Optimize Now” to reduce load. Export/backup important content before refreshing or starting a new chat.";
		if (mem === "warn" || dom === "warn") return input.lang === "zh" ? "Consejo: la carga está alta, pero puedes seguir conversando. Evita desplazarte mucho por el historial de una sola vez; para revisar contenido antiguo puedes cambiar temporalmente a “Conservador”." : "Tip: Load is higher but still OK. Avoid long scroll sessions. Switch to “Conservative” when browsing old history.";
		if (input.virtCount > 0 && input.turns > 220) return input.lang === "zh" ? "Consejo: el estado es bueno. Para buscar contenido antiguo, usa la búsqueda o exporta el chat; evita bajar repetidamente hasta el final." : "Tip: Healthy. Use search or export to view old history, instead of repeatedly scrolling to the bottom.";
		return input.lang === "zh" ? "Consejo: el estado es bueno." : "Tip: Healthy.";
	}
	function loadBool$1(storage, key, def) {
		const v = storage.getItem(key);
		if (v === null || v === void 0) return def;
		return v === "1";
	}
	function saveBool$1(storage, key, val) {
		storage.setItem(key, val ? "1" : "0");
	}
	function loadMode$1(storage) {
		const v = storage.getItem("cgpt_vs_mode");
		return v === "performance" || v === "balanced" || v === "conservative" ? v : "balanced";
	}
	function saveMode$1(storage, mode) {
		storage.setItem("cgpt_vs_mode", mode);
	}
	function loadPos$1(storage, viewportWidth, viewportHeight) {
		try {
			const raw = storage.getItem("cgpt_vs_pos");
			if (!raw) return {
				x: 18,
				y: 64,
				side: "left",
				hidden: false
			};
			const p = JSON.parse(raw);
			if (typeof p.x === "number" && typeof p.y === "number") return {
				x: clamp(p.x, 0, viewportWidth - 40),
				y: clamp(p.y, 0, viewportHeight - 40),
				side: p.side === "right" ? "right" : "left",
				hidden: !!p.hidden
			};
		} catch {}
		return {
			x: 18,
			y: 64,
			side: "left",
			hidden: false
		};
	}
	function savePos$1(storage, pos) {
		storage.setItem("cgpt_vs_pos", JSON.stringify(pos));
	}
	var CHECK_INTERVAL_MS = 1100;
	var ROUTE_GUARD_MS = 800;
	var INPUT_DIM_IDLE_MS = 850;
	var IMAGE_LOAD_RETRY_MS = 250;
	var POS_FOLLOW_MS = 450;
	var POS_FOLLOW_WHEN_OPEN_MS = 250;
	var MODE_TO_MARGIN_SCREENS = {
		performance: 1,
		balanced: 2,
		conservative: 3
	};
	var FORCE_CLEAN_MARGIN_SCREENS = .4;
	var LANG_KEY = "vs_lang";
	var lang = localStorage.getItem(LANG_KEY) || "zh";
	var I18N = {
		zh: {
			export: "Exportar historial del chat",
			fold: "Contraer/mostrar código",
			token: "Estimación de tokens",
			lang: "EN",
			optimize: "Optimizar ahora",
			optimizeTip: "Reduce ahora la carga de la página sin afectar el contenido del chat",
			newChat: "Nueva conversación",
			help: "Ayuda",
			health: "Saludable"
		},
		en: {
			export: "Export Chat Log",
			fold: "Fold Code",
			token: "Token Estimate",
			lang: "Español",
			optimize: "Optimize Now",
			optimizeTip: "Reduce page load now, chat content stays safe",
			newChat: "New chat",
			help: "Help",
			health: "Healthy"
		}
	};
	var KEY_ENABLED = "cgpt_vs_enabled";
	var KEY_PINNED = "cgpt_vs_pinned";
	var KEY_MINIMAL = "cgpt_vs_minimal";
	var KEY_EDGE_SNAP = "cgpt_vs_edge_snap";
	var KEY_LAST_OPEN = "cgpt_vs_open";
	var STYLE_ID = "cgpt-vs-style";
	var ROOT_ID = "cgpt-vs-root";
	var DOT_ID = "cgpt-vs-dot";
	var BTN_ID = "cgpt-vs-btn";
	var PANEL_ID = "cgpt-vs-panel";
	var HELP_ID = "cgpt-vs-help";
	var FP_ID = "cgpt-vs-featurepack";
	var currentMode = loadMode();
	var virtualizationEnabled = loadBool(KEY_ENABLED, true);
	var minimalMode = loadBool(KEY_MINIMAL, true);
	var edgeSnap = loadBool(KEY_EDGE_SNAP, true);
	var pinned = loadBool(KEY_PINNED, false);
	var wasOpen = loadBool(KEY_LAST_OPEN, false);
	var ctrlFFreeze = false;
	var typingDimTimer = null;
	var lastInputAt = 0;
	var rafPending = false;
	var lastVirtualizedCount = 0;
	var lastTurnsCount = 0;
	var followTimer = null;
	var pinnedPos = loadPos();
	function t(k) {
		return I18N[lang] && I18N[lang][k] ? I18N[lang][k] : k;
	}
	function loadBool(key, def) {
		return loadBool$1(localStorage, key, def);
	}
	function saveBool(key, val) {
		saveBool$1(localStorage, key, val);
	}
	function loadMode() {
		return loadMode$1(localStorage);
	}
	function saveMode(mode) {
		currentMode = mode;
		saveMode$1(localStorage, mode);
	}
	function loadPos() {
		return loadPos$1(localStorage, window.innerWidth, window.innerHeight);
	}
	function savePos() {
		savePos$1(localStorage, pinnedPos);
	}
	function getMarginScreens() {
		return MODE_TO_MARGIN_SCREENS[currentMode] ?? MODE_TO_MARGIN_SCREENS.balanced;
	}
	function getUsedHeapMB() {
		const p = window.performance;
		if (!p || !p.memory || !p.memory.usedJSHeapSize) return null;
		return p.memory.usedJSHeapSize / (1024 * 1024);
	}
	function memoryLevel(usedMB) {
		return memoryLevel$1(usedMB, lang);
	}
	function domLevel(domNodes) {
		return domLevel$1(domNodes);
	}
	function estimateRemainingTurns(usedMB, turns) {
		return estimateRemainingTurns$1(usedMB, turns);
	}
	function modeLabel(mode) {
		return modeLabel$1(mode, lang);
	}
	function suggestionText(domNodes, usedMB, virtCount, turns) {
		return suggestionText$1({
			virtualizationEnabled,
			ctrlFFreeze,
			domNodes,
			usedMB,
			virtCount,
			turns,
			lang
		});
	}
	function getMessageNodes() {
		let nodes = document.querySelectorAll("div[data-message-id]");
		if (nodes && nodes.length) return Array.from(nodes);
		nodes = document.querySelectorAll("[data-testid=\"conversation-turn\"]");
		if (nodes && nodes.length) return Array.from(nodes);
		const main = document.querySelector("main");
		if (!main) return [];
		nodes = main.querySelectorAll("div[role=\"presentation\"]");
		return nodes && nodes.length ? Array.from(nodes) : [];
	}
	function unvirtualizeAll() {
		const msgs = getMessageNodes();
		for (const msg of msgs) if (msg.dataset.vsSlimmed) {
			msg.innerHTML = msg.dataset.vsBackup || msg.innerHTML;
			delete msg.dataset.vsSlimmed;
			delete msg.dataset.vsBackup;
			delete msg.dataset.vsH;
		}
	}
	function virtualizeOnce(marginScreensOverride) {
		if (!virtualizationEnabled || ctrlFFreeze) {
			lastVirtualizedCount = 0;
			lastTurnsCount = getMessageNodes().length || 0;
			return;
		}
		const marginScreens = typeof marginScreensOverride === "number" ? marginScreensOverride : getMarginScreens();
		const msgs = getMessageNodes();
		lastTurnsCount = msgs.length;
		const viewportTop = window.scrollY;
		const viewportBottom = viewportTop + window.innerHeight;
		const keepTop = viewportTop - window.innerHeight * marginScreens;
		const keepBottom = viewportBottom + window.innerHeight * marginScreens;
		let slimmedCount = 0;
		for (const msg of msgs) {
			const rect = msg.getBoundingClientRect();
			const top = rect.top + window.scrollY;
			if (!(top + rect.height > keepTop && top < keepBottom)) {
				if (!msg.dataset.vsSlimmed) {
					msg.dataset.vsSlimmed = "1";
					msg.dataset.vsBackup = msg.innerHTML;
					const h = Math.max(24, Math.round(rect.height));
					msg.dataset.vsH = String(h);
					msg.innerHTML = `<div class="cgpt-vs-ph" style="height:${h}px"></div>`;
				} else {
					const oldH = Number(msg.dataset.vsH || 0);
					const newH = Math.max(24, Math.round(rect.height));
					if (oldH && Math.abs(newH - oldH) > 180) {
						msg.dataset.vsH = String(newH);
						const ph = msg.querySelector(".cgpt-vs-ph");
						if (ph) ph.style.height = `${newH}px`;
					}
				}
				slimmedCount += 1;
			} else if (msg.dataset.vsSlimmed) {
				msg.innerHTML = msg.dataset.vsBackup || msg.innerHTML;
				delete msg.dataset.vsSlimmed;
				delete msg.dataset.vsBackup;
				delete msg.dataset.vsH;
			}
		}
		lastVirtualizedCount = slimmedCount;
	}
	function scheduleVirtualize(marginOverride) {
		if (rafPending) return;
		rafPending = true;
		requestAnimationFrame(() => {
			rafPending = false;
			virtualizeOnce(marginOverride);
			updateUI();
		});
	}
	function enableCtrlFFreeze() {
		if (ctrlFFreeze) return;
		ctrlFFreeze = true;
		unvirtualizeAll();
		updateUI();
	}
	function disableCtrlFFreeze() {
		if (!ctrlFFreeze) return;
		ctrlFFreeze = false;
		scheduleVirtualize();
	}
	function installFindGuards() {
		window.addEventListener("keydown", (e) => {
			if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) enableCtrlFFreeze();
			if (e.key === "Escape") setTimeout(() => disableCtrlFFreeze(), 120);
		}, true);
	}
	function installTypingDim() {
		const dim = () => {
			lastInputAt = Date.now();
			const root = ensureRoot();
			root.classList.add("dim");
			if (typingDimTimer) clearTimeout(typingDimTimer);
			typingDimTimer = setTimeout(() => {
				if (Date.now() - lastInputAt >= INPUT_DIM_IDLE_MS) root.classList.remove("dim");
			}, 870);
		};
		document.addEventListener("input", (e) => {
			if (!e || !e.target) return;
			const tag = (e.target.tagName || "").toLowerCase();
			if (tag === "textarea" || tag === "input") dim();
		}, true);
		document.addEventListener("focusin", (e) => {
			const el = e.target;
			if (!el) return;
			const tag = (el.tagName || "").toLowerCase();
			if (tag === "textarea" || tag === "input") dim();
		}, true);
		document.addEventListener("focusout", () => {
			setTimeout(() => {
				ensureRoot().classList.remove("dim");
			}, 220);
		}, true);
	}
	function installImageLoadHook() {
		window.addEventListener("load", (e) => {
			const t = e && e.target;
			if (t && t.tagName && t.tagName.toLowerCase() === "img") setTimeout(() => scheduleVirtualize(), IMAGE_LOAD_RETRY_MS);
		}, true);
	}
	function installResizeFix() {
		window.addEventListener("resize", () => {
			unvirtualizeAll();
			requestAnimationFrame(() => scheduleVirtualize());
		}, { passive: true });
	}
	function findModelButton() {
		const header = document.querySelector("header");
		if (!header) return null;
		const btns = header.querySelectorAll("button, [role=\"button\"]");
		const candidates = [];
		for (const b of btns) {
			const txt = (b.innerText || b.textContent || "").trim();
			if (!txt) continue;
			if (/chatgpt/i.test(txt) || /\bgpt\b/i.test(txt) || txt.includes("modelo") || txt.includes("cambiar") || txt.includes("ChatGPT")) candidates.push(b);
		}
		if (!candidates.length) return null;
		let best = candidates[0];
		let bestScore = Infinity;
		for (const c of candidates) {
			const r = c.getBoundingClientRect();
			const score = r.top * 10 + r.left;
			if (score < bestScore) {
				bestScore = score;
				best = c;
			}
		}
		return best;
	}
	function positionNearModelButton() {
		const root = ensureRoot();
		if (pinned) return;
		const btn = findModelButton();
		if (!btn) {
			root.style.left = "12px";
			root.style.top = "10px";
			root.style.right = "auto";
			root.style.bottom = "auto";
			root.classList.add("fallback");
			return;
		}
		const r = btn.getBoundingClientRect();
		const x = Math.round(r.left + r.width + 10);
		const y = Math.round(r.top + (r.height - 28) / 2);
		root.style.left = `${clamp(x, 6, window.innerWidth - 360)}px`;
		root.style.top = `${clamp(y, 6, window.innerHeight - 60)}px`;
		root.style.right = "auto";
		root.style.bottom = "auto";
		root.classList.remove("fallback");
	}
	function startFollowPositionLoop() {
		stopFollowPositionLoop();
		const tick = () => {
			const open = ensureRoot().classList.contains("open");
			positionNearModelButton();
			followTimer = setTimeout(tick, open ? POS_FOLLOW_WHEN_OPEN_MS : POS_FOLLOW_MS);
		};
		tick();
	}
	function stopFollowPositionLoop() {
		if (followTimer) clearTimeout(followTimer);
		followTimer = null;
	}
	function estimateTokens() {
		let text = "";
		getMessageNodes().forEach((m) => {
			text += m.innerText || "";
		});
		return Math.round(text.length / 4);
	}
	function exportChatMarkdown() {
		let md = "# ChatGPT Chat Log\n\n";
		getMessageNodes().forEach((m) => {
			const chunk = (m.innerText || "").trim();
			if (chunk) md += chunk + "\n\n---\n\n";
		});
		const blob = new Blob(["﻿" + md], { type: "text/markdown;charset=utf-8" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = "chatgpt-chat.md";
		a.click();
	}
	var folded = false;
	function toggleCode() {
		document.querySelectorAll("pre").forEach((p) => p.style.display = folded ? "" : "none");
		folded = !folded;
	}
	function toggleLang() {
		lang = lang === "zh" ? "en" : "zh";
		localStorage.setItem(LANG_KEY, lang);
		updateUI();
		renderFeaturePack(true);
	}
	function injectStyles() {
		if (document.getElementById(STYLE_ID)) return;
		const style = document.createElement("style");
		style.id = STYLE_ID;
		style.textContent = `
      #${ROOT_ID}{position:fixed;z-index:2147483647;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Apple Color Emoji","Segoe UI Emoji";user-select:none;-webkit-user-select:none;transform:translateZ(0);opacity:1;transition:opacity 160ms ease;}
      #${ROOT_ID}.dim{opacity:0.2} #${ROOT_ID}.fallback{filter:saturate(1.02)}
      #${BTN_ID}{display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 10px;border-radius:999px;border:1px solid rgba(0,0,0,0.12);background:rgba(255,255,255,0.78);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 6px 18px rgba(0,0,0,0.10);cursor:pointer;font-size:12px;color:rgba(0,0,0,0.78)}
      #${BTN_ID}:hover{background:rgba(255,255,255,0.92)} #${ROOT_ID}.minimal #cgpt-vs-miniText{display:none}
      #cgpt-vs-miniText{max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0.9}
      #${DOT_ID}{width:9px;height:9px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,0.16);transition:transform 140ms ease}
      #${DOT_ID}.warn{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,0.16)} #${DOT_ID}.bad{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,0.16)} #${DOT_ID}.off{background:rgba(0,0,0,0.28);box-shadow:0 0 0 3px rgba(0,0,0,0.08)}
      #${PANEL_ID}{margin-top:8px;width:360px;max-width:min(420px, calc(100vw - 16px));padding:12px;border-radius:16px;border:1px solid rgba(0,0,0,0.12);background:rgba(255,255,255,0.86);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 14px 40px rgba(0,0,0,0.16);display:none;color:rgba(0,0,0,0.86);font-size:12px;line-height:1.5}
      #${ROOT_ID}.open #${PANEL_ID}{display:block} .cgpt-vs-toprow{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
      .cgpt-vs-seg{display:flex;align-items:center;width:100%;padding:3px;border-radius:999px;background:rgba(0,0,0,0.06);border:1px solid rgba(0,0,0,0.08);box-shadow:inset 0 1px 0 rgba(255,255,255,0.7)}
      .cgpt-vs-seg button{flex:1;height:28px;border:0;background:transparent;border-radius:999px;cursor:pointer;font-size:12px;color:rgba(0,0,0,0.62);transition:background 140ms ease, box-shadow 140ms ease, color 140ms ease}
      .cgpt-vs-seg button.active{background:rgba(255,255,255,0.92);color:rgba(0,0,0,0.86);box-shadow:0 8px 18px rgba(0,0,0,0.10)}
      .cgpt-vs-controls{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;flex-wrap:wrap} .cgpt-vs-chiprow{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .cgpt-vs-chip{height:28px;padding:0 10px;border-radius:999px;border:1px solid rgba(0,0,0,0.12);background:rgba(255,255,255,0.88);cursor:pointer;font-size:12px;color:rgba(0,0,0,0.78);box-shadow:0 6px 14px rgba(0,0,0,0.08)}
      .cgpt-vs-chip:hover{background:rgba(255,255,255,0.96)} .cgpt-vs-chip.primary{border-color:rgba(0,0,0,0.14);font-weight:600}
      .cgpt-vs-row{display:flex;justify-content:space-between;gap:12px;padding:4px 0} .cgpt-vs-k{color:rgba(0,0,0,0.56)} .cgpt-vs-v{font-variant-numeric:tabular-nums}
      .mem-ok{color:#16a34a;font-weight:600} .mem-warn{color:#d97706;font-weight:600} .mem-bad{color:#dc2626;font-weight:700}
      .cgpt-vs-hr{height:1px;background:rgba(0,0,0,0.08);margin:10px 0 8px} .cgpt-vs-tip{color:rgba(0,0,0,0.74)}
      .cgpt-vs-about{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:8px 2px 2px;flex-wrap:wrap} .cgpt-vs-aboutLeft{min-width:0} .cgpt-vs-aboutTitle{font-weight:800;letter-spacing:0.1px} .cgpt-vs-aboutSub{margin-top:3px;color:rgba(0,0,0,0.62);font-size:11px} .cgpt-vs-aboutLinks{margin-top:6px;display:flex;gap:10px;flex-wrap:wrap;align-items:center} .cgpt-vs-link{color:rgba(37,99,235,0.95);text-decoration:none;font-weight:600;font-size:12px} .cgpt-vs-link:hover{text-decoration:underline} .cgpt-vs-supportHint{margin-top:6px;color:rgba(0,0,0,0.66);font-size:11px}
      #${FP_ID}{margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;width:100%} #${FP_ID} .fp-left{display:flex;gap:6px;flex-wrap:wrap;align-items:center} #${FP_ID} .fp-right{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;align-items:center} #${FP_ID} .fp-token{font-size:12px;color:rgba(0,0,0,0.66);padding:0 2px}
      #${HELP_ID}{position:fixed;inset:0;background:rgba(0,0,0,0.30);display:none;align-items:center;justify-content:center;z-index:2147483647} #${HELP_ID}.show{display:flex}
      .cgpt-vs-helpCard{width:min(720px, calc(100vw - 20px));max-height:min(78vh, 680px);overflow:auto;padding:16px 16px;border-radius:18px;border:1px solid rgba(0,0,0,0.14);background:rgba(255,255,255,0.92);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 18px 60px rgba(0,0,0,0.24);color:rgba(0,0,0,0.86);line-height:1.55}
      .cgpt-vs-helpTitle{font-size:14px;font-weight:800;margin-bottom:8px} .cgpt-vs-helpClose{position:sticky;top:0;float:right;height:30px;padding:0 12px;border-radius:999px;border:1px solid rgba(0,0,0,0.14);background:rgba(255,255,255,0.94);cursor:pointer}
      #${ROOT_ID}.pinned #${BTN_ID}{cursor:grab} #${ROOT_ID}.pinned.dragging #${BTN_ID}{cursor:grabbing;box-shadow:0 18px 44px rgba(0,0,0,0.24)} #${ROOT_ID}.pinned.hiddenLeft{transform:translateX(-62%)} #${ROOT_ID}.pinned.hiddenRight{transform:translateX(62%)} #${ROOT_ID}.pinned.hiddenLeft:hover, #${ROOT_ID}.pinned.hiddenRight:hover{transform:translateX(0)} #${ROOT_ID}.open.hiddenLeft, #${ROOT_ID}.open.hiddenRight{transform:translateX(0)}
    `;
		document.documentElement.appendChild(style);
	}
	function ensureRoot() {
		injectStyles();
		let root = document.getElementById(ROOT_ID);
		if (root) return root;
		root = document.createElement("div");
		root.id = ROOT_ID;
		root.innerHTML = `
      <div id="${BTN_ID}" role="button" tabindex="0" aria-label="ChatGPT Virtual Scroll Engine">
        <span id="${DOT_ID}"></span>
        <span id="cgpt-vs-miniText">${t("health")}</span>
      </div>

      <div id="${PANEL_ID}">
        <div class="cgpt-vs-toprow">
          <div style="flex:1">
            <div class="cgpt-vs-seg" aria-label="virtualization mode">
              <button type="button" data-mode="performance">${lang === "zh" ? "Rendimiento 1" : "Performance"}</button>
              <button type="button" data-mode="balanced">${lang === "zh" ? "Equilibrado2" : "Balanced"}</button>
              <button type="button" data-mode="conservative">${lang === "zh" ? "Conservador 3" : "Conservative"}</button>
            </div>
          </div>
        </div>
        <div class="cgpt-vs-controls">
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <button class="cgpt-vs-chip primary" id="cgpt-vs-toggle">--</button>
            <button class="cgpt-vs-chip" id="cgpt-vs-minimal">--</button>
          </div>
          <div class="cgpt-vs-chiprow"><button class="cgpt-vs-chip" id="cgpt-vs-pin">📌</button><button class="cgpt-vs-chip" id="cgpt-vs-helpBtn">?</button></div>
        </div>
        <div class="cgpt-vs-hr"></div>
        <div class="cgpt-vs-row"><span class="cgpt-vs-k">${lang === "zh" ? "Modo actual" : "Mode"}</span><span class="cgpt-vs-v" data-k="mode">--</span></div>
        <div class="cgpt-vs-row"><span class="cgpt-vs-k">DOM</span><span class="cgpt-vs-v" data-k="dom">--</span></div>
        <div class="cgpt-vs-row"><span class="cgpt-vs-k">${lang === "zh" ? "Memoria (heap JS)" : "Memory (JS Heap)"}</span><span class="cgpt-vs-v" data-k="mem">--</span></div>
        <div class="cgpt-vs-row"><span class="cgpt-vs-k">${lang === "zh" ? "Virtualización" : "Virtualization"}</span><span class="cgpt-vs-v" data-k="virt">--</span></div>
        <div class="cgpt-vs-row"><span class="cgpt-vs-k">${lang === "zh" ? "Turnos del chat" : "Turns"}</span><span class="cgpt-vs-v" data-k="turns">--</span></div>
        <div class="cgpt-vs-row"><span class="cgpt-vs-k">${lang === "zh" ? "Restante estimado" : "Estimated remaining"}</span><span class="cgpt-vs-v" data-k="remain">--</span></div>
        <div class="cgpt-vs-hr"></div>
        <div class="cgpt-vs-controls" style="margin-top:8px;"><button class="cgpt-vs-chip" id="cgpt-vs-forceClean" title="${t("optimizeTip")}">${t("optimize")}</button><button class="cgpt-vs-chip" id="cgpt-vs-newChat">${t("newChat")}</button></div>
        <div class="cgpt-vs-hr"></div><div class="cgpt-vs-tip" data-k="tip">--</div><div class="cgpt-vs-hr"></div><div id="${FP_ID}"></div>
      </div>
    `;
		const help = document.createElement("div");
		help.id = HELP_ID;
		help.innerHTML = `
      <div class="cgpt-vs-helpCard" role="dialog" aria-label="Help">
        <button class="cgpt-vs-helpClose" id="cgpt-vs-helpClose">${lang === "zh" ? "Cerrar" : "Close"}</button>
        <div class="cgpt-vs-helpTitle">${lang === "zh" ? "Panel acelerador para conversaciones largas (guía simple)" : "Long Chat Accelerator (Quick Guide)"}</div>
        <div style="margin:8px 0 10px;"><b>${lang === "zh" ? "¿Qué significa el punto verde/amarillo/rojo?" : "What is the green/yellow/red dot?"}</b><br/>${lang === "zh" ? "Es el indicador de salud de la página: verde = buen estado; amarillo = carga alta; rojo = cerca de la zona de lentitud." : "It indicates page health: green=good, yellow=high load, red=near lag."}</div>
        <div style="margin:10px 0;"><b>${lang === "zh" ? "¿Cómo elegir los tres modos?" : "How to choose modes?"}</b><br/>${lang === "zh" ? "Rendimiento = menor consumo y máxima optimización, útil para conversaciones antiguas; Equilibrado = recomendado para uso diario; Conservador = conserva más historial pero consume más recursos, útil en conversaciones nuevas." : "Performance=lowest resource; Balanced=recommended; Conservative=keeps more history but uses more resources."}</div>
        <div style="margin:10px 0;"><b>${lang === "zh" ? "¿Cuál es la diferencia entre pausar y activar?" : "Pause vs Enable?"}</b><br/>${lang === "zh" ? "Activado pliega el historial fuera de pantalla en marcadores para reducir carga; pausado muestra todo el contenido, pero puede volverse más lento." : "Enable folds off-screen history to reduce load; Pause shows full history but may lag."}</div>
        <div style="margin:10px 0;"><b>${lang === "zh" ? "¿“Optimizar ahora” borra contenido?" : "Does “Optimize Now” delete content?"}</b><br/>${lang === "zh" ? "No. Solo pliega el historial más lejano para aligerar la página; al desplazarte hacia esa zona se restaura automáticamente." : "No. It only folds far history to reduce load; scrolling there restores it automatically."}</div>
        <div style="margin:10px 0;"><b>${lang === "zh" ? "¿Por qué Ctrl+F puede ponerse más lento?" : "Why Find (Ctrl+F) can be slower?"}</b><br/>${lang === "zh" ? "Para que puedas buscar en todo el historial, el script restaura temporalmente el contenido completo; al presionar Esc se reactiva la optimización." : "To let you search all history, the script temporarily restores full content; press Esc to resume acceleration."}</div>
        <div style="margin:10px 0;"><b>${lang === "zh" ? "Privacidad y declaración" : "Privacy"}</b><br/>${lang === "zh" ? "Este script no sube el contenido de tus conversaciones. Toda la lógica se ejecuta localmente en el navegador." : "This script does not upload your chat. Everything runs locally in your browser."}</div>
      </div>
    `;
		document.body.appendChild(root);
		document.body.appendChild(help);
		root.classList.toggle("minimal", minimalMode);
		root.classList.toggle("open", !!wasOpen);
		bindUI(root, help);
		applyPinnedState();
		return root;
	}
	function renderFeaturePack(forceRebuild) {
		const root = document.getElementById(ROOT_ID);
		if (!root) return;
		const slot = root.querySelector("#cgpt-vs-featurepack");
		if (!slot) return;
		if (!forceRebuild && slot.childElementCount) return;
		slot.innerHTML = "";
		const left = document.createElement("div");
		left.className = "fp-left";
		const right = document.createElement("div");
		right.className = "fp-right";
		const mkBtn = (label, fn, title) => {
			const b = document.createElement("button");
			b.className = "cgpt-vs-chip";
			b.textContent = label;
			if (title) b.title = title;
			b.addEventListener("click", fn);
			return b;
		};
		const exportBtn = mkBtn(t("export"), exportChatMarkdown);
		const foldBtn = mkBtn(t("fold"), toggleCode);
		const token = document.createElement("span");
		token.className = "fp-token";
		const langBtn = mkBtn(t("lang"), toggleLang);
		left.append(exportBtn, foldBtn);
		right.append(token, langBtn);
		slot.append(left, right);
		const tick = () => {
			if (!document.body.contains(token)) return;
			token.textContent = `${t("token")}: ${estimateTokens()}`;
			setTimeout(tick, 1500);
		};
		tick();
	}
	function bindUI(root, help) {
		const btn = root.querySelector("#cgpt-vs-btn");
		const panel = root.querySelector("#cgpt-vs-panel");
		const toggleBtn = root.querySelector("#cgpt-vs-toggle");
		const minimalBtn = root.querySelector("#cgpt-vs-minimal");
		const pinBtn = root.querySelector("#cgpt-vs-pin");
		const helpBtn = root.querySelector("#cgpt-vs-helpBtn");
		const helpClose = help.querySelector("#cgpt-vs-helpClose");
		const forceCleanBtn = root.querySelector("#cgpt-vs-forceClean");
		const newChatBtn = root.querySelector("#cgpt-vs-newChat");
		function setOpen(open) {
			root.classList.toggle("open", open);
			saveBool(KEY_LAST_OPEN, open);
			startFollowPositionLoop();
		}
		btn.addEventListener("click", () => {
			if (root.classList.contains("dragging")) return;
			setOpen(!root.classList.contains("open"));
		});
		btn.addEventListener("mouseenter", () => {
			if (!pinned && minimalMode) setOpen(true);
		});
		root.addEventListener("mouseleave", () => {
			if (!pinned && minimalMode) setOpen(false);
		});
		btn.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				setOpen(!root.classList.contains("open"));
			}
		});
		document.addEventListener("click", (e) => {
			if (!root.classList.contains("open")) return;
			if (root.contains(e.target)) return;
			setOpen(false);
		}, true);
		panel.querySelectorAll(".cgpt-vs-seg button").forEach((b) => {
			b.addEventListener("click", () => {
				const mode = b.getAttribute("data-mode");
				if (mode !== "performance" && mode !== "balanced" && mode !== "conservative") return;
				saveMode(mode);
				refreshSegUI(root);
				scheduleVirtualize();
				updateUI();
			});
		});
		toggleBtn.addEventListener("click", () => {
			virtualizationEnabled = !virtualizationEnabled;
			saveBool(KEY_ENABLED, virtualizationEnabled);
			if (!virtualizationEnabled) unvirtualizeAll();
			else scheduleVirtualize();
			updateUI();
		});
		minimalBtn.addEventListener("click", () => {
			minimalMode = !minimalMode;
			saveBool(KEY_MINIMAL, minimalMode);
			root.classList.toggle("minimal", minimalMode);
			updateUI();
		});
		helpBtn.addEventListener("click", () => help.classList.add("show"));
		helpClose.addEventListener("click", () => help.classList.remove("show"));
		help.addEventListener("click", (e) => {
			if (e.target === help) help.classList.remove("show");
		});
		pinBtn.addEventListener("click", () => {
			pinned = !pinned;
			saveBool(KEY_PINNED, pinned);
			applyPinnedState();
			updateUI();
		});
		forceCleanBtn.addEventListener("click", () => {
			if (!virtualizationEnabled) {
				virtualizationEnabled = true;
				saveBool(KEY_ENABLED, true);
			}
			scheduleVirtualize(FORCE_CLEAN_MARGIN_SCREENS);
			flashDot();
		});
		newChatBtn.addEventListener("click", () => {
			if (!tryClickNewChat()) window.open(location.origin + "/", "_blank", "noopener,noreferrer");
		});
		installDrag(root);
		refreshSegUI(root);
		renderFeaturePack(true);
	}
	function refreshSegUI(root) {
		const panel = root.querySelector("#cgpt-vs-panel");
		if (!panel) return;
		panel.querySelectorAll(".cgpt-vs-seg button").forEach((b) => {
			b.classList.toggle("active", b.getAttribute("data-mode") === currentMode);
		});
	}
	function applyPinnedState() {
		const root = ensureRoot();
		root.classList.toggle("pinned", pinned);
		if (pinned) {
			stopFollowPositionLoop();
			root.style.left = `${clamp(pinnedPos.x, 0, window.innerWidth - 60)}px`;
			root.style.top = `${clamp(pinnedPos.y, 0, window.innerHeight - 60)}px`;
			root.style.right = "auto";
			root.style.bottom = "auto";
			updatePinnedHiddenClass();
		} else {
			root.classList.remove("hiddenLeft", "hiddenRight");
			startFollowPositionLoop();
			positionNearModelButton();
		}
	}
	function updatePinnedHiddenClass() {
		const root = ensureRoot();
		root.classList.remove("hiddenLeft", "hiddenRight");
		if (!pinned) return;
		if (!edgeSnap) return;
		if (root.classList.contains("open")) return;
		if (pinnedPos.hidden) if (pinnedPos.side === "right") root.classList.add("hiddenRight");
		else root.classList.add("hiddenLeft");
	}
	function snapToEdgeIfNeeded() {
		if (!pinned || !edgeSnap) return;
		const rect = ensureRoot().getBoundingClientRect();
		if (rect.left <= window.innerWidth - rect.right) {
			pinnedPos.x = 8;
			pinnedPos.side = "left";
		} else {
			pinnedPos.x = Math.max(8, window.innerWidth - rect.width - 8);
			pinnedPos.side = "right";
		}
		pinnedPos.hidden = true;
		savePos();
		applyPinnedState();
	}
	function installDrag(root) {
		let dragging = false;
		let startX = 0;
		let startY = 0;
		let originX = 0;
		let originY = 0;
		const btn = root.querySelector("#cgpt-vs-btn");
		if (!btn) return;
		btn.addEventListener("pointerdown", (e) => {
			if (!pinned) return;
			if (e.button !== 0) return;
			dragging = true;
			root.classList.add("dragging");
			btn.setPointerCapture(e.pointerId);
			startX = e.clientX;
			startY = e.clientY;
			const rect = root.getBoundingClientRect();
			originX = rect.left;
			originY = rect.top;
			pinnedPos.hidden = false;
			updatePinnedHiddenClass();
			e.preventDefault();
			e.stopPropagation();
		});
		btn.addEventListener("pointermove", (e) => {
			if (!dragging) return;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			const nx = clamp(originX + dx, 0, window.innerWidth - 40);
			const ny = clamp(originY + dy, 0, window.innerHeight - 40);
			pinnedPos.x = nx;
			pinnedPos.y = ny;
			savePos();
			root.style.left = `${nx}px`;
			root.style.top = `${ny}px`;
		});
		btn.addEventListener("pointerup", (e) => {
			if (!dragging) return;
			dragging = false;
			root.classList.remove("dragging");
			snapToEdgeIfNeeded();
			updatePinnedHiddenClass();
			e.preventDefault();
			e.stopPropagation();
		});
		btn.addEventListener("pointercancel", () => {
			dragging = false;
			root.classList.remove("dragging");
			updatePinnedHiddenClass();
		});
	}
	function flashDot() {
		const dot = document.getElementById(DOT_ID);
		if (!dot) return;
		dot.style.transform = "scale(1.14)";
		setTimeout(() => {
			dot.style.transform = "scale(1)";
		}, 140);
	}
	function tryClickNewChat() {
		const candidates = document.querySelectorAll("a, button, [role=\"button\"]");
		for (const el of candidates) {
			const tx = (el.innerText || el.textContent || "").trim();
			if (!tx) continue;
			if (tx === "Nuevo chat" || tx === "New chat" || tx.includes("Nueva conversación") || tx.includes("New chat") || tx.includes("Nueva charla")) try {
				el.click();
				return true;
			} catch {}
		}
		return false;
	}
	function updateUI() {
		const root = ensureRoot();
		const domNodes = document.getElementsByTagName("*").length;
		const usedMB = getUsedHeapMB();
		const memInfo = memoryLevel(usedMB);
		const domInfo = domLevel(domNodes);
		const turns = lastTurnsCount || getMessageNodes().length || 0;
		const virt = virtualizationEnabled ? lastVirtualizedCount || 0 : 0;
		const remainTurns = estimateRemainingTurns(usedMB, turns);
		const remainText = remainTurns == null ? lang === "zh" ? "No se puede estimar" : "N/A" : lang === "zh" ? `${remainTurns} turnos aprox.` : `~${remainTurns} turns`;
		const virtText = !virtualizationEnabled ? lang === "zh" ? "Pausado (vista completa)" : "Paused (full visible)" : ctrlFFreeze ? lang === "zh" ? "Pausado (búsqueda Ctrl+F activa)" : "Paused (Find active)" : virt > 0 ? lang === "zh" ? `Activado (${virt} elementos virtualizados)` : `On (${virt} virtualized)` : lang === "zh" ? "Activado (no hace falta virtualizar ahora)" : "On (no need now)";
		const worst = !virtualizationEnabled ? "off" : memInfo.level === "bad" || domInfo.level === "bad" ? "bad" : memInfo.level === "warn" || domInfo.level === "warn" ? "warn" : "ok";
		const dot = root.querySelector("#cgpt-vs-dot");
		if (dot) {
			dot.classList.remove("warn", "bad", "off");
			if (worst === "warn") dot.classList.add("warn");
			if (worst === "bad") dot.classList.add("bad");
			if (worst === "off") dot.classList.add("off");
		}
		const mini = root.querySelector("#cgpt-vs-miniText");
		if (mini) {
			const status = worst === "bad" ? lang === "zh" ? "Riesgo" : "Risk" : worst === "warn" ? lang === "zh" ? "Atención" : "Caution" : worst === "off" ? lang === "zh" ? "Pausar" : "Paused" : lang === "zh" ? "Saludable" : "Healthy";
			mini.textContent = `${modeLabel(currentMode)} · ${status}`;
		}
		const setText = (k, v) => {
			const el = root.querySelector(`[data-k="${k}"]`);
			if (el) el.textContent = v;
		};
		setText("mode", `${modeLabel(currentMode)} (×${getMarginScreens()} pantallas)`);
		setText("dom", domInfo.label);
		const memEl = root.querySelector("[data-k=\"mem\"]");
		if (memEl) {
			memEl.textContent = memInfo.label;
			memEl.classList.remove("mem-ok", "mem-warn", "mem-bad");
			if (memInfo.level === "ok") memEl.classList.add("mem-ok");
			if (memInfo.level === "warn") memEl.classList.add("mem-warn");
			if (memInfo.level === "bad") memEl.classList.add("mem-bad");
		}
		setText("virt", virtText);
		setText("turns", `${turns}`);
		setText("remain", remainText);
		setText("tip", suggestionText(domNodes, usedMB, virt, turns));
		const toggleBtn = root.querySelector("#cgpt-vs-toggle");
		if (toggleBtn) toggleBtn.textContent = virtualizationEnabled ? lang === "zh" ? "Pausar" : "Pause" : lang === "zh" ? "Activar" : "Enable";
		const minimalBtn = root.querySelector("#cgpt-vs-minimal");
		if (minimalBtn) minimalBtn.textContent = minimalMode ? lang === "zh" ? "Mostrar datos" : "Show stats" : lang === "zh" ? "Modo minimalista" : "Minimal";
		const pinBtn = root.querySelector("#cgpt-vs-pin");
		if (pinBtn) pinBtn.textContent = pinned ? lang === "zh" ? "📌Anclado" : "📌Pinned" : lang === "zh" ? "📌Anclar" : "📌Pin";
		const optimizeBtn = root.querySelector("#cgpt-vs-forceClean");
		if (optimizeBtn) {
			optimizeBtn.textContent = t("optimize");
			optimizeBtn.title = t("optimizeTip");
		}
		const newBtn = root.querySelector("#cgpt-vs-newChat");
		if (newBtn) newBtn.textContent = t("newChat");
		updatePinnedHiddenClass();
	}
	function startRouteGuards() {
		setInterval(() => {
			const root = document.getElementById(ROOT_ID);
			if (!root || !document.body.contains(root)) try {
				ensureRoot();
				applyPinnedState();
				updateUI();
				scheduleVirtualize();
				startFollowPositionLoop();
			} catch {}
			else {
				if (!pinned) positionNearModelButton();
				renderFeaturePack(false);
			}
		}, ROUTE_GUARD_MS);
	}
	function boot() {
		ensureRoot();
		applyPinnedState();
		startFollowPositionLoop();
		installFindGuards();
		installTypingDim();
		installImageLoadHook();
		installResizeFix();
		startRouteGuards();
		window.addEventListener("scroll", () => scheduleVirtualize(), { passive: true });
		scheduleVirtualize();
		updateUI();
		setInterval(() => updateUI(), CHECK_INTERVAL_MS);
	}
	setTimeout(boot, 900);
})();
