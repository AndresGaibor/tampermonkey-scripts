// ==UserScript==
// @name            Better ChatGPT Assistant (asistente multifunción mejorado para ChatGPT web)
// @namespace       https://github.com/3150214587/chatgpt-virtual-scrollGPT-
// @version         8.2.3.15
// @author          3150214587
// @description     Better ChatGPT Assistant con Virtual Scroll Engine 6.0: chats largos ultra fluidos, exportación, monitor de tokens, i18n y más.
// @description:es  Asistente multifunción estable para ChatGPT: virtualización de conversaciones largas + indicador superior minimalista (verde/amarillo/rojo) + panel con 3 modos / pausa / optimización forzada / nueva conversación / ayuda + atenuación al escribir + Ctrl+F + resize + exportación Markdown (UTF-8 BOM) + plegado de código + estimación de tokens + cambio ES/EN
// @license         MIT
// @icon            https://www.google.com/s2/favicons?sz=64&domain=chatgpt.com
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
	var state = {
		lang: "zh",
		currentMode: "balanced",
		virtualizationEnabled: true,
		minimalMode: true,
		edgeSnap: true,
		pinned: false,
		wasOpen: false,
		ctrlFFreeze: false,
		lastVirtualizedCount: 0,
		lastTurnsCount: 0,
		folded: false,
		pinnedPos: {
			x: 18,
			y: 64,
			side: "left",
			hidden: false
		}
	};
	var CHECK_INTERVAL_MS = 1100;
	var MODE_TO_MARGIN_SCREENS = {
		performance: 1,
		balanced: 2,
		conservative: 3
	};
	var FORCE_CLEAN_MARGIN_SCREENS = .4;
	var LANG_KEY = "vs_lang";
	var KEY_MODE = "cgpt_vs_mode";
	var KEY_ENABLED = "cgpt_vs_enabled";
	var KEY_PINNED = "cgpt_vs_pinned";
	var KEY_POS = "cgpt_vs_pos";
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
	function clamp(value, min, max) {
		return Math.max(min, Math.min(max, value));
	}
	function loadBool(storage, key, def) {
		const v = storage.getItem(key);
		if (v === null || v === void 0) return def;
		return v === "1";
	}
	function saveBool(storage, key, val) {
		storage.setItem(key, val ? "1" : "0");
	}
	function loadMode(storage) {
		const v = storage.getItem(KEY_MODE);
		return v === "performance" || v === "balanced" || v === "conservative" ? v : "balanced";
	}
	function saveMode(storage, mode) {
		storage.setItem(KEY_MODE, mode);
	}
	function loadPos(storage, viewportWidth, viewportHeight) {
		try {
			const raw = storage.getItem(KEY_POS);
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
	function savePos(storage, pos) {
		storage.setItem(KEY_POS, JSON.stringify(pos));
	}
	function injectStyles() {
		if (document.getElementById("cgpt-vs-style")) return;
		const style = document.createElement("style");
		style.id = STYLE_ID;
		style.textContent = `
    #cgpt-vs-root{position:fixed;z-index:2147483647;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Apple Color Emoji","Segoe UI Emoji";user-select:none;-webkit-user-select:none;transform:translateZ(0);opacity:1;transition:opacity 160ms ease;}
    #cgpt-vs-root.dim{opacity:0.2} #cgpt-vs-root.fallback{filter:saturate(1.02)}
    #cgpt-vs-btn{display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 10px;border-radius:999px;border:1px solid rgba(0,0,0,0.12);background:rgba(255,255,255,0.78);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 6px 18px rgba(0,0,0,0.10);cursor:pointer;font-size:12px;color:rgba(0,0,0,0.78)}
    #cgpt-vs-btn:hover{background:rgba(255,255,255,0.92)} #cgpt-vs-root.minimal #cgpt-vs-miniText{display:none}
    #cgpt-vs-miniText{max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0.9}
    #cgpt-vs-dot{width:9px;height:9px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,0.16);transition:transform 140ms ease}
    #cgpt-vs-dot.warn{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,0.16)} #cgpt-vs-dot.bad{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,0.16)} #cgpt-vs-dot.off{background:rgba(0,0,0,0.28);box-shadow:0 0 0 3px rgba(0,0,0,0.08)}
    #cgpt-vs-panel{margin-top:8px;width:360px;max-width:min(420px, calc(100vw - 16px));padding:12px;border-radius:16px;border:1px solid rgba(0,0,0,0.12);background:rgba(255,255,255,0.86);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 14px 40px rgba(0,0,0,0.16);display:none;color:rgba(0,0,0,0.86);font-size:12px;line-height:1.5}
    #cgpt-vs-root.open #cgpt-vs-panel{display:block} .cgpt-vs-toprow{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
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
    #cgpt-vs-featurepack{margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;width:100%} #cgpt-vs-featurepack .fp-left{display:flex;gap:6px;flex-wrap:wrap;align-items:center} #cgpt-vs-featurepack .fp-right{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;align-items:center} #cgpt-vs-featurepack .fp-token{font-size:12px;color:rgba(0,0,0,0.66);padding:0 2px}
    #cgpt-vs-help{position:fixed;inset:0;background:rgba(0,0,0,0.30);display:none;align-items:center;justify-content:center;z-index:2147483647} #cgpt-vs-help.show{display:flex}
    .cgpt-vs-helpCard{width:min(720px, calc(100vw - 20px));max-height:min(78vh, 680px);overflow:auto;padding:16px 16px;border-radius:18px;border:1px solid rgba(0,0,0,0.14);background:rgba(255,255,255,0.92);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 18px 60px rgba(0,0,0,0.24);color:rgba(0,0,0,0.86);line-height:1.55}
    .cgpt-vs-helpTitle{font-size:14px;font-weight:800;margin-bottom:8px} .cgpt-vs-helpClose{position:sticky;top:0;float:right;height:30px;padding:0 12px;border-radius:999px;border:1px solid rgba(0,0,0,0.14);background:rgba(255,255,255,0.94);cursor:pointer}
    #cgpt-vs-root.pinned #cgpt-vs-btn{cursor:grab} #cgpt-vs-root.pinned.dragging #cgpt-vs-btn{cursor:grabbing;box-shadow:0 18px 44px rgba(0,0,0,0.24)} #cgpt-vs-root.pinned.hiddenLeft{transform:translateX(-62%)} #cgpt-vs-root.pinned.hiddenRight{transform:translateX(62%)} #cgpt-vs-root.pinned.hiddenLeft:hover, #cgpt-vs-root.pinned.hiddenRight:hover{transform:translateX(0)} #cgpt-vs-root.open.hiddenLeft, #cgpt-vs-root.open.hiddenRight{transform:translateX(0)}
  `;
		document.documentElement.appendChild(style);
	}
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
	function setLanguage(lang) {
		localStorage.setItem(LANG_KEY, lang);
	}
	function t(lang, key) {
		return I18N[lang] && I18N[lang][key] ? I18N[lang][key] : key;
	}
	function toggleLanguage(current) {
		return current === "zh" ? "en" : "zh";
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
      <span id="cgpt-vs-miniText">${t(state.lang, "health")}</span>
    </div>

    <div id="${PANEL_ID}">
      <div class="cgpt-vs-toprow">
        <div style="flex:1">
          <div class="cgpt-vs-seg" aria-label="virtualization mode">
            <button type="button" data-mode="performance">${state.lang === "zh" ? "Rendimiento 1" : "Performance"}</button>
            <button type="button" data-mode="balanced">${state.lang === "zh" ? "Equilibrado2" : "Balanced"}</button>
            <button type="button" data-mode="conservative">${state.lang === "zh" ? "Conservador 3" : "Conservative"}</button>
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
      <div class="cgpt-vs-row"><span class="cgpt-vs-k">${state.lang === "zh" ? "Modo actual" : "Mode"}</span><span class="cgpt-vs-v" data-k="mode">--</span></div>
      <div class="cgpt-vs-row"><span class="cgpt-vs-k">DOM</span><span class="cgpt-vs-v" data-k="dom">--</span></div>
      <div class="cgpt-vs-row"><span class="cgpt-vs-k">${state.lang === "zh" ? "Memoria (heap JS)" : "Memory (JS Heap)"}</span><span class="cgpt-vs-v" data-k="mem">--</span></div>
      <div class="cgpt-vs-row"><span class="cgpt-vs-k">${state.lang === "zh" ? "Virtualización" : "Virtualization"}</span><span class="cgpt-vs-v" data-k="virt">--</span></div>
      <div class="cgpt-vs-row"><span class="cgpt-vs-k">${state.lang === "zh" ? "Turnos del chat" : "Turns"}</span><span class="cgpt-vs-v" data-k="turns">--</span></div>
      <div class="cgpt-vs-row"><span class="cgpt-vs-k">${state.lang === "zh" ? "Restante estimado" : "Estimated remaining"}</span><span class="cgpt-vs-v" data-k="remain">--</span></div>
      <div class="cgpt-vs-hr"></div>
      <div class="cgpt-vs-controls" style="margin-top:8px;"><button class="cgpt-vs-chip" id="cgpt-vs-forceClean" title="${t(state.lang, "optimizeTip")}">${t(state.lang, "optimize")}</button><button class="cgpt-vs-chip" id="cgpt-vs-newChat">${t(state.lang, "newChat")}</button></div>
      <div class="cgpt-vs-hr"></div><div class="cgpt-vs-tip" data-k="tip">--</div><div class="cgpt-vs-hr"></div><div id="${FP_ID}"></div>
    </div>
  `;
		const help = document.createElement("div");
		help.id = HELP_ID;
		help.innerHTML = `
    <div class="cgpt-vs-helpCard" role="dialog" aria-label="Help">
      <button class="cgpt-vs-helpClose" id="cgpt-vs-helpClose">${state.lang === "zh" ? "Cerrar" : "Close"}</button>
      <div class="cgpt-vs-helpTitle">${state.lang === "zh" ? "Panel acelerador para conversaciones largas (guía simple)" : "Long Chat Accelerator (Quick Guide)"}</div>
      <div style="margin:8px 0 10px;"><b>${state.lang === "zh" ? "¿Qué significa el punto verde/amarillo/rojo?" : "What is the green/yellow/red dot?"}</b><br/>${state.lang === "zh" ? "Es el indicador de salud de la página: verde = buen estado; amarillo = carga alta; rojo = cerca de la zona de lentitud." : "It indicates page health: green=good, yellow=high load, red=near lag."}</div>
      <div style="margin:10px 0;"><b>${state.lang === "zh" ? "¿Cómo elegir los tres modos?" : "How to choose modes?"}</b><br/>${state.lang === "zh" ? "Rendimiento = menor consumo y máxima optimización, útil para conversaciones antiguas; Equilibrado = recomendado para uso diario; Conservador = conserva más historial pero consume más recursos, útil en conversaciones nuevas." : "Performance=lowest resource; Balanced=recommended; Conservative=keeps more history but uses more resources."}</div>
      <div style="margin:10px 0;"><b>${state.lang === "zh" ? "¿Cuál es la diferencia entre pausar y activar?" : "Pause vs Enable?"}</b><br/>${state.lang === "zh" ? "Activado pliega el historial fuera de pantalla en marcadores para reducir carga; pausado muestra todo el contenido, pero puede volverse más lento." : "Enable folds off-screen history to reduce load; Pause shows full history but may lag."}</div>
      <div style="margin:10px 0;"><b>${state.lang === "zh" ? "¿\"Optimizar ahora\" borra contenido?" : "Does \"Optimize Now\" delete content?"}</b><br/>${state.lang === "zh" ? "No. Solo pliega el historial más lejano para aligerar la página; al desplazarte hacia esa zona se restaura automáticamente." : "No. It only folds far history to reduce load; scrolling there restores it automatically."}</div>
      <div style="margin:10px 0;"><b>${state.lang === "zh" ? "¿Por qué Ctrl+F puede ponerse más lento?" : "Why Find (Ctrl+F) can be slower?"}</b><br/>${state.lang === "zh" ? "Para que puedas buscar en todo el historial, el script restaura temporalmente el contenido completo; al presionar Esc se reactiva la optimización." : "To let you search all history, the script temporarily restores full content; press Esc to resume acceleration."}</div>
      <div style="margin:10px 0;"><b>${state.lang === "zh" ? "Privacidad y declaración" : "Privacy"}</b><br/>${state.lang === "zh" ? "Este script no sube el contenido de tus conversaciones. Toda la lógica se ejecuta localmente en el navegador." : "This script does not upload your chat. Everything runs locally in your browser."}</div>
    </div>
  `;
		document.body.appendChild(root);
		document.body.appendChild(help);
		root.classList.toggle("minimal", state.minimalMode);
		root.classList.toggle("open", !!state.wasOpen);
		return root;
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
	function estimateTokens(text) {
		return Math.round(text.length / 4);
	}
	function exportChatMarkdown() {
		let md = "# ChatGPT Chat Log\n\n";
		const nodes = getMessageNodes();
		for (const m of nodes) {
			const chunk = (m.innerText || "").trim();
			if (chunk) md += chunk + "\n\n---\n\n";
		}
		const blob = new Blob(["﻿" + md], { type: "text/markdown;charset=utf-8" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = "chatgpt-chat.md";
		a.click();
	}
	function toggleCode() {
		const preElements = document.querySelectorAll("pre");
		const hide = Array.from(preElements).some((p) => p.style.display !== "none");
		for (const p of preElements) p.style.display = hide ? "none" : "";
		return !hide;
	}
	function getUsedHeapMB() {
		const p = window.performance;
		if (!p || !p.memory || !p.memory.usedJSHeapSize) return null;
		return p.memory.usedJSHeapSize / (1024 * 1024);
	}
	function memoryLevel(usedMB, lang) {
		if (usedMB == null) return {
			label: lang === "zh" ? "No disponible" : "N/A",
			level: "na"
		};
		if (usedMB < 220) return {
			label: `${usedMB.toFixed(0)}MB${lang === "zh" ? " (estable y fluido)" : " (OK)"}`,
			level: "ok"
		};
		if (usedMB < 520) return {
			label: `${usedMB.toFixed(0)}MB${lang === "zh" ? " (alto, puede ir lento)" : " (High)"}`,
			level: "warn"
		};
		return {
			label: `${usedMB.toFixed(0)}MB${lang === "zh" ? " (riesgo de bloqueo)" : " (Warn)"}`,
			level: "bad"
		};
	}
	function domLevel(domNodes) {
		if (domNodes < 7e3) return {
			label: `${domNodes}`,
			level: "ok"
		};
		if (domNodes < 15e3) return {
			label: `${domNodes}`,
			level: "warn"
		};
		return {
			label: `${domNodes}`,
			level: "bad"
		};
	}
	function estimateRemainingTurns(usedMB, turns) {
		if (usedMB == null || !turns || turns < 12) return null;
		const avg = usedMB / turns;
		if (!isFinite(avg) || avg <= 0) return null;
		const headroom = 520 - usedMB;
		return Math.max(0, Math.min(9999, Math.floor(headroom / avg)));
	}
	function modeLabel(mode, lang) {
		if (lang === "en") return mode;
		if (mode === "conservative") return "Conservador c";
		if (mode === "balanced") return "Equilibrado b";
		return "Rendimiento a";
	}
	function suggestionText(input) {
		const mem = memoryLevel(input.usedMB, input.lang).level;
		const dom = domLevel(input.domNodes).level;
		if (!input.virtualizationEnabled) return input.lang === "zh" ? "Consejo: la virtualización está pausada. El historial completo queda visible, pero los chats largos pueden ponerse lentos. Actívala cuando necesites fluidez." : "Tip: Virtualization is paused. Full history is visible, but long chats may lag. Enable it for smooth scrolling.";
		if (input.ctrlFFreeze) return input.lang === "zh" ? "Consejo: estás usando la búsqueda del navegador (Ctrl+F). La virtualización se pausó para permitir buscar en todo el historial. Se restaurará automáticamente al salir de la búsqueda." : "Tip: Browser Find (Ctrl+F) is active. Virtualization is paused so you can search all history. It will resume after you exit Find.";
		if (mem === "bad" || dom === "bad") return input.lang === "zh" ? "Consejo: la página entró en zona de lentitud. Pulsa \"Optimizar ahora\" para reducir la carga; exporta o respalda el contenido importante antes de refrescar o abrir una nueva conversación." : "Tip: Near lag zone. Click \"Optimize Now\" to reduce load. Export/backup important content before refreshing or starting a new chat.";
		if (mem === "warn" || dom === "warn") return input.lang === "zh" ? "Consejo: la carga está alta, pero puedes seguir conversando. Evita desplazarte mucho por el historial de una sola vez; para revisar contenido antiguo puedes cambiar temporalmente a \"Conservador\"." : "Tip: Load is higher but still OK. Avoid long scroll sessions. Switch to \"Conservative\" when browsing old history.";
		if (input.virtCount > 0 && input.turns > 220) return input.lang === "zh" ? "Consejo: el estado es bueno. Para buscar contenido antiguo, usa la búsqueda o exporta el chat; evita bajar repetidamente hasta el final." : "Tip: Healthy. Use search or export to view old history, instead of repeatedly scrolling to the bottom.";
		return input.lang === "zh" ? "Consejo: el estado es bueno." : "Tip: Healthy.";
	}
	var followTimer = null;
	function getMarginScreens$1() {
		return MODE_TO_MARGIN_SCREENS[state.currentMode] ?? MODE_TO_MARGIN_SCREENS.balanced;
	}
	function flashDot() {
		const dot = document.getElementById(DOT_ID);
		if (!dot) return;
		dot.style.transform = "scale(1.14)";
		setTimeout(() => {
			dot.style.transform = "scale(1)";
		}, 140);
	}
	function positionNearModelButton() {
		const root = document.getElementById(ROOT_ID);
		if (!root) return;
		if (state.pinned) return;
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
			const root = document.getElementById(ROOT_ID);
			if (!root) return;
			const open = root.classList.contains("open");
			positionNearModelButton();
			followTimer = setTimeout(tick, open ? 250 : 450);
		};
		tick();
	}
	function stopFollowPositionLoop() {
		if (followTimer) clearTimeout(followTimer);
		followTimer = null;
	}
	function updatePinnedHiddenClass() {
		const root = document.getElementById(ROOT_ID);
		if (!root) return;
		root.classList.remove("hiddenLeft", "hiddenRight");
		if (!state.pinned) return;
		if (!state.edgeSnap) return;
		if (root.classList.contains("open")) return;
		if (state.pinnedPos.hidden) if (state.pinnedPos.side === "right") root.classList.add("hiddenRight");
		else root.classList.add("hiddenLeft");
	}
	function applyPinnedState() {
		const root = ensureRoot();
		root.classList.toggle("pinned", state.pinned);
		if (state.pinned) {
			stopFollowPositionLoop();
			root.style.left = `${clamp(state.pinnedPos.x, 0, window.innerWidth - 60)}px`;
			root.style.top = `${clamp(state.pinnedPos.y, 0, window.innerHeight - 60)}px`;
			root.style.right = "auto";
			root.style.bottom = "auto";
			updatePinnedHiddenClass();
		} else {
			root.classList.remove("hiddenLeft", "hiddenRight");
			startFollowPositionLoop();
			positionNearModelButton();
		}
	}
	function snapToEdgeIfNeeded() {
		if (!state.pinned || !state.edgeSnap) return;
		const root = document.getElementById(ROOT_ID);
		if (!root) return;
		const rect = root.getBoundingClientRect();
		if (rect.left <= window.innerWidth - rect.right) {
			state.pinnedPos.x = 8;
			state.pinnedPos.side = "left";
		} else {
			state.pinnedPos.x = Math.max(8, window.innerWidth - rect.width - 8);
			state.pinnedPos.side = "right";
		}
		state.pinnedPos.hidden = true;
		applyPinnedState();
	}
	function refreshSegUI(root) {
		const panel = root.querySelector(`#${PANEL_ID}`);
		if (!panel) return;
		panel.querySelectorAll(".cgpt-vs-seg button").forEach((b) => {
			b.classList.toggle("active", b.getAttribute("data-mode") === state.currentMode);
		});
	}
	function renderFeaturePack(forceRebuild) {
		const root = document.getElementById(ROOT_ID);
		if (!root) return;
		const slot = root.querySelector(`#${FP_ID}`);
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
		const exportBtn = mkBtn(t(state.lang, "export"), exportChatMarkdown);
		const foldFn = () => {
			state.folded = toggleCode();
		};
		const foldBtn = mkBtn(t(state.lang, "fold"), foldFn);
		const token = document.createElement("span");
		token.className = "fp-token";
		const langBtn = mkBtn(t(state.lang, "lang"), () => {
			state.lang = toggleLanguage(state.lang);
			setLanguage(state.lang);
			updateUI();
			renderFeaturePack(true);
		});
		left.append(exportBtn, foldBtn);
		right.append(token, langBtn);
		slot.append(left, right);
		const tick = () => {
			if (!document.body.contains(token)) return;
			const text = getMessageNodes().map((m) => m.innerText || "").join("");
			token.textContent = `${t(state.lang, "token")}: ${estimateTokens(text)}`;
			setTimeout(tick, 1500);
		};
		tick();
	}
	function updateUI() {
		const root = ensureRoot();
		const domNodes = document.getElementsByTagName("*").length;
		const usedMB = getUsedHeapMB();
		const memInfo = memoryLevel(usedMB, state.lang);
		const domInfo = domLevel(domNodes);
		const turns = state.lastTurnsCount || getMessageNodes().length || 0;
		const virt = state.virtualizationEnabled ? state.lastVirtualizedCount || 0 : 0;
		const remainTurns = estimateRemainingTurns(usedMB, turns);
		const remainText = remainTurns == null ? state.lang === "zh" ? "No se puede estimar" : "N/A" : state.lang === "zh" ? `${remainTurns} turnos aprox.` : `~${remainTurns} turns`;
		const virtText = !state.virtualizationEnabled ? state.lang === "zh" ? "Pausado (vista completa)" : "Paused (full visible)" : state.ctrlFFreeze ? state.lang === "zh" ? "Pausado (búsqueda Ctrl+F activa)" : "Paused (Find active)" : virt > 0 ? state.lang === "zh" ? `Activado (${virt} elementos virtualizados)` : `On (${virt} virtualized)` : state.lang === "zh" ? "Activado (no hace falta virtualizar ahora)" : "On (no need now)";
		const worst = !state.virtualizationEnabled ? "off" : memInfo.level === "bad" || domInfo.level === "bad" ? "bad" : memInfo.level === "warn" || domInfo.level === "warn" ? "warn" : "ok";
		const dot = root.querySelector(`#${DOT_ID}`);
		if (dot) {
			dot.classList.remove("warn", "bad", "off");
			if (worst === "warn") dot.classList.add("warn");
			if (worst === "bad") dot.classList.add("bad");
			if (worst === "off") dot.classList.add("off");
		}
		const mini = root.querySelector("#cgpt-vs-miniText");
		if (mini) {
			const status = worst === "bad" ? state.lang === "zh" ? "Riesgo" : "Risk" : worst === "warn" ? state.lang === "zh" ? "Atención" : "Caution" : worst === "off" ? state.lang === "zh" ? "Pausar" : "Paused" : state.lang === "zh" ? "Saludable" : "Healthy";
			mini.textContent = `${modeLabel(state.currentMode, state.lang)} · ${status}`;
		}
		const setText = (k, v) => {
			const el = root.querySelector(`[data-k="${k}"]`);
			if (el) el.textContent = v;
		};
		setText("mode", `${modeLabel(state.currentMode, state.lang)} (×${getMarginScreens$1()} pantallas)`);
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
		setText("tip", suggestionText({
			virtualizationEnabled: state.virtualizationEnabled,
			ctrlFFreeze: state.ctrlFFreeze,
			domNodes,
			usedMB,
			virtCount: virt,
			turns,
			lang: state.lang
		}));
		const toggleBtn = root.querySelector("#cgpt-vs-toggle");
		if (toggleBtn) toggleBtn.textContent = state.virtualizationEnabled ? state.lang === "zh" ? "Pausar" : "Pause" : state.lang === "zh" ? "Activar" : "Enable";
		const minimalBtn = root.querySelector("#cgpt-vs-minimal");
		if (minimalBtn) minimalBtn.textContent = state.minimalMode ? state.lang === "zh" ? "Mostrar datos" : "Show stats" : state.lang === "zh" ? "Modo minimalista" : "Minimal";
		const pinBtn = root.querySelector("#cgpt-vs-pin");
		if (pinBtn) pinBtn.textContent = state.pinned ? state.lang === "zh" ? "📌Anclado" : "📌Pinned" : state.lang === "zh" ? "📌Anclar" : "📌Pin";
		updatePinnedHiddenClass();
	}
	function setLangFromStorage() {
		const stored = localStorage.getItem("vs_lang");
		if (stored === "zh" || stored === "en") state.lang = stored;
	}
	var rafPending = false;
	var typingDimTimer = null;
	var lastInputAt = 0;
	function getMarginScreens() {
		return MODE_TO_MARGIN_SCREENS[state.currentMode] ?? MODE_TO_MARGIN_SCREENS.balanced;
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
		if (!state.virtualizationEnabled || state.ctrlFFreeze) {
			state.lastVirtualizedCount = 0;
			state.lastTurnsCount = getMessageNodes().length || 0;
			return;
		}
		const marginScreens = typeof marginScreensOverride === "number" ? marginScreensOverride : getMarginScreens();
		const msgs = getMessageNodes();
		state.lastTurnsCount = msgs.length;
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
		state.lastVirtualizedCount = slimmedCount;
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
	function installFindGuards() {
		window.addEventListener("keydown", (e) => {
			if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
				if (!state.ctrlFFreeze) {
					state.ctrlFFreeze = true;
					unvirtualizeAll();
					updateUI();
				}
			}
			if (e.key === "Escape") setTimeout(() => {
				if (state.ctrlFFreeze) {
					state.ctrlFFreeze = false;
					scheduleVirtualize();
				}
			}, 120);
		}, true);
	}
	function installImageLoadHook() {
		window.addEventListener("load", (e) => {
			const t = e && e.target;
			if (t && t.tagName && t.tagName.toLowerCase() === "img") setTimeout(() => scheduleVirtualize(), 250);
		}, true);
	}
	function installResizeFix() {
		window.addEventListener("resize", () => {
			unvirtualizeAll();
			requestAnimationFrame(() => scheduleVirtualize());
		}, { passive: true });
	}
	function installTypingDim() {
		const dim = () => {
			lastInputAt = Date.now();
			const root = document.getElementById(ROOT_ID);
			if (root) root.classList.add("dim");
			if (typingDimTimer) clearTimeout(typingDimTimer);
			typingDimTimer = setTimeout(() => {
				if (Date.now() - lastInputAt >= 850) {
					const el = document.getElementById(ROOT_ID);
					if (el) el.classList.remove("dim");
				}
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
				const root = document.getElementById(ROOT_ID);
				if (root) root.classList.remove("dim");
			}, 220);
		}, true);
	}
	function installDrag(root) {
		let dragging = false;
		let startX = 0;
		let startY = 0;
		let originX = 0;
		let originY = 0;
		const btn = root.querySelector(`#${BTN_ID}`);
		if (!btn) return;
		btn.addEventListener("pointerdown", (ev) => {
			if (!state.pinned) return;
			if (ev.button !== 0) return;
			dragging = true;
			root.classList.add("dragging");
			btn.setPointerCapture(ev.pointerId);
			startX = ev.clientX;
			startY = ev.clientY;
			const rect = root.getBoundingClientRect();
			originX = rect.left;
			originY = rect.top;
			state.pinnedPos.hidden = false;
			updatePinnedHiddenClass();
			ev.preventDefault();
			ev.stopPropagation();
		});
		btn.addEventListener("pointermove", (ev) => {
			if (!dragging) return;
			const dx = ev.clientX - startX;
			const dy = ev.clientY - startY;
			const nx = clamp(originX + dx, 0, window.innerWidth - 40);
			const ny = clamp(originY + dy, 0, window.innerHeight - 40);
			state.pinnedPos.x = nx;
			state.pinnedPos.y = ny;
			savePos(localStorage, state.pinnedPos);
			root.style.left = `${nx}px`;
			root.style.top = `${ny}px`;
		});
		btn.addEventListener("pointerup", (ev) => {
			if (!dragging) return;
			dragging = false;
			root.classList.remove("dragging");
			snapToEdgeIfNeeded();
			updatePinnedHiddenClass();
			ev.preventDefault();
			ev.stopPropagation();
		});
		btn.addEventListener("pointercancel", () => {
			dragging = false;
			root.classList.remove("dragging");
			updatePinnedHiddenClass();
		});
	}
	function bindUI(root, help) {
		const btn = root.querySelector(`#${BTN_ID}`);
		const panel = root.querySelector(`#${PANEL_ID}`);
		const toggleBtn = root.querySelector("#cgpt-vs-toggle");
		const minimalBtn = root.querySelector("#cgpt-vs-minimal");
		const pinBtn = root.querySelector("#cgpt-vs-pin");
		const helpBtn = root.querySelector("#cgpt-vs-helpBtn");
		const helpClose = help.querySelector("#cgpt-vs-helpClose");
		const forceCleanBtn = root.querySelector("#cgpt-vs-forceClean");
		const newChatBtn = root.querySelector("#cgpt-vs-newChat");
		function setOpen(open) {
			root.classList.toggle("open", open);
			saveBool(localStorage, KEY_LAST_OPEN, open);
			startFollowPositionLoop();
		}
		btn?.addEventListener("click", () => {
			if (root.classList.contains("dragging")) return;
			setOpen(!root.classList.contains("open"));
		});
		btn?.addEventListener("mouseenter", () => {
			if (!state.pinned && state.minimalMode) setOpen(true);
		});
		root.addEventListener("mouseleave", () => {
			if (!state.pinned && state.minimalMode) setOpen(false);
		});
		btn?.addEventListener("keydown", (ev) => {
			if (ev.key === "Enter" || ev.key === " ") {
				ev.preventDefault();
				setOpen(!root.classList.contains("open"));
			}
		});
		document.addEventListener("click", (e) => {
			if (!root.classList.contains("open")) return;
			if (root.contains(e.target)) return;
			setOpen(false);
		}, true);
		panel?.querySelectorAll(".cgpt-vs-seg button").forEach((b) => {
			b.addEventListener("click", () => {
				const mode = b.getAttribute("data-mode");
				if (mode !== "performance" && mode !== "balanced" && mode !== "conservative") return;
				state.currentMode = mode;
				saveMode(localStorage, mode);
				refreshSegUI(root);
				scheduleVirtualize();
				updateUI();
			});
		});
		toggleBtn?.addEventListener("click", () => {
			state.virtualizationEnabled = !state.virtualizationEnabled;
			saveBool(localStorage, KEY_ENABLED, state.virtualizationEnabled);
			if (!state.virtualizationEnabled) unvirtualizeAll();
			else scheduleVirtualize();
			updateUI();
		});
		minimalBtn?.addEventListener("click", () => {
			state.minimalMode = !state.minimalMode;
			saveBool(localStorage, KEY_MINIMAL, state.minimalMode);
			root.classList.toggle("minimal", state.minimalMode);
			updateUI();
		});
		helpBtn?.addEventListener("click", () => help.classList.add("show"));
		helpClose?.addEventListener("click", () => help.classList.remove("show"));
		help.addEventListener("click", (e) => {
			if (e.target === help) help.classList.remove("show");
		});
		pinBtn?.addEventListener("click", () => {
			state.pinned = !state.pinned;
			saveBool(localStorage, KEY_PINNED, state.pinned);
			applyPinnedState();
			updateUI();
		});
		forceCleanBtn?.addEventListener("click", () => {
			if (!state.virtualizationEnabled) {
				state.virtualizationEnabled = true;
				saveBool(localStorage, KEY_ENABLED, true);
			}
			scheduleVirtualize(FORCE_CLEAN_MARGIN_SCREENS);
			flashDot();
		});
		newChatBtn?.addEventListener("click", () => {
			if (!tryClickNewChat()) window.open(location.origin + "/", "_blank", "noopener,noreferrer");
		});
		installDrag(root);
		refreshSegUI(root);
		renderFeaturePack(true);
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
				if (!state.pinned) positionNearModelButton();
				renderFeaturePack(false);
			}
		}, 800);
	}
	function initStateFromStorage() {
		setLangFromStorage();
		state.currentMode = loadMode(localStorage);
		state.virtualizationEnabled = loadBool(localStorage, KEY_ENABLED, true);
		state.minimalMode = loadBool(localStorage, KEY_MINIMAL, true);
		state.edgeSnap = loadBool(localStorage, KEY_EDGE_SNAP, true);
		state.pinned = loadBool(localStorage, KEY_PINNED, false);
		state.wasOpen = loadBool(localStorage, KEY_LAST_OPEN, false);
		state.pinnedPos = loadPos(localStorage, window.innerWidth, window.innerHeight);
	}
	function boot() {
		initStateFromStorage();
		const root = ensureRoot();
		applyPinnedState();
		startFollowPositionLoop();
		bindUI(root, document.getElementById("cgpt-vs-help"));
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
