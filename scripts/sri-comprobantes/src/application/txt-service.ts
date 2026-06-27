import { normalizeText } from '@shared/text.ts';

export type TxtServiceState = {
  isDownloadingTxtReport: boolean;
  receiverRuc: string | null;
  reportStatusData: ReportStatus | null;
};

export type ReportStatus = {
  should_download_txt?: boolean;
  status?: string;
  reason?: string;
};

export type TxtServiceDeps = {
  state: TxtServiceState;
  renderDashboard: (opts: { status: string; message: string }) => void;
  updateTxtButtons: () => void;
  refreshReportStatusFromApi: (force?: boolean) => Promise<void>;
  refreshPeriodsFromApi: (force?: boolean) => Promise<void>;
  refreshInvoicesFromApi: (force?: boolean) => Promise<void>;
  getSelectedYear: (document: Document) => number | null;
  getSelectedMonth: (document: Document) => number | null;
  getSelectedDay: (document: Document) => number;
  getSelectedDocumentType: (document: Document) => string;
  REFRESH_AFTER_DOWNLOAD_MS: number[];
};

export function createTxtService(deps: TxtServiceDeps) {
  const {
    state,
    renderDashboard,
    updateTxtButtons,
    refreshReportStatusFromApi,
    refreshPeriodsFromApi,
    refreshInvoicesFromApi,
    getSelectedYear,
    getSelectedMonth,
    getSelectedDay,
    getSelectedDocumentType,
    REFRESH_AFTER_DOWNLOAD_MS,
  } = deps;

  function findTxtReportLink(): HTMLElement | null {
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
        message: 'Ya hay una descarga TXT en proceso.',
      });
      return;
    }

    await refreshReportStatusFromApi(true);

    const report = state.reportStatusData as ReportStatus | null;

    if (!report) {
      renderDashboard({
        status: 'error',
        message: 'No se pudo leer el estado TXT desde la API.',
      });
      return;
    }

    if (!report.should_download_txt) {
      renderDashboard({
        status: 'success',
        message: `TXT no necesario. Estado: ${report.status}. Motivo: ${report.reason}.`,
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
        message: 'No se encontró "Descargar reporte". Primero consulta el SRI manualmente.',
      });
      return;
    }

    state.isDownloadingTxtReport = true;
    updateTxtButtons();

    renderDashboard({
      status: 'loading',
      message: customMessage,
    });

    console.log('[SRI TM] Descargando TXT manual:', {
      receiverRuc: state.receiverRuc,
      year: getSelectedYear(document),
      month: getSelectedMonth(document),
      day: getSelectedDay(document),
      documentType: getSelectedDocumentType(document),
    });

    link.click();

    for (const delay of REFRESH_AFTER_DOWNLOAD_MS) {
      setTimeout(() => {
        refreshReportStatusFromApi(true);
        refreshPeriodsFromApi(true);
        refreshInvoicesFromApi(true);
      }, delay);
    }

    setTimeout(() => {
      state.isDownloadingTxtReport = false;
      updateTxtButtons();
    }, Math.max(...REFRESH_AFTER_DOWNLOAD_MS) + 1000);
  }

  return {
    findTxtReportLink,
    downloadTxtSmart,
    downloadTxtForce,
  };
}