// ==UserScript==
// @name         SRI - Comprobantes sincronizados manual
// @namespace    https://github.com/AndresGaibor/userscripts
// @version      2026.6.12.14
// @author       Andres
// @description  Consulta API local, filtra meses, revisa TXT bajo demanda, pagina y descarga comprobantes recibidos en modo manual.
// @icon         https://www.google.com/s2/favicons?sz=64&domain=srienlinea.sri.gob.ec
// @supportURL   https://github.com/AndresGaibor/tampermonkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/sri-comprobantes.user.js
// @updateURL    https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/sri-comprobantes.user.js
// @match        https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/pages/consultas/recibidos/comprobantesRecibidos.jsf*
// @connect      localhost
// @connect      127.0.0.1
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function() {
	"use strict";
	function debounce(fn, delayMs) {
		let timer = null;
		return (...args) => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => fn(...args), delayMs);
		};
	}
	function onlyDigits(value) {
		return String(value ?? "").replace(/\D/g, "");
	}
	function normalizeSpaces(value) {
		return String(value ?? "").replace(/\s+/g, " ").trim();
	}
	function normalizeText(value) {
		return normalizeSpaces(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
	}
	function escapeHtml(value) {
		return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#039;");
	}
	function buildTableIndexes(headers) {
		const normalizedHeaders = headers.map((header) => normalizeText(header));
		const findHeader = (...needles) => {
			const index = normalizedHeaders.findIndex((text) => needles.some((needle) => text.includes(needle)));
			return index >= 0 ? index : null;
		};
		return {
			type: findHeader("tipo y serie") ?? 2,
			access: findHeader("clave de acceso", "autorizacion") ?? 3,
			xml: findHeader("documento") ?? 9,
			pdf: findHeader("ride") ?? 10
		};
	}
	function extractAccessKeyFromText(text) {
		const accessKeyMatch = text.match(/\b\d{49}\b/);
		return accessKeyMatch ? accessKeyMatch[0] : null;
	}
	function extractDocumentNumberFromTypeText(text) {
		const docMatch = normalizeSpaces(text).match(/(\d{3})\s*-\s*(\d{3})\s*-\s*(\d{9})/);
		if (!docMatch) return null;
		return `${docMatch[1]}${docMatch[2]}${docMatch[3]}`;
	}
	function shouldTreatAsDownloaded(invoice, config) {
		const xmlAvailable = String(invoice.xml_status ?? "").toLowerCase() === "available";
		const pdfValue = String(invoice.pdf_status ?? "").toLowerCase();
		const pdfOk = pdfValue !== "" && pdfValue !== "missing";
		return Boolean(invoice.downloaded === true || config.hideWhenXmlIsAvailable && xmlAvailable || xmlAvailable && pdfOk);
	}
	function buildPaginationSignature(currentText, tableText, timestamp = Date.now()) {
		const current = normalizeSpaces(currentText || "");
		if (current) return current;
		if (tableText == null) return "sin-tabla";
		return normalizeSpaces(tableText || "").match(/\b\d{49}\b/)?.[0] || `pagina-${timestamp}`;
	}
	function getCurrentPageRuc(document, receiverRucOverride) {
		if (receiverRucOverride) return onlyDigits(receiverRucOverride);
		const directInput = document.getElementById("frmPrincipal:txtParametro");
		if (directInput?.value) {
			const value = onlyDigits(directInput.value);
			if (value.length >= 10) return value;
		}
		const input = document.querySelector("input[id$=\"txtParametro\"]") || document.querySelector("input[name$=\"txtParametro\"]") || document.querySelector("input.sri-input-txt-paramtero");
		if (input?.value) {
			const value = onlyDigits(input.value);
			if (value.length >= 10) return value;
		}
		const topbarRuc = document.querySelector(".area-usuario-blue span");
		if (topbarRuc?.textContent) {
			const match = topbarRuc.textContent.match(/\b\d{10,13}\b/);
			if (match) return onlyDigits(match[0]);
		}
		return null;
	}
	function toApiReceiverRuc(value, sendReceiverAsBase10WhenEnds001) {
		const digits = onlyDigits(value || "");
		if (sendReceiverAsBase10WhenEnds001 && digits.length === 13 && digits.endsWith("001")) return digits.slice(0, 10);
		return digits;
	}
	function getSelectedYear(document) {
		const select = document.getElementById("frmPrincipal:ano");
		return select?.value ? Number(select.value) : null;
	}
	function getSelectedMonth(document) {
		const select = document.getElementById("frmPrincipal:mes");
		return select?.value ? Number(select.value) : null;
	}
	function getSelectedDay(document) {
		const select = document.getElementById("frmPrincipal:dia");
		return select?.value ? Number(select.value) : 0;
	}
	function getSelectedDocumentType(document) {
		const select = document.getElementById("frmPrincipal:cmbTipoComprobante");
		return select ? String(select.value || "") : "";
	}
	function buildCurrentPeriodsKey(options) {
		const receiverRuc = options.pageRuc ? toApiReceiverRuc(options.pageRuc, options.sendReceiverAsBase10WhenEnds001) : null;
		if (!receiverRuc || !options.year || !options.documentType) return null;
		return `${receiverRuc}:${options.year}:${options.documentType}`;
	}
	function getTableIndexes(tbody) {
		const table = tbody.closest("table");
		return buildTableIndexes((table ? Array.from(table.querySelectorAll("thead th")) : []).map((th) => th.textContent ?? ""));
	}
	function extractRowData(row, indexes) {
		const cells = Array.from(row.children);
		const typeCell = cells[indexes.type] || cells[2] || null;
		const accessCell = cells[indexes.access] || cells[3] || null;
		return {
			row,
			cells,
			typeCell,
			accessCell,
			xmlCell: cells[indexes.xml] || cells[9] || null,
			pdfCell: cells[indexes.pdf] || cells[10] || null,
			accessKey: extractAccessKeyFromText(accessCell ? accessCell.textContent || "" : row.textContent || ""),
			documentNumber: typeCell ? extractDocumentNumberFromTypeText(typeCell.textContent || "") : null
		};
	}
	function getPaginationSignature() {
		const current = document.querySelector(".ui-paginator-current") || document.querySelector("[class*=\"ui-paginator-current\"]");
		const tbody = findComprobantesTbody();
		const tableText = tbody ? Array.from(tbody.querySelectorAll("tr")).map((row) => row.textContent || "").join(" ") : null;
		return buildPaginationSignature(current?.textContent || "", tableText);
	}
	function findComprobantesTbody() {
		return document.getElementById("frmPrincipal:tablaCompRecibidos_data") || document.querySelector("tbody[id$=\"tablaCompRecibidos_data\"]") || document.querySelector("#frmPrincipal\\:panelListaComprobantes tbody.ui-datatable-data");
	}
	function findNextPageButton() {
		return Array.from(document.querySelectorAll(".ui-paginator-next, [class*=\"ui-paginator-next\"]")).find((element) => {
			return !((element.className || "").includes("ui-state-disabled") || element.getAttribute("aria-disabled") === "true") && getComputedStyle(element).display !== "none";
		}) || null;
	}
	function getCurrentPeriodsKey(CONFIG) {
		const pageRuc = getCurrentPageRuc(document, CONFIG.RECEIVER_RUC_OVERRIDE);
		const year = getSelectedYear(document);
		const documentType = getSelectedDocumentType(document);
		return buildCurrentPeriodsKey({
			pageRuc,
			receiverRucOverride: CONFIG.RECEIVER_RUC_OVERRIDE,
			sendReceiverAsBase10WhenEnds001: CONFIG.SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001,
			year,
			documentType
		});
	}
	function resetMonthVisibility(state, updateDashboardStats) {
		const monthSelect = document.getElementById("frmPrincipal:mes");
		if (!monthSelect) return;
		for (const option of Array.from(monthSelect.options)) {
			option.hidden = false;
			option.disabled = false;
			option.title = "";
			option.dataset.tmSriHidden = "false";
		}
		state.hiddenMonthsCount = 0;
		updateDashboardStats();
	}
	function applyMonthVisibility(state, CONFIG, getCurrentPeriodsKeyFn, resetMonthVisibilityFn, updateDashboardStats) {
		const monthSelect = document.getElementById("frmPrincipal:mes");
		if (!monthSelect) return;
		const currentKey = getCurrentPeriodsKeyFn();
		if (!currentKey || !state.periodData || !state.periodDataKey || state.periodDataKey !== currentKey || state.monthsByNumber.size === 0) {
			resetMonthVisibilityFn();
			return;
		}
		const selectedMonth = Number(monthSelect.value);
		let hiddenCount = 0;
		for (const option of Array.from(monthSelect.options)) {
			const monthNumber = Number(option.value);
			const metadata = state.monthsByNumber.get(monthNumber);
			if (!metadata) {
				option.hidden = false;
				option.disabled = false;
				option.title = "";
				option.dataset.tmSriHidden = "false";
				continue;
			}
			let shouldHide = Boolean(metadata.can_hide);
			if (CONFIG.NEVER_HIDE_SELECTED_MONTH && monthNumber === selectedMonth) shouldHide = false;
			option.hidden = shouldHide;
			option.disabled = shouldHide;
			option.dataset.tmSriHidden = shouldHide ? "true" : "false";
			option.title = `Estado: ${metadata.status || "-"}. Total: ${metadata.total ?? 0}. Descargadas: ${metadata.downloaded ?? 0}. Pendientes: ${metadata.missing ?? 0}.`;
			if (shouldHide) hiddenCount++;
		}
		state.hiddenMonthsCount = hiddenCount;
		updateDashboardStats();
	}
	var CONFIG = {
		API_BASE: "http://localhost:3000",
		API_INVOICES_PATH: "/api/tampermonkey/invoices",
		API_PERIODS_PATH: "/api/tampermonkey/periods",
		API_REPORT_STATUS_PATH: "/api/tampermonkey/report-status",
		API_STATUS: "all",
		SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001: true,
		RECEIVER_RUC_OVERRIDE: "",
		DEFAULT_VIEW_FILTER: "missing",
		HIDE_WHEN_XML_IS_AVAILABLE: false,
		MARK_UNKNOWN_ROWS: false,
		APPLY_INTERVAL_MS: 2500,
		OBSERVER_DEBOUNCE_MS: 350,
		REFRESH_AFTER_MANUAL_CONSULTAR_MS: [
			1500,
			4e3,
			8e3
		],
		REFRESH_AFTER_DOWNLOAD_MS: [
			3e3,
			8e3,
			15e3
		],
		AUTO_DOWNLOAD_XML: true,
		AUTO_DOWNLOAD_PDF: false,
		DOWNLOAD_DELAY_MS: 5500,
		MAX_BATCH_DOWNLOADS_PER_PAGE: 200,
		PAGINATION_DELAY_MS: 4500,
		PAGE_AFTER_QUEUE_DELAY_MS: 2500,
		MAX_PAGES_PER_BATCH: 30,
		HIDE_MONTHS_USING_API: true,
		NEVER_HIDE_SELECTED_MONTH: true
	};
	var state = {
		pageRuc: null,
		receiverRuc: null,
		periodDataKey: null,
		apiData: null,
		periodData: null,
		reportStatusData: null,
		byAccessKey: new Map(),
		byDocumentNumber: new Map(),
		monthsByNumber: new Map(),
		viewFilter: GM_getValue("viewFilter", CONFIG.DEFAULT_VIEW_FILTER),
		compactMode: GM_getValue("compactMode", false),
		isRefreshingInvoices: false,
		isRefreshingPeriods: false,
		isRefreshingReportStatus: false,
		isDownloadingTxtReport: false,
		isBatchDownloading: false,
		batchAcrossPages: false,
		batchDownloadedCount: 0,
		batchQueueTotal: 0,
		batchPageCount: 0,
		batchVisitedPages: new Set(),
		lastInvoicesUrl: null,
		lastPeriodsUrl: null,
		lastReportStatusUrl: null,
		lastInvoicesRefreshAt: null,
		lastPeriodsRefreshAt: null,
		lastReportStatusAt: null,
		lastInvoicesError: null,
		lastPeriodsError: null,
		lastReportStatusError: null,
		hiddenMonthsCount: 0,
		lastPageStats: {
			rows: 0,
			downloaded: 0,
			missing: 0,
			unknown: 0,
			hidden: 0
		}
	};
	function isAvailable(status) {
		return String(status ?? "").toLowerCase() === "available";
	}
	function isPdfOk(status) {
		const value = String(status ?? "").toLowerCase();
		return value !== "" && value !== "missing";
	}
	function injectStyles() {
		const style = document.createElement("style");
		style.textContent = `
    #tm-sri-dashboard {
      margin: 14px 0 18px 0;
      padding: 14px;
      border: 1px solid #d0d7de;
      border-radius: 10px;
      background: #ffffff;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
      font-family: Arial, sans-serif;
      color: #24292f;
    }

    .tm-sri-dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }

    .tm-sri-dashboard-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 3px;
    }

    .tm-sri-dashboard-message {
      font-size: 12px;
      color: #57606a;
      line-height: 1.4;
    }

    .tm-sri-dashboard-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .tm-sri-status-pill {
      display: inline-block;
      padding: 5px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }

    .tm-sri-status-loading {
      background: #ddf4ff;
      color: #0969da;
    }

    .tm-sri-status-success {
      background: #dafbe1;
      color: #1a7f37;
    }

    .tm-sri-status-warning {
      background: #fff8c5;
      color: #9a6700;
    }

    .tm-sri-status-error {
      background: #ffebe9;
      color: #cf222e;
    }

    .tm-sri-stats-grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(90px, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }

    .tm-sri-stat {
      border: 1px solid #d8dee4;
      border-radius: 8px;
      padding: 8px;
      background: #f6f8fa;
      min-height: 48px;
    }

    .tm-sri-stat span {
      display: block;
      font-size: 11px;
      color: #57606a;
      margin-bottom: 4px;
    }

    .tm-sri-stat strong {
      display: block;
      font-size: 18px;
      color: #24292f;
    }

    .tm-sri-meta {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      font-size: 12px;
      color: #57606a;
    }

    .tm-sri-dashboard-actions {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 12px;
    }

    .tm-sri-filter-group {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .tm-sri-btn {
      cursor: pointer;
      border: 1px solid #0969da;
      background: #ffffff;
      color: #0969da;
      border-radius: 7px;
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .tm-sri-btn-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1em;
      font-size: 12px;
      line-height: 1;
    }

    .tm-sri-btn-label {
      line-height: 1;
    }

    .tm-sri-btn:hover:not(:disabled) {
      background: #ddf4ff;
    }

    .tm-sri-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .tm-sri-btn-primary,
    .tm-sri-btn-active {
      background: #0969da;
      color: #ffffff;
    }

    .tm-sri-btn-secondary {
      border-color: #8c959f;
      color: #57606a;
    }

    .tm-sri-btn-danger {
      border-color: #cf222e;
      color: #cf222e;
    }

    .tm-sri-btn-danger:hover:not(:disabled) {
      background: #ffebe9;
    }

    .tm-sri-btn-txt {
      border-color: #8250df;
      color: #8250df;
    }

    .tm-sri-btn-txt:hover:not(:disabled) {
      background: #fbefff;
    }

    .tm-sri-dashboard-compact {
      padding: 10px 12px;
    }

    .tm-sri-dashboard-compact .tm-sri-dashboard-body,
    .tm-sri-dashboard-compact .tm-sri-dashboard-actions {
      display: none;
    }

    .tm-sri-dashboard-compact .tm-sri-dashboard-header {
      margin-bottom: 0;
    }

    .tm-sri-row-downloaded {
      background: #dafbe1 !important;
      opacity: 0.75;
    }

    .tm-sri-row-missing {
      background: #fff8c5 !important;
    }

    .tm-sri-row-unknown {
      background: #f6f8fa !important;
    }

    .tm-sri-row-processing {
      outline: 2px solid #0969da !important;
      outline-offset: -2px;
    }

    .tm-sri-row-hidden {
      display: none !important;
    }

    .tm-sri-row-badge {
      display: inline-block;
      margin-top: 4px;
      padding: 3px 7px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
    }

    .tm-sri-badge-downloaded {
      background: #1a7f37;
      color: #ffffff;
    }

    .tm-sri-badge-missing {
      background: #bf8700;
      color: #ffffff;
    }

    .tm-sri-badge-unknown {
      background: #6e7781;
      color: #ffffff;
    }

    .tm-sri-badge-processing {
      background: #0969da;
      color: #ffffff;
    }

    .tm-sri-file-badge {
      display: inline-block;
      padding: 4px 7px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }

    .tm-sri-file-downloaded {
      background: #1a7f37;
      color: #ffffff;
    }

    @media (max-width: 900px) {
      .tm-sri-stats-grid {
        grid-template-columns: repeat(2, minmax(120px, 1fr));
      }

      .tm-sri-dashboard-header,
      .tm-sri-dashboard-actions {
        align-items: stretch;
        flex-direction: column;
      }

      .tm-sri-dashboard-header-actions,
      .tm-sri-filter-group {
        justify-content: flex-start;
      }
    }
  `;
		document.head.appendChild(style);
	}
	function updateDashboardStats() {
		ensureDashboardMounted();
		const summary = state.apiData?.summary;
		const page = state.lastPageStats;
		const report = state.reportStatusData;
		updateStatsGrid(summary, page);
		updateMetaContainer(summary, page, report);
		updateFilterButtons();
		updateCompactButton();
		updateBatchButtons();
		updateTxtButtons();
	}
	function updateStatsGrid(summary, page) {
		const grid = document.getElementById("tm-sri-stats-grid");
		if (!grid) return;
		grid.innerHTML = `
    <div class="tm-sri-stat">
      <span>Total API</span>
      <strong>${summary?.total ?? "-"}</strong>
    </div>
    <div class="tm-sri-stat">
      <span>Descargadas API</span>
      <strong>${summary?.downloaded ?? "-"}</strong>
    </div>
    <div class="tm-sri-stat">
      <span>Pendientes API</span>
      <strong>${summary?.missing ?? "-"}</strong>
    </div>
    <div class="tm-sri-stat">
      <span>Filas página</span>
      <strong>${page.rows ?? 0}</strong>
    </div>
    <div class="tm-sri-stat">
      <span>Ocultas</span>
      <strong>${page.hidden ?? 0}</strong>
    </div>
    <div class="tm-sri-stat">
      <span>No cruzadas</span>
      <strong>${page.unknown ?? 0}</strong>
    </div>
  `;
	}
	function updateMetaContainer(summary, page, report) {
		const container = document.getElementById("tm-sri-meta-container");
		if (!container) return;
		const txtStatus = report ? `${escapeHtml(report.status || "-")} | ${report.should_download_txt ? "descargar" : "ok"} | ${escapeHtml(report.reason || "-")}` : state.lastReportStatusError ? `error: ${escapeHtml(state.lastReportStatusError)}` : "-";
		const refreshTime = state.lastInvoicesRefreshAt ? state.lastInvoicesRefreshAt.toLocaleTimeString() : "-";
		const batchStatus = state.isBatchDownloading ? `${state.batchDownloadedCount}/${state.batchQueueTotal} | páginas: ${state.batchPageCount}` : "Inactivo";
		container.innerHTML = `
    <span><strong>RUC pantalla:</strong> <span>${escapeHtml(state.pageRuc || "-")}</span></span>
    <span><strong>receiverRuc API:</strong> <span>${escapeHtml(state.receiverRuc || "-")}</span></span>
    <span><strong>Periodo:</strong> <span>${escapeHtml(`${page.rows} / - / día -`)}</span></span>
    <span><strong>Meses ocultos:</strong> <span>${state.hiddenMonthsCount}</span></span>
    <span><strong>TXT:</strong> <span>${txtStatus}</span></span>
    <span><strong>Última API:</strong> <span>${refreshTime}</span></span>
    <span><strong>Lote:</strong> <span>${batchStatus}</span></span>
  `;
	}
	function updateFilterButtons() {
		const buttons = document.querySelectorAll(".tm-sri-filter-btn");
		for (const button of buttons) {
			const filter = button.getAttribute("data-filter");
			button.classList.toggle("tm-sri-btn-active", filter === state.viewFilter);
		}
	}
	function updateCompactButton() {
		const button = document.getElementById("tm-sri-compact-btn");
		if (button) {
			const label = button.querySelector(".tm-sri-btn-label");
			if (label) label.textContent = state.compactMode ? "Expandir" : "Minimizar";
		}
	}
	function updateBatchButtons() {
		const downloadPageButton = document.getElementById("tm-sri-download-page-btn");
		const downloadAllButton = document.getElementById("tm-sri-download-all-pages-btn");
		const stopButton = document.getElementById("tm-sri-stop-download-btn");
		if (downloadPageButton) {
			downloadPageButton.disabled = state.isBatchDownloading;
			const label = downloadPageButton.querySelector(".tm-sri-btn-label");
			if (label) label.textContent = state.isBatchDownloading ? "Descargando..." : "Descargar página";
		}
		if (downloadAllButton) {
			downloadAllButton.disabled = state.isBatchDownloading;
			const label = downloadAllButton.querySelector(".tm-sri-btn-label");
			if (label) label.textContent = state.isBatchDownloading ? "Descargando..." : "Descargar todas páginas";
		}
		if (stopButton) stopButton.disabled = !state.isBatchDownloading;
	}
	function updateTxtButtons() {
		const smartButton = document.getElementById("tm-sri-smart-txt-btn");
		const forceButton = document.getElementById("tm-sri-force-txt-btn");
		if (smartButton) {
			smartButton.disabled = state.isDownloadingTxtReport;
			const label = smartButton.querySelector(".tm-sri-btn-label");
			if (label) label.textContent = state.isDownloadingTxtReport ? "TXT descargando..." : "TXT inteligente";
		}
		if (forceButton) forceButton.disabled = state.isDownloadingTxtReport;
	}
	function getStatusLabel(status) {
		return {
			loading: "Cargando",
			success: "Conectado",
			warning: "Atención",
			error: "Error"
		}[status] || status;
	}
	function buttonLabel(icon, text) {
		return `<span class="tm-sri-btn-icon" aria-hidden="true">${icon}</span><span class="tm-sri-btn-label">${text}</span>`;
	}
	function ensureDashboardMounted() {
		const existing = document.getElementById("tm-sri-dashboard");
		if (existing && existing.isConnected) {
			existing.classList.toggle("tm-sri-dashboard-compact", Boolean(state.compactMode));
			return existing;
		}
		const dashboard = createDashboardElement();
		const mountTarget = findDashboardMountTarget();
		if (mountTarget.mode === "after" && mountTarget.reference?.parentNode) mountTarget.reference.parentNode.insertBefore(dashboard, mountTarget.reference.nextSibling);
		else if (mountTarget.mode === "before" && mountTarget.reference?.parentNode) mountTarget.reference.parentNode.insertBefore(dashboard, mountTarget.reference);
		else if (mountTarget.element) mountTarget.element.prepend(dashboard);
		else document.body.prepend(dashboard);
		updateFilterButtons();
		updateCompactButton();
		updateBatchButtons();
		updateTxtButtons();
		updateDashboardStats();
		return dashboard;
	}
	function findDashboardMountTarget() {
		const searchPanel = document.getElementById("frmPrincipal:pnlBusqueda");
		const pnlDocumentos = document.getElementById("frmPrincipal:pnldocumentosrecibidos");
		const tableWrapper = document.getElementById("frmPrincipal:tablaCompRecibidos");
		const panelLista = document.getElementById("frmPrincipal:panelListaComprobantes");
		if (searchPanel) return {
			mode: "after",
			reference: searchPanel
		};
		if (pnlDocumentos) return {
			mode: "before",
			reference: pnlDocumentos
		};
		if (tableWrapper) return {
			mode: "before",
			reference: tableWrapper
		};
		if (panelLista) return {
			mode: "prepend",
			element: panelLista
		};
		return {
			mode: "prepend",
			element: document.body
		};
	}
	function createDashboardElement() {
		const wrapper = document.createElement("div");
		wrapper.innerHTML = `
    <div id="tm-sri-dashboard" class="tm-sri-dashboard${state.compactMode ? " tm-sri-dashboard-compact" : ""}">
      <div class="tm-sri-dashboard-header">
        <div>
          <div class="tm-sri-dashboard-title">Comprobantes SRI sincronizados</div>
          <div id="tm-sri-dashboard-message" class="tm-sri-dashboard-message">Inicializando...</div>
        </div>

        <div class="tm-sri-dashboard-header-actions">
          <span id="tm-sri-status-pill" class="tm-sri-status-pill tm-sri-status-loading">Cargando</span>
          <button id="tm-sri-compact-btn" type="button" class="tm-sri-btn tm-sri-btn-secondary">${buttonLabel("▾", "Minimizar")}</button>
        </div>
      </div>

      <div class="tm-sri-dashboard-body">
        <div id="tm-sri-stats-grid" class="tm-sri-stats-grid">
          <div class="tm-sri-stat">
            <span>Total API</span>
            <strong class="tm-sri-stat-val" data-stat="total-api">-</strong>
          </div>
          <div class="tm-sri-stat">
            <span>Descargadas API</span>
            <strong class="tm-sri-stat-val" data-stat="downloaded-api">-</strong>
          </div>
          <div class="tm-sri-stat">
            <span>Pendientes API</span>
            <strong class="tm-sri-stat-val" data-stat="missing-api">-</strong>
          </div>
          <div class="tm-sri-stat">
            <span>Filas página</span>
            <strong class="tm-sri-stat-val" data-stat="page-rows">-</strong>
          </div>
          <div class="tm-sri-stat">
            <span>Ocultas</span>
            <strong class="tm-sri-stat-val" data-stat="hidden">-</strong>
          </div>
          <div class="tm-sri-stat">
            <span>No cruzadas</span>
            <strong class="tm-sri-stat-val" data-stat="unknown">-</strong>
          </div>
        </div>

        <div id="tm-sri-meta-container" class="tm-sri-meta">
          <span><strong>RUC pantalla:</strong> <span class="tm-sri-meta-val" data-meta="page-ruc">-</span></span>
          <span><strong>receiverRuc API:</strong> <span class="tm-sri-meta-val" data-meta="receiver-ruc">-</span></span>
          <span><strong>Periodo:</strong> <span class="tm-sri-meta-val" data-meta="period">-</span></span>
          <span><strong>Meses ocultos:</strong> <span class="tm-sri-meta-val" data-meta="hidden-months">-</span></span>
          <span><strong>TXT:</strong> <span class="tm-sri-meta-val" data-meta="txt">-</span></span>
          <span><strong>Última API:</strong> <span class="tm-sri-meta-val" data-meta="last-refresh">-</span></span>
          <span><strong>Lote:</strong> <span class="tm-sri-meta-val" data-meta="batch">Inactivo</span></span>
        </div>
      </div>

      <div class="tm-sri-dashboard-actions">
        <button id="tm-sri-refresh-btn" type="button" class="tm-sri-btn tm-sri-btn-primary">${buttonLabel("↻", "Actualizar API")}</button>
        <button id="tm-sri-refresh-periods-btn" type="button" class="tm-sri-btn tm-sri-btn-secondary">${buttonLabel("🗓", "Releer meses")}</button>
        <button id="tm-sri-refresh-report-btn" type="button" class="tm-sri-btn tm-sri-btn-secondary">${buttonLabel("TXT", "Releer TXT")}</button>

        <div class="tm-sri-filter-group">
          <button type="button" class="tm-sri-btn tm-sri-filter-btn" data-filter="missing">${buttonLabel("!", "Pendientes")}</button>
          <button type="button" class="tm-sri-btn tm-sri-filter-btn" data-filter="all">${buttonLabel("≡", "Todas")}</button>
          <button type="button" class="tm-sri-btn tm-sri-filter-btn" data-filter="downloaded">${buttonLabel("✓", "Descargadas")}</button>
        </div>

        <div class="tm-sri-filter-group">
          <button id="tm-sri-smart-txt-btn" type="button" class="tm-sri-btn tm-sri-btn-txt">${buttonLabel("⚡", "TXT inteligente")}</button>
          <button id="tm-sri-force-txt-btn" type="button" class="tm-sri-btn tm-sri-btn-secondary">${buttonLabel("⏱", "Forzar TXT")}</button>
        </div>

        <div class="tm-sri-filter-group">
          <button id="tm-sri-download-page-btn" type="button" class="tm-sri-btn tm-sri-btn-danger">${buttonLabel("↓", "Descargar página")}</button>
          <button id="tm-sri-download-all-pages-btn" type="button" class="tm-sri-btn tm-sri-btn-danger">${buttonLabel("⇣", "Descargar todas páginas")}</button>
          <button id="tm-sri-stop-download-btn" type="button" class="tm-sri-btn tm-sri-btn-secondary">${buttonLabel("■", "Detener")}</button>
        </div>
      </div>
    </div>
  `;
		return wrapper.firstElementChild;
	}
	function renderDashboard({ status, message }) {
		ensureDashboardMounted();
		const dashboard = document.getElementById("tm-sri-dashboard");
		const messageElement = document.getElementById("tm-sri-dashboard-message");
		const statusPill = document.getElementById("tm-sri-status-pill");
		if (dashboard) {
			dashboard.classList.remove("tm-sri-dashboard-loading", "tm-sri-dashboard-success", "tm-sri-dashboard-warning", "tm-sri-dashboard-error");
			dashboard.classList.add(`tm-sri-dashboard-${status}`);
		}
		if (messageElement) messageElement.textContent = message;
		if (statusPill) {
			statusPill.className = `tm-sri-status-pill tm-sri-status-${status}`;
			statusPill.textContent = getStatusLabel(status);
		}
		updateDashboardStats();
	}
	function upsertRowBadge(row, accessCell, text, type) {
		const target = accessCell?.querySelector(".ui-dt-c") || accessCell;
		if (!target) return;
		let badge = target.querySelector(".tm-sri-row-badge");
		if (!badge) {
			badge = document.createElement("span");
			badge.className = "tm-sri-row-badge";
			target.appendChild(document.createElement("br"));
			target.appendChild(badge);
		}
		badge.className = `tm-sri-row-badge tm-sri-badge-${type}`;
		badge.textContent = text;
	}
	function removeRowBadge(row) {
		const badge = row.querySelector(".tm-sri-row-badge");
		if (badge) badge.remove();
	}
	function replaceDownloadCell(cell, label, type) {
		if (!cell) return;
		if (!cell.dataset.tmOriginalHtml) cell.dataset.tmOriginalHtml = cell.innerHTML;
		const desiredHtml = `<div class="ui-dt-c"><span class="tm-sri-file-badge tm-sri-file-${escapeHtml(type)}">${escapeHtml(label)}</span></div>`;
		if (cell.innerHTML.trim() !== desiredHtml) cell.innerHTML = desiredHtml;
	}
	function restoreCell(cell) {
		if (!cell || !cell.dataset.tmOriginalHtml) return;
		cell.innerHTML = cell.dataset.tmOriginalHtml;
		delete cell.dataset.tmOriginalHtml;
	}
	function restoreDownloadCells(rowData) {
		restoreCell(rowData.xmlCell);
		restoreCell(rowData.pdfCell);
	}
	function hideRow(row) {
		row.classList.add("tm-sri-row-hidden");
		row.style.setProperty("display", "none", "important");
	}
	function resetRowVisualState(row) {
		row.classList.remove("tm-sri-row-downloaded", "tm-sri-row-missing", "tm-sri-row-unknown", "tm-sri-row-hidden", "tm-sri-row-processing");
		row.style.removeProperty("display");
	}
	function findMatchingInvoice(rowData) {
		if (rowData.accessKey && state.byAccessKey.has(rowData.accessKey)) return state.byAccessKey.get(rowData.accessKey);
		if (rowData.documentNumber && state.byDocumentNumber.has(rowData.documentNumber)) return state.byDocumentNumber.get(rowData.documentNumber);
		return null;
	}
	function applyInvoiceStatusToTable() {
		const tbody = findComprobantesTbody();
		if (!tbody || !state.apiData) {
			updateDashboardStats();
			return;
		}
		const indexes = getTableIndexes(tbody);
		const rows = Array.from(tbody.querySelectorAll("tr[role=\"row\"], tr"));
		const pageStats = {
			rows: 0,
			downloaded: 0,
			missing: 0,
			unknown: 0,
			hidden: 0
		};
		for (const row of rows) {
			if (!row.querySelector("td")) continue;
			pageStats.rows++;
			const rowData = extractRowData(row, indexes);
			const invoice = findMatchingInvoice(rowData);
			resetRowVisualState(row);
			if (!invoice) {
				pageStats.unknown++;
				restoreDownloadCells(rowData);
				if (CONFIG.MARK_UNKNOWN_ROWS) {
					row.classList.add("tm-sri-row-unknown");
					upsertRowBadge(row, rowData.accessCell, "No registrado en API", "unknown");
				} else removeRowBadge(row);
				if (state.viewFilter === "downloaded") {
					hideRow(row);
					pageStats.hidden++;
				}
				continue;
			}
			const xmlAvailable = isAvailable(invoice.xml_status);
			const pdfOk = isPdfOk(invoice.pdf_status);
			if (shouldTreatAsDownloaded(invoice, { hideWhenXmlIsAvailable: CONFIG.HIDE_WHEN_XML_IS_AVAILABLE })) {
				pageStats.downloaded++;
				row.classList.add("tm-sri-row-downloaded");
				upsertRowBadge(row, rowData.accessCell, "Descargado en sistema", "downloaded");
				if (xmlAvailable) replaceDownloadCell(rowData.xmlCell, "XML en sistema", "downloaded");
				if (pdfOk) replaceDownloadCell(rowData.pdfCell, "RIDE en sistema", "downloaded");
				if (state.viewFilter === "missing") {
					hideRow(row);
					pageStats.hidden++;
				}
				continue;
			}
			pageStats.missing++;
			row.classList.add("tm-sri-row-missing");
			restoreCell(rowData.xmlCell);
			restoreCell(rowData.pdfCell);
			const missingParts = [];
			if (!xmlAvailable) missingParts.push("XML");
			if (!pdfOk) missingParts.push("RIDE");
			upsertRowBadge(row, rowData.accessCell, missingParts.length ? `Falta ${missingParts.join(" y ")}` : "Pendiente", "missing");
			if (state.viewFilter === "downloaded") {
				hideRow(row);
				pageStats.hidden++;
			}
		}
		state.lastPageStats = pageStats;
		updateDashboardStats();
	}
	function dumpCurrentRows() {
		const tbody = findComprobantesTbody();
		if (!tbody) {
			console.warn("[SRI TM] No se encontró la tabla.");
			return [];
		}
		const indexes = getTableIndexes(tbody);
		const rows = Array.from(tbody.querySelectorAll("tr[role=\"row\"], tr")).filter((row) => row.querySelector("td")).map((row) => {
			const rowData = extractRowData(row, indexes);
			const invoice = findMatchingInvoice(rowData);
			return {
				accessKey: rowData.accessKey,
				documentNumber: rowData.documentNumber,
				existsInApi: Boolean(invoice),
				downloaded: invoice?.downloaded,
				xml_status: invoice?.xml_status,
				pdf_status: invoice?.pdf_status,
				display: getComputedStyle(row).display
			};
		});
		console.table(rows);
		return rows;
	}
	function exposeDebugTools(callbacks) {
		const targetWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
		targetWindow.tmSRI = {
			refresh: () => callbacks.refreshAllFromApi(),
			refreshInvoices: () => callbacks.refreshInvoicesFromApi(true),
			refreshPeriods: () => callbacks.refreshPeriodsFromApi(true),
			refreshReportStatus: () => callbacks.refreshReportStatusFromApi(true),
			apply: () => {
				callbacks.applyInvoiceStatusToTable();
				callbacks.applyMonthVisibility();
			},
			setFilter: (filter) => {
				if (![
					"all",
					"missing",
					"downloaded"
				].includes(filter)) {
					console.warn("Filtro inválido. Usa: all, missing o downloaded.");
					return;
				}
				state.viewFilter = filter;
				GM_setValue("viewFilter", filter);
				callbacks.updateFilterButtons();
				callbacks.applyInvoiceStatusToTable();
			},
			downloadTxtSmart: () => callbacks.downloadTxtSmart(),
			downloadTxtForce: () => callbacks.downloadTxtForce(),
			startDownloadPage: () => callbacks.startBatchDownloadCurrentPage(),
			startDownloadAllPages: () => callbacks.startBatchDownloadAllPages(),
			stopDownload: () => callbacks.stopBatchDownloadPending(),
			nextPage: () => callbacks.moveToNextPageAndContinue(),
			dumpRows: () => callbacks.dumpCurrentRows(),
			state,
			config: CONFIG
		};
		console.log("[SRI TM] Debug listo: tmSRI.refresh(), tmSRI.downloadTxtSmart(), tmSRI.dumpRows()");
	}
	function buildDocumentNumber(invoice) {
		const series = onlyDigits(invoice.series ?? "");
		const sequential = onlyDigits(invoice.sequential ?? "");
		if (!series || !sequential) return null;
		return `${series}${sequential}`;
	}
	function getDocumentNumberFromAccessKey(accessKey) {
		const key = onlyDigits(accessKey ?? "");
		if (key.length < 39) return null;
		return `${key.slice(24, 30)}${key.slice(30, 39)}`;
	}
	function buildInvoiceIndexes(invoices) {
		const byAccessKey = new Map();
		const byDocumentNumber = new Map();
		for (const invoice of invoices) {
			const accessKey = onlyDigits(invoice.access_key ?? "");
			if (accessKey) byAccessKey.set(accessKey, invoice);
			const documentNumber = buildDocumentNumber(invoice);
			if (documentNumber) byDocumentNumber.set(documentNumber, invoice);
			const documentNumberFromAccessKey = getDocumentNumberFromAccessKey(accessKey);
			if (documentNumberFromAccessKey) byDocumentNumber.set(documentNumberFromAccessKey, invoice);
		}
		return {
			byAccessKey,
			byDocumentNumber
		};
	}
	function buildBatchFinishMessage(downloadedCount) {
		return `Descarga finalizada. Archivos procesados: ${downloadedCount}.`;
	}
	function buildBatchFinishState(state) {
		return {
			isBatchDownloading: false,
			batchAcrossPages: false
		};
	}
	function buildBatchStopState(state) {
		return {
			isBatchDownloading: false,
			batchAcrossPages: state.batchAcrossPages
		};
	}
	function registerVisitedPage(visitedPages, pageSignature) {
		const nextVisitedPages = new Set(visitedPages);
		nextVisitedPages.add(pageSignature);
		return nextVisitedPages;
	}
	function shouldStopForCycle(visitedPages, pageSignature) {
		return visitedPages.has(pageSignature);
	}
	function shouldStopForPageLimit(pageCount, maxPagesPerBatch) {
		return pageCount > maxPagesPerBatch;
	}
	function shouldAdvanceToNextPage(acrossPages, hasNextPage, isBatchStopping) {
		return acrossPages && hasNextPage && !isBatchStopping;
	}
	function createRequestJson(request) {
		return function requestJson(url) {
			return new Promise((resolve, reject) => {
				request({
					method: "GET",
					url,
					headers: { Accept: "application/json" },
					timeout: 15e3,
					onload: (res) => {
						try {
							if (res.status < 200 || res.status >= 300) {
								reject(new Error(`HTTP ${res.status}`));
								return;
							}
							resolve(JSON.parse(res.responseText));
						} catch (error) {
							reject(error);
						}
					},
					ontimeout: () => reject(new Error("Tiempo de espera agotado")),
					onerror: () => reject(new Error("Error de red"))
				});
			});
		};
	}
	function installManualConsultarHook(refreshAllFromApi) {
		document.addEventListener("click", (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			if (target.closest("#tm-sri-dashboard")) return;
			const element = target.closest("button, input, a, span");
			if (!element) return;
			const text = normalizeText(element.textContent || element.value || element.getAttribute("title") || element.getAttribute("aria-label") || "");
			if (!(text.includes("consultar") || text.includes("buscar"))) return;
			console.log("[SRI TM] Consultar manual detectado. Solo refrescaré API local después.");
			for (const delay of CONFIG.REFRESH_AFTER_MANUAL_CONSULTAR_MS) setTimeout(() => {
				refreshAllFromApi();
			}, delay);
		}, true);
	}
	function installManualDownloadHooks(refreshAllFromApi) {
		document.addEventListener("click", (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const link = target.closest("a[id*=\"lnkXml\"], a[id*=\"lnkPdf\"], a[id$=\"lnkTxtlistado\"]");
			if (!link) return;
			console.log("[SRI TM] Descarga manual detectada:", link.id);
			for (const delay of CONFIG.REFRESH_AFTER_DOWNLOAD_MS) setTimeout(() => {
				refreshAllFromApi();
			}, delay);
		}, true);
	}
	function installPeriodChangeHook(refreshPeriodsFromApi, refreshReportStatusFromApi, updateDashboardStats) {
		document.addEventListener("change", (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const id = target.id || "";
			const changedYear = id === "frmPrincipal:ano";
			const changedDocumentType = id === "frmPrincipal:cmbTipoComprobante";
			if (!changedYear && !changedDocumentType && !(id === "frmPrincipal:mes" || id === "frmPrincipal:dia")) return;
			state.reportStatusData = null;
			if (changedYear || changedDocumentType) {
				const monthSelect = document.getElementById("frmPrincipal:mes");
				if (monthSelect) for (const option of Array.from(monthSelect.options)) {
					option.hidden = false;
					option.disabled = false;
					option.title = "";
					option.dataset.tmSriHidden = "false";
				}
				state.hiddenMonthsCount = 0;
				state.periodData = null;
				state.periodDataKey = null;
				state.monthsByNumber.clear();
			}
			setTimeout(() => {
				if (changedYear || changedDocumentType) refreshPeriodsFromApi(true);
				refreshReportStatusFromApi(true);
				updateDashboardStats();
			}, 500);
		}, true);
	}
	function createInvoiceSyncService(deps) {
		const { config, state, requestJson, getCurrentPageRuc, toApiReceiverRuc, indexInvoices, applyInvoiceStatusToTable, renderDashboard, updateDashboardStats } = deps;
		async function refreshInvoicesFromApi(force = false) {
			const pageRuc = getCurrentPageRuc(document, config.RECEIVER_RUC_OVERRIDE);
			if (!pageRuc) {
				renderDashboard({
					status: "warning",
					message: "No se pudo leer el RUC del receptor en el SRI."
				});
				return;
			}
			const receiverRuc = toApiReceiverRuc(pageRuc, config.SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001);
			if (!receiverRuc) {
				renderDashboard({
					status: "warning",
					message: "No se pudo calcular el receiverRuc para la API."
				});
				return;
			}
			if (!force && state.pageRuc === pageRuc && state.apiData) {
				applyInvoiceStatusToTable();
				return;
			}
			if (state.isRefreshingInvoices) {
				console.log("[SRI TM] Ya hay una consulta de facturas en proceso.");
				return;
			}
			state.isRefreshingInvoices = true;
			state.pageRuc = pageRuc;
			state.receiverRuc = receiverRuc;
			renderDashboard({
				status: "loading",
				message: `Consultando facturas en API local para receptor ${receiverRuc}...`
			});
			try {
				const url = `${config.API_BASE}${config.API_INVOICES_PATH}?receiverRuc=${encodeURIComponent(receiverRuc)}&status=${encodeURIComponent(config.API_STATUS)}`;
				console.log("[SRI TM] GET invoices:", url);
				const response = await requestJson(url);
				if (!response || response.success !== true || !response.data) throw new Error("Formato inválido en /invoices.");
				state.apiData = response.data;
				state.lastInvoicesRefreshAt = new Date();
				state.lastInvoicesError = null;
				indexInvoices(response.data.invoices || []);
				applyInvoiceStatusToTable();
				renderDashboard({
					status: "success",
					message: `Facturas sincronizadas. Receptor: ${receiverRuc}`
				});
			} catch (error) {
				state.lastInvoicesError = error instanceof Error ? error.message : String(error);
				console.error("[SRI TM] Error invoices:", error);
				renderDashboard({
					status: "error",
					message: `Error facturas: ${state.lastInvoicesError}`
				});
			} finally {
				state.isRefreshingInvoices = false;
				updateDashboardStats();
			}
		}
		function indexInvoicesToState(invoices) {
			const indexes = buildInvoiceIndexes(invoices);
			state.byAccessKey = indexes.byAccessKey;
			state.byDocumentNumber = indexes.byDocumentNumber;
			console.log("[SRI TM] Facturas indexadas:", {
				accessKeys: state.byAccessKey.size,
				documentNumbers: state.byDocumentNumber.size
			});
		}
		function findMatchingInvoice(accessKey, documentNumber) {
			if (accessKey && state.byAccessKey.has(accessKey)) return state.byAccessKey.get(accessKey);
			if (documentNumber && state.byDocumentNumber.has(documentNumber)) return state.byDocumentNumber.get(documentNumber);
			return null;
		}
		return {
			refreshInvoicesFromApi,
			indexInvoices: indexInvoicesToState,
			findMatchingInvoice
		};
	}
	function createPeriodSyncService(deps) {
		const { config, state, requestJson, getCurrentPageRuc, toApiReceiverRuc, getSelectedYear, getSelectedDocumentType, getCurrentPeriodsKey, indexMonths, applyMonthVisibility, resetMonthVisibility, updateDashboardStats } = deps;
		async function refreshPeriodsFromApi(force = false) {
			if (!config.HIDE_MONTHS_USING_API) return;
			const pageRuc = getCurrentPageRuc(document, config.RECEIVER_RUC_OVERRIDE);
			if (!pageRuc) return;
			const receiverRuc = toApiReceiverRuc(pageRuc, config.SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001);
			const year = getSelectedYear(document);
			const documentType = getSelectedDocumentType(document);
			const periodKey = getCurrentPeriodsKey();
			if (!receiverRuc || !year || !documentType || !periodKey) {
				resetMonthVisibility();
				return;
			}
			if (state.isRefreshingPeriods) {
				console.log("[SRI TM] Ya hay una consulta de periodos en proceso.");
				return;
			}
			if (!force && state.periodData && state.periodDataKey === periodKey) {
				applyMonthVisibility();
				return;
			}
			state.isRefreshingPeriods = true;
			state.receiverRuc = receiverRuc;
			try {
				const url = `${config.API_BASE}${config.API_PERIODS_PATH}?receiverRuc=${encodeURIComponent(receiverRuc)}&year=${encodeURIComponent(year)}&documentType=${encodeURIComponent(documentType)}`;
				console.log("[SRI TM] GET periods:", url);
				const response = await requestJson(url);
				if (!response || response.success !== true || !response.data) throw new Error("Formato inválido en /periods.");
				state.periodData = response.data;
				state.periodDataKey = periodKey;
				state.lastPeriodsRefreshAt = new Date();
				state.lastPeriodsError = null;
				indexMonths(response.data.months || []);
				applyMonthVisibility();
			} catch (error) {
				state.lastPeriodsError = error instanceof Error ? error.message : String(error);
				state.periodData = null;
				state.periodDataKey = null;
				state.monthsByNumber.clear();
				console.warn("[SRI TM] Error periods:", state.lastPeriodsError);
			} finally {
				state.isRefreshingPeriods = false;
				updateDashboardStats();
			}
		}
		function indexMonthsToState(months) {
			state.monthsByNumber.clear();
			for (const month of months) state.monthsByNumber.set(Number(month.month), month);
			console.log("[SRI TM] Meses indexados:", state.monthsByNumber.size);
		}
		function ensurePeriodsMatchCurrentSelection() {
			const currentKey = getCurrentPeriodsKey();
			if (!currentKey) {
				resetMonthVisibility();
				return;
			}
			if (state.periodDataKey === currentKey) return;
			resetMonthVisibility();
			state.periodData = null;
			state.periodDataKey = null;
			state.monthsByNumber.clear();
			if (!state.isRefreshingPeriods) refreshPeriodsFromApi(true);
		}
		return {
			refreshPeriodsFromApi,
			indexMonths: indexMonthsToState,
			ensurePeriodsMatchCurrentSelection
		};
	}
	function createReportStatusSyncService(deps) {
		const { config, state, requestJson, getCurrentPageRuc, toApiReceiverRuc, getSelectedYear, getSelectedMonth, getSelectedDay, getSelectedDocumentType, updateDashboardStats } = deps;
		function buildReportUrl(receiverRuc, year, month, day, documentType) {
			return `${config.API_BASE}${config.API_REPORT_STATUS_PATH}?receiverRuc=${encodeURIComponent(receiverRuc)}&year=${encodeURIComponent(String(year))}&month=${encodeURIComponent(String(month))}&day=${encodeURIComponent(String(day))}&documentType=${encodeURIComponent(documentType)}`;
		}
		async function refreshReportStatusFromApi(force = false) {
			const pageRuc = getCurrentPageRuc(document, config.RECEIVER_RUC_OVERRIDE);
			if (!pageRuc) return;
			const receiverRuc = toApiReceiverRuc(pageRuc, config.SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001);
			const year = getSelectedYear(document);
			const month = getSelectedMonth(document);
			const day = getSelectedDay(document);
			const documentType = getSelectedDocumentType(document);
			if (!receiverRuc || !year || !month || !documentType) return;
			if (state.isRefreshingReportStatus) {
				console.log("[SRI TM] Ya hay una consulta de estado TXT en proceso.");
				return;
			}
			if (!force && state.reportStatusData) {
				updateDashboardStats();
				return;
			}
			state.isRefreshingReportStatus = true;
			state.receiverRuc = receiverRuc;
			try {
				const url = buildReportUrl(receiverRuc, year, month, day, documentType);
				console.log("[SRI TM] GET report-status:", url);
				const response = await requestJson(url);
				if (!response || response.success !== true || !response.data) throw new Error("Formato inválido en /report-status.");
				state.reportStatusData = response.data;
				state.lastReportStatusAt = new Date();
				state.lastReportStatusError = null;
			} catch (error) {
				state.lastReportStatusError = error instanceof Error ? error.message : String(error);
				state.reportStatusData = null;
				console.warn("[SRI TM] Error report-status:", state.lastReportStatusError);
			} finally {
				state.isRefreshingReportStatus = false;
				updateDashboardStats();
			}
		}
		return {
			refreshReportStatusFromApi,
			buildReportUrl
		};
	}
	function createSyncOrchestrator(deps) {
		const { refreshInvoicesFromApi, refreshPeriodsFromApi, refreshReportStatusFromApi } = deps;
		async function refreshAllFromApi() {
			await refreshInvoicesFromApi(true);
			await refreshPeriodsFromApi(true);
			await refreshReportStatusFromApi(true);
		}
		return { refreshAllFromApi };
	}
	function createTxtService(deps) {
		const { state, renderDashboard, updateTxtButtons, refreshReportStatusFromApi, refreshPeriodsFromApi, refreshInvoicesFromApi, getSelectedYear, getSelectedMonth, getSelectedDay, getSelectedDocumentType, REFRESH_AFTER_DOWNLOAD_MS } = deps;
		function findTxtReportLink() {
			return document.getElementById("frmPrincipal:lnkTxtlistado") || document.querySelector("a[id$=\"lnkTxtlistado\"]") || Array.from(document.querySelectorAll("a")).find((link) => normalizeText(link.textContent || "").includes("descargar reporte")) || null;
		}
		async function downloadTxtSmart() {
			if (state.isDownloadingTxtReport) {
				renderDashboard({
					status: "warning",
					message: "Ya hay una descarga TXT en proceso."
				});
				return;
			}
			await refreshReportStatusFromApi(true);
			const report = state.reportStatusData;
			if (!report) {
				renderDashboard({
					status: "error",
					message: "No se pudo leer el estado TXT desde la API."
				});
				return;
			}
			if (!report.should_download_txt) {
				renderDashboard({
					status: "success",
					message: `TXT no necesario. Estado: ${report.status}. Motivo: ${report.reason}.`
				});
				return;
			}
			downloadTxtForce(`TXT necesario. Motivo: ${report.reason}.`);
		}
		function downloadTxtForce(customMessage = "Descargando TXT forzado del periodo actual...") {
			const link = findTxtReportLink();
			if (!link) {
				renderDashboard({
					status: "warning",
					message: "No se encontró \"Descargar reporte\". Primero consulta el SRI manualmente."
				});
				return;
			}
			state.isDownloadingTxtReport = true;
			updateTxtButtons();
			renderDashboard({
				status: "loading",
				message: customMessage
			});
			console.log("[SRI TM] Descargando TXT manual:", {
				receiverRuc: state.receiverRuc,
				year: getSelectedYear(document),
				month: getSelectedMonth(document),
				day: getSelectedDay(document),
				documentType: getSelectedDocumentType(document)
			});
			link.click();
			for (const delay of REFRESH_AFTER_DOWNLOAD_MS) setTimeout(() => {
				refreshReportStatusFromApi(true);
				refreshPeriodsFromApi(true);
				refreshInvoicesFromApi(true);
			}, delay);
			setTimeout(() => {
				state.isDownloadingTxtReport = false;
				updateTxtButtons();
			}, Math.max(...REFRESH_AFTER_DOWNLOAD_MS) + 1e3);
		}
		return {
			findTxtReportLink,
			downloadTxtSmart,
			downloadTxtForce
		};
	}
	function buildBatchStartState(acrossPages) {
		return {
			isBatchDownloading: true,
			batchAcrossPages: Boolean(acrossPages),
			batchDownloadedCount: 0,
			batchQueueTotal: 0,
			batchPageCount: 0,
			batchVisitedPages: new Set()
		};
	}
	function createBatchOrchestrator(deps) {
		const { state, renderDashboard, updateBatchButtons } = deps;
		function startBatchDownloadCurrentPage() {
			startBatchDownload({ acrossPages: false });
		}
		function startBatchDownloadAllPages() {
			startBatchDownload({ acrossPages: true });
		}
		function startBatchDownload({ acrossPages }) {
			if (state.isBatchDownloading) {
				renderDashboard({
					status: "warning",
					message: "Ya hay una descarga por lote en proceso."
				});
				return;
			}
			const nextState = buildBatchStartState(acrossPages);
			state.isBatchDownloading = nextState.isBatchDownloading;
			state.batchAcrossPages = nextState.batchAcrossPages;
			state.batchDownloadedCount = nextState.batchDownloadedCount;
			state.batchQueueTotal = nextState.batchQueueTotal;
			state.batchPageCount = nextState.batchPageCount;
			state.batchVisitedPages = nextState.batchVisitedPages;
			updateBatchButtons();
			renderDashboard({
				status: "loading",
				message: acrossPages ? "Descarga por lote iniciada en todas las páginas." : "Descarga por lote iniciada en la página actual."
			});
			deps.processCurrentPageForBatch();
		}
		return {
			startBatchDownloadCurrentPage,
			startBatchDownloadAllPages,
			startBatchDownload
		};
	}
	function buildDownloadQueue(candidates, config) {
		const queue = [];
		for (const candidate of candidates) {
			if (candidate.downloaded) continue;
			if (config.autoDownloadXml && !candidate.xmlAvailable && candidate.xmlLink) queue.push({
				row: candidate.row,
				link: candidate.xmlLink,
				accessCell: candidate.accessCell,
				accessKey: candidate.accessKey,
				file: "xml"
			});
			if (config.autoDownloadPdf && !candidate.pdfOk && candidate.pdfLink) queue.push({
				row: candidate.row,
				link: candidate.pdfLink,
				accessCell: candidate.accessCell,
				accessKey: candidate.accessKey,
				file: "pdf"
			});
		}
		return queue.slice(0, config.maxBatchDownloadsPerPage);
	}
	function buildBatchDownloadCandidates(options) {
		const candidates = [];
		for (const row of options.rows) {
			const rowData = options.extractRowData(row);
			const invoice = options.findMatchingInvoice(rowData);
			if (!invoice) continue;
			const xmlAvailable = Boolean(invoice.xml_status);
			const pdfOk = Boolean(invoice.pdf_status);
			const downloaded = options.shouldTreatAsDownloaded(invoice, { hideWhenXmlIsAvailable: options.hideWhenXmlIsAvailable });
			if (downloaded) continue;
			candidates.push({
				row,
				accessCell: options.getAccessCell(rowData),
				accessKey: options.getAccessKey(rowData),
				downloaded,
				xmlAvailable,
				pdfOk,
				xmlLink: options.getXmlLink(rowData),
				pdfLink: options.getPdfLink(rowData)
			});
		}
		return candidates;
	}
	function buildBatchPageLoadingMessage(pageCount, queueLength) {
		return `Página ${pageCount || 1}: ${queueLength} archivo(s) pendiente(s).`;
	}
	function buildBatchAdvanceMessage(beforeSignature) {
		return `Avanzando a la siguiente página desde ${beforeSignature}...`;
	}
	function dequeueBatchItem(queue) {
		const [item, ...remaining] = queue;
		return {
			item,
			remaining
		};
	}
	function buildBatchProgressMessage(fileLabel, downloadedCount, queueTotal, remainingInPage) {
		return `Descargando ${fileLabel} ${downloadedCount}/${queueTotal}. Restantes en página: ${remainingInPage}.`;
	}
	function createBatchProcessor(deps) {
		const { config, state, findComprobantesTbody, getTableIndexes, extractRowData, findMatchingInvoice, upsertRowBadge, renderDashboard, refreshInvoicesFromApi, refreshReportStatusFromApi } = deps;
		function buildDownloadQueueForCurrentPage() {
			const tbody = findComprobantesTbody();
			if (!tbody) return [];
			const indexes = getTableIndexes(tbody);
			return buildDownloadQueue(buildBatchDownloadCandidates({
				rows: Array.from(tbody.querySelectorAll("tr[role=\"row\"], tr")).filter((row) => row.querySelector("td")).filter((row) => getComputedStyle(row).display !== "none"),
				extractRowData: (row) => extractRowData(row, indexes),
				findMatchingInvoice: (rowData) => findMatchingInvoice(rowData),
				shouldTreatAsDownloaded: (invoice, options) => shouldTreatAsDownloaded(invoice, options),
				hideWhenXmlIsAvailable: false,
				getAccessCell: (rowData) => rowData.accessCell,
				getAccessKey: (rowData) => rowData.accessKey,
				getXmlLink: (rowData) => rowData.xmlCell?.querySelector("a[id*=\"lnkXml\"]"),
				getPdfLink: (rowData) => rowData.pdfCell?.querySelector("a[id*=\"lnkPdf\"]")
			}), {
				autoDownloadXml: config.AUTO_DOWNLOAD_XML,
				autoDownloadPdf: config.AUTO_DOWNLOAD_PDF,
				maxBatchDownloadsPerPage: config.MAX_BATCH_DOWNLOADS_PER_PAGE
			});
		}
		function processCurrentPageForBatch() {
			if (!state.isBatchDownloading) {
				deps.finishBatch("Descarga por lote detenida.", "warning");
				return;
			}
			const pageSignature = deps.getPaginationSignature();
			if (state.batchAcrossPages) {
				if (deps.shouldStopForCycle(state.batchVisitedPages, pageSignature)) {
					deps.finishBatch("Proceso detenido para evitar repetir una página.", "warning");
					return;
				}
				state.batchVisitedPages = deps.registerVisitedPage(state.batchVisitedPages, pageSignature);
				state.batchPageCount++;
				if (deps.shouldStopForPageLimit(state.batchPageCount, config.MAX_PAGES_PER_BATCH)) {
					deps.finishBatch("Proceso detenido por límite máximo de páginas.", "warning");
					return;
				}
			}
			const queue = buildDownloadQueueForCurrentPage();
			state.batchQueueTotal += queue.length;
			if (queue.length === 0) {
				if (state.batchAcrossPages && deps.moveToNextPageAndContinue()) return;
				deps.finishBatch(deps.buildBatchFinishMessage(state.batchDownloadedCount), "success");
				return;
			}
			renderDashboard({
				status: "loading",
				message: buildBatchPageLoadingMessage(state.batchPageCount, queue.length)
			});
			processDownloadQueue(queue);
		}
		function processDownloadQueue(queue) {
			if (!state.isBatchDownloading) {
				deps.finishBatch("Descarga por lote detenida.", "warning");
				return;
			}
			const { item, remaining } = dequeueBatchItem(queue);
			if (!item) {
				refreshInvoicesFromApi(true);
				setTimeout(() => {
					if (state.batchAcrossPages && deps.moveToNextPageAndContinue()) return;
					deps.finishBatch(deps.buildBatchFinishMessage(state.batchDownloadedCount), "success");
				}, config.PAGE_AFTER_QUEUE_DELAY_MS);
				return;
			}
			state.batchDownloadedCount++;
			item.row.classList.add("tm-sri-row-processing");
			upsertRowBadge(item.row, item.accessCell, `Descargando ${item.file.toUpperCase()}...`, "processing");
			renderDashboard({
				status: "loading",
				message: buildBatchProgressMessage(item.file.toUpperCase(), state.batchDownloadedCount, state.batchQueueTotal, remaining.length)
			});
			item.link.click();
			for (const delay of config.REFRESH_AFTER_DOWNLOAD_MS) setTimeout(() => {
				refreshInvoicesFromApi(true);
				refreshReportStatusFromApi(true);
			}, delay);
			setTimeout(() => {
				processDownloadQueue(remaining);
			}, config.DOWNLOAD_DELAY_MS);
		}
		return {
			buildDownloadQueueForCurrentPage,
			processCurrentPageForBatch,
			processDownloadQueue
		};
	}
	function createBatchPagination(deps) {
		const { config, state, findNextPageButton, getPaginationSignature, renderDashboard, refreshInvoicesFromApi } = deps;
		function moveToNextPageAndContinue() {
			const nextButton = findNextPageButton();
			if (!deps.shouldAdvanceToNextPage(state.batchAcrossPages, Boolean(nextButton), !state.isBatchDownloading)) return false;
			renderDashboard({
				status: "loading",
				message: buildBatchAdvanceMessage(getPaginationSignature())
			});
			nextButton.click();
			setTimeout(async () => {
				await refreshInvoicesFromApi(true);
				deps.processCurrentPageForBatch();
			}, config.PAGINATION_DELAY_MS);
			return true;
		}
		return { moveToNextPageAndContinue };
	}
	function createBatchFinalization(deps) {
		const { state, updateBatchButtons, renderDashboard, refreshInvoicesFromApi, refreshReportStatusFromApi } = deps;
		function stopBatchDownloadPending() {
			if (!state.isBatchDownloading) {
				renderDashboard({
					status: "warning",
					message: "No hay una descarga por lote activa."
				});
				return;
			}
			const nextState = buildBatchStopState(state);
			state.isBatchDownloading = nextState.isBatchDownloading;
			state.batchAcrossPages = nextState.batchAcrossPages;
			updateBatchButtons();
			renderDashboard({
				status: "warning",
				message: "Se solicitó detener la descarga por lote."
			});
		}
		function finishBatch(message, status) {
			const nextState = buildBatchFinishState(state);
			state.isBatchDownloading = nextState.isBatchDownloading;
			state.batchAcrossPages = nextState.batchAcrossPages;
			updateBatchButtons();
			renderDashboard({
				status,
				message
			});
			refreshInvoicesFromApi(true);
			refreshReportStatusFromApi(true);
		}
		return {
			stopBatchDownloadPending,
			finishBatch
		};
	}
	(function() {
		"use strict";
		if (!location.pathname.includes("/comprobantes-electronicos-internet/pages/consultas/recibidos/comprobantesRecibidos.jsf")) return;
		injectStyles();
		ensureDashboardMounted();
		const requestJson = createRequestJson((options) => {
			GM_xmlhttpRequest(options);
		});
		const getCurrentPeriodsKey$1 = () => getCurrentPeriodsKey(CONFIG);
		const resetMonthVisibility$1 = () => resetMonthVisibility(state, updateDashboardStats);
		const applyMonthVisibility$1 = () => applyMonthVisibility(state, CONFIG, () => getCurrentPeriodsKey(CONFIG), () => resetMonthVisibility(state, updateDashboardStats), updateDashboardStats);
		const invoiceSync = createInvoiceSyncService({
			config: CONFIG,
			state,
			requestJson,
			getCurrentPageRuc: (doc, override) => getCurrentPageRuc(doc, override),
			toApiReceiverRuc: (pageRuc, sendAsBase10) => toApiReceiverRuc(pageRuc, sendAsBase10),
			indexInvoices: (invoices) => {
				const indexes = buildInvoiceIndexes(invoices);
				state.byAccessKey = indexes.byAccessKey;
				state.byDocumentNumber = indexes.byDocumentNumber;
			},
			applyInvoiceStatusToTable,
			renderDashboard,
			updateDashboardStats
		});
		const periodSync = createPeriodSyncService({
			config: CONFIG,
			state,
			requestJson,
			getCurrentPageRuc: (doc, override) => getCurrentPageRuc(doc, override),
			toApiReceiverRuc: (pageRuc, sendAsBase10) => toApiReceiverRuc(pageRuc, sendAsBase10),
			getSelectedYear: (doc) => getSelectedYear(doc),
			getSelectedDocumentType: (doc) => getSelectedDocumentType(doc),
			getCurrentPeriodsKey: getCurrentPeriodsKey$1,
			indexMonths: (months) => {
				state.monthsByNumber.clear();
				for (const month of months) state.monthsByNumber.set(Number(month.month), month);
			},
			applyMonthVisibility: applyMonthVisibility$1,
			resetMonthVisibility: resetMonthVisibility$1,
			updateDashboardStats
		});
		const reportStatusSync = createReportStatusSyncService({
			config: CONFIG,
			state,
			requestJson,
			getCurrentPageRuc: (doc, override) => getCurrentPageRuc(doc, override),
			toApiReceiverRuc: (pageRuc, sendAsBase10) => toApiReceiverRuc(pageRuc, sendAsBase10),
			getSelectedYear: (doc) => getSelectedYear(doc),
			getSelectedMonth: (doc) => getSelectedMonth(doc),
			getSelectedDay: (doc) => getSelectedDay(doc),
			getSelectedDocumentType: (doc) => getSelectedDocumentType(doc),
			updateDashboardStats
		});
		const txtService = createTxtService({
			state,
			renderDashboard,
			updateTxtButtons,
			refreshReportStatusFromApi: reportStatusSync.refreshReportStatusFromApi,
			refreshPeriodsFromApi: periodSync.refreshPeriodsFromApi,
			refreshInvoicesFromApi: invoiceSync.refreshInvoicesFromApi,
			getSelectedYear: (doc) => getSelectedYear(doc),
			getSelectedMonth: (doc) => getSelectedMonth(doc),
			getSelectedDay: (doc) => getSelectedDay(doc),
			getSelectedDocumentType: (doc) => getSelectedDocumentType(doc),
			REFRESH_AFTER_DOWNLOAD_MS: CONFIG.REFRESH_AFTER_DOWNLOAD_MS
		});
		const batchDeps = {
			config: CONFIG,
			state,
			findComprobantesTbody,
			getTableIndexes,
			extractRowData,
			findMatchingInvoice,
			upsertRowBadge,
			findNextPageButton,
			getPaginationSignature,
			renderDashboard,
			updateBatchButtons,
			refreshInvoicesFromApi: invoiceSync.refreshInvoicesFromApi,
			refreshReportStatusFromApi: reportStatusSync.refreshReportStatusFromApi,
			shouldStopForCycle,
			shouldStopForPageLimit,
			registerVisitedPage,
			shouldAdvanceToNextPage,
			buildBatchFinishMessage,
			processCurrentPageForBatch: () => {},
			moveToNextPageAndContinue: () => false,
			finishBatch: () => {}
		};
		const batchOrchestrator = createBatchOrchestrator(batchDeps);
		const batchProcessor = createBatchProcessor(batchDeps);
		const batchPagination = createBatchPagination(batchDeps);
		const batchFinalization = createBatchFinalization(batchDeps);
		batchDeps.processCurrentPageForBatch = batchProcessor.processCurrentPageForBatch;
		batchDeps.moveToNextPageAndContinue = batchPagination.moveToNextPageAndContinue;
		batchDeps.finishBatch = batchFinalization.finishBatch;
		const syncOrchestrator = createSyncOrchestrator({
			refreshInvoicesFromApi: invoiceSync.refreshInvoicesFromApi,
			refreshPeriodsFromApi: periodSync.refreshPeriodsFromApi,
			refreshReportStatusFromApi: reportStatusSync.refreshReportStatusFromApi
		});
		start();
		function start() {
			syncOrchestrator.refreshAllFromApi();
			installManualConsultarHook(syncOrchestrator.refreshAllFromApi);
			installManualDownloadHooks(syncOrchestrator.refreshAllFromApi);
			installPeriodChangeHook(periodSync.refreshPeriodsFromApi, reportStatusSync.refreshReportStatusFromApi, updateDashboardStats);
			exposeDebugTools({
				applyInvoiceStatusToTable,
				applyMonthVisibility: applyMonthVisibility$1,
				updateFilterButtons,
				downloadTxtSmart: txtService.downloadTxtSmart,
				downloadTxtForce: txtService.downloadTxtForce,
				startBatchDownloadCurrentPage: batchOrchestrator.startBatchDownloadCurrentPage,
				startBatchDownloadAllPages: batchOrchestrator.startBatchDownloadAllPages,
				stopBatchDownloadPending: batchFinalization.stopBatchDownloadPending,
				moveToNextPageAndContinue: batchPagination.moveToNextPageAndContinue,
				dumpCurrentRows,
				refreshAllFromApi: syncOrchestrator.refreshAllFromApi,
				refreshInvoicesFromApi: invoiceSync.refreshInvoicesFromApi,
				refreshPeriodsFromApi: periodSync.refreshPeriodsFromApi,
				refreshReportStatusFromApi: reportStatusSync.refreshReportStatusFromApi
			});
			setInterval(() => {
				ensureDashboardMounted();
				periodSync.ensurePeriodsMatchCurrentSelection();
				applyInvoiceStatusToTable();
				applyMonthVisibility$1();
			}, CONFIG.APPLY_INTERVAL_MS);
			new MutationObserver(debounce(() => {
				ensureDashboardMounted();
				periodSync.ensurePeriodsMatchCurrentSelection();
				applyInvoiceStatusToTable();
				applyMonthVisibility$1();
			}, CONFIG.OBSERVER_DEBOUNCE_MS)).observe(document.body, {
				childList: true,
				subtree: true
			});
		}
	})();
})();
