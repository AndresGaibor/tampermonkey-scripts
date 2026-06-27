import { debounce } from '@shared/timing.ts';
import {
  getCurrentPeriodsKey as getCurrentPeriodsKeyFromPeriods,
  resetMonthVisibility as resetMonthVisibilityFromPeriods,
  applyMonthVisibility as applyMonthVisibilityFromPeriods,
} from '@sri/infrastructure/sri-periods.ts';
import { dumpCurrentRows } from '@sri/presentation/dashboard-debug.ts';
import { buildInvoiceIndexes } from '@sri/domain/comprobante/invoice-keys.ts';
import {
  buildBatchFinishMessage as buildBatchFinishMessageDomain,
} from '@sri/domain/batch/batch-finalization.ts';

import {
  registerVisitedPage,
  shouldAdvanceToNextPage,
  shouldStopForCycle,
  shouldStopForPageLimit,
} from '@sri/domain/batch/batch-pagination.ts';
import { createRequestJson } from '@sri/infrastructure/sri-api.ts';
import {
  extractRowData,
  findNextPageButton,
  getCurrentPageRuc,
  getPaginationSignature,
  getSelectedDay,
  getSelectedDocumentType,
  getSelectedMonth,
  getSelectedYear,
  getTableIndexes,
  toApiReceiverRuc,
} from '@sri/infrastructure/sri-dom.ts';
import { state } from '@sri/shared/state.ts';
import { CONFIG } from '@sri/shared/config.ts';
import {
  ensureDashboardMounted,
  renderDashboard,
  updateDashboardStats,
  updateFilterButtons,
  updateBatchButtons,
  updateTxtButtons,
  injectStyles,
} from '@sri/presentation/dashboard.ts';
import {
  installManualConsultarHook,
  installManualDownloadHooks,
  installPeriodChangeHook,
  exposeDebugTools,
  findComprobantesTbody,
} from '@sri/presentation/dashboard-actions.ts';
import { createInvoiceSyncService } from '@sri/application/invoice-sync.ts';
import { createPeriodSyncService } from '@sri/application/period-sync.ts';
import { createReportStatusSyncService } from '@sri/application/report-status-sync.ts';
import { createSyncOrchestrator } from '@sri/application/sync-orchestrator.ts';
import { createTxtService } from '@sri/application/txt-service.ts';
import { createBatchOrchestrator } from '@sri/application/batch-orchestrator.ts';
import { createBatchProcessor } from '@sri/application/batch-processor.ts';
import { createBatchPagination } from '@sri/application/batch-pagination.ts';
import { createBatchFinalization } from '@sri/application/batch-finalization.ts';
import { applyInvoiceStatusToTable, findMatchingInvoice } from '@sri/presentation/table-status.ts';
import { upsertRowBadge } from '@sri/presentation/table-badges.ts';
import type { BatchServiceDeps } from '@sri/application/batch-types.ts';

(function () {
  'use strict';

  const TARGET_PATH =
    '/comprobantes-electronicos-internet/pages/consultas/recibidos/comprobantesRecibidos.jsf';

  if (!location.pathname.includes(TARGET_PATH)) {
    return;
  }

  injectStyles();
  ensureDashboardMounted();

  const requestJson = createRequestJson((options) => {
    GM_xmlhttpRequest(options as never);
  }) as (url: string) => Promise<{ success: boolean; data: unknown }>;

  // ── Period / Month helpers ──────────────────────────────────────────────

  const getCurrentPeriodsKey = () => getCurrentPeriodsKeyFromPeriods(CONFIG);

  const resetMonthVisibility = () => resetMonthVisibilityFromPeriods(state, updateDashboardStats);

  const applyMonthVisibility = () => applyMonthVisibilityFromPeriods(
    state,
    CONFIG,
    () => getCurrentPeriodsKeyFromPeriods(CONFIG),
    () => resetMonthVisibilityFromPeriods(state, updateDashboardStats),
    updateDashboardStats,
  );

  // ── Application layer ───────────────────────────────────────────────────

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
    updateDashboardStats,
  });

  const periodSync = createPeriodSyncService({
    config: CONFIG,
    state,
    requestJson,
    getCurrentPageRuc: (doc, override) => getCurrentPageRuc(doc, override),
    toApiReceiverRuc: (pageRuc, sendAsBase10) => toApiReceiverRuc(pageRuc, sendAsBase10),
    getSelectedYear: (doc) => getSelectedYear(doc),
    getSelectedDocumentType: (doc) => getSelectedDocumentType(doc),
    getCurrentPeriodsKey,
    indexMonths: (months) => {
      state.monthsByNumber.clear();
      for (const month of months) {
        state.monthsByNumber.set(Number((month as { month?: number }).month), month);
      }
    },
    applyMonthVisibility,
    resetMonthVisibility,
    updateDashboardStats,
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
    updateDashboardStats,
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
    REFRESH_AFTER_DOWNLOAD_MS: CONFIG.REFRESH_AFTER_DOWNLOAD_MS,
  });

  const batchDeps: BatchServiceDeps = {
    config: CONFIG as never,
    state: state as never,
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
    buildBatchFinishMessage: buildBatchFinishMessageDomain,
    processCurrentPageForBatch: () => {},
    moveToNextPageAndContinue: () => false,
    finishBatch: () => {},
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
    refreshReportStatusFromApi: reportStatusSync.refreshReportStatusFromApi,
  });

  // ── Startup ─────────────────────────────────────────────────────────────

  start();

  function start() {
    syncOrchestrator.refreshAllFromApi();

    installManualConsultarHook(syncOrchestrator.refreshAllFromApi);
    installManualDownloadHooks(syncOrchestrator.refreshAllFromApi);
    installPeriodChangeHook(
      periodSync.refreshPeriodsFromApi,
      reportStatusSync.refreshReportStatusFromApi,
      updateDashboardStats,
    );

    exposeDebugTools({
      applyInvoiceStatusToTable,
      applyMonthVisibility,
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
      refreshReportStatusFromApi: reportStatusSync.refreshReportStatusFromApi,
    });

    setInterval(() => {
      ensureDashboardMounted();
      periodSync.ensurePeriodsMatchCurrentSelection();
      applyInvoiceStatusToTable();
      applyMonthVisibility();
    }, CONFIG.APPLY_INTERVAL_MS);

    const observer = new MutationObserver(
      debounce(() => {
        ensureDashboardMounted();
        periodSync.ensurePeriodsMatchCurrentSelection();
        applyInvoiceStatusToTable();
        applyMonthVisibility();
      }, CONFIG.OBSERVER_DEBOUNCE_MS),
    );

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

})();
