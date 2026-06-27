import { state } from '@sri/shared/state.ts';
import {
  updateDashboardStats,
  updateFilterButtons,
  updateCompactButton,
  updateBatchButtons,
  updateTxtButtons,
  getStatusLabel,
} from './dashboard-stats.ts';

export function ensureDashboardMounted() {
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

export function findDashboardMountTarget() {
  const searchPanel = document.getElementById('frmPrincipal:pnlBusqueda');
  const pnlDocumentos = document.getElementById('frmPrincipal:pnldocumentosrecibidos');
  const tableWrapper = document.getElementById('frmPrincipal:tablaCompRecibidos');
  const panelLista = document.getElementById('frmPrincipal:panelListaComprobantes');

  if (searchPanel) {
    return { mode: 'after' as const, reference: searchPanel };
  }

  if (pnlDocumentos) {
    return { mode: 'before' as const, reference: pnlDocumentos };
  }

  if (tableWrapper) {
    return { mode: 'before' as const, reference: tableWrapper };
  }

  if (panelLista) {
    return { mode: 'prepend' as const, element: panelLista };
  }

  return { mode: 'prepend' as const, element: document.body };
}

export function createDashboardElement() {
  const wrapper = document.createElement('div');
  const compactClass = state.compactMode ? ' tm-sri-dashboard-compact' : '';

  wrapper.innerHTML = `
    <div id="tm-sri-dashboard" class="tm-sri-dashboard${compactClass}">
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
    </div>
  `;

  return wrapper.firstElementChild as HTMLElement;
}

export function renderDashboard({ status, message }: { status: string; message: string }) {
  ensureDashboardMounted();
  const dashboard = document.getElementById('tm-sri-dashboard');
  const messageElement = document.getElementById('tm-sri-dashboard-message');
  const statusPill = document.getElementById('tm-sri-status-pill');

  if (dashboard) {
    dashboard.classList.remove(
      'tm-sri-dashboard-loading',
      'tm-sri-dashboard-success',
      'tm-sri-dashboard-warning',
      'tm-sri-dashboard-error'
    );

    dashboard.classList.add(`tm-sri-dashboard-${status}`);
  }

  if (messageElement) {
    messageElement.textContent = message;
  }

  if (statusPill) {
    statusPill.className = `tm-sri-status-pill tm-sri-status-${status}`;
    statusPill.textContent = getStatusLabel(status);
  }

  updateDashboardStats();
}
