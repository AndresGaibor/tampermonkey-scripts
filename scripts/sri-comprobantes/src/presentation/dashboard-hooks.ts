import { normalizeText } from '@shared/text.ts';
import { state } from '@sri/shared/state.ts';
import { CONFIG } from '@sri/shared/config.ts';

export function installManualConsultarHook(
  refreshAllFromApi: () => void
) {
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

export function installManualDownloadHooks(
  refreshAllFromApi: () => void
) {
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

export function installPeriodChangeHook(
  refreshPeriodsFromApi: (force?: boolean) => Promise<void>,
  refreshReportStatusFromApi: (force?: boolean) => Promise<void>,
  updateDashboardStats: () => void
) {
  document.addEventListener(
    'change',
    (event) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const id = target.id || '';

      const changedYear = id === 'frmPrincipal:ano';
      const changedDocumentType = id === 'frmPrincipal:cmbTipoComprobante';
      const changedMonthOrDay = id === 'frmPrincipal:mes' || id === 'frmPrincipal:dia';

      if (!changedYear && !changedDocumentType && !changedMonthOrDay) {
        return;
      }

      state.reportStatusData = null;

      if (changedYear || changedDocumentType) {
        const monthSelect = document.getElementById('frmPrincipal:mes') as HTMLSelectElement | null;

        if (monthSelect) {
          for (const option of Array.from(monthSelect.options) as HTMLOptionElement[]) {
            option.hidden = false;
            option.disabled = false;
            option.title = '';
            option.dataset.tmSriHidden = 'false';
          }
        }

        state.hiddenMonthsCount = 0;
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
