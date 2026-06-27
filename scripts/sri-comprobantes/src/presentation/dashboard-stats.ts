import { state } from '@sri/shared/state.ts';
import { ensureDashboardMounted } from './dashboard-render.ts';
import { escapeHtml } from '@shared/text.ts';

export function updateDashboardStats() {
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

function updateStatsGrid(
  summary: { total?: number; downloaded?: number; missing?: number } | undefined,
  page: { rows: number; hidden: number; unknown: number }
) {
  const grid = document.getElementById('tm-sri-stats-grid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="tm-sri-stat">
      <span>Total API</span>
      <strong>${summary?.total ?? '-'}</strong>
    </div>
    <div class="tm-sri-stat">
      <span>Descargadas API</span>
      <strong>${summary?.downloaded ?? '-'}</strong>
    </div>
    <div class="tm-sri-stat">
      <span>Pendientes API</span>
      <strong>${summary?.missing ?? '-'}</strong>
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

function updateMetaContainer(
  summary: { total?: number; downloaded?: number; missing?: number } | undefined,
  page: { rows: number },
  report: { status?: string; should_download_txt?: boolean; reason?: string } | null
) {
  const container = document.getElementById('tm-sri-meta-container');
  if (!container) return;

  const txtStatus = report
    ? `${escapeHtml(report.status || '-')} | ${report.should_download_txt ? 'descargar' : 'ok'} | ${escapeHtml(report.reason || '-')}`
    : state.lastReportStatusError
      ? `error: ${escapeHtml(state.lastReportStatusError)}`
      : '-';

  const refreshTime = state.lastInvoicesRefreshAt
    ? state.lastInvoicesRefreshAt.toLocaleTimeString()
    : '-';

  const batchStatus = state.isBatchDownloading
    ? `${state.batchDownloadedCount}/${state.batchQueueTotal} | páginas: ${state.batchPageCount}`
    : 'Inactivo';

  container.innerHTML = `
    <span><strong>RUC pantalla:</strong> <span>${escapeHtml(state.pageRuc || '-')}</span></span>
    <span><strong>receiverRuc API:</strong> <span>${escapeHtml(state.receiverRuc || '-')}</span></span>
    <span><strong>Periodo:</strong> <span>${escapeHtml(`${page.rows} / - / día -`)}</span></span>
    <span><strong>Meses ocultos:</strong> <span>${state.hiddenMonthsCount}</span></span>
    <span><strong>TXT:</strong> <span>${txtStatus}</span></span>
    <span><strong>Última API:</strong> <span>${refreshTime}</span></span>
    <span><strong>Lote:</strong> <span>${batchStatus}</span></span>
  `;
}

export function updateFilterButtons() {
  const buttons = document.querySelectorAll('.tm-sri-filter-btn');

  for (const button of buttons) {
    const filter = button.getAttribute('data-filter');
    button.classList.toggle('tm-sri-btn-active', filter === state.viewFilter);
  }
}

export function updateCompactButton() {
  const button = document.getElementById('tm-sri-compact-btn');

  if (button) {
    button.textContent = state.compactMode ? 'Expandir' : 'Minimizar';
  }
}

export function updateBatchButtons() {
  const downloadPageButton = document.getElementById('tm-sri-download-page-btn');
  const downloadAllButton = document.getElementById('tm-sri-download-all-pages-btn');
  const stopButton = document.getElementById('tm-sri-stop-download-btn');

  if (downloadPageButton) {
    downloadPageButton.disabled = state.isBatchDownloading;
    downloadPageButton.textContent = state.isBatchDownloading ? 'Descargando...' : 'Descargar página';
  }

  if (downloadAllButton) {
    downloadAllButton.disabled = state.isBatchDownloading;
    downloadAllButton.textContent = state.isBatchDownloading ? 'Descargando...' : 'Descargar todas páginas';
  }

  if (stopButton) {
    stopButton.disabled = !state.isBatchDownloading;
  }
}

export function updateTxtButtons() {
  const smartButton = document.getElementById('tm-sri-smart-txt-btn');
  const forceButton = document.getElementById('tm-sri-force-txt-btn');

  if (smartButton) {
    smartButton.disabled = state.isDownloadingTxtReport;
    smartButton.textContent = state.isDownloadingTxtReport ? 'TXT descargando...' : 'TXT inteligente';
  }

  if (forceButton) {
    forceButton.disabled = state.isDownloadingTxtReport;
  }
}

export function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    loading: 'Cargando',
    success: 'Conectado',
    warning: 'Atención',
    error: 'Error'
  };

  return labels[status] || status;
}

export function buildMonthTitle(metadata: { status?: string; total?: number; downloaded?: number; missing?: number }) {
  const status = metadata.status || '-';
  const total = metadata.total ?? 0;
  const downloaded = metadata.downloaded ?? 0;
  const missing = metadata.missing ?? 0;

  return `Estado: ${status}. Total: ${total}. Descargadas: ${downloaded}. Pendientes: ${missing}.`;
}
