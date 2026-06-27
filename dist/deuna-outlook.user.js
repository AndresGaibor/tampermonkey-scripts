// ==UserScript==
// @name         Deuna Outlook → SriCache
// @namespace    https://github.com/AndresGaibor/userscripts
// @version      1.0.1
// @author       SriCache
// @description  Extrae recargas Deuna desde Outlook Web y las envía a SriCache
// @icon         https://www.google.com/s2/favicons?sz=64&domain=outlook.live.com
// @supportURL   https://github.com/AndresGaibor/tampermonkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/deuna-outlook.user.js
// @updateURL    https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/deuna-outlook.user.js
// @match        https://outlook.live.com/*
// @match        https://outlook.office.com/*
// @connect      localhost
// @connect      127.0.0.1
// @connect      192.168.*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function() {
	"use strict";
	var s = new Set();
	var _css = async (t) => {
		if (s.has(t)) return;
		s.add(t);
		((c) => {
			if (typeof GM_addStyle === "function") GM_addStyle(c);
			else (document.head || document.documentElement).appendChild(document.createElement("style")).append(c);
		})(t);
	};
	function getStoredValue(key, fallback) {
		try {
			return GM_getValue(key, fallback);
		} catch {
			return fallback;
		}
	}
	_css("#deuna-sricache-btn{z-index:99999;color:#fff;cursor:pointer;background:#10b981;border:none;border-radius:8px;align-items:center;gap:8px;padding:10px 18px;font-family:system-ui,-apple-system,sans-serif;font-size:13px;font-weight:600;transition:background .2s,transform .1s,opacity .2s;display:flex;position:fixed;bottom:16px;right:16px;box-shadow:0 4px 12px #00000026}#deuna-sricache-btn:hover{background:#059669}#deuna-sricache-btn:active{transform:scale(.95)}#deuna-sricache-btn:disabled{cursor:not-allowed;background:#6b7280}");
	var SENT_KEY = "deuna_sent_txns";
	var POLL_INTERVAL = 5e3;
	function getApiBase() {
		try {
			const val = getStoredValue("api_base", "");
			if (val) return val.replace(/\/+$/, "");
		} catch {}
		try {
			const val = localStorage.getItem("deuna_api_base");
			if (val) return val.replace(/\/+$/, "");
		} catch {}
		return "http://localhost:3000/api/deuna-imports";
	}
	function getSentTxnIds() {
		try {
			const raw = localStorage.getItem(SENT_KEY);
			return raw ? new Set(JSON.parse(raw)) : new Set();
		} catch {
			return new Set();
		}
	}
	function markSent(txnNumber) {
		const sent = getSentTxnIds();
		sent.add(txnNumber);
		localStorage.setItem(SENT_KEY, JSON.stringify([...sent]));
	}
	async function postReceipt(data) {
		const url = `${getApiBase()}/emails`;
		return new Promise((resolve, reject) => {
			const fn = typeof GM_xmlhttpRequest !== "undefined" ? GM_xmlhttpRequest : null;
			if (fn) fn({
				method: "POST",
				url,
				headers: { "Content-Type": "application/json" },
				data: JSON.stringify(data),
				onload: (res) => {
					if (res.status >= 200 && res.status < 300) resolve({ success: true });
					else if (res.status === 409) resolve({
						success: true,
						duplicated: true
					});
					else reject(new Error(`HTTP ${res.status}: ${res.responseText}`));
				},
				onerror: (err) => reject(err),
				ontimeout: () => reject(new Error("Timeout de red")),
				timeout: 1e4
			});
			else fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data)
			}).then((res) => {
				if (res.status >= 200 && res.status < 300) resolve({ success: true });
				else if (res.status === 409) resolve({
					success: true,
					duplicated: true
				});
				else res.text().then((text) => reject(new Error(`HTTP ${res.status}: ${text}`)));
			}).catch(reject);
		});
	}
	function getReadingPaneText() {
		for (const selector of [
			"#selected-email",
			"div[role=\"document\"]",
			"[aria-label=\"Cuerpo del mensaje\"]",
			"#ReadingPaneContainerId",
			"#ItemHeader"
		]) {
			const el = document.querySelector(selector);
			if (el) {
				const text = el.textContent?.replace(/\s+/g, " ").trim();
				if (text) return {
					text,
					element: el
				};
			}
		}
		return {
			text: document.body.textContent?.replace(/\s+/g, " ").trim() || "",
			element: null
		};
	}
	function parseAmount(amountStr) {
		try {
			const clean = amountStr.replace(/[^0-9,.]/g, "").replace(/\./g, "").replace(",", ".");
			const parsed = parseFloat(clean);
			return isNaN(parsed) ? null : parsed;
		} catch {
			return null;
		}
	}
	function isDeunaEmail(text) {
		const hasDeunaKeywords = /Recargaste/i.test(text) && /Detalles de la transacci[oó]n/i.test(text) && /Monto/i.test(text);
		const hasDeunaSender = text.includes("notificaciones@deunaapp.com");
		return hasDeunaKeywords || hasDeunaSender && /Recargaste/i.test(text);
	}
	function extractFromPage() {
		const { text } = getReadingPaneText();
		if (!isDeunaEmail(text)) return null;
		const txnMatch = text.match(/N[uú]mero de transacci[oó]n\s*:?\s*(\d+)/i);
		if (!txnMatch) return null;
		const transactionNumber = txnMatch[1];
		const amountMatch = text.match(/Monto\s*:?\s*\$?([\d,.]+)\s*(USD)?/i);
		if (!amountMatch) return null;
		const amount = parseAmount(amountMatch[1]);
		if (amount === null) return null;
		const reasonMatch = text.match(/Motivo\s*:?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ ]+?)\s+Fecha/i);
		const reason = reasonMatch ? reasonMatch[1].trim() : "Recarga";
		if (reason.toLowerCase() !== "recarga") return null;
		const dateMatch = text.match(/Fecha\s*:?\s*(\d{1,2}\s+[a-zA-ZáéíóúñÑ]+\.?\s+\d{4}\s*-\s*\d{2}[h:]\d{2})/i);
		const sourceMatch = text.match(/Cuenta de origen\s*:?\s*(\*+\d+)/i);
		const destMatch = text.match(/Cuenta de destino\s*:?\s*(\*+\d+)/i);
		const maskedIdMatch = text.match(/C[ée]dula terminada en\s*:?\s*(\*+\d+)/i);
		let supportPhone;
		const phoneMatch = text.match(/09[\d\s-]{8,15}/);
		if (phoneMatch) {
			const digits = phoneMatch[0].replace(/\s+/g, "");
			if (digits.length === 10) supportPhone = digits;
		}
		let customerName;
		const nameMatch = text.match(/Cliente\s*:?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ\s]+?)(?:\s+Ci|$)/i);
		if (nameMatch) customerName = nameMatch[1].trim();
		else {
			const altMatch = text.match(/([A-Za-zÁÉÍÓÚáéíóúñÑ\s]{3,})\s+C[ée]dula terminada/i);
			if (altMatch) customerName = altMatch[1].trim();
		}
		let subject = "";
		const subjectEl = document.querySelector("div[role=\"main\"] h1, div[role=\"heading\"] h1, [data-testid=\"conversations-subject\"], #selected-email .subject");
		if (subjectEl?.textContent) subject = subjectEl.textContent.trim();
		else {
			subject = document.title || "";
			if (subject.endsWith(" - Outlook")) subject = subject.slice(0, -10);
			else if (subject.endsWith(" - Mail - Outlook")) subject = subject.slice(0, -17);
		}
		return {
			sender: "notificaciones@deunaapp.com",
			subject: subject || "Recarga Deuna",
			amount,
			currency: "USD",
			transactionNumber,
			reason,
			transactionDate: dateMatch ? dateMatch[1] : void 0,
			sourceAccount: sourceMatch ? sourceMatch[1] : void 0,
			destinationAccount: destMatch ? destMatch[1] : void 0,
			customerName,
			maskedId: maskedIdMatch ? maskedIdMatch[1] : void 0,
			supportPhone,
			rawJson: JSON.stringify({ extractedAt: new Date().toISOString() })
		};
	}
	async function processCurrentEmail() {
		const data = extractFromPage();
		if (!data) return false;
		if (getSentTxnIds().has(data.transactionNumber)) return true;
		try {
			if ((await postReceipt(data)).success) {
				markSent(data.transactionNumber);
				console.log("[Deuna→SriCache] Sincronizada recarga:", data.transactionNumber, data.amount);
				return true;
			}
		} catch (err) {
			console.error("[Deuna→SriCache] Error al sincronizar:", err);
		}
		return false;
	}
	function addUI() {
		if (document.getElementById("deuna-sricache-btn")) return;
		const btn = document.createElement("button");
		btn.id = "deuna-sricache-btn";
		btn.textContent = "Enviar recarga a SriCache";
		btn.addEventListener("click", async () => {
			btn.textContent = "Enviando...";
			btn.disabled = true;
			const data = extractFromPage();
			if (!data) {
				btn.textContent = "No es correo Deuna";
				setTimeout(() => {
					btn.textContent = "Enviar recarga a SriCache";
					btn.disabled = false;
				}, 2e3);
				return;
			}
			if (getSentTxnIds().has(data.transactionNumber)) {
				btn.textContent = "✓ Ya enviado";
				setTimeout(() => {
					btn.textContent = "Enviar recarga a SriCache";
					btn.disabled = false;
				}, 2e3);
				return;
			}
			try {
				const res = await postReceipt(data);
				if (res.success) {
					markSent(data.transactionNumber);
					btn.textContent = res.duplicated ? "✓ Ya existía" : "✓ Enviado";
				} else btn.textContent = "❌ Error";
			} catch (err) {
				console.error(err);
				btn.textContent = "❌ Error";
			}
			setTimeout(() => {
				btn.textContent = "Enviar recarga a SriCache";
				btn.disabled = false;
			}, 2e3);
		});
		document.body.appendChild(btn);
	}
	var lastUrl = location.href;
	function startPolling() {
		addUI();
		setInterval(() => {
			if (location.href !== lastUrl) {
				lastUrl = location.href;
				addUI();
			}
			if (!document.getElementById("deuna-sricache-btn")) addUI();
			const data = extractFromPage();
			if (data) {
				if (!getSentTxnIds().has(data.transactionNumber)) processCurrentEmail();
			}
		}, POLL_INTERVAL);
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startPolling);
	else startPolling();
})();
