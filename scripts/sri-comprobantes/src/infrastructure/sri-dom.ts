import { onlyDigits } from '@shared/text.ts';
import {
  buildTableIndexes,
  extractAccessKeyFromText,
  extractDocumentNumberFromTypeText,
} from '../domain/comprobante/row-matching.ts';
import { buildPaginationSignature } from '../domain/comprobante/pagination-signature.ts';

type PageDocument = Pick<Document, 'getElementById' | 'querySelector'>;

type ReceiverRucOptions = {
  pageRuc: string | null;
  receiverRucOverride: string;
  sendReceiverAsBase10WhenEnds001: boolean;
};

type CurrentPeriodsKeyOptions = ReceiverRucOptions & {
  year: number | null;
  documentType: string;
};

export function getCurrentPageRuc(document: PageDocument, receiverRucOverride: string) {
  if (receiverRucOverride) {
    return onlyDigits(receiverRucOverride);
  }

  const directInput = document.getElementById('frmPrincipal:txtParametro') as { value?: string } | null;

  if (directInput?.value) {
    const value = onlyDigits(directInput.value);

    if (value.length >= 10) {
      return value;
    }
  }

  const input =
    (document.querySelector('input[id$="txtParametro"]') as { value?: string } | null) ||
    (document.querySelector('input[name$="txtParametro"]') as { value?: string } | null) ||
    (document.querySelector('input.sri-input-txt-paramtero') as { value?: string } | null);

  if (input?.value) {
    const value = onlyDigits(input.value);

    if (value.length >= 10) {
      return value;
    }
  }

  const topbarRuc = document.querySelector('.area-usuario-blue span') as { textContent?: string } | null;

  if (topbarRuc?.textContent) {
    const match = topbarRuc.textContent.match(/\b\d{10,13}\b/);

    if (match) {
      return onlyDigits(match[0]);
    }
  }

  return null;
}

export function toApiReceiverRuc(value: string | null, sendReceiverAsBase10WhenEnds001: boolean) {
  const digits = onlyDigits(value || '');

  if (sendReceiverAsBase10WhenEnds001 && digits.length === 13 && digits.endsWith('001')) {
    return digits.slice(0, 10);
  }

  return digits;
}

export function getSelectedYear(document: PageDocument) {
  const select = document.getElementById('frmPrincipal:ano') as { value?: string } | null;
  return select?.value ? Number(select.value) : null;
}

export function getSelectedMonth(document: PageDocument) {
  const select = document.getElementById('frmPrincipal:mes') as { value?: string } | null;
  return select?.value ? Number(select.value) : null;
}

export function getSelectedDay(document: PageDocument) {
  const select = document.getElementById('frmPrincipal:dia') as { value?: string } | null;
  return select?.value ? Number(select.value) : 0;
}

export function getSelectedDocumentType(document: PageDocument) {
  const select = document.getElementById('frmPrincipal:cmbTipoComprobante') as { value?: string } | null;
  return select ? String(select.value || '') : '';
}

export function buildCurrentPeriodsKey(options: CurrentPeriodsKeyOptions) {
  const receiverRuc = options.pageRuc
    ? toApiReceiverRuc(options.pageRuc, options.sendReceiverAsBase10WhenEnds001)
    : null;

  if (!receiverRuc || !options.year || !options.documentType) {
    return null;
  }

  return `${receiverRuc}:${options.year}:${options.documentType}`;
}

export type TableIndexes = { type: number; access: number; xml: number; pdf: number };

export type RowData = {
  row: HTMLTableRowElement;
  cells: HTMLElement[];
  typeCell: HTMLElement | null;
  accessCell: HTMLElement | null;
  xmlCell: HTMLElement | null;
  pdfCell: HTMLElement | null;
  accessKey: string | null;
  documentNumber: string | null;
};

export function getTableIndexes(tbody: HTMLElement): TableIndexes {
  const table = tbody.closest('table') as HTMLTableElement | null;
  const headers = table ? (Array.from(table.querySelectorAll('thead th')) as HTMLElement[]) : [];

  return buildTableIndexes(headers.map((th) => th.textContent ?? ''));
}

export function extractRowData(row: HTMLTableRowElement, indexes: TableIndexes): RowData {
  const cells = Array.from(row.children) as HTMLElement[];

  const typeCell = cells[indexes.type] || cells[2] || null;
  const accessCell = cells[indexes.access] || cells[3] || null;
  const xmlCell = cells[indexes.xml] || cells[9] || null;
  const pdfCell = cells[indexes.pdf] || cells[10] || null;

  const accessText = accessCell ? accessCell.textContent || '' : row.textContent || '';
  const accessKey = extractAccessKeyFromText(accessText);

  const documentNumber = typeCell
    ? extractDocumentNumberFromTypeText(typeCell.textContent || '')
    : null;

  return {
    row,
    cells,
    typeCell,
    accessCell,
    xmlCell,
    pdfCell,
    accessKey,
    documentNumber,
  };
}

export function getPaginationSignature(): string {
  const current =
    document.querySelector('.ui-paginator-current') ||
    document.querySelector('[class*="ui-paginator-current"]');
  const tbody = findComprobantesTbody();
  const tableText = tbody
    ? Array.from(tbody.querySelectorAll('tr'))
        .map((row) => row.textContent || '')
        .join(' ')
    : null;

  return buildPaginationSignature(current?.textContent || '', tableText);
}

export function findComprobantesTbody(): HTMLElement | null {
  return (
    document.getElementById('frmPrincipal:tablaCompRecibidos_data') ||
    document.querySelector('tbody[id$="tablaCompRecibidos_data"]') ||
    document.querySelector('#frmPrincipal\\:panelListaComprobantes tbody.ui-datatable-data')
  );
}

export function findNextPageButton(): HTMLElement | null {
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

  return (next as HTMLElement) || null;
}