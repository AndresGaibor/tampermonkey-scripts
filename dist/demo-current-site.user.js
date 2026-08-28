// ==UserScript==
// @name         Demo - Current Site Helper
// @namespace    https://github.com/AndresGaibor/userscripts
// @version      0.1.18
// @author       Andres
// @description  Script mínimo de ejemplo para crear nuevos userscripts desde este monorepo.
// @supportURL   https://github.com/AndresGaibor/tampermonkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/demo-current-site.user.js
// @updateURL    https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/demo-current-site.user.js
// @match        https://example.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function() {
	"use strict";
	function normalizeSpaces(value) {
		return String(value ?? "").replace(/\s+/g, " ").trim();
	}
	function normalizeText(value) {
		return normalizeSpaces(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
	}
	function injectCss(css, id) {
		if (id) {
			const existing = document.getElementById(id);
			if (existing instanceof HTMLStyleElement) {
				existing.textContent = css;
				return existing;
			}
		}
		const style = document.createElement("style");
		if (id) style.id = id;
		style.textContent = css;
		document.head.appendChild(style);
		return style;
	}
	function getStoredValue(key, fallback) {
		try {
			return GM_getValue(key, fallback);
		} catch {
			return fallback;
		}
	}
	function setStoredValue(key, value) {
		GM_setValue(key, value);
	}
	var enabledKey = "demo-current-site:enabled";
	function main() {
		const enabled = getStoredValue(enabledKey, true);
		GM_registerMenuCommand(enabled ? "Desactivar demo" : "Activar demo", () => {
			setStoredValue(enabledKey, !enabled);
			location.reload();
		});
		if (!enabled) return;
		injectCss(`
    #ag-userscript-demo {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 999999;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 10px;
      background: #111827;
      color: #fff;
      font-family: Arial, sans-serif;
      font-size: 13px;
      box-shadow: 0 4px 18px rgba(0, 0, 0, .25);
    }
  `, "ag-userscript-demo-style");
		const box = document.createElement("div");
		box.id = "ag-userscript-demo";
		box.innerHTML = `<span aria-hidden="true">⚙️</span><span>Userscript activo: ${normalizeText(document.title) || location.hostname}</span>`;
		document.body.appendChild(box);
	}
	main();
})();
