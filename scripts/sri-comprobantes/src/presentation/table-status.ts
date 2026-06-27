import { state } from '@sri/shared/state.ts';
import { CONFIG } from '@sri/shared/config.ts';
import {
  findComprobantesTbody,
  getTableIndexes,
  extractRowData,
} from '../infrastructure/sri-dom.ts';
import { isAvailable, isPdfOk } from '../domain/comprobante/status.ts';
import { shouldTreatAsDownloaded } from '../domain/comprobante/row-matching.ts';
import { renderDashboard, updateDashboardStats } from './dashboard.ts';
import {
  upsertRowBadge,
  removeRowBadge,
  replaceDownloadCell,
  restoreCell,
  restoreDownloadCells,
  hideRow,
  resetRowVisualState,
} from './table-badges.ts';

export function findMatchingInvoice(rowData: {
  accessKey: string | null;
  documentNumber: string | null;
}) {
  if (rowData.accessKey && state.byAccessKey.has(rowData.accessKey)) {
    return state.byAccessKey.get(rowData.accessKey);
  }

  if (rowData.documentNumber && state.byDocumentNumber.has(rowData.documentNumber)) {
    return state.byDocumentNumber.get(rowData.documentNumber);
  }

  return null;
}

export function applyInvoiceStatusToTable() {
  const tbody = findComprobantesTbody();

  if (!tbody || !state.apiData) {
    updateDashboardStats();
    return;
  }

  const indexes = getTableIndexes(tbody);
  const rows = Array.from(tbody.querySelectorAll('tr[role="row"], tr')) as HTMLTableRowElement[];

  const pageStats = {
    rows: 0,
    downloaded: 0,
    missing: 0,
    unknown: 0,
    hidden: 0,
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

    const downloaded = shouldTreatAsDownloaded(invoice, {
      hideWhenXmlIsAvailable: CONFIG.HIDE_WHEN_XML_IS_AVAILABLE,
    });

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

    const missingParts: string[] = [];

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
      'missing',
    );

    if (state.viewFilter === 'downloaded') {
      hideRow(row);
      pageStats.hidden++;
    }
  }

  state.lastPageStats = pageStats;
  updateDashboardStats();
}
