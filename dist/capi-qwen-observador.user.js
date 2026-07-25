// ==UserScript==
// @name         CAPI - Qwen Observer
// @namespace    https://github.com/AndresGaibor/userscripts
// @version      1.0.1
// @author       Andres
// @description  Publica telemetría local saneada del estado de Qwen para CAPI sin capturar prompts, respuestas, cookies ni tokens.
// @supportURL   https://github.com/AndresGaibor/tampermonkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/capi-qwen-observador.user.js
// @updateURL    https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/capi-qwen-observador.user.js
// @match        https://chat.qwen.ai/*
// @run-at       document-start
// ==/UserScript==

(function() {
	"use strict";
	var estado = {
		version: 1,
		estado: "desconocido",
		generando: false,
		actualizadoEn: Date.now(),
		turnoId: null,
		mutaciones: 0
	};
	window.__CAPI_QWEN_BRIDGE__ = estado;
	function actualizarEstado() {
		const texto = document.body?.innerText ?? "";
		const generando = [...document.querySelectorAll("button,[role=\"button\"]")].some((boton) => /stop|detener/i.test(`${boton.getAttribute("aria-label") ?? ""} ${boton.textContent ?? ""}`));
		const pensamientoCompletado = /pensamiento completado/i.test(texto);
		estado.generando = generando;
		estado.estado = generando ? "pensando" : pensamientoCompletado ? "esperando_respuesta" : "esperando_turno";
		estado.actualizadoEn = Date.now();
		estado.mutaciones += 1;
		window.dispatchEvent(new CustomEvent("capi:qwen-estado", { detail: { ...estado } }));
	}
	function iniciarObservador() {
		const raiz = document.documentElement;
		if (raiz) new MutationObserver(actualizarEstado).observe(raiz, {
			subtree: true,
			childList: true,
			attributes: true
		});
		window.setInterval(actualizarEstado, 15e3);
		actualizarEstado();
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciarObservador, { once: true });
	else iniciarObservador();
})();
