import {
  buildDownloadQueue,
  type DownloadQueueCandidate,
  type DownloadQueueItem,
} from '../domain/download-queue.ts';
import { buildBatchDownloadCandidates } from '../domain/batch/batch-candidates.ts';
import { buildBatchPageLoadingMessage } from '../domain/batch/batch-messages.ts';
import { buildBatchProgressMessage } from '../domain/batch/batch-queue.ts';
import { dequeueBatchItem } from '../domain/batch/batch-queue.ts';
import { shouldTreatAsDownloaded } from '../domain/comprobante/row-matching.ts';
import type { BatchServiceDeps } from './batch-types.ts';

export function createBatchProcessor(deps: BatchServiceDeps) {
  const {
    config,
    state,
    findComprobantesTbody,
    getTableIndexes,
    extractRowData,
    findMatchingInvoice,
    upsertRowBadge,
    renderDashboard,
    refreshInvoicesFromApi,
    refreshReportStatusFromApi,
  } = deps;

  function buildDownloadQueueForCurrentPage() {
    const tbody = findComprobantesTbody();

    if (!tbody) {
      return [];
    }

    const indexes = getTableIndexes(tbody);
    const rows = (Array.from(tbody.querySelectorAll('tr[role="row"], tr')) as HTMLTableRowElement[])
      .filter((row) => row.querySelector('td'))
      .filter((row) => getComputedStyle(row).display !== 'none');

    const candidates: DownloadQueueCandidate<HTMLTableRowElement>[] = buildBatchDownloadCandidates({
      rows,
      extractRowData: (row) => extractRowData(row, indexes),
      findMatchingInvoice: (rowData) => findMatchingInvoice(rowData),
      shouldTreatAsDownloaded: (invoice, options) =>
        shouldTreatAsDownloaded(invoice as { xml_status: unknown; pdf_status: unknown }, options),
      hideWhenXmlIsAvailable: false,
      getAccessCell: (rowData) => rowData.accessCell,
      getAccessKey: (rowData) => rowData.accessKey,
      getXmlLink: (rowData) => rowData.xmlCell?.querySelector('a[id*="lnkXml"]') as HTMLAnchorElement | null,
      getPdfLink: (rowData) => rowData.pdfCell?.querySelector('a[id*="lnkPdf"]') as HTMLAnchorElement | null,
    });

    return buildDownloadQueue(candidates, {
      autoDownloadXml: config.AUTO_DOWNLOAD_XML,
      autoDownloadPdf: config.AUTO_DOWNLOAD_PDF,
      maxBatchDownloadsPerPage: config.MAX_BATCH_DOWNLOADS_PER_PAGE,
    });
  }

  function processCurrentPageForBatch() {
    if (!state.isBatchDownloading) {
      deps.finishBatch('Descarga por lote detenida.', 'warning');
      return;
    }

    const pageSignature = deps.getPaginationSignature();

    if (state.batchAcrossPages) {
      if (deps.shouldStopForCycle(state.batchVisitedPages, pageSignature)) {
        deps.finishBatch('Proceso detenido para evitar repetir una página.', 'warning');
        return;
      }

      state.batchVisitedPages = deps.registerVisitedPage(state.batchVisitedPages, pageSignature);
      state.batchPageCount++;

      if (deps.shouldStopForPageLimit(state.batchPageCount, config.MAX_PAGES_PER_BATCH)) {
        deps.finishBatch('Proceso detenido por límite máximo de páginas.', 'warning');
        return;
      }
    }

    const queue = buildDownloadQueueForCurrentPage();

    state.batchQueueTotal += queue.length;

    if (queue.length === 0) {
      if (state.batchAcrossPages && deps.moveToNextPageAndContinue()) {
        return;
      }

      deps.finishBatch(deps.buildBatchFinishMessage(state.batchDownloadedCount), 'success');
      return;
    }

    renderDashboard({
      status: 'loading',
      message: buildBatchPageLoadingMessage(state.batchPageCount, queue.length),
    });

    processDownloadQueue(queue);
  }

  function processDownloadQueue(queue: DownloadQueueItem<HTMLTableRowElement>[]) {
    if (!state.isBatchDownloading) {
      deps.finishBatch('Descarga por lote detenida.', 'warning');
      return;
    }

    const { item, remaining } = dequeueBatchItem(queue);

    if (!item) {
      refreshInvoicesFromApi(true);

      setTimeout(() => {
        if (state.batchAcrossPages && deps.moveToNextPageAndContinue()) {
          return;
        }

        deps.finishBatch(deps.buildBatchFinishMessage(state.batchDownloadedCount), 'success');
      }, config.PAGE_AFTER_QUEUE_DELAY_MS);

      return;
    }

    state.batchDownloadedCount++;

    item.row.classList.add('tm-sri-row-processing');

    upsertRowBadge(item.row, item.accessCell, `Descargando ${item.file.toUpperCase()}...`, 'processing');

    renderDashboard({
      status: 'loading',
      message: buildBatchProgressMessage(
        item.file.toUpperCase(),
        state.batchDownloadedCount,
        state.batchQueueTotal,
        remaining.length,
      ),
    });

    item.link.click();

    for (const delay of config.REFRESH_AFTER_DOWNLOAD_MS) {
      setTimeout(() => {
        refreshInvoicesFromApi(true);
        refreshReportStatusFromApi(true);
      }, delay);
    }

    setTimeout(() => {
      processDownloadQueue(remaining);
    }, config.DOWNLOAD_DELAY_MS);
  }

  return {
    buildDownloadQueueForCurrentPage,
    processCurrentPageForBatch,
    processDownloadQueue,
  };
}