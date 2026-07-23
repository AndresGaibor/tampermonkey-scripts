// ==UserScript==
// @name         DeepSeek - Session Relay + Stream Catcher
// @namespace    https://github.com/AndresGaibor/userscripts
// @version      0.2.2
// @author       Andres
// @description  Captura Authorization y cookies de DeepSeek Chat y las envía al bridge local de capi. También intercepta el stream SSE para streaming en consola.
// @supportURL   https://github.com/AndresGaibor/tampermonkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/deepseek-session-relay.user.js
// @updateURL    https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/deepseek-session-relay.user.js
// @match        https://chat.deepseek.com/*
// @connect      localhost
// @connect      127.0.0.1
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
	var BRIDGE_URL = "http://localhost:3847/api/deepseek/session";
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
				} else {
					console.warn(`[DeepSeek Session] Bridge respondió ${res.status}`);
					programarReintento();
				}
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
				statusEl.textContent = "CLI no disponible";
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
	function interceptarFetchStream() {
		if (typeof unsafeWindow.fetch !== "function" || unsafeWindow.__capiStreamPatched) return;
		unsafeWindow.__capiStreamPatched = true;
		const original = unsafeWindow.fetch;
		unsafeWindow.fetch.__capiStreamPatched = true;
		unsafeWindow.fetch = async function(input, init) {
			const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
			window.__capiAllFetchCalls = window.__capiAllFetchCalls || [];
			window.__capiAllFetchCalls.push({
				url,
				time: Date.now()
			});
			if (!url.includes("chat/completion")) return original.apply(this, arguments);
			console.log("[DeepSeek Stream] Intercepted chat/completion fetch!");
			window.__capiStreamIntercepted = true;
			try {
				const response = await original.apply(this, arguments);
				if (!response.ok || !response.body) return response;
				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";
				const newStream = new ReadableStream({ async start(controller) {
					const process = () => {
						reader.read().then(({ done, value }) => {
							if (done) {
								try {
									controller.close();
								} catch {}
								window.__capiStreamDone = true;
								return;
							}
							buffer += decoder.decode(value, { stream: true });
							const lines = buffer.split("\n");
							buffer = lines.pop() || "";
							for (const line of lines) {
								if (!line.startsWith("data: ")) continue;
								const raw = line.slice(6).trim();
								if (!raw || raw === "[DONE]") continue;
								try {
									const parsed = JSON.parse(raw);
									let obj = parsed;
									if (parsed.data !== void 0) {
										const dd = parsed.data;
										obj = typeof dd === "string" ? JSON.parse(dd) : dd || parsed;
									}
									window.__capiStreamChunks = window.__capiStreamChunks || [];
									if (obj.p?.startsWith("response/fragments")) {
										if (obj.p === "response/fragments/-1/content") {
											const chunk = obj.v || "";
											window.__capiStreamResponse = (window.__capiStreamResponse || "") + chunk;
											window.__capiStreamChunks.push({
												type: "RESPONSE",
												chunk
											});
										}
									} else if (obj.v?.response?.fragments) {
										for (const f of obj.v.response.fragments) if (f.type === "THINK") {
											window.__capiStreamThink = (window.__capiStreamThink || "") + (f.content || "");
											window.__capiStreamChunks.push({
												type: "THINK",
												chunk: f.content || ""
											});
										} else if (f.type === "RESPONSE") {
											window.__capiStreamResponse = (window.__capiStreamResponse || "") + (f.content || "");
											window.__capiStreamChunks.push({
												type: "RESPONSE",
												chunk: f.content || ""
											});
										}
									} else if (obj.event === "close") window.__capiStreamDone = true;
								} catch {}
							}
							try {
								controller.enqueue(value);
							} catch {}
							process();
						}).catch((err) => {
							try {
								controller.error(err);
							} catch {}
						});
					};
					process();
				} });
				return new Response(newStream, {
					status: response.status,
					statusText: response.statusText,
					headers: response.headers
				});
			} catch (err) {
				return original.apply(this, arguments);
			}
		};
	}
	function iniciar() {
		leerCookies();
		leerLocalStorage();
		interceptarXMLHttpRequest();
		interceptarFetch();
		interceptarFetchStream();
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
