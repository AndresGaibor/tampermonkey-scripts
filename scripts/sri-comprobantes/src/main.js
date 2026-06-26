// Script migrado desde Tampermonkey.
// IMPORTANTE: la metadata (@name, @match, @grant, etc.) ahora se controla desde scripts.manifest.mjs.
// La lógica se mantiene igual para que primero funcione y luego puedas refactorizarla por módulos.

(function () {
  'use strict';

  const TARGET_PATH =
    '/comprobantes-electronicos-internet/pages/consultas/recibidos/comprobantesRecibidos.jsf';

  if (!location.pathname.includes(TARGET_PATH)) {
    return;
  }

  const CONFIG = {
    API_BASE: 'http://localhost:3000',
    API_INVOICES_PATH: '/api/tampermonkey/invoices',
    API_PERIODS_PATH: '/api/tampermonkey/periods',
    API_REPORT_STATUS_PATH: '/api/tampermonkey/report-status',

    API_STATUS: 'all',

    SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001: true,
    RECEIVER_RUC_OVERRIDE: '',

    DEFAULT_VIEW_FILTER: 'missing',

    // Importante:
    // Si true, una factura con XML available se considera descargada visualmente.
    // Si quieres exigir XML + PDF/RIDE, ponlo en false.
    HIDE_WHEN_XML_IS_AVAILABLE: false,

    MARK_UNKNOWN_ROWS: false,

    // Solo aplica estilos. No consulta ni cambia el formulario del SRI.
    APPLY_INTERVAL_MS: 2500,
    OBSERVER_DEBOUNCE_MS: 350,

    // Después de que TÚ presionas Consultar en el SRI,
    // solo refresca la API local. No vuelve a consultar el SRI.
    REFRESH_AFTER_MANUAL_CONSULTAR_MS: [1500, 4000, 8000],

    // Después de que TÚ descargas XML/PDF/TXT,
    // solo refresca la API local.
    REFRESH_AFTER_DOWNLOAD_MS: [3000, 8000, 15000],

    AUTO_DOWNLOAD_XML: true,
    AUTO_DOWNLOAD_PDF: false,
    DOWNLOAD_DELAY_MS: 5500,
    MAX_BATCH_DOWNLOADS_PER_PAGE: 200,

    PAGINATION_DELAY_MS: 4500,
    PAGE_AFTER_QUEUE_DELAY_MS: 2500,
    MAX_PAGES_PER_BATCH: 30,

    // Meses:
    // Oculta opciones del combo solo si la API dice can_hide=true.
    // Nunca cambia automáticamente el mes seleccionado.
    HIDE_MONTHS_USING_API: true,
    NEVER_HIDE_SELECTED_MONTH: true
  };

  const state = {
    pageRuc: null,
    receiverRuc: null,
    periodDataKey: null,
    apiData: null,
    periodData: null,
    reportStatusData: null,

    byAccessKey: new Map(),
    byDocumentNumber: new Map(),
    monthsByNumber: new Map(),

    viewFilter: GM_getValue('viewFilter', CONFIG.DEFAULT_VIEW_FILTER),
    compactMode: GM_getValue('compactMode', false),

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

  injectStyles();
  ensureDashboardMounted();
  start();

  function start() {
    refreshAllFromApi();

    installManualConsultarHook();
    installManualDownloadHooks();
    installPeriodChangeHook();
    exposeDebugTools();

    setInterval(() => {
      ensureDashboardMounted();
      ensurePeriodsMatchCurrentSelection();
      applyInvoiceStatusToTable();
      applyMonthVisibility();
    }, CONFIG.APPLY_INTERVAL_MS);

    const observer = new MutationObserver(
      debounce(() => {
        ensureDashboardMounted();
        ensurePeriodsMatchCurrentSelection();
        applyInvoiceStatusToTable();
        applyMonthVisibility();
      }, CONFIG.OBSERVER_DEBOUNCE_MS)
    );

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function refreshAllFromApi() {
    refreshInvoicesFromApi(true);
    refreshPeriodsFromApi(true);
    refreshReportStatusFromApi(true);
  }

  async function refreshInvoicesFromApi(force = false) {
    const pageRuc = getCurrentPageRuc();

    if (!pageRuc) {
      renderDashboard({
        status: 'warning',
        message: 'No se pudo leer el RUC del receptor en el SRI.'
      });
      return;
    }

    const receiverRuc = toApiReceiverRuc(pageRuc);

    if (!receiverRuc) {
      renderDashboard({
        status: 'warning',
        message: 'No se pudo calcular el receiverRuc para la API.'
      });
      return;
    }

    if (!force && state.pageRuc === pageRuc && state.apiData) {
      applyInvoiceStatusToTable();
      return;
    }

    if (state.isRefreshingInvoices) {
      console.log('[SRI TM] Ya hay una consulta de facturas en proceso.');
      return;
    }

    state.isRefreshingInvoices = true;
    state.pageRuc = pageRuc;
    state.receiverRuc = receiverRuc;

    renderDashboard({
      status: 'loading',
      message: `Consultando facturas en API local para receptor ${receiverRuc}...`
    });

    try {
      const url =
        `${CONFIG.API_BASE}${CONFIG.API_INVOICES_PATH}` +
        `?receiverRuc=${encodeURIComponent(receiverRuc)}` +
        `&status=${encodeURIComponent(CONFIG.API_STATUS)}`;

      state.lastInvoicesUrl = url;
      console.log('[SRI TM] GET invoices:', url);

      const response = await requestJson(url);

      if (!response || response.success !== true || !response.data) {
        throw new Error('Formato inválido en /invoices.');
      }

      state.apiData = response.data;
      state.lastInvoicesRefreshAt = new Date();
      state.lastInvoicesError = null;

      indexInvoices(response.data.invoices || []);
      applyInvoiceStatusToTable();

      renderDashboard({
        status: 'success',
        message: `Facturas sincronizadas. Receptor: ${receiverRuc}`
      });
    } catch (error) {
      state.lastInvoicesError = error.message;

      console.error('[SRI TM] Error invoices:', error);

      renderDashboard({
        status: 'error',
        message: `Error facturas: ${error.message}`
      });
    } finally {
      state.isRefreshingInvoices = false;
      updateDashboardStats();
    }
  }

  async function refreshPeriodsFromApi(force = false) {
    if (!CONFIG.HIDE_MONTHS_USING_API) {
      return;
    }

    const pageRuc = getCurrentPageRuc();

    if (!pageRuc) {
      return;
    }

    const receiverRuc = toApiReceiverRuc(pageRuc);
    const year = getSelectedYear();
    const documentType = getSelectedDocumentType();
    const periodKey = getCurrentPeriodsKey();

    if (!receiverRuc || !year || !documentType || !periodKey) {
  resetMonthVisibility();
  return;
}

    if (state.isRefreshingPeriods) {
      console.log('[SRI TM] Ya hay una consulta de periodos en proceso.');
      return;
    }

    if (!force && state.periodData && state.periodDataKey === periodKey) {
  applyMonthVisibility();
  return;
}

    state.isRefreshingPeriods = true;
    state.receiverRuc = receiverRuc;

    try {
      const url =
        `${CONFIG.API_BASE}${CONFIG.API_PERIODS_PATH}` +
        `?receiverRuc=${encodeURIComponent(receiverRuc)}` +
        `&year=${encodeURIComponent(year)}` +
        `&documentType=${encodeURIComponent(documentType)}`;

      state.lastPeriodsUrl = url;
      console.log('[SRI TM] GET periods:', url);

      const response = await requestJson(url);

      if (!response || response.success !== true || !response.data) {
        throw new Error('Formato inválido en /periods.');
      }

      state.periodData = response.data;
      state.periodDataKey = periodKey;
      state.lastPeriodsRefreshAt = new Date();
      state.lastPeriodsError = null;

      indexMonths(response.data.months || []);
      applyMonthVisibility();
    } catch (error) {
      state.lastPeriodsError = error.message;
      state.periodData = null;
      state.periodDataKey = null;
      state.monthsByNumber.clear();

      console.warn('[SRI TM] Error periods:', error.message);
    } finally {
      state.isRefreshingPeriods = false;
      updateDashboardStats();
    }
  }

  async function refreshReportStatusFromApi(force = false) {
    const pageRuc = getCurrentPageRuc();

    if (!pageRuc) {
      return;
    }

    const receiverRuc = toApiReceiverRuc(pageRuc);
    const year = getSelectedYear();
    const month = getSelectedMonth();
    const day = getSelectedDay();
    const documentType = getSelectedDocumentType();

    if (!receiverRuc || !year || !month || !documentType) {
      return;
    }

    if (state.isRefreshingReportStatus) {
      console.log('[SRI TM] Ya hay una consulta de estado TXT en proceso.');
      return;
    }

    if (!force && state.reportStatusData) {
      updateDashboardStats();
      return;
    }

    state.isRefreshingReportStatus = true;
    state.receiverRuc = receiverRuc;

    try {
      const url =
        `${CONFIG.API_BASE}${CONFIG.API_REPORT_STATUS_PATH}` +
        `?receiverRuc=${encodeURIComponent(receiverRuc)}` +
        `&year=${encodeURIComponent(year)}` +
        `&month=${encodeURIComponent(month)}` +
        `&day=${encodeURIComponent(day)}` +
        `&documentType=${encodeURIComponent(documentType)}`;

      state.lastReportStatusUrl = url;
      console.log('[SRI TM] GET report-status:', url);

      const response = await requestJson(url);

      if (!response || response.success !== true || !response.data) {
        throw new Error('Formato inválido en /report-status.');
      }

      state.reportStatusData = response.data;
      state.lastReportStatusAt = new Date();
      state.lastReportStatusError = null;
    } catch (error) {
      state.lastReportStatusError = error.message;
      state.reportStatusData = null;

      console.warn('[SRI TM] Error report-status:', error.message);
    } finally {
      state.isRefreshingReportStatus = false;
      updateDashboardStats();
    }
  }

  function requestJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: {
          Accept: 'application/json'
        },
        timeout: 15000,
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
        ontimeout: () => reject(new Error('Tiempo de espera agotado')),
        onerror: () => reject(new Error('Error de red'))
      });
    });
  }

  function getCurrentPageRuc() {
    if (CONFIG.RECEIVER_RUC_OVERRIDE) {
      return onlyDigits(CONFIG.RECEIVER_RUC_OVERRIDE);
    }

    const directInput = document.getElementById('frmPrincipal:txtParametro');

    if (directInput && directInput.value) {
      const value = onlyDigits(directInput.value);

      if (value.length >= 10) {
        return value;
      }
    }

    const input =
      document.querySelector('input[id$="txtParametro"]') ||
      document.querySelector('input[name$="txtParametro"]') ||
      document.querySelector('input.sri-input-txt-paramtero');

    if (input && input.value) {
      const value = onlyDigits(input.value);

      if (value.length >= 10) {
        return value;
      }
    }

    const topbarRuc = document.querySelector('.area-usuario-blue span');

    if (topbarRuc) {
      const match = topbarRuc.textContent.match(/\b\d{10,13}\b/);

      if (match) {
        return onlyDigits(match[0]);
      }
    }

    return null;
  }

  function toApiReceiverRuc(value) {
    const digits = onlyDigits(value);

    if (
      CONFIG.SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001 &&
      digits.length === 13 &&
      digits.endsWith('001')
    ) {
      return digits.slice(0, 10);
    }

    return digits;
  }

  function getSelectedYear() {
    const select = document.getElementById('frmPrincipal:ano');
    return select ? Number(select.value) : null;
  }

  function getSelectedMonth() {
    const select = document.getElementById('frmPrincipal:mes');
    return select ? Number(select.value) : null;
  }

  function getSelectedDay() {
    const select = document.getElementById('frmPrincipal:dia');
    return select ? Number(select.value) : 0;
  }

  function getSelectedDocumentType() {
    const select = document.getElementById('frmPrincipal:cmbTipoComprobante');
    return select ? String(select.value || '') : '';
  }

  function getCurrentPeriodsKey() {
  const pageRuc = getCurrentPageRuc();
  const receiverRuc = pageRuc ? toApiReceiverRuc(pageRuc) : null;
  const year = getSelectedYear();
  const documentType = getSelectedDocumentType();

  if (!receiverRuc || !year || !documentType) {
    return null;
  }

  return `${receiverRuc}:${year}:${documentType}`;
}

function resetMonthVisibility() {
  const monthSelect = document.getElementById('frmPrincipal:mes');

  if (!monthSelect) {
    return;
  }

  for (const option of Array.from(monthSelect.options)) {
    option.hidden = false;
    option.disabled = false;
    option.title = '';
    option.dataset.tmSriHidden = 'false';
  }

  state.hiddenMonthsCount = 0;
  updateDashboardStats();
}

function ensurePeriodsMatchCurrentSelection() {
  const currentKey = getCurrentPeriodsKey();

  if (!currentKey) {
    resetMonthVisibility();
    return;
  }

  if (state.periodDataKey === currentKey) {
    return;
  }

  resetMonthVisibility();

  state.periodData = null;
  state.periodDataKey = null;
  state.monthsByNumber.clear();

  if (!state.isRefreshingPeriods) {
    refreshPeriodsFromApi(true);
  }
}

  function indexInvoices(invoices) {
    state.byAccessKey.clear();
    state.byDocumentNumber.clear();

    for (const invoice of invoices) {
      const accessKey = onlyDigits(invoice.access_key || '');

      if (accessKey) {
        state.byAccessKey.set(accessKey, invoice);
      }

      const docNumber = buildDocumentNumber(invoice);

      if (docNumber) {
        state.byDocumentNumber.set(docNumber, invoice);
      }

      const docNumberFromAccessKey = getDocumentNumberFromAccessKey(accessKey);

      if (docNumberFromAccessKey) {
        state.byDocumentNumber.set(docNumberFromAccessKey, invoice);
      }
    }

    console.log('[SRI TM] Facturas indexadas:', {
      accessKeys: state.byAccessKey.size,
      documentNumbers: state.byDocumentNumber.size
    });
  }

  function indexMonths(months) {
    state.monthsByNumber.clear();

    for (const month of months) {
      state.monthsByNumber.set(Number(month.month), month);
    }

    console.log('[SRI TM] Meses indexados:', state.monthsByNumber.size);
  }

  function buildDocumentNumber(invoice) {
    const series = onlyDigits(invoice.series || '');
    const sequential = onlyDigits(invoice.sequential || '');

    if (!series || !sequential) {
      return null;
    }

    return `${series}${sequential}`;
  }

  function getDocumentNumberFromAccessKey(accessKey) {
    const key = onlyDigits(accessKey);

    if (key.length < 39) {
      return null;
    }

    const series = key.slice(24, 30);
    const sequential = key.slice(30, 39);

    return `${series}${sequential}`;
  }

  function applyMonthVisibility() {
  const monthSelect = document.getElementById('frmPrincipal:mes');

  if (!monthSelect) {
    return;
  }

  const currentKey = getCurrentPeriodsKey();

  if (
    !currentKey ||
    !state.periodData ||
    !state.periodDataKey ||
    state.periodDataKey !== currentKey ||
    state.monthsByNumber.size === 0
  ) {
    resetMonthVisibility();
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
      option.title = '';
      option.dataset.tmSriHidden = 'false';
      continue;
    }

    let shouldHide = Boolean(metadata.can_hide);

    // Nunca ocultar el mes actualmente seleccionado.
    // Esto evita que el SRI quede en un estado raro.
    if (CONFIG.NEVER_HIDE_SELECTED_MONTH && monthNumber === selectedMonth) {
      shouldHide = false;
    }

    option.hidden = shouldHide;
    option.disabled = shouldHide;
    option.dataset.tmSriHidden = shouldHide ? 'true' : 'false';
    option.title = buildMonthTitle(metadata);

    if (shouldHide) {
      hiddenCount++;
    }
  }

  state.hiddenMonthsCount = hiddenCount;
  updateDashboardStats();
}

  function buildMonthTitle(metadata) {
    const status = metadata.status || '-';
    const total = metadata.total ?? 0;
    const downloaded = metadata.downloaded ?? 0;
    const missing = metadata.missing ?? 0;

    return `Estado: ${status}. Total: ${total}. Descargadas: ${downloaded}. Pendientes: ${missing}.`;
  }

  function applyInvoiceStatusToTable() {
    const tbody = findComprobantesTbody();

    if (!tbody || !state.apiData) {
      updateDashboardStats();
      return;
    }

    const indexes = getTableIndexes(tbody);
    const rows = Array.from(tbody.querySelectorAll('tr[role="row"], tr'));

    const pageStats = {
      rows: 0,
      downloaded: 0,
      missing: 0,
      unknown: 0,
      hidden: 0
    };

    for (const row of rows) {
      if (!row.querySelector('td')) {
        continue;
      }

      pageStats.rows++;

      const rowData = extractRowData(row, indexes);
      const invoice = findMatchingInvoice(rowData);

      resetRowVisualState(row);

      if (!invoice) {
        pageStats.unknown++;
        restoreDownloadCells(rowData);

        if (CONFIG.MARK_UNKNOWN_ROWS) {
          row.classList.add('tm-sri-row-unknown');
          upsertRowBadge(row, rowData.accessCell, 'No registrado en API', 'unknown');
        } else {
          removeRowBadge(row);
        }

        if (state.viewFilter === 'downloaded') {
          hideRow(row);
          pageStats.hidden++;
        }

        continue;
      }

      const xmlAvailable = isAvailable(invoice.xml_status);
      const pdfOk = isPdfOk(invoice.pdf_status);

      const downloaded =
        invoice.downloaded === true ||
        (CONFIG.HIDE_WHEN_XML_IS_AVAILABLE && xmlAvailable) ||
        (xmlAvailable && pdfOk);

      if (downloaded) {
        pageStats.downloaded++;

        row.classList.add('tm-sri-row-downloaded');
        upsertRowBadge(row, rowData.accessCell, 'Descargado en sistema', 'downloaded');

        if (xmlAvailable) {
          replaceDownloadCell(rowData.xmlCell, 'XML en sistema', 'downloaded');
        }

        if (pdfOk) {
          replaceDownloadCell(rowData.pdfCell, 'RIDE en sistema', 'downloaded');
        }

        if (state.viewFilter === 'missing') {
          hideRow(row);
          pageStats.hidden++;
        }

        continue;
      }

      pageStats.missing++;

      row.classList.add('tm-sri-row-missing');

      restoreCell(rowData.xmlCell);
      restoreCell(rowData.pdfCell);

      const missingParts = [];

      if (!xmlAvailable) {
        missingParts.push('XML');
      }

      if (!pdfOk) {
        missingParts.push('RIDE');
      }

      upsertRowBadge(
        row,
        rowData.accessCell,
        missingParts.length ? `Falta ${missingParts.join(' y ')}` : 'Pendiente',
        'missing'
      );

      if (state.viewFilter === 'downloaded') {
        hideRow(row);
        pageStats.hidden++;
      }
    }

    state.lastPageStats = pageStats;
    updateDashboardStats();
  }

  function hideRow(row) {
    row.classList.add('tm-sri-row-hidden');
    row.style.setProperty('display', 'none', 'important');
  }

  function findComprobantesTbody() {
    return (
      document.getElementById('frmPrincipal:tablaCompRecibidos_data') ||
      document.querySelector('tbody[id$="tablaCompRecibidos_data"]') ||
      document.querySelector('#frmPrincipal\\:panelListaComprobantes tbody.ui-datatable-data')
    );
  }

  function getTableIndexes(tbody) {
    const table = tbody.closest('table');
    const headers = table ? Array.from(table.querySelectorAll('thead th')) : [];

    const normalizedHeaders = headers.map((th) => normalizeText(th.textContent));

    const findHeader = (...needles) => {
      const index = normalizedHeaders.findIndex((text) =>
        needles.some((needle) => text.includes(needle))
      );

      return index >= 0 ? index : null;
    };

    return {
      type: findHeader('tipo y serie') ?? 2,
      access: findHeader('clave de acceso', 'autorizacion') ?? 3,
      xml: findHeader('documento') ?? 9,
      pdf: findHeader('ride') ?? 10
    };
  }

  function extractRowData(row, indexes) {
    const cells = Array.from(row.children);

    const typeCell = cells[indexes.type] || cells[2] || null;
    const accessCell = cells[indexes.access] || cells[3] || null;
    const xmlCell = cells[indexes.xml] || cells[9] || null;
    const pdfCell = cells[indexes.pdf] || cells[10] || null;

    const accessText = accessCell ? accessCell.textContent || '' : row.textContent || '';
    const accessKeyMatch = accessText.match(/\b\d{49}\b/);
    const accessKey = accessKeyMatch ? accessKeyMatch[0] : null;

    let documentNumber = null;

    if (typeCell) {
      const typeText = normalizeSpaces(typeCell.textContent || '');
      const docMatch = typeText.match(/(\d{3})\s*-\s*(\d{3})\s*-\s*(\d{9})/);

      if (docMatch) {
        documentNumber = `${docMatch[1]}${docMatch[2]}${docMatch[3]}`;
      }
    }

    return {
      row,
      cells,
      typeCell,
      accessCell,
      xmlCell,
      pdfCell,
      accessKey,
      documentNumber
    };
  }

  function findMatchingInvoice(rowData) {
    if (rowData.accessKey && state.byAccessKey.has(rowData.accessKey)) {
      return state.byAccessKey.get(rowData.accessKey);
    }

    if (rowData.documentNumber && state.byDocumentNumber.has(rowData.documentNumber)) {
      return state.byDocumentNumber.get(rowData.documentNumber);
    }

    return null;
  }

  function resetRowVisualState(row) {
    row.classList.remove(
      'tm-sri-row-downloaded',
      'tm-sri-row-missing',
      'tm-sri-row-unknown',
      'tm-sri-row-hidden',
      'tm-sri-row-processing'
    );

    row.style.removeProperty('display');
  }

  function isAvailable(status) {
    return String(status || '').toLowerCase() === 'available';
  }

  function isPdfOk(status) {
    const value = String(status || '').toLowerCase();

    return value !== '' && value !== 'missing';
  }

  function replaceDownloadCell(cell, label, type) {
    if (!cell) {
      return;
    }

    if (!cell.dataset.tmOriginalHtml) {
      cell.dataset.tmOriginalHtml = cell.innerHTML;
    }

    const desiredHtml = `
      <div class="ui-dt-c">
        <span class="tm-sri-file-badge tm-sri-file-${type}">
          ${escapeHtml(label)}
        </span>
      </div>
    `.trim();

    if (cell.innerHTML.trim() !== desiredHtml) {
      cell.innerHTML = desiredHtml;
    }
  }

  function restoreDownloadCells(rowData) {
    restoreCell(rowData.xmlCell);
    restoreCell(rowData.pdfCell);
  }

  function restoreCell(cell) {
    if (!cell || !cell.dataset.tmOriginalHtml) {
      return;
    }

    cell.innerHTML = cell.dataset.tmOriginalHtml;
    delete cell.dataset.tmOriginalHtml;
  }

  function upsertRowBadge(row, accessCell, text, type) {
    const target = accessCell?.querySelector('.ui-dt-c') || accessCell;

    if (!target) {
      return;
    }

    let badge = target.querySelector('.tm-sri-row-badge');

    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'tm-sri-row-badge';
      target.appendChild(document.createElement('br'));
      target.appendChild(badge);
    }

    badge.className = `tm-sri-row-badge tm-sri-badge-${type}`;
    badge.textContent = text;
  }

  function removeRowBadge(row) {
    const badge = row.querySelector('.tm-sri-row-badge');

    if (badge) {
      badge.remove();
    }
  }

  function findTxtReportLink() {
    return (
      document.getElementById('frmPrincipal:lnkTxtlistado') ||
      document.querySelector('a[id$="lnkTxtlistado"]') ||
      Array.from(document.querySelectorAll('a')).find((link) =>
        normalizeText(link.textContent || '').includes('descargar reporte')
      ) ||
      null
    );
  }

  async function downloadTxtSmart() {
    if (state.isDownloadingTxtReport) {
      renderDashboard({
        status: 'warning',
        message: 'Ya hay una descarga TXT en proceso.'
      });
      return;
    }

    await refreshReportStatusFromApi(true);

    const report = state.reportStatusData;

    if (!report) {
      renderDashboard({
        status: 'error',
        message: 'No se pudo leer el estado TXT desde la API.'
      });
      return;
    }

    if (!report.should_download_txt) {
      renderDashboard({
        status: 'success',
        message: `TXT no necesario. Estado: ${report.status}. Motivo: ${report.reason}.`
      });
      return;
    }

    downloadTxtForce(`TXT necesario. Motivo: ${report.reason}.`);
  }

  function downloadTxtForce(customMessage = 'Descargando TXT forzado del periodo actual...') {
    const link = findTxtReportLink();

    if (!link) {
      renderDashboard({
        status: 'warning',
        message: 'No se encontró “Descargar reporte”. Primero consulta el SRI manualmente.'
      });
      return;
    }

    state.isDownloadingTxtReport = true;
    updateTxtButtons();

    renderDashboard({
      status: 'loading',
      message: customMessage
    });

    console.log('[SRI TM] Descargando TXT manual:', {
      receiverRuc: state.receiverRuc,
      year: getSelectedYear(),
      month: getSelectedMonth(),
      day: getSelectedDay(),
      documentType: getSelectedDocumentType()
    });

    link.click();

    for (const delay of CONFIG.REFRESH_AFTER_DOWNLOAD_MS) {
      setTimeout(() => {
        refreshReportStatusFromApi(true);
        refreshPeriodsFromApi(true);
        refreshInvoicesFromApi(true);
      }, delay);
    }

    setTimeout(() => {
      state.isDownloadingTxtReport = false;
      updateTxtButtons();
      updateDashboardStats();
    }, Math.max(...CONFIG.REFRESH_AFTER_DOWNLOAD_MS) + 1000);
  }

  function buildDownloadQueueForCurrentPage() {
    const tbody = findComprobantesTbody();

    if (!tbody) {
      return [];
    }

    const indexes = getTableIndexes(tbody);
    const rows = Array.from(tbody.querySelectorAll('tr[role="row"], tr'))
      .filter((row) => row.querySelector('td'))
      .filter((row) => getComputedStyle(row).display !== 'none');

    const queue = [];

    for (const row of rows) {
      const rowData = extractRowData(row, indexes);
      const invoice = findMatchingInvoice(rowData);

      if (!invoice) {
        continue;
      }

      const xmlAvailable = isAvailable(invoice.xml_status);
      const pdfOk = isPdfOk(invoice.pdf_status);

      const downloaded =
        invoice.downloaded === true ||
        (CONFIG.HIDE_WHEN_XML_IS_AVAILABLE && xmlAvailable) ||
        (xmlAvailable && pdfOk);

      if (downloaded) {
        continue;
      }

      const xmlLink = rowData.xmlCell?.querySelector('a[id*="lnkXml"]');
      const pdfLink = rowData.pdfCell?.querySelector('a[id*="lnkPdf"]');

      if (CONFIG.AUTO_DOWNLOAD_XML && !xmlAvailable && xmlLink) {
        queue.push({
          row,
          link: xmlLink,
          accessCell: rowData.accessCell,
          accessKey: rowData.accessKey,
          file: 'xml'
        });
      }

      if (CONFIG.AUTO_DOWNLOAD_PDF && !pdfOk && pdfLink) {
        queue.push({
          row,
          link: pdfLink,
          accessCell: rowData.accessCell,
          accessKey: rowData.accessKey,
          file: 'pdf'
        });
      }
    }

    return queue.slice(0, CONFIG.MAX_BATCH_DOWNLOADS_PER_PAGE);
  }

  function startBatchDownloadCurrentPage() {
    startBatchDownload({
      acrossPages: false
    });
  }

  function startBatchDownloadAllPages() {
    startBatchDownload({
      acrossPages: true
    });
  }

  function startBatchDownload({ acrossPages }) {
    if (state.isBatchDownloading) {
      renderDashboard({
        status: 'warning',
        message: 'Ya hay una descarga por lote en proceso.'
      });
      return;
    }

    state.isBatchDownloading = true;
    state.batchAcrossPages = Boolean(acrossPages);
    state.batchDownloadedCount = 0;
    state.batchQueueTotal = 0;
    state.batchPageCount = 0;
    state.batchVisitedPages = new Set();

    updateBatchButtons();

    renderDashboard({
      status: 'loading',
      message: acrossPages
        ? 'Descarga por lote iniciada en todas las páginas.'
        : 'Descarga por lote iniciada en la página actual.'
    });

    processCurrentPageForBatch();
  }

  function processCurrentPageForBatch() {
    if (!state.isBatchDownloading) {
      finishBatch('Descarga por lote detenida.', 'warning');
      return;
    }

    const pageSignature = getPaginationSignature();

    if (state.batchAcrossPages) {
      if (state.batchVisitedPages.has(pageSignature)) {
        finishBatch('Proceso detenido para evitar repetir una página.', 'warning');
        return;
      }

      state.batchVisitedPages.add(pageSignature);
      state.batchPageCount++;

      if (state.batchPageCount > CONFIG.MAX_PAGES_PER_BATCH) {
        finishBatch('Proceso detenido por límite máximo de páginas.', 'warning');
        return;
      }
    }

    const queue = buildDownloadQueueForCurrentPage();

    state.batchQueueTotal += queue.length;
    updateDashboardStats();

    if (queue.length === 0) {
      if (state.batchAcrossPages && moveToNextPageAndContinue()) {
        return;
      }

      finishBatch(
        `Descarga finalizada. Archivos procesados: ${state.batchDownloadedCount}.`,
        'success'
      );
      return;
    }

    renderDashboard({
      status: 'loading',
      message: `Página ${state.batchPageCount || 1}: ${queue.length} archivo(s) pendiente(s).`
    });

    processDownloadQueue(queue);
  }

  function processDownloadQueue(queue) {
    if (!state.isBatchDownloading) {
      finishBatch('Descarga por lote detenida.', 'warning');
      return;
    }

    const item = queue.shift();

    if (!item) {
      refreshInvoicesFromApi(true);

      setTimeout(() => {
        if (state.batchAcrossPages && moveToNextPageAndContinue()) {
          return;
        }

        finishBatch(
          `Descarga finalizada. Archivos procesados: ${state.batchDownloadedCount}.`,
          'success'
        );
      }, CONFIG.PAGE_AFTER_QUEUE_DELAY_MS);

      return;
    }

    state.batchDownloadedCount++;

    item.row.classList.add('tm-sri-row-processing');

    upsertRowBadge(
      item.row,
      item.accessCell,
      `Descargando ${item.file.toUpperCase()}...`,
      'processing'
    );

    renderDashboard({
      status: 'loading',
      message:
        `Descargando ${item.file.toUpperCase()} ` +
        `${state.batchDownloadedCount}/${state.batchQueueTotal}. ` +
        `Restantes en página: ${queue.length}.`
    });

    item.link.click();

    for (const delay of CONFIG.REFRESH_AFTER_DOWNLOAD_MS) {
      setTimeout(() => {
        refreshInvoicesFromApi(true);
        refreshReportStatusFromApi(true);
      }, delay);
    }

    setTimeout(() => {
      processDownloadQueue(queue);
    }, CONFIG.DOWNLOAD_DELAY_MS);
  }

  function moveToNextPageAndContinue() {
    const nextButton = findNextPageButton();

    if (!nextButton) {
      return false;
    }

    const beforeSignature = getPaginationSignature();

    renderDashboard({
      status: 'loading',
      message: `Avanzando a la siguiente página desde ${beforeSignature}...`
    });

    nextButton.click();

    setTimeout(async () => {
      await refreshInvoicesFromApi(true);
      applyInvoiceStatusToTable();

      processCurrentPageForBatch();
    }, CONFIG.PAGINATION_DELAY_MS);

    return true;
  }

  function findNextPageButton() {
    const candidates = Array.from(
      document.querySelectorAll('.ui-paginator-next, [class*="ui-paginator-next"]')
    );

    const next = candidates.find((element) => {
      const classText = element.className || '';
      const disabled =
        classText.includes('ui-state-disabled') ||
        element.getAttribute('aria-disabled') === 'true';

      return !disabled && getComputedStyle(element).display !== 'none';
    });

    return next || null;
  }

  function getPaginationSignature() {
    const current =
      document.querySelector('.ui-paginator-current') ||
      document.querySelector('[class*="ui-paginator-current"]');

    if (current) {
      return normalizeSpaces(current.textContent || '');
    }

    const tbody = findComprobantesTbody();

    if (!tbody) {
      return 'sin-tabla';
    }

    const firstAccessKey = Array.from(tbody.querySelectorAll('tr'))
      .map((row) => row.textContent || '')
      .join(' ')
      .match(/\b\d{49}\b/)?.[0];

    return firstAccessKey || `pagina-${Date.now()}`;
  }

  function stopBatchDownloadPending() {
    if (!state.isBatchDownloading) {
      renderDashboard({
        status: 'warning',
        message: 'No hay una descarga por lote activa.'
      });
      return;
    }

    state.isBatchDownloading = false;
    updateBatchButtons();

    renderDashboard({
      status: 'warning',
      message: 'Se solicitó detener la descarga por lote.'
    });
  }

  function finishBatch(message, status) {
    state.isBatchDownloading = false;
    state.batchAcrossPages = false;
    updateBatchButtons();

    renderDashboard({
      status,
      message
    });

    refreshInvoicesFromApi(true);
    refreshReportStatusFromApi(true);
  }

  function ensureDashboardMounted() {
    const existing = document.getElementById('tm-sri-dashboard');

    if (existing && existing.isConnected) {
      existing.classList.toggle('tm-sri-dashboard-compact', Boolean(state.compactMode));
      return existing;
    }

    const dashboard = createDashboardElement();
    const mountTarget = findDashboardMountTarget();

    if (mountTarget.mode === 'after' && mountTarget.reference?.parentNode) {
      mountTarget.reference.parentNode.insertBefore(dashboard, mountTarget.reference.nextSibling);
    } else if (mountTarget.mode === 'before' && mountTarget.reference?.parentNode) {
      mountTarget.reference.parentNode.insertBefore(dashboard, mountTarget.reference);
    } else if (mountTarget.element) {
      mountTarget.element.prepend(dashboard);
    } else {
      document.body.prepend(dashboard);
    }

    updateFilterButtons();
    updateCompactButton();
    updateBatchButtons();
    updateTxtButtons();
    updateDashboardStats();

    return dashboard;
  }

  function findDashboardMountTarget() {
    const searchPanel = document.getElementById('frmPrincipal:pnlBusqueda');
    const pnlDocumentos = document.getElementById('frmPrincipal:pnldocumentosrecibidos');
    const tableWrapper = document.getElementById('frmPrincipal:tablaCompRecibidos');
    const panelLista = document.getElementById('frmPrincipal:panelListaComprobantes');

    if (searchPanel) {
      return {
        mode: 'after',
        reference: searchPanel
      };
    }

    if (pnlDocumentos) {
      return {
        mode: 'before',
        reference: pnlDocumentos
      };
    }

    if (tableWrapper) {
      return {
        mode: 'before',
        reference: tableWrapper
      };
    }

    if (panelLista) {
      return {
        mode: 'prepend',
        element: panelLista
      };
    }

    return {
      mode: 'prepend',
      element: document.body
    };
  }

  function createDashboardElement() {
    const dashboard = document.createElement('div');
    dashboard.id = 'tm-sri-dashboard';
    dashboard.className = `tm-sri-dashboard ${state.compactMode ? 'tm-sri-dashboard-compact' : ''}`;

    dashboard.innerHTML = `
      <div class="tm-sri-dashboard-header">
        <div>
          <div class="tm-sri-dashboard-title">Comprobantes SRI sincronizados</div>
          <div id="tm-sri-dashboard-message" class="tm-sri-dashboard-message">Inicializando...</div>
        </div>

        <div class="tm-sri-dashboard-header-actions">
          <span id="tm-sri-status-pill" class="tm-sri-status-pill tm-sri-status-loading">Cargando</span>
          <button id="tm-sri-compact-btn" type="button" class="tm-sri-btn tm-sri-btn-secondary">Minimizar</button>
        </div>
      </div>

      <div class="tm-sri-dashboard-body">
        <div class="tm-sri-stats-grid">
          <div class="tm-sri-stat">
            <span>Total API</span>
            <strong id="tm-sri-stat-total-api">-</strong>
          </div>
          <div class="tm-sri-stat">
            <span>Descargadas API</span>
            <strong id="tm-sri-stat-downloaded-api">-</strong>
          </div>
          <div class="tm-sri-stat">
            <span>Pendientes API</span>
            <strong id="tm-sri-stat-missing-api">-</strong>
          </div>
          <div class="tm-sri-stat">
            <span>Filas página</span>
            <strong id="tm-sri-stat-page-rows">-</strong>
          </div>
          <div class="tm-sri-stat">
            <span>Ocultas</span>
            <strong id="tm-sri-stat-hidden">-</strong>
          </div>
          <div class="tm-sri-stat">
            <span>No cruzadas</span>
            <strong id="tm-sri-stat-unknown">-</strong>
          </div>
        </div>

        <div class="tm-sri-meta">
          <span><strong>RUC pantalla:</strong> <span id="tm-sri-meta-page-ruc">-</span></span>
          <span><strong>receiverRuc API:</strong> <span id="tm-sri-meta-receiver-ruc">-</span></span>
          <span><strong>Periodo:</strong> <span id="tm-sri-meta-period">-</span></span>
          <span><strong>Meses ocultos:</strong> <span id="tm-sri-meta-hidden-months">-</span></span>
          <span><strong>TXT:</strong> <span id="tm-sri-meta-txt">-</span></span>
          <span><strong>Última API:</strong> <span id="tm-sri-meta-last-refresh">-</span></span>
          <span><strong>Lote:</strong> <span id="tm-sri-meta-batch">Inactivo</span></span>
        </div>
      </div>

      <div class="tm-sri-dashboard-actions">
        <button id="tm-sri-refresh-btn" type="button" class="tm-sri-btn tm-sri-btn-primary">Actualizar API</button>
        <button id="tm-sri-refresh-periods-btn" type="button" class="tm-sri-btn tm-sri-btn-secondary">Releer meses</button>
        <button id="tm-sri-refresh-report-btn" type="button" class="tm-sri-btn tm-sri-btn-secondary">Releer TXT</button>

        <div class="tm-sri-filter-group">
          <button type="button" class="tm-sri-btn tm-sri-filter-btn" data-filter="missing">Pendientes</button>
          <button type="button" class="tm-sri-btn tm-sri-filter-btn" data-filter="all">Todas</button>
          <button type="button" class="tm-sri-btn tm-sri-filter-btn" data-filter="downloaded">Descargadas</button>
        </div>

        <div class="tm-sri-filter-group">
          <button id="tm-sri-smart-txt-btn" type="button" class="tm-sri-btn tm-sri-btn-txt">TXT inteligente</button>
          <button id="tm-sri-force-txt-btn" type="button" class="tm-sri-btn tm-sri-btn-secondary">Forzar TXT</button>
        </div>

        <div class="tm-sri-filter-group">
          <button id="tm-sri-download-page-btn" type="button" class="tm-sri-btn tm-sri-btn-danger">Descargar página</button>
          <button id="tm-sri-download-all-pages-btn" type="button" class="tm-sri-btn tm-sri-btn-danger">Descargar todas páginas</button>
          <button id="tm-sri-stop-download-btn" type="button" class="tm-sri-btn tm-sri-btn-secondary">Detener</button>
        </div>
      </div>
    `;

    dashboard.addEventListener('click', (event) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest('#tm-sri-refresh-btn')) {
        refreshAllFromApi();
        return;
      }

      if (target.closest('#tm-sri-refresh-periods-btn')) {
        refreshPeriodsFromApi(true);
        return;
      }

      if (target.closest('#tm-sri-refresh-report-btn')) {
        refreshReportStatusFromApi(true);
        return;
      }

      if (target.closest('#tm-sri-compact-btn')) {
        state.compactMode = !state.compactMode;
        GM_setValue('compactMode', state.compactMode);
        dashboard.classList.toggle('tm-sri-dashboard-compact', Boolean(state.compactMode));
        updateCompactButton();
        return;
      }

      if (target.closest('#tm-sri-smart-txt-btn')) {
        downloadTxtSmart();
        return;
      }

      if (target.closest('#tm-sri-force-txt-btn')) {
        downloadTxtForce();
        return;
      }

      if (target.closest('#tm-sri-download-page-btn')) {
        startBatchDownloadCurrentPage();
        return;
      }

      if (target.closest('#tm-sri-download-all-pages-btn')) {
        startBatchDownloadAllPages();
        return;
      }

      if (target.closest('#tm-sri-stop-download-btn')) {
        stopBatchDownloadPending();
        return;
      }

      const filterButton = target.closest('.tm-sri-filter-btn');

      if (filterButton) {
        const filter = filterButton.getAttribute('data-filter');

        if (['all', 'missing', 'downloaded'].includes(filter)) {
          state.viewFilter = filter;
          GM_setValue('viewFilter', filter);
          updateFilterButtons();
          applyInvoiceStatusToTable();
        }
      }
    });

    return dashboard;
  }

  function renderDashboard({ status, message }) {
    const dashboard = ensureDashboardMounted();
    const messageElement = document.getElementById('tm-sri-dashboard-message');
    const statusPill = document.getElementById('tm-sri-status-pill');

    dashboard.classList.remove(
      'tm-sri-dashboard-loading',
      'tm-sri-dashboard-success',
      'tm-sri-dashboard-warning',
      'tm-sri-dashboard-error'
    );

    dashboard.classList.add(`tm-sri-dashboard-${status}`);

    if (messageElement) {
      messageElement.textContent = message;
    }

    if (statusPill) {
      statusPill.className = `tm-sri-status-pill tm-sri-status-${status}`;
      statusPill.textContent = getStatusLabel(status);
    }

    updateDashboardStats();
  }

  function updateDashboardStats() {
    ensureDashboardMounted();

    const summary = state.apiData?.summary;
    const page = state.lastPageStats;
    const report = state.reportStatusData;

    setText('tm-sri-stat-total-api', summary?.total ?? '-');
    setText('tm-sri-stat-downloaded-api', summary?.downloaded ?? '-');
    setText('tm-sri-stat-missing-api', summary?.missing ?? '-');
    setText('tm-sri-stat-page-rows', page.rows ?? 0);
    setText('tm-sri-stat-hidden', page.hidden ?? 0);
    setText('tm-sri-stat-unknown', page.unknown ?? 0);

    setText('tm-sri-meta-page-ruc', state.pageRuc || '-');
    setText('tm-sri-meta-receiver-ruc', state.receiverRuc || '-');
    setText(
      'tm-sri-meta-period',
      `${getSelectedYear() || '-'} / ${getSelectedMonth() || '-'} / día ${getSelectedDay()}`
    );

    setText('tm-sri-meta-hidden-months', state.hiddenMonthsCount);

    setText(
      'tm-sri-meta-txt',
      report
        ? `${report.status || '-'} | ${report.should_download_txt ? 'descargar' : 'ok'} | ${report.reason || '-'}`
        : state.lastReportStatusError
          ? `error: ${state.lastReportStatusError}`
          : '-'
    );

    setText(
      'tm-sri-meta-last-refresh',
      state.lastInvoicesRefreshAt ? state.lastInvoicesRefreshAt.toLocaleTimeString() : '-'
    );

    setText(
      'tm-sri-meta-batch',
      state.isBatchDownloading
        ? `${state.batchDownloadedCount}/${state.batchQueueTotal} | páginas: ${state.batchPageCount}`
        : 'Inactivo'
    );

    updateFilterButtons();
    updateCompactButton();
    updateBatchButtons();
    updateTxtButtons();
  }

  function updateFilterButtons() {
    const buttons = document.querySelectorAll('.tm-sri-filter-btn');

    for (const button of buttons) {
      const filter = button.getAttribute('data-filter');
      button.classList.toggle('tm-sri-btn-active', filter === state.viewFilter);
    }
  }

  function updateCompactButton() {
    const button = document.getElementById('tm-sri-compact-btn');

    if (button) {
      button.textContent = state.compactMode ? 'Expandir' : 'Minimizar';
    }
  }

  function updateBatchButtons() {
    const downloadPageButton = document.getElementById('tm-sri-download-page-btn');
    const downloadAllButton = document.getElementById('tm-sri-download-all-pages-btn');
    const stopButton = document.getElementById('tm-sri-stop-download-btn');

    if (downloadPageButton) {
      downloadPageButton.disabled = state.isBatchDownloading;
      downloadPageButton.textContent = state.isBatchDownloading
        ? 'Descargando...'
        : 'Descargar página';
    }

    if (downloadAllButton) {
      downloadAllButton.disabled = state.isBatchDownloading;
      downloadAllButton.textContent = state.isBatchDownloading
        ? 'Descargando...'
        : 'Descargar todas páginas';
    }

    if (stopButton) {
      stopButton.disabled = !state.isBatchDownloading;
    }
  }

  function updateTxtButtons() {
    const smartButton = document.getElementById('tm-sri-smart-txt-btn');
    const forceButton = document.getElementById('tm-sri-force-txt-btn');

    if (smartButton) {
      smartButton.disabled = state.isDownloadingTxtReport;
      smartButton.textContent = state.isDownloadingTxtReport
        ? 'TXT descargando...'
        : 'TXT inteligente';
    }

    if (forceButton) {
      forceButton.disabled = state.isDownloadingTxtReport;
    }
  }

  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = String(value);
    }
  }

  function getStatusLabel(status) {
    const labels = {
      loading: 'Cargando',
      success: 'Conectado',
      warning: 'Atención',
      error: 'Error'
    };

    return labels[status] || status;
  }

  function installManualConsultarHook() {
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;

        if (!(target instanceof Element)) {
          return;
        }

        if (target.closest('#tm-sri-dashboard')) {
          return;
        }

        const element = target.closest('button, input, a, span');

        if (!element) {
          return;
        }

        const text = normalizeText(
          element.textContent ||
            element.value ||
            element.getAttribute('title') ||
            element.getAttribute('aria-label') ||
            ''
        );

        const isConsultar = text.includes('consultar') || text.includes('buscar');

        if (!isConsultar) {
          return;
        }

        console.log('[SRI TM] Consultar manual detectado. Solo refrescaré API local después.');

        for (const delay of CONFIG.REFRESH_AFTER_MANUAL_CONSULTAR_MS) {
          setTimeout(() => {
            refreshAllFromApi();
          }, delay);
        }
      },
      true
    );
  }

  function installManualDownloadHooks() {
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;

        if (!(target instanceof Element)) {
          return;
        }

        const link = target.closest('a[id*="lnkXml"], a[id*="lnkPdf"], a[id$="lnkTxtlistado"]');

        if (!link) {
          return;
        }

        console.log('[SRI TM] Descarga manual detectada:', link.id);

        for (const delay of CONFIG.REFRESH_AFTER_DOWNLOAD_MS) {
          setTimeout(() => {
            refreshAllFromApi();
          }, delay);
        }
      },
      true
    );
  }

  function installPeriodChangeHook() {
  document.addEventListener(
    'change',
    (event) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const id = target.id || '';

      const changedYear =
        id === 'frmPrincipal:ano';

      const changedDocumentType =
        id === 'frmPrincipal:cmbTipoComprobante';

      const changedMonthOrDay =
        id === 'frmPrincipal:mes' ||
        id === 'frmPrincipal:dia';

      if (!changedYear && !changedDocumentType && !changedMonthOrDay) {
        return;
      }

      state.reportStatusData = null;

      if (changedYear || changedDocumentType) {
        resetMonthVisibility();

        state.periodData = null;
        state.periodDataKey = null;
        state.monthsByNumber.clear();
      }

      setTimeout(() => {
        if (changedYear || changedDocumentType) {
          refreshPeriodsFromApi(true);
        }

        refreshReportStatusFromApi(true);
        updateDashboardStats();
      }, 500);
    },
    true
  );
}

  function exposeDebugTools() {
    const targetWindow =
      typeof unsafeWindow !== 'undefined'
        ? unsafeWindow
        : window;

    targetWindow.tmSRI = {
      refresh: () => refreshAllFromApi(),
      refreshInvoices: () => refreshInvoicesFromApi(true),
      refreshPeriods: () => refreshPeriodsFromApi(true),
      refreshReportStatus: () => refreshReportStatusFromApi(true),
      apply: () => {
        applyInvoiceStatusToTable();
        applyMonthVisibility();
      },
      setFilter: (filter) => {
        if (!['all', 'missing', 'downloaded'].includes(filter)) {
          console.warn('Filtro inválido. Usa: all, missing o downloaded.');
          return;
        }

        state.viewFilter = filter;
        GM_setValue('viewFilter', filter);
        updateFilterButtons();
        applyInvoiceStatusToTable();
      },
      downloadTxtSmart: () => downloadTxtSmart(),
      downloadTxtForce: () => downloadTxtForce(),
      startDownloadPage: () => startBatchDownloadCurrentPage(),
      startDownloadAllPages: () => startBatchDownloadAllPages(),
      stopDownload: () => stopBatchDownloadPending(),
      nextPage: () => moveToNextPageAndContinue(),
      dumpRows: () => dumpCurrentRows(),
      state,
      config: CONFIG
    };

    console.log('[SRI TM] Debug listo: tmSRI.refresh(), tmSRI.downloadTxtSmart(), tmSRI.dumpRows()');
  }

  function dumpCurrentRows() {
    const tbody = findComprobantesTbody();

    if (!tbody) {
      console.warn('[SRI TM] No se encontró la tabla.');
      return [];
    }

    const indexes = getTableIndexes(tbody);

    const rows = Array.from(tbody.querySelectorAll('tr[role="row"], tr'))
      .filter((row) => row.querySelector('td'))
      .map((row) => {
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

  function injectStyles() {
    const style = document.createElement('style');

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

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function normalizeSpaces(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeText(value) {
    return normalizeSpaces(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function debounce(fn, delay) {
    let timer = null;

    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }
})();