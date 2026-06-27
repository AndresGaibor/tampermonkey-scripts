import { state } from '@sri/shared/state.ts';
import { CONFIG } from '@sri/shared/config.ts';
import {
  findComprobantesTbody,
  getTableIndexes,
  extractRowData,
} from '../infrastructure/sri-dom.ts';
import { findMatchingInvoice } from './table-status.ts';

export function dumpCurrentRows() {
  const tbody = findComprobantesTbody();

  if (!tbody) {
    console.warn('[SRI TM] No se encontró la tabla.');
    return [];
  }

  const indexes = getTableIndexes(tbody);

  const rows = (Array.from(tbody.querySelectorAll('tr[role="row"], tr')) as HTMLTableRowElement[])
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
        display: getComputedStyle(row).display,
      };
    });

  console.table(rows);
  return rows;
}

export function exposeDebugTools(callbacks: {
  applyInvoiceStatusToTable: () => void;
  applyMonthVisibility: () => void;
  updateFilterButtons: () => void;
  downloadTxtSmart: () => Promise<void>;
  downloadTxtForce: () => void;
  startBatchDownloadCurrentPage: () => void;
  startBatchDownloadAllPages: () => void;
  stopBatchDownloadPending: () => void;
  moveToNextPageAndContinue: () => boolean;
  dumpCurrentRows: () => void;
  refreshAllFromApi: () => void;
  refreshInvoicesFromApi: (force?: boolean) => Promise<void>;
  refreshPeriodsFromApi: (force?: boolean) => Promise<void>;
  refreshReportStatusFromApi: (force?: boolean) => Promise<void>;
}) {
  const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  targetWindow.tmSRI = {
    refresh: () => callbacks.refreshAllFromApi(),
    refreshInvoices: () => callbacks.refreshInvoicesFromApi(true),
    refreshPeriods: () => callbacks.refreshPeriodsFromApi(true),
    refreshReportStatus: () => callbacks.refreshReportStatusFromApi(true),
    apply: () => {
      callbacks.applyInvoiceStatusToTable();
      callbacks.applyMonthVisibility();
    },
    setFilter: (filter: string) => {
      if (!['all', 'missing', 'downloaded'].includes(filter)) {
        console.warn('Filtro inválido. Usa: all, missing o downloaded.');
        return;
      }

      state.viewFilter = filter;
      GM_setValue('viewFilter', filter);
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

  console.log('[SRI TM] Debug listo: tmSRI.refresh(), tmSRI.downloadTxtSmart(), tmSRI.dumpRows()');
}
