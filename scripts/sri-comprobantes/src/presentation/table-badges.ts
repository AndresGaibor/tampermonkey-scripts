import { escapeHtml } from '@shared/text.ts';

type RowData = {
  xmlCell: HTMLElement | null;
  pdfCell: HTMLElement | null;
};

export function upsertRowBadge(
  row: HTMLElement,
  accessCell: HTMLElement | null,
  text: string,
  type: string,
) {
  const target = (accessCell?.querySelector('.ui-dt-c') as HTMLElement | null) || accessCell;

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

export function removeRowBadge(row: HTMLElement) {
  const badge = row.querySelector('.tm-sri-row-badge');

  if (badge) {
    badge.remove();
  }
}

export function replaceDownloadCell(cell: HTMLElement | null, label: string, type: string) {
  if (!cell) {
    return;
  }

  if (!cell.dataset.tmOriginalHtml) {
    cell.dataset.tmOriginalHtml = cell.innerHTML;
  }

  const desiredHtml =
    `<div class="ui-dt-c"><span class="tm-sri-file-badge tm-sri-file-${escapeHtml(type)}">${escapeHtml(label)}</span></div>`;

  if (cell.innerHTML.trim() !== desiredHtml) {
    cell.innerHTML = desiredHtml;
  }
}

export function restoreCell(cell: HTMLElement | null) {
  if (!cell || !cell.dataset.tmOriginalHtml) {
    return;
  }

  cell.innerHTML = cell.dataset.tmOriginalHtml;
  delete cell.dataset.tmOriginalHtml;
}

export function restoreDownloadCells(rowData: RowData) {
  restoreCell(rowData.xmlCell);
  restoreCell(rowData.pdfCell);
}

export function hideRow(row: HTMLTableRowElement) {
  row.classList.add('tm-sri-row-hidden');
  row.style.setProperty('display', 'none', 'important');
}

export function resetRowVisualState(row: HTMLElement) {
  row.classList.remove(
    'tm-sri-row-downloaded',
    'tm-sri-row-missing',
    'tm-sri-row-unknown',
    'tm-sri-row-hidden',
    'tm-sri-row-processing',
  );

  row.style.removeProperty('display');
}
