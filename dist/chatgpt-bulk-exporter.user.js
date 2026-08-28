// ==UserScript==
// @name         ChatGPT - Bulk Markdown Exporter
// @namespace    https://github.com/AndresGaibor/userscripts
// @version      0.1.15
// @author       Andres
// @description  Selecciona múltiples conversaciones de ChatGPT y expórtalas como Markdown dentro de un ZIP.
// @supportURL   https://github.com/AndresGaibor/tampermonkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/chatgpt-bulk-exporter.user.js
// @updateURL    https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/chatgpt-bulk-exporter.user.js
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function() {
	"use strict";
	function normalizeTimestamp(value) {
		if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
		if (value == null || value === "") return null;
		if (typeof value === "number") {
			if (!Number.isFinite(value) || value <= 0) return null;
			const date = new Date(value < 1e11 ? value * 1e3 : value);
			return Number.isNaN(date.getTime()) ? null : date;
		}
		if (typeof value === "string") {
			const trimmed = value.trim();
			if (!trimmed) return null;
			const numeric = Number(trimmed);
			if (Number.isFinite(numeric) && numeric > 0) {
				const date = new Date(numeric < 1e11 ? numeric * 1e3 : numeric);
				return Number.isNaN(date.getTime()) ? null : date;
			}
			const parsed = Date.parse(trimmed);
			return Number.isNaN(parsed) ? null : new Date(parsed);
		}
		return null;
	}
	function formatDateTime(date, locale = "es-EC") {
		if (!date || Number.isNaN(date.getTime())) return "Fecha no disponible";
		return new Intl.DateTimeFormat(locale, {
			dateStyle: "medium",
			timeStyle: "short"
		}).format(date);
	}
	function compactDate(date) {
		if (!date || Number.isNaN(date.getTime())) return "unknown";
		const p = (n) => String(n).padStart(2, "0");
		return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
	}
	function reactFiber(element) {
		const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"));
		return key ? element[key] : null;
	}
	function datesFromHistoryItem(value, id, depth = 0, seen = new WeakSet()) {
		if (!value || typeof value !== "object" || depth > 8 || seen.has(value)) return null;
		seen.add(value);
		const record = value;
		if ((typeof record.id === "string" ? record.id : typeof record.conversation_id === "string" ? record.conversation_id : null) === id && ("create_time" in record || "update_time" in record)) {
			const createdAt = normalizeTimestamp(record.create_time ?? record.created_at);
			return {
				createdAt,
				updatedAt: normalizeTimestamp(record.update_time ?? record.updated_at) ?? createdAt
			};
		}
		for (const [key, child] of Object.entries(record)) {
			if (key === "_owner" || key === "children" || key === "return" || key === "stateNode") continue;
			const found = datesFromHistoryItem(child, id, depth + 1, seen);
			if (found) return found;
		}
		return null;
	}
	function datesFromReactLink(element, id) {
		let fiber = reactFiber(element);
		for (let level = 0; fiber && level < 7; level++) {
			const found = datesFromHistoryItem(fiber.memoizedProps, id);
			if (found) return found;
			fiber = fiber.return;
		}
		return null;
	}
	function pageElementForHref(element, href) {
		try {
			if (typeof unsafeWindow !== "undefined") return [...unsafeWindow.document.querySelectorAll("a[href^=\"/c/\"]")].find((link) => link.getAttribute("href") === href) ?? element;
		} catch {}
		return element;
	}
	function readTimestamp(element, names) {
		let current = element;
		while (current) {
			for (const name of names) {
				const date = normalizeTimestamp(current.getAttribute(name) ?? current.dataset?.[name.replace(/^data-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase())]);
				if (date) return date;
			}
			current = current.parentElement;
		}
		return null;
	}
	function findConversationLinks(root = document) {
		const seen = new Set();
		const result = [];
		root.querySelectorAll("a[href^=\"/c/\"]").forEach((element) => {
			const href = element.getAttribute("href") || "";
			const match = href.match(/^\/c\/([^/?#]+)/);
			if (!match) return;
			const id = decodeURIComponent(match[1]);
			if (seen.has(id)) return;
			seen.add(id);
			const row = element.closest("[data-sidebar-item], [data-conversation-id]") || element;
			const reactDates = datesFromReactLink(pageElementForHref(element, href), id);
			const createdAt = readTimestamp(row, [
				"data-create-time",
				"data-created-at",
				"data-created"
			]) ?? reactDates?.createdAt ?? null;
			const updatedAt = readTimestamp(row, [
				"data-update-time",
				"data-updated-at",
				"data-updated"
			]) ?? reactDates?.updatedAt ?? createdAt;
			result.push({
				id,
				href,
				title: element.textContent?.trim() || "ChatGPT chat",
				element,
				createdAt,
				updatedAt
			});
		});
		return result;
	}
	function findSidebarMountTarget(root = document) {
		const history = root.querySelector("#history");
		if (history) return history;
		const nav = root.querySelector("nav[aria-label=\"Historial del chat\"]");
		if (nav) return nav;
		const firstConversation = findConversationLinks(root)[0]?.element;
		if (firstConversation) return firstConversation.closest("[data-sidebar-item]")?.parentElement || firstConversation.parentElement;
		return root.querySelector("#stage-slideover-sidebar [data-sidebar-root], #stage-slideover-sidebar") || root.querySelector("[data-sidebar-root]");
	}
	function decorateConversation(link, checked, onChange) {
		let input = link.querySelector("[data-cbe-checkbox]");
		if (!input) {
			input = link.ownerDocument.createElement("input");
			input.type = "checkbox";
			input.dataset.cbeCheckbox = "true";
			input.className = "cbe-visually-hidden";
			input.setAttribute("aria-label", `Seleccionar ${link.textContent?.trim() || "chat"}`);
			input.addEventListener("click", (event) => event.stopPropagation());
			input.addEventListener("change", () => onChange?.(input.checked));
			link.prepend(input);
		}
		input.checked = checked;
		link.classList.toggle("cbe-is-selected", checked);
		let marker = link.querySelector("[data-cbe-selection-marker]");
		if (!marker) {
			marker = link.ownerDocument.createElement("span");
			marker.dataset.cbeSelectionMarker = "true";
			marker.className = "cbe-selection-marker";
			marker.setAttribute("aria-hidden", "true");
			link.prepend(marker);
		}
		return input;
	}
	var SelectionStore = class {
		selected = new Set();
		get size() {
			return this.selected.size;
		}
		get ids() {
			return [...this.selected];
		}
		has(id) {
			return this.selected.has(id);
		}
		add(id) {
			this.selected.add(id);
		}
		remove(id) {
			this.selected.delete(id);
		}
		toggle(id) {
			this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
		}
		clear() {
			this.selected.clear();
		}
	};
	function roleOf(value) {
		const role = typeof value === "string" ? value : "";
		return [
			"user",
			"assistant",
			"system",
			"tool"
		].includes(role) ? role : "unknown";
	}
	function contentOf(content) {
		if (!content) return "";
		if (typeof content === "string") return content;
		if (Array.isArray(content.parts)) return content.parts.map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
		if (typeof content.text === "string") return content.text;
		return "";
	}
	function normalizeConversation(raw) {
		if (!raw || typeof raw !== "object" || typeof raw.conversation_id !== "string" || !raw.mapping || typeof raw.mapping !== "object") throw new Error("Unsupported conversation format");
		const messages = Object.entries(raw.mapping).flatMap(([key, node]) => node?.message ? [{
			id: String(node.message.id ?? key),
			parentId: node.parent ?? null,
			role: roleOf(node.message.author?.role),
			createdAt: normalizeTimestamp(node.message.create_time),
			content: contentOf(node.message.content)
		}] : []);
		const messageDates = messages.map((message) => message.createdAt).filter((date) => date !== null);
		const firstMessageDate = messageDates.length ? new Date(Math.min(...messageDates.map((date) => date.getTime()))) : null;
		const lastMessageDate = messageDates.length ? new Date(Math.max(...messageDates.map((date) => date.getTime()))) : null;
		return {
			id: raw.conversation_id,
			title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "ChatGPT chat",
			createdAt: normalizeTimestamp(raw.create_time) ?? firstMessageDate,
			updatedAt: normalizeTimestamp(raw.update_time) ?? lastMessageDate ?? firstMessageDate,
			currentNode: typeof raw.current_node === "string" ? raw.current_node : null,
			messages
		};
	}
	function getActiveBranch(conversation) {
		const byId = new Map(conversation.messages.map((message) => [message.id, message]));
		const result = [];
		const seen = new Set();
		let id = conversation.currentNode;
		while (id && !seen.has(id)) {
			seen.add(id);
			const message = byId.get(id);
			if (!message) break;
			result.push(message);
			id = message.parentId;
		}
		return result.reverse();
	}
	function renderMarkdown(conversation, exportedAt = new Date(), locale = "default") {
		const lines = [
			`# ${conversation.title}`,
			"",
			"**User:** Anonymous  ",
			`**Created:** ${formatDateTime(conversation.createdAt, locale)}`,
			`**Updated:** ${formatDateTime(conversation.updatedAt, locale)}`,
			`**Exported:** ${formatDateTime(exportedAt, locale)}`,
			`**Link:** https://chatgpt.com/c/${conversation.id}`,
			""
		];
		for (const message of getActiveBranch(conversation)) {
			if (message.role !== "user" && message.role !== "assistant") continue;
			lines.push(`## ${message.role === "user" ? "Prompt" : "Response"}:`, "", formatDateTime(message.createdAt, locale), "", message.content.trim(), "");
		}
		return `${lines.join("\n").trim()}\n`;
	}
	var INVALID = /[\\/:*?"<>|]/g;
	function createFilename(title, date) {
		return `ChatGPT-${(title || "").replace(INVALID, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "").slice(0, 100).trim() || "chat"}${date ? `-${compactDate(date)}` : ""}.md`;
	}
	function uniqueFilename(name, used) {
		if (!used.has(name)) return name;
		const dot = name.lastIndexOf(".");
		const base = name.slice(0, dot), ext = name.slice(dot);
		let n = 2;
		while (used.has(`${base}-${n}${ext}`)) n++;
		return `${base}-${n}${ext}`;
	}
	async function exportBatch(options) {
		const files = [];
		const failures = [];
		const used = new Set();
		const ids = options.conversationIds;
		for (let index = 0; index < ids.length; index++) {
			const id = ids[index];
			if (options.signal?.aborted) return {
				files,
				failures,
				cancelled: true
			};
			options.onProgress?.({
				index: index + 1,
				total: ids.length,
				id,
				state: "fetching"
			});
			try {
				const conversation = await options.fetchConversation(id, options.signal);
				options.onProgress?.({
					index: index + 1,
					total: ids.length,
					id,
					state: "rendering",
					title: conversation.title
				});
				const name = uniqueFilename(createFilename(conversation.title, conversation.updatedAt), used);
				used.add(name);
				files.push({
					name,
					content: renderMarkdown(conversation, options.now)
				});
				options.onProgress?.({
					index: index + 1,
					total: ids.length,
					id,
					state: "done",
					title: conversation.title
				});
			} catch (error) {
				if (options.signal?.aborted) return {
					files,
					failures,
					cancelled: true
				};
				console.warn("[CBE] Conversation export failed", id, error instanceof Error ? error.message : "unknown error");
				failures.push(id);
				options.onProgress?.({
					index: index + 1,
					total: ids.length,
					id,
					state: "failed"
				});
			}
		}
		return {
			files,
			failures,
			cancelled: false
		};
	}
	function conversationToSidebarMetadata(conversation, href = `/c/${encodeURIComponent(conversation.id)}`) {
		return {
			id: conversation.id,
			title: conversation.title,
			href,
			createdAt: conversation.createdAt,
			updatedAt: conversation.updatedAt
		};
	}
	var ConversationFormatError = class extends Error {
		name = "ConversationFormatError";
	};
	async function fetchConversation(conversationId, signal) {
		const response = await fetch(`/backend-api/conversation/${encodeURIComponent(conversationId)}`, {
			credentials: "include",
			signal,
			headers: { Accept: "application/json" }
		});
		if (!response.ok) throw new Error(`Conversation request failed (${response.status})`);
		try {
			return normalizeConversation(await response.json());
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") throw error;
			throw new ConversationFormatError("Unsupported conversation response");
		}
	}
	function readHistoryPayload(payload) {
		if (Array.isArray(payload)) return {
			items: payload,
			total: null
		};
		if (!payload || typeof payload !== "object") return {
			items: [],
			total: null
		};
		const record = payload;
		const candidates = [
			record.items,
			record.conversations,
			record.data
		];
		for (const candidate of candidates) {
			if (Array.isArray(candidate)) return {
				items: candidate,
				total: typeof record.total === "number" ? record.total : null
			};
			if (candidate && typeof candidate === "object") {
				const nested = candidate;
				const items = Array.isArray(nested.items) ? nested.items : Array.isArray(nested.conversations) ? nested.conversations : null;
				if (items) return {
					items,
					total: typeof record.total === "number" ? record.total : typeof nested.total === "number" ? nested.total : null
				};
			}
		}
		return {
			items: [],
			total: typeof record.total === "number" ? record.total : null
		};
	}
	function normalizeHistoryItem(item) {
		if (!item || typeof item !== "object") return null;
		const entry = item;
		const id = typeof entry.conversation_id === "string" ? entry.conversation_id : typeof entry.id === "string" ? entry.id : "";
		if (!id.trim()) return null;
		const createdAt = normalizeTimestamp(entry.create_time ?? entry.created_at);
		const updatedAt = normalizeTimestamp(entry.update_time ?? entry.updated_at) ?? createdAt;
		return {
			id,
			title: typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : "ChatGPT chat",
			href: `/c/${encodeURIComponent(id)}`,
			createdAt,
			updatedAt
		};
	}
	async function fetchConversationHistory(options = {}) {
		const { signal, pageSize = 28, onProgress } = options;
		const conversations = [];
		const seen = new Set();
		let offset = 0;
		let total = null;
		while (true) {
			const query = new URLSearchParams({
				offset: String(offset),
				limit: String(pageSize),
				order: "updated"
			});
			const response = await fetch(`/backend-api/conversations?${query}`, {
				credentials: "include",
				signal,
				headers: { Accept: "application/json" }
			});
			if (!response.ok) throw new Error(`Conversation history request failed (${response.status})`);
			const page = readHistoryPayload(await response.json());
			const items = page.items;
			if (page.total !== null) total = page.total;
			if (items.length === 0) break;
			let added = 0;
			for (const item of items) {
				const conversation = normalizeHistoryItem(item);
				if (conversation && !seen.has(conversation.id)) {
					seen.add(conversation.id);
					conversations.push(conversation);
					added++;
				}
			}
			onProgress?.({
				loaded: conversations.length,
				total
			});
			if (added === 0 || total !== null && conversations.length >= total) break;
			offset += items.length;
		}
		return conversations;
	}
	var CACHE_KEY = "cbe:conversation-date-cache:v1";
	var CACHE_TTL_MS = 1440 * 60 * 1e3;
	function validEntry(value) {
		if (!value || typeof value !== "object") return false;
		const entry = value;
		const validDate = (date) => date === null || typeof date === "number" && Number.isFinite(date);
		return typeof entry.id === "string" && entry.id.trim() !== "" && typeof entry.title === "string" && validDate(entry.createdAt) && validDate(entry.updatedAt) && typeof entry.validatedAt === "number" && Number.isFinite(entry.validatedAt);
	}
	var ConversationDateCache = class {
		storage;
		constructor(storage) {
			this.storage = storage;
		}
		load(now = Date.now()) {
			const raw = this.storage.get(CACHE_KEY);
			if (!Array.isArray(raw)) return [];
			return raw.filter(validEntry).filter((entry) => now - entry.validatedAt < CACHE_TTL_MS).sort((a, b) => b.validatedAt - a.validatedAt).slice(0, 500);
		}
		save(entries, now = Date.now()) {
			const deduped = new Map();
			for (const entry of entries) if (validEntry(entry)) deduped.set(entry.id, {
				...entry,
				validatedAt: Number.isFinite(entry.validatedAt) ? entry.validatedAt : now
			});
			this.storage.set(CACHE_KEY, [...deduped.values()].sort((a, b) => b.validatedAt - a.validatedAt).slice(0, 500));
		}
	};
	var tampermonkeyDateCache = new ConversationDateCache({
		get: (key) => typeof GM_getValue === "function" ? GM_getValue(key, []) : [],
		set: (key, value) => {
			if (typeof GM_setValue === "function") GM_setValue(key, value);
		}
	});
	function cachedToSidebarConversation(entry, fallback) {
		return {
			...fallback,
			title: entry.title || fallback.title,
			createdAt: entry.createdAt === null ? fallback.createdAt : new Date(entry.createdAt),
			updatedAt: entry.updatedAt === null ? fallback.updatedAt : new Date(entry.updatedAt)
		};
	}
	async function indexConversationDates(options) {
		const { conversations, cache, fetchConversation, signal, onUpdate, onProgress } = options;
		const now = options.now ?? Date.now();
		const entries = cache.load(now);
		const byId = new Map(entries.map((entry) => [entry.id, entry]));
		const stale = [];
		for (const conversation of conversations) {
			const cached = byId.get(conversation.id);
			if (cached) onUpdate?.(cachedToSidebarConversation(cached, conversation));
			const missingDate = !conversation.createdAt || !conversation.updatedAt;
			const incompleteCache = !cached?.createdAt || !cached?.updatedAt;
			if (!cached || now - cached.validatedAt >= 864e5 || missingDate || incompleteCache) stale.push(conversation);
		}
		let loaded = 0;
		const report = () => onProgress?.({
			loaded: ++loaded,
			total: stale.length
		});
		let cursor = 0;
		const worker = async () => {
			while (true) {
				if (signal?.aborted) return;
				const conversation = stale[cursor++];
				if (!conversation) return;
				try {
					const result = await fetchConversation(conversation.id, signal);
					if (signal?.aborted) return;
					const metadata = conversationToSidebarMetadata(result, conversation.href);
					byId.set(conversation.id, {
						id: metadata.id,
						title: metadata.title,
						createdAt: metadata.createdAt?.getTime() ?? null,
						updatedAt: metadata.updatedAt?.getTime() ?? null,
						validatedAt: now
					});
					onUpdate?.(metadata);
				} catch (error) {
					if (error instanceof DOMException && error.name === "AbortError") return;
				} finally {
					report();
				}
			}
		};
		const count = Math.min(Math.max(options.concurrency ?? 3, 1), Math.max(stale.length, 1));
		await Promise.all(Array.from({ length: count }, worker));
		if (!signal?.aborted) cache.save([...byId.values()], now);
	}
	var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
	var fleb = new u8([
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		1,
		1,
		1,
		1,
		2,
		2,
		2,
		2,
		3,
		3,
		3,
		3,
		4,
		4,
		4,
		4,
		5,
		5,
		5,
		5,
		0,
		0,
		0,
		0
	]);
	var fdeb = new u8([
		0,
		0,
		0,
		0,
		1,
		1,
		2,
		2,
		3,
		3,
		4,
		4,
		5,
		5,
		6,
		6,
		7,
		7,
		8,
		8,
		9,
		9,
		10,
		10,
		11,
		11,
		12,
		12,
		13,
		13,
		0,
		0
	]);
	var clim = new u8([
		16,
		17,
		18,
		0,
		8,
		7,
		9,
		6,
		10,
		5,
		11,
		4,
		12,
		3,
		13,
		2,
		14,
		1,
		15
	]);
	var freb = function(eb, start) {
		var b = new u16(31);
		for (var i = 0; i < 31; ++i) b[i] = start += 1 << eb[i - 1];
		var r = new i32(b[30]);
		for (var i = 1; i < 30; ++i) for (var j = b[i]; j < b[i + 1]; ++j) r[j] = j - b[i] << 5 | i;
		return {
			b,
			r
		};
	};
	var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
	fl[28] = 258, revfl[258] = 28;
	var _b = freb(fdeb, 0);
	_b.b;
	var revfd = _b.r;
	var rev = new u16(32768);
	for (var i = 0; i < 32768; ++i) {
		var x = (i & 43690) >> 1 | (i & 21845) << 1;
		x = (x & 52428) >> 2 | (x & 13107) << 2;
		x = (x & 61680) >> 4 | (x & 3855) << 4;
		rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
	}
	var hMap = (function(cd, mb, r) {
		var s = cd.length;
		var i = 0;
		var l = new u16(mb);
		for (; i < s; ++i) if (cd[i]) ++l[cd[i] - 1];
		var le = new u16(mb);
		for (i = 1; i < mb; ++i) le[i] = le[i - 1] + l[i - 1] << 1;
		var co;
		if (r) {
			co = new u16(1 << mb);
			var rvb = 15 - mb;
			for (i = 0; i < s; ++i) if (cd[i]) {
				var sv = i << 4 | cd[i];
				var r_1 = mb - cd[i];
				var v = le[cd[i] - 1]++ << r_1;
				for (var m = v | (1 << r_1) - 1; v <= m; ++v) co[rev[v] >> rvb] = sv;
			}
		} else {
			co = new u16(s);
			for (i = 0; i < s; ++i) if (cd[i]) co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
		}
		return co;
	});
	var flt = new u8(288);
	for (var i = 0; i < 144; ++i) flt[i] = 8;
	for (var i = 144; i < 256; ++i) flt[i] = 9;
	for (var i = 256; i < 280; ++i) flt[i] = 7;
	for (var i = 280; i < 288; ++i) flt[i] = 8;
	var fdt = new u8(32);
	for (var i = 0; i < 32; ++i) fdt[i] = 5;
	var flm = hMap(flt, 9, 0), fdm = hMap(fdt, 5, 0);
	var shft = function(p) {
		return (p + 7) / 8 | 0;
	};
	var slc = function(v, s, e) {
		if (s == null || s < 0) s = 0;
		if (e == null || e > v.length) e = v.length;
		return new u8(v.subarray(s, e));
	};
	var ec = [
		"unexpected EOF",
		"invalid block type",
		"invalid length/literal",
		"invalid distance",
		"stream finished",
		"no stream handler",
		,
		"no callback",
		"invalid UTF-8 data",
		"extra field too long",
		"date not in range 1980-2099",
		"filename too long",
		"stream finishing",
		"invalid zip data"
	];
	var err = function(ind, msg, nt) {
		var e = new Error(msg || ec[ind]);
		e.code = ind;
		if (Error.captureStackTrace) Error.captureStackTrace(e, err);
		if (!nt) throw e;
		return e;
	};
	var wbits = function(d, p, v) {
		v <<= p & 7;
		var o = p / 8 | 0;
		d[o] |= v;
		d[o + 1] |= v >> 8;
	};
	var wbits16 = function(d, p, v) {
		v <<= p & 7;
		var o = p / 8 | 0;
		d[o] |= v;
		d[o + 1] |= v >> 8;
		d[o + 2] |= v >> 16;
	};
	var hTree = function(d, mb) {
		var t = [];
		for (var i = 0; i < d.length; ++i) if (d[i]) t.push({
			s: i,
			f: d[i]
		});
		var s = t.length;
		var t2 = t.slice();
		if (!s) return {
			t: et,
			l: 0
		};
		if (s == 1) {
			var v = new u8(t[0].s + 1);
			v[t[0].s] = 1;
			return {
				t: v,
				l: 1
			};
		}
		t.sort(function(a, b) {
			return a.f - b.f;
		});
		t.push({
			s: -1,
			f: 25001
		});
		var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
		t[0] = {
			s: -1,
			f: l.f + r.f,
			l,
			r
		};
		while (i1 != s - 1) {
			l = t[t[i0].f < t[i2].f ? i0++ : i2++];
			r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
			t[i1++] = {
				s: -1,
				f: l.f + r.f,
				l,
				r
			};
		}
		var maxSym = t2[0].s;
		for (var i = 1; i < s; ++i) if (t2[i].s > maxSym) maxSym = t2[i].s;
		var tr = new u16(maxSym + 1);
		var mbt = ln(t[i1 - 1], tr, 0);
		if (mbt > mb) {
			var i = 0, dt = 0;
			var lft = mbt - mb, cst = 1 << lft;
			t2.sort(function(a, b) {
				return tr[b.s] - tr[a.s] || a.f - b.f;
			});
			for (; i < s; ++i) {
				var i2_1 = t2[i].s;
				if (tr[i2_1] > mb) {
					dt += cst - (1 << mbt - tr[i2_1]);
					tr[i2_1] = mb;
				} else break;
			}
			dt >>= lft;
			while (dt > 0) {
				var i2_2 = t2[i].s;
				if (tr[i2_2] < mb) dt -= 1 << mb - tr[i2_2]++ - 1;
				else ++i;
			}
			for (; i >= 0 && dt; --i) {
				var i2_3 = t2[i].s;
				if (tr[i2_3] == mb) {
					--tr[i2_3];
					++dt;
				}
			}
			mbt = mb;
		}
		return {
			t: new u8(tr),
			l: mbt
		};
	};
	var ln = function(n, l, d) {
		return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
	};
	var lc = function(c) {
		var s = c.length;
		while (s && !c[--s]);
		var cl = new u16(++s);
		var cli = 0, cln = c[0], cls = 1;
		var w = function(v) {
			cl[cli++] = v;
		};
		for (var i = 1; i <= s; ++i) if (c[i] == cln && i != s) ++cls;
		else {
			if (!cln && cls > 2) {
				for (; cls > 138; cls -= 138) w(32754);
				if (cls > 2) {
					w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
					cls = 0;
				}
			} else if (cls > 3) {
				w(cln), --cls;
				for (; cls > 6; cls -= 6) w(8304);
				if (cls > 2) w(cls - 3 << 5 | 8208), cls = 0;
			}
			while (cls--) w(cln);
			cls = 1;
			cln = c[i];
		}
		return {
			c: cl.subarray(0, cli),
			n: s
		};
	};
	var clen = function(cf, cl) {
		var l = 0;
		for (var i = 0; i < cl.length; ++i) l += cf[i] * cl[i];
		return l;
	};
	var wfblk = function(out, pos, dat) {
		var s = dat.length;
		var o = shft(pos + 2);
		out[o] = s & 255;
		out[o + 1] = s >> 8;
		out[o + 2] = out[o] ^ 255;
		out[o + 3] = out[o + 1] ^ 255;
		for (var i = 0; i < s; ++i) out[o + i + 4] = dat[i];
		return (o + 4 + s) * 8;
	};
	var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
		wbits(out, p++, final);
		++lf[256];
		var _a = hTree(lf, 15), dlt = _a.t, mlb = _a.l;
		var _b = hTree(df, 15), ddt = _b.t, mdb = _b.l;
		var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
		var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
		var lcfreq = new u16(19);
		for (var i = 0; i < lclt.length; ++i) ++lcfreq[lclt[i] & 31];
		for (var i = 0; i < lcdt.length; ++i) ++lcfreq[lcdt[i] & 31];
		var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
		var nlcc = 19;
		for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc);
		var flen = bl + 5 << 3;
		var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
		var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
		if (bs >= 0 && flen <= ftlen && flen <= dtlen) return wfblk(out, p, dat.subarray(bs, bs + bl));
		var lm, ll, dm, dl;
		wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
		if (dtlen < ftlen) {
			lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
			var llm = hMap(lct, mlcb, 0);
			wbits(out, p, nlc - 257);
			wbits(out, p + 5, ndc - 1);
			wbits(out, p + 10, nlcc - 4);
			p += 14;
			for (var i = 0; i < nlcc; ++i) wbits(out, p + 3 * i, lct[clim[i]]);
			p += 3 * nlcc;
			var lcts = [lclt, lcdt];
			for (var it = 0; it < 2; ++it) {
				var clct = lcts[it];
				for (var i = 0; i < clct.length; ++i) {
					var len = clct[i] & 31;
					wbits(out, p, llm[len]), p += lct[len];
					if (len > 15) wbits(out, p, clct[i] >> 5 & 127), p += clct[i] >> 12;
				}
			}
		} else lm = flm, ll = flt, dm = fdm, dl = fdt;
		for (var i = 0; i < li; ++i) {
			var sym = syms[i];
			if (sym > 255) {
				var len = sym >> 18 & 31;
				wbits16(out, p, lm[len + 257]), p += ll[len + 257];
				if (len > 7) wbits(out, p, sym >> 23 & 31), p += fleb[len];
				var dst = sym & 31;
				wbits16(out, p, dm[dst]), p += dl[dst];
				if (dst > 3) wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
			} else wbits16(out, p, lm[sym]), p += ll[sym];
		}
		wbits16(out, p, lm[256]);
		return p + ll[256];
	};
	var deo = new i32([
		65540,
		131080,
		131088,
		131104,
		262176,
		1048704,
		1048832,
		2114560,
		2117632
	]);
	var et = new u8(0);
	var dflt = function(dat, lvl, plvl, pre, post, st) {
		var s = st.z || dat.length;
		var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
		var w = o.subarray(pre, o.length - post);
		var lst = st.l;
		var pos = (st.r || 0) & 7;
		if (lvl) {
			if (pos) w[0] = st.r >> 3;
			var opt = deo[lvl - 1];
			var n = opt >> 13, c = opt & 8191;
			var msk_1 = (1 << plvl) - 1;
			var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
			var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
			var hsh = function(i) {
				return (dat[i] ^ dat[i + 1] << bs1_1 ^ dat[i + 2] << bs2_1) & msk_1;
			};
			var syms = new i32(25e3);
			var lf = new u16(288), df = new u16(32);
			var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
			for (; i + 2 < s; ++i) {
				var hv = hsh(i);
				var imod = i & 32767, pimod = head[hv];
				prev[imod] = pimod;
				head[hv] = imod;
				if (wi <= i) {
					var rem = s - i;
					if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
						pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
						li = lc_1 = eb = 0, bs = i;
						for (var j = 0; j < 286; ++j) lf[j] = 0;
						for (var j = 0; j < 30; ++j) df[j] = 0;
					}
					var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
					if (rem > 2 && hv == hsh(i - dif)) {
						var maxn = Math.min(n, rem) - 1;
						var maxd = Math.min(32767, i);
						var ml = Math.min(258, rem);
						while (dif <= maxd && --ch_1 && imod != pimod) {
							if (dat[i + l] == dat[i + l - dif]) {
								var nl = 0;
								for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl);
								if (nl > l) {
									l = nl, d = dif;
									if (nl > maxn) break;
									var mmd = Math.min(dif, nl - 2);
									var md = 0;
									for (var j = 0; j < mmd; ++j) {
										var ti = i - dif + j & 32767;
										var cd = ti - prev[ti] & 32767;
										if (cd > md) md = cd, pimod = ti;
									}
								}
							}
							imod = pimod, pimod = prev[imod];
							dif += imod - pimod & 32767;
						}
					}
					if (d) {
						syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
						var lin = revfl[l] & 31, din = revfd[d] & 31;
						eb += fleb[lin] + fdeb[din];
						++lf[257 + lin];
						++df[din];
						wi = i + l;
						++lc_1;
					} else {
						syms[li++] = dat[i];
						++lf[dat[i]];
					}
				}
			}
			for (i = Math.max(i, wi); i < s; ++i) {
				syms[li++] = dat[i];
				++lf[dat[i]];
			}
			pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
			if (!lst) {
				st.r = pos & 7 | w[pos / 8 | 0] << 3;
				pos -= 7;
				st.h = head, st.p = prev, st.i = i, st.w = wi;
			}
		} else {
			for (var i = st.w || 0; i < s + lst; i += 65535) {
				var e = i + 65535;
				if (e >= s) {
					w[pos / 8 | 0] = lst;
					e = s;
				}
				pos = wfblk(w, pos + 1, dat.subarray(i, e));
			}
			st.i = s;
		}
		return slc(o, 0, pre + shft(pos) + post);
	};
	var crct = (function() {
		var t = new Int32Array(256);
		for (var i = 0; i < 256; ++i) {
			var c = i, k = 9;
			while (--k) c = (c & 1 && -306674912) ^ c >>> 1;
			t[i] = c;
		}
		return t;
	})();
	var crc = function() {
		var c = -1;
		return {
			p: function(d) {
				var cr = c;
				for (var i = 0; i < d.length; ++i) cr = crct[cr & 255 ^ d[i]] ^ cr >>> 8;
				c = cr;
			},
			d: function() {
				return ~c;
			}
		};
	};
	var dopt = function(dat, opt, pre, post, st) {
		if (!st) {
			st = { l: 1 };
			if (opt.dictionary) {
				var dict = opt.dictionary.subarray(-32768);
				var newDat = new u8(dict.length + dat.length);
				newDat.set(dict);
				newDat.set(dat, dict.length);
				dat = newDat;
				st.w = dict.length;
			}
		}
		return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
	};
	var mrg = function(a, b) {
		var o = {};
		for (var k in a) o[k] = a[k];
		for (var k in b) o[k] = b[k];
		return o;
	};
	var wbytes = function(d, b, v) {
		for (; v; ++b) d[b] = v, v >>>= 8;
	};
	function deflateSync(data, opts) {
		return dopt(data, opts || {}, 0, 0);
	}
	var fltn = function(d, p, t, o) {
		for (var k in d) {
			var val = d[k], n = p + k, op = o;
			if (Array.isArray(val)) op = mrg(o, val[1]), val = val[0];
			if (ArrayBuffer.isView(val)) t[n] = [val, op];
			else {
				t[n += "/"] = [new u8(0), op];
				fltn(val, n, t, o);
			}
		}
	};
	var te = typeof TextEncoder != "undefined" && new TextEncoder();
	var td = typeof TextDecoder != "undefined" && new TextDecoder();
	try {
		td.decode(et, { stream: true });
	} catch (e) {}
	function strToU8(str, latin1) {
		if (latin1) {
			var ar_1 = new u8(str.length);
			for (var i = 0; i < str.length; ++i) ar_1[i] = str.charCodeAt(i);
			return ar_1;
		}
		if (te) return te.encode(str);
		var l = str.length;
		var ar = new u8(str.length + (str.length >> 1));
		var ai = 0;
		var w = function(v) {
			ar[ai++] = v;
		};
		for (var i = 0; i < l; ++i) {
			if (ai + 5 > ar.length) {
				var n = new u8(ai + 8 + (l - i << 1));
				n.set(ar);
				ar = n;
			}
			var c = str.charCodeAt(i);
			if (c < 128 || latin1) w(c);
			else if (c < 2048) w(192 | c >> 6), w(128 | c & 63);
			else if (c > 55295 && c < 57344) c = 65536 + (c & 1047552) | str.charCodeAt(++i) & 1023, w(240 | c >> 18), w(128 | c >> 12 & 63), w(128 | c >> 6 & 63), w(128 | c & 63);
			else w(224 | c >> 12), w(128 | c >> 6 & 63), w(128 | c & 63);
		}
		return slc(ar, 0, ai);
	}
	var exfl = function(ex) {
		var le = 0;
		if (ex) for (var k in ex) {
			var l = ex[k].length;
			if (l > 65535) err(9);
			le += l + 4;
		}
		return le;
	};
	var wzh = function(d, b, f, fn, u, c, ce, co) {
		var fl = fn.length, ex = f.extra, col = co && co.length;
		var exl = exfl(ex);
		wbytes(d, b, ce != null ? 33639248 : 67324752), b += 4;
		if (ce != null) d[b++] = 20, d[b++] = f.os;
		d[b] = 20, b += 2;
		d[b++] = f.flag << 1 | (c < 0 && 8), d[b++] = u && 8;
		d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
		var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
		if (y < 0 || y > 119) err(10);
		wbytes(d, b, y << 25 | dt.getMonth() + 1 << 21 | dt.getDate() << 16 | dt.getHours() << 11 | dt.getMinutes() << 5 | dt.getSeconds() >> 1), b += 4;
		if (c != -1) {
			wbytes(d, b, f.crc);
			wbytes(d, b + 4, c < 0 ? -c - 2 : c);
			wbytes(d, b + 8, f.size);
		}
		wbytes(d, b + 12, fl);
		wbytes(d, b + 14, exl), b += 16;
		if (ce != null) {
			wbytes(d, b, col);
			wbytes(d, b + 6, f.attrs);
			wbytes(d, b + 10, ce), b += 14;
		}
		d.set(fn, b);
		b += fl;
		if (exl) for (var k in ex) {
			var exf = ex[k], l = exf.length;
			wbytes(d, b, +k);
			wbytes(d, b + 2, l);
			d.set(exf, b + 4), b += 4 + l;
		}
		if (col) d.set(co, b), b += col;
		return b;
	};
	var wzf = function(o, b, c, d, e) {
		wbytes(o, b, 101010256);
		wbytes(o, b + 8, c);
		wbytes(o, b + 10, c);
		wbytes(o, b + 12, d);
		wbytes(o, b + 16, e);
	};
	function zipSync(data, opts) {
		if (!opts) opts = {};
		var r = {};
		var files = [];
		fltn(data, "", r, opts);
		var o = 0;
		var tot = 0;
		for (var fn in r) {
			var _a = r[fn], file = _a[0], p = _a[1];
			var compression = p.level == 0 ? 0 : 8;
			var f = strToU8(fn), s = f.length;
			var com = p.comment, m = com && strToU8(com), ms = m && m.length;
			var exl = exfl(p.extra);
			if (s > 65535) err(11);
			var d = compression ? deflateSync(file, p) : file, l = d.length;
			var c = crc();
			c.p(file);
			files.push(mrg(p, {
				size: file.length,
				crc: c.d(),
				c: d,
				f,
				m,
				u: s != fn.length || m && com.length != ms,
				o,
				compression
			}));
			o += 30 + s + exl + l;
			tot += 76 + 2 * (s + exl) + (ms || 0) + l;
		}
		var out = new u8(tot + 22), oe = o, cdl = tot - o;
		for (var i = 0; i < files.length; ++i) {
			var f = files[i];
			wzh(out, f.o, f, f.f, f.u, f.c.length);
			var badd = 30 + f.f.length + exfl(f.extra);
			out.set(f.c, f.o + badd);
			wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
		}
		wzf(out, o, files.length, cdl, oe);
		return out;
	}
	function buildZip(files) {
		const entries = {};
		for (const file of files) entries[file.name] = strToU8(file.content);
		return zipSync(entries, { level: 6 });
	}
	function downloadBytes(bytes, filename, type = "application/zip") {
		const blob = new Blob([bytes], { type });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}
	function parseDateInput(value, boundary) {
		const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
		if (!match) return null;
		const year = Number(match[1]);
		const month = Number(match[2]);
		const day = Number(match[3]);
		const date = boundary === "start" ? new Date(year, month - 1, day, 0, 0, 0, 0) : new Date(year, month - 1, day, 23, 59, 59, 999);
		return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date.getTime() : null;
	}
	function isInDateRange(conversation, field, range) {
		const date = field === "created" ? conversation.createdAt : conversation.updatedAt;
		if (!date) return range.from === null && range.to === null;
		const time = date.getTime();
		return (range.from === null || time >= range.from) && (range.to === null || time <= range.to);
	}
	function filterConversations(conversations, field, range) {
		return conversations.filter((conversation) => isInDateRange(conversation, field, range));
	}
	function dateTime(conversation, field) {
		const time = (field === "created" ? conversation.createdAt : conversation.updatedAt)?.getTime();
		return typeof time === "number" && Number.isFinite(time) ? time : null;
	}
	function filterAndSortConversations(conversations, field, range) {
		return filterConversations(conversations, field, range).sort((left, right) => {
			const leftTime = dateTime(left, field);
			const rightTime = dateTime(right, field);
			if (leftTime !== null && rightTime !== null && leftTime !== rightTime) return rightTime - leftTime;
			if (leftTime === null && rightTime !== null) return 1;
			if (leftTime !== null && rightTime === null) return -1;
			return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
		});
	}
	function hasInvertedRange(range) {
		return range.from !== null && range.to !== null && range.from > range.to;
	}
	function mountSelectionTrigger(target, onClick) {
		const existing = target.ownerDocument.querySelector("[data-cbe-selection-trigger=\"true\"]");
		if (existing?.isConnected) return existing;
		const button = target.ownerDocument.createElement("button");
		button.type = "button";
		button.className = "cbe-menu-item";
		button.dataset.cbeSelectionTrigger = "true";
		button.setAttribute("aria-label", "Exportar chats");
		button.innerHTML = "<span class=\"cbe-menu-icon\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\" focusable=\"false\"><path d=\"M12 3v12m0 0 4-4m-4 4-4-4\"/><path d=\"M5 14v5h14v-5\"/></svg></span><span class=\"cbe-menu-label\">Exportar chats</span>";
		button.addEventListener("click", () => onClick?.());
		target.prepend(button);
		return button;
	}
	function dateInput(document, label, key) {
		const wrapper = document.createElement("label");
		wrapper.className = "cbe-date-field";
		wrapper.append(document.createTextNode(label));
		const input = document.createElement("input");
		input.type = "date";
		input.dataset.cbeDate = key;
		wrapper.append(input);
		return wrapper;
	}
	function mountSidebar() {
		const target = findSidebarMountTarget();
		if (!target) return;
		let root = document.getElementById("cbe-root");
		if (root?.isConnected) return;
		const store = new SelectionStore();
		let controller = null;
		let indexController = null;
		let conversations = [];
		let historyState = "idle";
		let progress = {
			loaded: 0,
			total: null
		};
		let field = "updated";
		let filterOpen = false;
		root = document.createElement("div");
		root.id = "cbe-root";
		const overlay = document.createElement("div");
		overlay.className = "cbe-modal-overlay";
		overlay.hidden = true;
		overlay.dataset.cbeOverlay = "true";
		const popover = document.createElement("section");
		popover.className = "cbe-popover";
		popover.hidden = true;
		popover.dataset.cbePopover = "true";
		popover.setAttribute("role", "dialog");
		popover.setAttribute("aria-modal", "true");
		popover.setAttribute("aria-label", "Exportar chats");
		const header = document.createElement("div");
		header.className = "cbe-popover-header";
		const heading = document.createElement("strong");
		heading.textContent = "Exportar chats";
		const count = document.createElement("span");
		count.dataset.cbeCount = "true";
		const close = document.createElement("button");
		close.type = "button";
		close.className = "cbe-icon-button";
		close.setAttribute("aria-label", "Cerrar");
		close.textContent = "×";
		header.append(heading, count, close);
		const filterToggle = document.createElement("button");
		filterToggle.type = "button";
		filterToggle.className = "cbe-filter-toggle";
		filterToggle.setAttribute("aria-expanded", "false");
		filterToggle.innerHTML = "<span>Filtrar por fecha</span><span aria-hidden=\"true\">⌄</span>";
		const filterPanel = document.createElement("div");
		filterPanel.className = "cbe-filter-panel";
		filterPanel.hidden = true;
		const select = document.createElement("select");
		select.dataset.cbeDateField = "true";
		select.innerHTML = "<option value=\"updated\">Última actualización</option><option value=\"created\">Fecha de creación</option>";
		const fields = document.createElement("div");
		fields.className = "cbe-date-fields";
		fields.append(dateInput(document, "Desde", "from"), dateInput(document, "Hasta", "to"));
		const error = document.createElement("div");
		error.className = "cbe-filter-error";
		error.hidden = true;
		filterPanel.append(select, fields, error);
		const status = document.createElement("div");
		status.className = "cbe-index-status";
		const list = document.createElement("div");
		list.className = "cbe-filter-list";
		list.setAttribute("role", "list");
		list.setAttribute("aria-label", "Conversaciones disponibles");
		list.tabIndex = 0;
		const empty = document.createElement("div");
		empty.className = "cbe-empty";
		empty.hidden = true;
		const actions = document.createElement("div");
		actions.className = "cbe-selection-actions";
		const selectAll = document.createElement("button");
		selectAll.type = "button";
		selectAll.className = "cbe-secondary-button";
		selectAll.textContent = "Seleccionar visibles";
		const clear = document.createElement("button");
		clear.type = "button";
		clear.className = "cbe-secondary-button";
		clear.textContent = "Limpiar selección";
		actions.append(selectAll, clear);
		const footer = document.createElement("div");
		footer.className = "cbe-popover-footer";
		const cancel = document.createElement("button");
		cancel.type = "button";
		cancel.className = "cbe-secondary-button";
		cancel.textContent = "Cancelar";
		const exportButton = document.createElement("button");
		exportButton.type = "button";
		exportButton.className = "cbe-primary-button";
		footer.append(cancel, exportButton);
		popover.append(header, status, filterToggle, filterPanel, actions, list, empty, footer);
		root.append(overlay, popover);
		document.body.append(root);
		const range = () => ({
			from: parseDateInput(fields.querySelector("[data-cbe-date=\"from\"]")?.value || "", "start"),
			to: parseDateInput(fields.querySelector("[data-cbe-date=\"to\"]")?.value || "", "end")
		});
		const visibleLinks = () => findConversationLinks(document);
		const refresh = () => {
			const current = range();
			const invalid = hasInvertedRange(current);
			error.hidden = !invalid;
			error.textContent = invalid ? "Desde debe ser anterior o igual a Hasta." : "";
			count.textContent = `${store.size} seleccionado${store.size === 1 ? "" : "s"}`;
			exportButton.textContent = `Exportar (${store.size})`;
			exportButton.disabled = store.size === 0 || controller !== null;
			const filteringDisabled = historyState === "loading";
			select.disabled = filteringDisabled;
			fields.querySelectorAll("input").forEach((input) => {
				input.disabled = filteringDisabled;
			});
			const visible = historyState === "loading" ? [] : invalid ? [] : filterAndSortConversations(conversations, field, current);
			selectAll.disabled = visible.length === 0 || invalid || historyState === "loading";
			clear.disabled = store.size === 0;
			overlay.hidden = popover.hidden;
			list.replaceChildren();
			empty.hidden = historyState === "loading" || visible.length > 0;
			empty.textContent = invalid ? "Corrige el rango de fechas." : conversations.length === 0 ? "No hay chats disponibles." : "No hay chats que coincidan con este filtro.";
			if (historyState === "indexing") status.textContent = `Indexando fechas ${progress.loaded}/${progress.total ?? conversations.length}`;
			for (const conversation of visible) {
				const row = document.createElement("label");
				row.className = `cbe-filter-row${store.has(conversation.id) ? " is-selected" : ""}`;
				const input = document.createElement("input");
				input.type = "checkbox";
				input.className = "cbe-visually-hidden";
				input.checked = store.has(conversation.id);
				input.setAttribute("aria-label", `Seleccionar ${conversation.title}`);
				input.addEventListener("change", () => {
					input.checked ? store.add(conversation.id) : store.remove(conversation.id);
					refresh();
				});
				const mark = document.createElement("span");
				mark.className = "cbe-row-check";
				mark.setAttribute("aria-hidden", "true");
				const text = document.createElement("span");
				const title = document.createElement("strong");
				title.textContent = conversation.title;
				const date = document.createElement("small");
				const dateValue = field === "created" ? conversation.createdAt : conversation.updatedAt;
				date.textContent = `${field === "created" ? "Creado" : "Actualizado"}: ${formatDateTime(dateValue)}`;
				text.append(title, date);
				row.append(input, mark, text);
				list.append(row);
			}
			for (const link of visibleLinks()) decorateConversation(link.element, store.has(link.id), (checked) => {
				checked ? store.add(link.id) : store.remove(link.id);
				refresh();
			});
		};
		const startProgressiveIndex = (activeController) => {
			historyState = conversations.length ? "indexing" : "error";
			progress = {
				loaded: 0,
				total: conversations.length
			};
			status.textContent = conversations.length ? `Indexando fechas 0/${conversations.length}` : "No se encontraron chats. Abre o recarga el historial e inténtalo de nuevo.";
			refresh();
			if (!conversations.length) return;
			indexConversationDates({
				conversations,
				cache: tampermonkeyDateCache,
				fetchConversation,
				signal: activeController.signal,
				onUpdate: (updated) => {
					if (indexController !== activeController) return;
					conversations = conversations.map((chat) => chat.id === updated.id ? updated : chat);
					refresh();
				},
				onProgress: (value) => {
					if (indexController !== activeController) return;
					progress = value;
					refresh();
				}
			}).then(() => {
				if (indexController === activeController && !activeController.signal.aborted) {
					historyState = "ready";
					status.textContent = `${conversations.length} chats disponibles`;
					refresh();
				}
			}).catch((caught) => {
				if (!(caught instanceof DOMException && caught.name === "AbortError") && indexController === activeController) {
					historyState = "error";
					status.textContent = "No se pudieron indexar todas las fechas; los resultados disponibles siguen utilizables.";
					refresh();
				}
			});
		};
		const loadHistory = async () => {
			indexController?.abort();
			const activeController = new AbortController();
			indexController = activeController;
			historyState = "loading";
			conversations = [];
			progress = {
				loaded: 0,
				total: null
			};
			status.textContent = "Cargando historial…";
			refresh();
			try {
				conversations = await fetchConversationHistory({
					signal: activeController.signal,
					onProgress: (value) => {
						if (indexController !== activeController) return;
						progress = value;
						status.textContent = value.total === null ? `Cargando historial… ${value.loaded}` : `Cargando historial… ${value.loaded}/${value.total}`;
					}
				});
				if (indexController !== activeController) return;
				const hasIncompleteDates = conversations.some((chat) => !chat.createdAt || !chat.updatedAt);
				if (!conversations.length || hasIncompleteDates) {
					if (!conversations.length) conversations = visibleLinks();
					startProgressiveIndex(activeController);
				} else {
					historyState = "ready";
					status.textContent = `${conversations.length} chats disponibles`;
					refresh();
					indexController = null;
				}
			} catch (caught) {
				if (caught instanceof DOMException && caught.name === "AbortError") return;
				if (indexController !== activeController) return;
				conversations = visibleLinks();
				startProgressiveIndex(activeController);
			}
		};
		const exit = () => {
			controller?.abort();
			indexController?.abort();
			controller = null;
			indexController = null;
			store.clear();
			popover.hidden = true;
			overlay.hidden = true;
			filterOpen = false;
			filterPanel.hidden = true;
			filterToggle.setAttribute("aria-expanded", "false");
			for (const link of visibleLinks()) {
				link.element.querySelector("[data-cbe-checkbox]")?.remove();
				link.element.querySelector("[data-cbe-selection-marker]")?.remove();
				link.element.classList.remove("cbe-is-selected");
			}
			conversations = [];
			historyState = "idle";
			trigger.hidden = false;
			refresh();
		};
		const trigger = mountSelectionTrigger(target, () => {
			popover.hidden = false;
			overlay.hidden = false;
			trigger.hidden = true;
			trigger.setAttribute("aria-expanded", "true");
			popover.style.width = `${Math.min(390, window.innerWidth - 24)}px`;
			loadHistory();
		});
		trigger.setAttribute("aria-controls", "cbe-export-popover");
		popover.id = "cbe-export-popover";
		for (const eventName of [
			"pointerdown",
			"mousedown",
			"click",
			"touchstart"
		]) popover.addEventListener(eventName, (event) => event.stopPropagation());
		overlay.addEventListener("click", exit);
		close.addEventListener("click", exit);
		cancel.addEventListener("click", exit);
		filterToggle.addEventListener("click", () => {
			filterOpen = !filterOpen;
			filterPanel.hidden = !filterOpen;
			filterToggle.setAttribute("aria-expanded", String(filterOpen));
		});
		select.addEventListener("change", () => {
			field = select.value;
			refresh();
		});
		fields.addEventListener("input", refresh);
		selectAll.addEventListener("click", () => {
			for (const conversation of filterAndSortConversations(conversations, field, range())) store.add(conversation.id);
			refresh();
		});
		clear.addEventListener("click", () => {
			store.clear();
			refresh();
		});
		exportButton.addEventListener("click", async () => {
			if (!store.size) return;
			controller = new AbortController();
			refresh();
			try {
				const result = await exportBatch({
					conversationIds: store.ids,
					signal: controller.signal,
					fetchConversation,
					onProgress: (p) => {
						if (p.state === "fetching" || p.state === "rendering") count.textContent = `Exportando ${p.index} de ${p.total}`;
					},
					now: new Date()
				});
				if (!result.cancelled && result.files.length) {
					const stamp = new Date();
					const pad = (n) => String(n).padStart(2, "0");
					downloadBytes(buildZip(result.files), `ChatGPT-chats-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.zip`);
				}
			} finally {
				controller = null;
				exit();
			}
		});
		status.textContent = "Cargando historial…";
		refresh();
	}
	var styles = `#cbe-root{font-family:var(--font-sans,ui-sans-serif);color:var(--text-primary,#202123);font-size:13px;position:fixed;inset:0;z-index:10000;pointer-events:none;box-sizing:border-box}#cbe-root *{box-sizing:border-box}#cbe-root button,#cbe-root input,#cbe-root select{font:inherit}#cbe-root button{border:0;color:inherit;cursor:pointer}#cbe-root button:disabled{cursor:default;opacity:.5}#cbe-root>.cbe-popover{pointer-events:auto}#cbe-root button:focus-visible,#cbe-root input:focus-visible,#cbe-root select:focus-visible{outline:2px solid var(--text-secondary,#888);outline-offset:2px}.cbe-menu-item{display:flex!important;align-items:center;width:100%;min-height:40px;padding:8px 12px!important;gap:10px;border-radius:10px;background:transparent!important;text-align:left}.cbe-menu-item:hover{background:var(--interactive-bg-secondary-hover,#f1f1f1)!important}.cbe-menu-icon{display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center;color:var(--text-secondary,#666);flex:0 0 20px}.cbe-menu-icon svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.cbe-menu-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cbe-modal-overlay{position:fixed;inset:0;z-index:0;background:#0003;pointer-events:auto}.cbe-popover{position:fixed;z-index:1;top:50%;left:50%;transform:translate(-50%,-50%);width:min(390px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:hidden;display:flex;flex-direction:column;padding:16px;border:1px solid var(--border-light,#ddd);border-radius:14px;background:var(--bg-primary,#fff);box-shadow:0 10px 30px #0002}.cbe-popover-header{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;padding:2px 2px 10px}.cbe-popover-header strong{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cbe-popover-header [data-cbe-count]{white-space:nowrap;color:var(--text-secondary,#666);font-size:12px}.cbe-icon-button{width:28px;height:28px;border-radius:7px;background:transparent!important;color:var(--text-secondary,#666)!important;font-size:20px;line-height:1}.cbe-icon-button:hover{background:var(--interactive-bg-secondary-hover,#f1f1f1)!important}.cbe-index-status{font-size:11px;line-height:1.4;color:var(--text-secondary,#666);padding:0 2px 8px}.cbe-index-status.is-error{color:var(--text-error,#b42318)}.cbe-filter-toggle{display:flex;justify-content:space-between;align-items:center;width:100%;min-height:34px;padding:7px 9px;border-radius:8px;background:var(--bg-secondary,#f7f7f8)!important;text-align:left}.cbe-filter-panel{padding-top:8px}.cbe-filter-panel select,.cbe-date-field input{width:100%;min-height:36px;padding:7px 9px;border:1px solid var(--border-light,#ddd);border-radius:8px;background:var(--bg-primary,#fff);color:inherit;font-size:12px}.cbe-date-fields{display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px}.cbe-date-field{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-secondary,#666)}.cbe-filter-error{padding-top:6px;color:var(--text-error,#b42318);font-size:11px}.cbe-selection-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px}.cbe-secondary-button,.cbe-primary-button{min-height:32px;padding:6px 9px;border-radius:8px;background:var(--bg-secondary,#f7f7f8)!important;font-size:12px}.cbe-primary-button{background:var(--interactive-bg-primary,#000)!important;color:var(--text-on-color,#fff)!important}.cbe-filter-list{min-height:0;flex:1 1 auto;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable;touch-action:pan-y;margin:8px -4px 0}.cbe-filter-row{display:flex;align-items:center;gap:8px;min-height:48px;padding:6px 8px;border-radius:8px;cursor:pointer}.cbe-filter-row:hover,.cbe-filter-row.is-selected{background:var(--bg-secondary,#f7f7f8)}.cbe-filter-row>span:last-child{min-width:0;display:flex;flex-direction:column;gap:2px}.cbe-filter-row strong,.cbe-filter-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cbe-filter-row small{color:var(--text-secondary,#666);font-size:11px}.cbe-row-check,.cbe-selection-marker{width:16px;height:16px;flex:0 0 16px;border:1px solid var(--border-medium,#999);border-radius:4px}.cbe-filter-row.is-selected .cbe-row-check,.cbe-is-selected .cbe-selection-marker{background:var(--interactive-bg-primary,#000);border-color:var(--interactive-bg-primary,#000)}.cbe-empty{padding:24px 8px;text-align:center;color:var(--text-secondary,#666);font-size:12px}.cbe-popover-footer{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-top:10px}.cbe-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important}.cbe-selection-marker{display:inline-block;margin-right:6px;vertical-align:middle}.cbe-is-selected{background:var(--bg-secondary,#f7f7f8)}`;
	function start() {
		const style = document.createElement("style");
		style.dataset.cbeStyles = "true";
		style.textContent = styles;
		document.head.append(style);
		let scheduled = false;
		let sidebarObserver = null;
		let observedAside = null;
		const refresh = () => {
			scheduled = false;
			mountSidebar();
			const aside = document.querySelector("aside");
			if (aside !== observedAside) {
				sidebarObserver?.disconnect();
				observedAside = aside;
				if (aside) {
					sidebarObserver = new MutationObserver(schedule);
					sidebarObserver.observe(aside, {
						childList: true,
						subtree: true
					});
				}
			}
		};
		const schedule = () => {
			if (!scheduled) {
				scheduled = true;
				queueMicrotask(refresh);
			}
		};
		new MutationObserver(schedule).observe(document.body, {
			childList: true,
			subtree: true
		});
		refresh();
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
	else start();
})();
