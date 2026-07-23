// ==UserScript==
// @name         DeepSeek - Session Relay
// @namespace    https://github.com/AndresGaibor/userscripts
// @version      0.1.2
// @author       Andres
// @description  Captura Authorization y cookies de DeepSeek Chat y las envía al bridge local de capi.
// @supportURL   https://github.com/AndresGaibor/tampermonkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/deepseek-session-relay.user.js
// @updateURL    https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/deepseek-session-relay.user.js
// @match        https://chat.deepseek.com/*
// @connect      127.0.0.1:3847
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function() {
	"use strict";
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
	var BRIDGE_URL = "http://127.0.0.1:3847/api/deepseek/session";
	var STORAGE_KEY_LAST_SENT = "deepseek:lastSent";
	var STORAGE_KEY_ENABLED = "deepseek:enabled";
	var STORAGE_KEY_MANUAL_DS_SESSION = "deepseek:manualDsSessionId";
	var authorization = null;
	var thumbcache = null;
	var awsWafToken = null;
	var panel = null;
	var statusEl = null;
	var sendBtn = null;
	var copyBtn = null;
	function hideToken(valor) {
		if (!valor || valor.length < 20) return "no disponible";
		return `${valor.slice(0, 12)}…${valor.slice(-6)}`;
	}
	function normalizeAuthorization(valor) {
		if (!valor || typeof valor !== "string") return null;
		const limpio = valor.trim();
		if (!limpio) return null;
		if (/^Bearer\s+/i.test(limpio)) return limpio;
		return `Bearer ${limpio}`;
	}
	function guardarToken(valor, origen) {
		const auth = normalizeAuthorization(valor);
		if (!auth) return;
		if (auth.replace(/^Bearer\s+/i, "").length < 20) return;
		if (authorization === auth) return;
		authorization = auth;
		console.info(`[DeepSeek Session] Authorization capturada desde ${origen}: ${hideToken(auth)}`);
		actualizarInterfaz();
	}
	function leerCookies() {
		try {
			const cookies = document.cookie.split("; ");
			for (const cookie of cookies) {
				if (cookie.startsWith(".thumbcache_")) {
					thumbcache = cookie;
					console.info(`[DeepSeek Session] thumbcache capturada`);
				}
				if (cookie.startsWith("aws-waf-token=")) {
					awsWafToken = cookie;
					console.info(`[DeepSeek Session] aws-waf-token capturado`);
				}
			}
		} catch (error) {
			console.warn("[DeepSeek Session] Error leyendo cookies:", error);
		}
	}
	function leerLocalStorage() {
		try {
			const raw = localStorage.getItem("userToken");
			if (!raw) return;
			let token;
			try {
				const parsed = JSON.parse(raw);
				token = typeof parsed === "string" ? parsed : parsed?.value ?? "";
			} catch {
				token = raw;
			}
			if (typeof token === "string" && token.length >= 20) guardarToken(token, "localStorage.userToken");
		} catch (error) {
			console.warn("[DeepSeek Session] Error en localStorage:", error);
		}
	}
	function interceptarXMLHttpRequest() {
		const OrigXHR = unsafeWindow.XMLHttpRequest;
		if (!OrigXHR || OrigXHR.prototype.__deepseekInterceptado) return;
		const originalSetHeader = OrigXHR.prototype.setRequestHeader;
		OrigXHR.prototype.__deepseekInterceptado = true;
		OrigXHR.prototype.setRequestHeader = function(nombre, valor) {
			if (String(nombre).toLowerCase() === "authorization") guardarToken(String(valor), "XMLHttpRequest");
			return originalSetHeader.apply(this, arguments);
		};
	}
	function interceptarFetch() {
		if (typeof unsafeWindow.fetch !== "function" || unsafeWindow.fetch.__deepseekInterceptado) return;
		const original = unsafeWindow.fetch;
		unsafeWindow.fetch.__deepseekInterceptado = true;
		unsafeWindow.fetch = function(input, init) {
			try {
				const auth = new Headers(init?.headers).get("authorization");
				if (auth) guardarToken(auth, "fetch");
			} catch {}
			return original.apply(this, arguments);
		};
	}
	function construirBundle() {
		return {
			source: "deepseek",
			capturedAt: new Date().toISOString(),
			authorization,
			cookies: {
				thumbcache,
				awsWafToken,
				dsSessionId: getStoredValue(STORAGE_KEY_MANUAL_DS_SESSION, null)
			}
		};
	}
	function enviarAlBridge() {
		const bundle = construirBundle();
		const json = JSON.stringify(bundle, null, 2);
		setStoredValue(STORAGE_KEY_LAST_SENT, Date.now());
		try {
			GM_xmlhttpRequest({
				method: "POST",
				url: BRIDGE_URL,
				headers: { "Content-Type": "application/json" },
				data: json,
				timeout: 8e3,
				onload: (res) => {
					if (res.status >= 200 && res.status < 300) {
						if (sendBtn) sendBtn.textContent = "Enviado ✓";
						setTimeout(() => {
							if (sendBtn) sendBtn.textContent = "Enviar al CLI";
						}, 1800);
					} else {
						if (sendBtn) sendBtn.textContent = `Error ${res.status}`;
						setTimeout(() => {
							if (sendBtn) sendBtn.textContent = "Enviar al CLI";
						}, 2e3);
					}
				},
				onerror: () => {
					if (sendBtn) sendBtn.textContent = "CLI no responde";
					setTimeout(() => {
						if (sendBtn) sendBtn.textContent = "Enviar al CLI";
					}, 2e3);
				},
				ontimeout: () => {
					if (sendBtn) sendBtn.textContent = "Timeout";
					setTimeout(() => {
						if (sendBtn) sendBtn.textContent = "Enviar al CLI";
					}, 2e3);
				}
			});
		} catch {
			if (sendBtn) sendBtn.textContent = "Error";
			setTimeout(() => {
				if (sendBtn) sendBtn.textContent = "Enviar al CLI";
			}, 2e3);
		}
	}
	function copiarJson() {
		const bundle = construirBundle();
		const json = JSON.stringify(bundle, null, 2);
		try {
			GM_setClipboard(json, "text");
			if (copyBtn) copyBtn.textContent = "Copiado ✓";
			setTimeout(() => {
				if (copyBtn) copyBtn.textContent = "Copiar JSON";
			}, 1500);
		} catch {}
	}
	function tieneCredenciales() {
		return !!(authorization && thumbcache && awsWafToken);
	}
	function actualizarInterfaz() {
		if (!panel || !statusEl || !sendBtn || !copyBtn) return;
		if (tieneCredenciales()) {
			statusEl.textContent = "Listo para enviar";
			statusEl.style.color = "#22c55e";
			sendBtn.disabled = false;
			sendBtn.style.opacity = "1";
			sendBtn.style.cursor = "pointer";
			copyBtn.style.display = "inline-block";
		} else {
			statusEl.textContent = `Auth: ${hideToken(authorization)}`;
			statusEl.style.color = "#f59e0b";
			sendBtn.disabled = true;
			sendBtn.style.opacity = "0.5";
			sendBtn.style.cursor = "not-allowed";
			copyBtn.style.display = "none";
		}
	}
	function crearInterfaz() {
		if (document.getElementById("deepseek-session-panel")) return;
		panel = document.createElement("div");
		panel.id = "deepseek-session-panel";
		injectCss(`
    #deepseek-session-panel {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483647;
      padding: 14px;
      min-width: 200px;
      border-radius: 12px;
      background: rgba(15, 15, 20, 0.97);
      border: 1px solid rgba(255,255,255,0.14);
      box-shadow: 0 10px 32px rgba(0,0,0,0.45);
      color: #fff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
    }
    #deepseek-session-panel h3 {
      margin: 0 0 10px 0;
      font-size: 14px;
      font-weight: 700;
      color: #a78bfa;
    }
    #deepseek-session-panel .ds-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      font-size: 12px;
    }
    #deepseek-session-panel .ds-status {
      font-weight: 600;
      margin-bottom: 10px;
    }
    #deepseek-session-panel .ds-btns {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    #deepseek-session-panel button {
      flex: 1;
      min-width: 90px;
      padding: 7px 10px;
      border: none;
      border-radius: 7px;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
    }
    #deepseek-session-panel .btn-send {
      background: #7c3aed;
      color: #fff;
    }
    #deepseek-session-panel .btn-copy {
      background: #374151;
      color: #fff;
    }
    #deepseek-session-panel .ds-note {
      margin-top: 10px;
      font-size: 11px;
      color: rgba(255,255,255,0.45);
      line-height: 1.4;
    }
  `, "deepseek-session-panel-style");
		statusEl = document.createElement("div");
		statusEl.className = "ds-status";
		sendBtn = document.createElement("button");
		sendBtn.className = "btn-send";
		sendBtn.textContent = "Enviar al CLI";
		sendBtn.disabled = true;
		sendBtn.style.opacity = "0.5";
		sendBtn.style.cursor = "not-allowed";
		sendBtn.addEventListener("click", enviarAlBridge);
		copyBtn = document.createElement("button");
		copyBtn.className = "btn-copy";
		copyBtn.textContent = "Copiar JSON";
		copyBtn.style.display = "none";
		copyBtn.addEventListener("click", copiarJson);
		const note = document.createElement("div");
		note.className = "ds-note";
		note.textContent = "ds_session_id debe ingresarse manualmente en la CLI (es HttpOnly).";
		panel.innerHTML = "<h3>🔑 DeepSeek Session</h3>";
		panel.append(statusEl);
		const btnsRow = document.createElement("div");
		btnsRow.className = "ds-btns";
		panel.append(btnsRow);
		btnsRow.append(sendBtn, copyBtn);
		panel.append(note);
		document.body.appendChild(panel);
		actualizarInterfaz();
	}
	function iniciar() {
		leerCookies();
		leerLocalStorage();
		interceptarXMLHttpRequest();
		interceptarFetch();
	}
	function boot() {
		if (!getStoredValue(STORAGE_KEY_ENABLED, true)) return;
		iniciar();
		setInterval(iniciar, 2e3);
		GM_registerMenuCommand("DeepSeek Session: Activar/Desactivar", () => {
			setStoredValue(STORAGE_KEY_ENABLED, !getStoredValue(STORAGE_KEY_ENABLED, true));
			location.reload();
		});
		if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", crearInterfaz, { once: true });
		else crearInterfaz();
		actualizarInterfaz();
	}
	boot();
})();
