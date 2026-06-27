export type ReportStatus = {
  should_download_txt?: boolean;
  status?: string;
  reason?: string;
};

export type ReportStatusSyncServiceDeps = {
  config: {
    API_BASE: string;
    API_REPORT_STATUS_PATH: string;
    RECEIVER_RUC_OVERRIDE: string;
    SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001: boolean;
  };
  state: {
    receiverRuc: string | null;
    reportStatusData: ReportStatus | null;
    isRefreshingReportStatus: boolean;
    lastReportStatusAt: Date | null;
    lastReportStatusError: string | null;
  };
  requestJson: (url: string) => Promise<{ success: boolean; data: unknown }>;
  getCurrentPageRuc: (document: Document, override: string) => string | null;
  toApiReceiverRuc: (pageRuc: string, sendAsBase10: boolean) => string | null;
  getSelectedYear: (document: Document) => number | null;
  getSelectedMonth: (document: Document) => number | null;
  getSelectedDay: (document: Document) => number;
  getSelectedDocumentType: (document: Document) => string;
  updateDashboardStats: () => void;
};

export function createReportStatusSyncService(deps: ReportStatusSyncServiceDeps) {
  const {
    config,
    state,
    requestJson,
    getCurrentPageRuc,
    toApiReceiverRuc,
    getSelectedYear,
    getSelectedMonth,
    getSelectedDay,
    getSelectedDocumentType,
    updateDashboardStats,
  } = deps;

  function buildReportUrl(receiverRuc: string, year: number, month: number, day: number, documentType: string) {
    return (
      `${config.API_BASE}${config.API_REPORT_STATUS_PATH}` +
      `?receiverRuc=${encodeURIComponent(receiverRuc)}` +
      `&year=${encodeURIComponent(String(year))}` +
      `&month=${encodeURIComponent(String(month))}` +
      `&day=${encodeURIComponent(String(day))}` +
      `&documentType=${encodeURIComponent(documentType)}`
    );
  }

  async function refreshReportStatusFromApi(force = false) {
    const pageRuc = getCurrentPageRuc(document, config.RECEIVER_RUC_OVERRIDE);

    if (!pageRuc) {
      return;
    }

    const receiverRuc = toApiReceiverRuc(pageRuc, config.SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001);
    const year = getSelectedYear(document);
    const month = getSelectedMonth(document);
    const day = getSelectedDay(document);
    const documentType = getSelectedDocumentType(document);

    if (!receiverRuc || !year || !month || !documentType) {
      return;
    }

    if (state.isRefreshingReportStatus) {
      console.log('[SRI TM] Ya hay una consulta de estado TXT en proceso.');
      return;
    }

    if (!force && state.reportStatusData) {
      updateDashboardStats();
      return;
    }

    state.isRefreshingReportStatus = true;
    state.receiverRuc = receiverRuc;

    try {
      const url = buildReportUrl(receiverRuc, year, month, day, documentType);

      console.log('[SRI TM] GET report-status:', url);

      const response = (await requestJson(url)) as { success: boolean; data: ReportStatus };

      if (!response || response.success !== true || !response.data) {
        throw new Error('Formato inválido en /report-status.');
      }

      state.reportStatusData = response.data;
      state.lastReportStatusAt = new Date();
      state.lastReportStatusError = null;
    } catch (error: unknown) {
      state.lastReportStatusError = error instanceof Error ? error.message : String(error);
      state.reportStatusData = null;

      console.warn('[SRI TM] Error report-status:', state.lastReportStatusError);
    } finally {
      state.isRefreshingReportStatus = false;
      updateDashboardStats();
    }
  }

  return {
    refreshReportStatusFromApi,
    buildReportUrl,
  };
}