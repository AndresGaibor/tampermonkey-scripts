// ==UserScript==
// @name         Deuna Outlook → SriCache
// @namespace    https://github.com/AndresGaibor/userscripts
// @version      1.0.15
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
	_css("#deuna-sricache-btn{z-index:99999;color:#fff;cursor:pointer;background:#10b981;border:none;border-radius:8px;align-items:center;gap:8px;padding:10px 18px;font-family:system-ui,-apple-system,sans-serif;font-size:13px;font-weight:600;transition:background .2s,transform .1s,opacity .2s;display:flex;position:fixed;bottom:16px;right:16px;box-shadow:0 4px 12px #00000026}#deuna-sricache-btn:hover{background:#059669}#deuna-sricache-btn:active{transform:scale(.95)}#deuna-sricache-btn:disabled{cursor:not-allowed;background:#6b7280}[role=option][aria-label]{position:relative}[role=option][aria-label] .deuna-sent-badge{top:50%;right:12px;transform:translateY(-50%)}#ConversationReadingPaneContainer,#ReadingPaneContainerId,[role=document]{position:relative}#ConversationReadingPaneContainer .deuna-sent-badge,#ReadingPaneContainerId .deuna-sent-badge,[role=document] .deuna-sent-badge{top:12px;right:16px}.deuna-sent-badge{z-index:10;letter-spacing:.02em;pointer-events:none;background:#10b981;border-radius:4px;align-items:center;gap:4px;padding:4px 8px;font-family:system-ui,-apple-system,sans-serif;font-size:11px;font-weight:700;line-height:1;display:inline-flex;position:absolute;box-shadow:0 2px 4px #00000026;color:#fff!important}");
	var SENT_KEY = "deuna_sent_txns";
	var SENT_SIGNATURES_KEY = "deuna_sent_signatures";
	var POLL_INTERVAL = 5e3;
	var SENT_BADGE_TEXT = "Enviado";
	function loadStringSet(storageKey) {
		try {
			const raw = localStorage.getItem(storageKey);
			if (!raw) return new Set();
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return new Set();
			return new Set(parsed.filter((value) => typeof value === "string" && value.length > 0));
		} catch {
			return new Set();
		}
	}
	function saveStringSet(storageKey, values) {
		localStorage.setItem(storageKey, JSON.stringify([...values]));
	}
	function normalizeFingerprintValue(value) {
		if (value === void 0 || value === null) return "";
		return (typeof value === "number" ? value.toFixed(2) : value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
	}
	function buildReceiptSignatures(data) {
		const currency = data.currency || "USD";
		const amount = typeof data.amount === "number" ? data.amount.toFixed(2) : "";
		const variants = [
			[
				data.sender,
				amount,
				currency,
				data.reason,
				data.transactionDate,
				data.customerName,
				data.maskedId,
				data.sourceAccount,
				data.destinationAccount,
				data.supportPhone
			],
			[
				data.sender,
				amount,
				currency,
				data.reason,
				data.transactionDate,
				data.customerName
			],
			[
				data.sender,
				amount,
				currency,
				data.reason,
				data.transactionDate
			],
			[
				data.sender,
				amount,
				currency,
				data.reason
			]
		];
		return [...new Set(variants.map((parts) => parts.map(normalizeFingerprintValue).filter(Boolean).join("|")).filter(Boolean))];
	}
	function getSentSignatures() {
		return loadStringSet(SENT_SIGNATURES_KEY);
	}
	function markSentFingerprints(data) {
		const sent = getSentSignatures();
		for (const signature of buildReceiptSignatures(data)) sent.add(signature);
		saveStringSet(SENT_SIGNATURES_KEY, sent);
	}
	function isFingerprintLoaded(data) {
		const sent = getSentSignatures();
		return buildReceiptSignatures(data).some((signature) => sent.has(signature));
	}
	function normalizeDeunaApiBase(value) {
		const base = value.replace(/\/+$/, "");
		if (base.endsWith("/api/deuna-imports")) return base;
		if (base.endsWith("/api")) return `${base}/deuna-imports`;
		try {
			const url = new URL(base);
			if (!url.pathname || url.pathname === "/") return `${base}/api/deuna-imports`;
		} catch {}
		return base;
	}
	function getApiBase() {
		try {
			const val = getStoredValue("deuna_api_base", "");
			if (val) return normalizeDeunaApiBase(val);
		} catch {}
		try {
			const val = localStorage.getItem("deuna_api_base");
			if (val) return normalizeDeunaApiBase(val);
		} catch {}
		try {
			const val = getStoredValue("api_base", "");
			if (val) return normalizeDeunaApiBase(val);
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
	function toReceiptParts(receipt) {
		const amount = typeof receipt.amount === "string" ? Number(receipt.amount) : receipt.amount;
		if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
		return {
			sender: receipt.sender || "notificaciones@deunaapp.com",
			subject: receipt.subject || "Recarga Deuna",
			receivedAt: receipt.receivedAt || receipt.received_at || void 0,
			customerName: receipt.customerName || receipt.customer_name || void 0,
			maskedId: receipt.maskedId || receipt.masked_id || void 0,
			amount,
			currency: receipt.currency || "USD",
			reason: receipt.reason || "Recarga",
			transactionDate: receipt.transactionDate || receipt.transaction_date || void 0,
			sourceAccount: receipt.sourceAccount || receipt.source_account || void 0,
			destinationAccount: receipt.destinationAccount || receipt.destination_account || void 0,
			transactionNumber: receipt.transactionNumber || receipt.transaction_number || void 0,
			supportPhone: receipt.supportPhone || receipt.support_phone || void 0
		};
	}
	function parseStoredReceipts(payload) {
		if (!payload || typeof payload !== "object") return [];
		const data = "data" in payload ? payload.data : payload;
		if (Array.isArray(data)) return data;
		if (data && typeof data === "object" && Array.isArray(data.items)) return data.items;
		return [];
	}
	async function getStoredReceipts() {
		const url = `${getApiBase()}/emails?pageSize=2000`;
		const fn = typeof GM_xmlhttpRequest !== "undefined" ? GM_xmlhttpRequest : null;
		if (fn) return parseStoredReceipts(await new Promise((resolve, reject) => {
			fn({
				method: "GET",
				url,
				onload: (res) => {
					if (res.status >= 200 && res.status < 300) try {
						resolve(JSON.parse(res.responseText));
					} catch (error) {
						reject(error);
					}
					else reject(new Error(`HTTP ${res.status}: ${res.responseText}`));
				},
				onerror: (err) => reject(err),
				ontimeout: () => reject(new Error("Timeout de red")),
				timeout: 1e4
			});
		}));
		const response = await fetch(url);
		if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
		return parseStoredReceipts(await response.json());
	}
	var sentReceiptsHydrated = false;
	async function hydrateSentReceipts() {
		if (sentReceiptsHydrated) return;
		sentReceiptsHydrated = true;
		try {
			const receipts = await getStoredReceipts();
			for (const receipt of receipts) {
				const parts = toReceiptParts(receipt);
				if (!parts) continue;
				markSentFingerprints(parts);
				if (parts.transactionNumber) markSent(parts.transactionNumber);
			}
			updateMailListBadges();
			updateReadingPaneBadge();
		} catch (error) {
			console.warn("[Deuna→SriCache] No se pudo cargar el historial de recargas:", error);
		}
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
			"#ConversationReadingPaneContainer [id^=\"UniqueMessageBody_\"]",
			"#ReadingPaneContainerId [id^=\"UniqueMessageBody_\"]",
			"#ReadingPaneContainerId",
			"#ConversationReadingPaneContainer",
			"[role=\"document\"]",
			"[aria-label=\"Cuerpo del mensaje\"]"
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
			return Number.isNaN(parsed) ? null : parsed;
		} catch {
			return null;
		}
	}
	function isDeunaEmail(text) {
		const hasDeunaKeywords = /Recargaste/i.test(text) && /Detalles de la transacci[oó]n/i.test(text) && /Monto/i.test(text);
		const hasDeunaSender = text.includes("notificaciones@deunaapp.com");
		return hasDeunaKeywords || hasDeunaSender && /Recargaste/i.test(text);
	}
	function parseDeunaReceiptFromText(text, overrides = {}, options = {}) {
		if (!isDeunaEmail(text)) return null;
		const fieldSeparator = "\\s*: ?\\s*|\\s+";
		const txnMatch = text.match(new RegExp(`N[uú]mero de transacci[oó]n(?:${fieldSeparator})(\\d+)`, "i"));
		const amountMatch = text.match(new RegExp(`Monto(?:${fieldSeparator})\\$?([\\d,.]+)\\s*(USD)?`, "i"));
		const reasonMatch = text.match(new RegExp(`Motivo(?:${fieldSeparator})([A-Za-zÁÉÍÓÚáéíóúñÑ ]+?)\\s+Fecha`, "i"));
		if (!amountMatch || !reasonMatch) return null;
		const amount = parseAmount(amountMatch[1]);
		if (amount === null) return null;
		const reason = reasonMatch[1].trim();
		if (reason.toLowerCase() !== "recarga") return null;
		const dateMatch = text.match(new RegExp(`Fecha(?:${fieldSeparator})(\\d{1,2}\\s+[a-zA-ZáéíóúñÑ]+\\.?\\s+\\d{4}\\s*-\\s*\\d{2}[h:]\\d{2})`, "i"));
		const sourceMatch = text.match(new RegExp(`Cuenta de origen(?:${fieldSeparator})(\\*+\\d+)`, "i"));
		const destMatch = text.match(new RegExp(`Cuenta de destino(?:${fieldSeparator})(\\*+\\d+)`, "i"));
		const maskedIdMatch = text.match(new RegExp(`C[ée]dula terminada en(?:${fieldSeparator})(\\*+\\d+)`, "i"));
		let supportPhone;
		const phoneMatch = text.match(/09[\d\s-]{8,15}/);
		if (phoneMatch) {
			const digits = phoneMatch[0].replace(/\s+/g, "");
			if (digits.length === 10) supportPhone = digits;
		}
		let customerName;
		const nameMatch = text.match(/Cliente\s*: ?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ\s]+?)(?:\s+Ci|$)/i);
		if (nameMatch) customerName = nameMatch[1].trim();
		else {
			const altMatch = text.match(/([A-Za-zÁÉÍÓÚáéíóúñÑ\s]{3,})\s+C[ée]dula terminada/i);
			if (altMatch) customerName = altMatch[1].trim();
		}
		const subject = overrides.subject || "Recarga Deuna";
		const receipt = {
			sender: overrides.sender || "notificaciones@deunaapp.com",
			subject,
			receivedAt: overrides.receivedAt,
			amount,
			currency: amountMatch[2] || "USD",
			reason,
			transactionDate: dateMatch ? dateMatch[1] : void 0,
			sourceAccount: sourceMatch ? sourceMatch[1] : void 0,
			destinationAccount: destMatch ? destMatch[1] : void 0,
			transactionNumber: txnMatch?.[1] ?? "",
			supportPhone,
			customerName,
			maskedId: maskedIdMatch ? maskedIdMatch[1] : void 0,
			rawJson: JSON.stringify({ extractedAt: new Date().toISOString() })
		};
		if (options.requireTransactionNumber !== false && !receipt.transactionNumber) return null;
		return receipt;
	}
	function getOutlookMailItems() {
		return Array.from(document.querySelectorAll("[role=\"option\"][aria-label]"));
	}
	function getOutlookReadingPane() {
		return document.querySelector("#ConversationReadingPaneContainer") || document.querySelector("#ReadingPaneContainerId") || document.querySelector("[role=\"document\"]");
	}
	function extractFromPage() {
		const { text } = getReadingPaneText();
		let subject = "";
		for (const selector of [
			"#ConversationReadingPaneContainer [id$=\"_SUBJECT\"] [title]",
			"#ConversationReadingPaneContainer [id$=\"_SUBJECT\"]",
			"#ReadingPaneContainerId [id$=\"_SUBJECT\"] [title]",
			"#ReadingPaneContainerId [id$=\"_SUBJECT\"]"
		]) {
			const subjectEl = document.querySelector(selector);
			const candidate = subjectEl?.getAttribute("title")?.trim() || subjectEl?.textContent?.trim();
			if (candidate) {
				subject = candidate;
				break;
			}
		}
		if (!subject) {
			subject = document.title || "";
			if (subject.endsWith(" - Outlook")) subject = subject.slice(0, -10);
			else if (subject.endsWith(" - Mail - Outlook")) subject = subject.slice(0, -17);
		}
		const parsed = parseDeunaReceiptFromText(text, { subject: subject || "Recarga Deuna" });
		if (!parsed?.transactionNumber) return null;
		return parsed;
	}
	function extractPreviewReceipt(option) {
		const text = option.getAttribute("aria-label")?.replace(/\s+/g, " ").trim() || option.textContent?.replace(/\s+/g, " ").trim() || "";
		if (!(text.includes("notificaciones@deunaapp.com") && /Recargaste/i.test(text))) return null;
		const subjectMatch = text.match(/¡Listo!\s+Recargaste\s+\$?([\d,.]+)\s+en\s+tu\s+cuenta\s+Deuna/i);
		if (!subjectMatch) return null;
		const amount = parseAmount(subjectMatch[1]);
		if (amount === null) return null;
		const dateMatch = text.match(/\b(Lun|Mar|Mi[eé]|Jue|Vie|S[aá]b|Dom)\b\s+(\d{1,2}\/\d{1,2}\/\d{4})/i) || text.match(/\b(Lun|Mar|Mi[eé]|Jue|Vie|S[aá]b|Dom)\b\s+\d{1,2}:\d{2}/i);
		const receivedAt = dateMatch ? dateMatch[0] : void 0;
		const parsed = parseDeunaReceiptFromText(text, {
			sender: "notificaciones@deunaapp.com",
			subject: subjectMatch[0],
			receivedAt
		}, { requireTransactionNumber: false });
		if (parsed) return parsed;
		return {
			sender: "notificaciones@deunaapp.com",
			subject: subjectMatch[0],
			receivedAt,
			amount,
			currency: "USD",
			reason: "Recarga",
			transactionNumber: ""
		};
	}
	function renderBadge(target, show) {
		if (!target) return;
		const existing = target.querySelector(":scope > .deuna-sent-badge");
		if (!show) {
			existing?.remove();
			return;
		}
		if (existing) {
			existing.textContent = SENT_BADGE_TEXT;
			return;
		}
		const badge = document.createElement("span");
		badge.className = "deuna-sent-badge";
		badge.textContent = SENT_BADGE_TEXT;
		target.appendChild(badge);
	}
	function updateMailListBadges() {
		for (const option of getOutlookMailItems()) {
			const receipt = extractPreviewReceipt(option);
			if (!receipt) {
				renderBadge(option, false);
				continue;
			}
			renderBadge(option, Boolean(receipt.transactionNumber && getSentTxnIds().has(receipt.transactionNumber)));
		}
	}
	function updateReadingPaneBadge() {
		const pane = getOutlookReadingPane();
		if (!pane) return;
		const receipt = extractFromPage();
		renderBadge(pane, Boolean(receipt && (isFingerprintLoaded(receipt) || getSentTxnIds().has(receipt.transactionNumber))));
	}
	async function processCurrentEmail() {
		const data = extractFromPage();
		if (!data) return false;
		if (getSentTxnIds().has(data.transactionNumber)) {
			markSentFingerprints(data);
			return true;
		}
		try {
			if ((await postReceipt(data)).success) {
				markSent(data.transactionNumber);
				markSentFingerprints(data);
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
				markSentFingerprints(data);
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
					markSentFingerprints(data);
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
	var mailListObserverStarted = false;
	var mailListScrollStarted = false;
	var badgeRefreshScheduled = false;
	function scheduleBadgeRefresh() {
		if (badgeRefreshScheduled) return;
		badgeRefreshScheduled = true;
		const refresh = () => {
			badgeRefreshScheduled = false;
			updateMailListBadges();
			updateReadingPaneBadge();
		};
		if (typeof requestAnimationFrame === "function") {
			requestAnimationFrame(refresh);
			return;
		}
		setTimeout(refresh, 0);
	}
	function observeOutlookMutations() {
		if (mailListObserverStarted || typeof MutationObserver === "undefined") return;
		mailListObserverStarted = true;
		new MutationObserver(scheduleBadgeRefresh).observe(document.body, {
			childList: true,
			subtree: true
		});
	}
	function observeOutlookScroll() {
		if (mailListScrollStarted) return;
		mailListScrollStarted = true;
		document.addEventListener("scroll", scheduleBadgeRefresh, {
			capture: true,
			passive: true
		});
	}
	function startPolling() {
		addUI();
		observeOutlookMutations();
		observeOutlookScroll();
		hydrateSentReceipts();
		updateMailListBadges();
		updateReadingPaneBadge();
		setInterval(() => {
			if (location.href !== lastUrl) {
				lastUrl = location.href;
				addUI();
			}
			if (!document.getElementById("deuna-sricache-btn")) addUI();
			updateMailListBadges();
			updateReadingPaneBadge();
			const data = extractFromPage();
			if (data) {
				if (!getSentTxnIds().has(data.transactionNumber)) processCurrentEmail();
			}
		}, POLL_INTERVAL);
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startPolling);
	else startPolling();
})();
