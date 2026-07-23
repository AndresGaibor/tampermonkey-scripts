// ==UserScript==
// @name         DeepSeek - Session Relay
// @namespace    https://github.com/AndresGaibor/userscripts
// @version      0.1.3
// @author       Andres
// @description  Captura Authorization y cookies de DeepSeek Chat y las envía al bridge local de capi.
// @supportURL   https://github.com/AndresGaibor/tampermonkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/deepseek-session-relay.user.js
// @updateURL    https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/deepseek-session-relay.user.js
// @match        https://chat.deepseek.com/*
// @connect      127.0.0.1:3847
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
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
	var STORAGE_KEY_ENABLED = "deepseek:enabled";
	var STORAGE_KEY_MANUAL_DS_SESSION = "deepseek:manualDsSessionId";
	var authorization = null;
	var thumbcache = null;
	var awsWafToken = null;
	var panel = null;
	var statusEl = null;
	var sentBadge = null;
	var retryCount = 0;
	var MAX_RETRIES = 120;
	var RETRY_INTERVAL_MS = 3e3;
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
	function tieneCredenciales() {
		return !!(authorization && thumbcache && awsWafToken);
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
		if (!tieneCredenciales()) return;
		const bundle = construirBundle();
		const json = JSON.stringify(bundle);
		GM_xmlhttpRequest({
			method: "POST",
			url: BRIDGE_URL,
			headers: { "Content-Type": "application/json" },
			data: json,
			timeout: 8e3,
			onload: (res) => {
				if (res.status >= 200 && res.status < 300) {
					retryCount = 0;
					actualizarInterfazExito();
					console.info("[DeepSeek Session] Sesión enviada al bridge correctamente");
				} else programarReintento();
			},
			onerror: () => {
				programarReintento();
			},
			ontimeout: () => {
				programarReintento();
			}
		});
	}
	function programarReintento() {
		if (retryCount >= MAX_RETRIES) {
			if (statusEl) {
				statusEl.textContent = "Puente no disponible";
				statusEl.style.color = "#ef4444";
			}
			return;
		}
		retryCount++;
		if (statusEl) {
			statusEl.textContent = `Esperando CLI... (${retryCount}/${MAX_RETRIES})`;
			statusEl.style.color = "#f59e0b";
		}
		setTimeout(enviarAlBridge, RETRY_INTERVAL_MS);
	}
	function actualizarInterfazExito() {
		if (!statusEl || !sentBadge) return;
		statusEl.textContent = "Enviado a capi ✓";
		statusEl.style.color = "#22c55e";
		sentBadge.style.display = "block";
	}
	function actualizarInterfaz() {
		if (!panel || !statusEl) return;
		if (tieneCredenciales()) {
			statusEl.textContent = "Credenciales listas — enviando...";
			statusEl.style.color = "#a78bfa";
			enviarAlBridge();
		} else {
			statusEl.textContent = `Esperando: ${hideToken(authorization)}`;
			statusEl.style.color = "#f59e0b";
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
      min-width: 210px;
      border-radius: 12px;
      background: rgba(15, 15, 20, 0.97);
      border: 1px solid rgba(255,255,255,0.14);
      box-shadow: 0 10px 32px rgba(0,0,0,0.45);
      color: #fff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
    }
    #deepseek-session-panel h3 {
      margin: 0 0 8px 0;
      font-size: 14px;
      font-weight: 700;
      color: #a78bfa;
    }
    #deepseek-session-panel .ds-status {
      font-weight: 600;
      margin-bottom: 6px;
      font-size: 12px;
    }
    #deepseek-session-panel .ds-sent {
      display: none;
      font-size: 11px;
      color: #22c55e;
      margin-bottom: 6px;
    }
    #deepseek-session-panel .ds-note {
      font-size: 11px;
      color: rgba(255,255,255,0.4);
      line-height: 1.4;
    }
  `, "deepseek-session-panel-style");
		statusEl = document.createElement("div");
		statusEl.className = "ds-status";
		statusEl.textContent = "Esperando credenciales...";
		sentBadge = document.createElement("div");
		sentBadge.className = "ds-sent";
		sentBadge.textContent = "✓ Sesión enviada a capi";
		const note = document.createElement("div");
		note.className = "ds-note";
		note.textContent = "ds_session_id (HttpOnly) se configura manualmente en capi auth deepseek setDsSession";
		panel.innerHTML = "<h3>🔑 DeepSeek Session</h3>";
		panel.append(statusEl);
		panel.append(sentBadge);
		panel.append(note);
		document.body.appendChild(panel);
		actualizarInterfaz();
	}
	function capturarAuthorization(valor, origen) {
		const auth = normalizeAuthorization(valor);
		if (!auth) return;
		if (auth.replace(/^Bearer\s+/i, "").length < 20) return;
		if (authorization === auth) return;
		authorization = auth;
		console.info(`[DeepSeek Session] Authorization capturada desde ${origen}`);
		actualizarInterfaz();
	}
	function leerCookies() {
		try {
			const cookies = document.cookie.split("; ");
			for (const cookie of cookies) {
				if (cookie.startsWith(".thumbcache_") && cookie !== thumbcache) {
					thumbcache = cookie;
					console.info("[DeepSeek Session] thumbcache capturada");
					actualizarInterfaz();
				}
				if (cookie.startsWith("aws-waf-token=") && cookie !== awsWafToken) {
					awsWafToken = cookie;
					console.info("[DeepSeek Session] aws-waf-token capturado");
					actualizarInterfaz();
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
			if (typeof token === "string" && token.length >= 20) capturarAuthorization(token, "localStorage.userToken");
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
			if (String(nombre).toLowerCase() === "authorization") capturarAuthorization(String(valor), "XMLHttpRequest");
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
				if (auth) capturarAuthorization(auth, "fetch");
			} catch {}
			return original.apply(this, arguments);
		};
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
	}
	boot();
})();
