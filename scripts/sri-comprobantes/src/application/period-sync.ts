export type PeriodSyncServiceDeps = {
  config: {
    API_BASE: string;
    API_PERIODS_PATH: string;
    RECEIVER_RUC_OVERRIDE: string;
    SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001: boolean;
    HIDE_MONTHS_USING_API: boolean;
  };
  state: {
    receiverRuc: string | null;
    periodData: { months?: unknown[] } | null;
    periodDataKey: string | null;
    monthsByNumber: Map<number, unknown>;
    isRefreshingPeriods: boolean;
    lastPeriodsRefreshAt: Date | null;
    lastPeriodsError: string | null;
  };
  requestJson: (url: string) => Promise<{ success: boolean; data: unknown }>;
  getCurrentPageRuc: (document: Document, override: string) => string | null;
  toApiReceiverRuc: (pageRuc: string, sendAsBase10: boolean) => string | null;
  getSelectedYear: (document: Document) => number | null;
  getSelectedDocumentType: (document: Document) => string;
  getCurrentPeriodsKey: () => string | null;
  indexMonths: (months: unknown[]) => void;
  applyMonthVisibility: () => void;
  resetMonthVisibility: () => void;
  updateDashboardStats: () => void;
};

type PeriodApiResponse = { months?: unknown[] };

export function createPeriodSyncService(deps: PeriodSyncServiceDeps) {
  const {
    config,
    state,
    requestJson,
    getCurrentPageRuc,
    toApiReceiverRuc,
    getSelectedYear,
    getSelectedDocumentType,
    getCurrentPeriodsKey,
    indexMonths,
    applyMonthVisibility,
    resetMonthVisibility,
    updateDashboardStats,
  } = deps;

  async function refreshPeriodsFromApi(force = false) {
    if (!config.HIDE_MONTHS_USING_API) {
      return;
    }

    const pageRuc = getCurrentPageRuc(document, config.RECEIVER_RUC_OVERRIDE);

    if (!pageRuc) {
      return;
    }

    const receiverRuc = toApiReceiverRuc(pageRuc, config.SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001);
    const year = getSelectedYear(document);
    const documentType = getSelectedDocumentType(document);
    const periodKey = getCurrentPeriodsKey();

    if (!receiverRuc || !year || !documentType || !periodKey) {
      resetMonthVisibility();
      return;
    }

    if (state.isRefreshingPeriods) {
      console.log('[SRI TM] Ya hay una consulta de periodos en proceso.');
      return;
    }

    if (!force && state.periodData && state.periodDataKey === periodKey) {
      applyMonthVisibility();
      return;
    }

    state.isRefreshingPeriods = true;
    state.receiverRuc = receiverRuc;

    try {
      const url =
        `${config.API_BASE}${config.API_PERIODS_PATH}` +
        `?receiverRuc=${encodeURIComponent(receiverRuc)}` +
        `&year=${encodeURIComponent(year)}` +
        `&documentType=${encodeURIComponent(documentType)}`;

      console.log('[SRI TM] GET periods:', url);

      const response = (await requestJson(url)) as { success: boolean; data: PeriodApiResponse };

      if (!response || response.success !== true || !response.data) {
        throw new Error('Formato inválido en /periods.');
      }

      state.periodData = response.data;
      state.periodDataKey = periodKey;
      state.lastPeriodsRefreshAt = new Date();
      state.lastPeriodsError = null;

      indexMonths(response.data.months || []);
      applyMonthVisibility();
    } catch (error: unknown) {
      state.lastPeriodsError = error instanceof Error ? error.message : String(error);
      state.periodData = null;
      state.periodDataKey = null;
      state.monthsByNumber.clear();

      console.warn('[SRI TM] Error periods:', state.lastPeriodsError);
    } finally {
      state.isRefreshingPeriods = false;
      updateDashboardStats();
    }
  }

  function indexMonthsToState(months: unknown[]) {
    state.monthsByNumber.clear();

    for (const month of months) {
      state.monthsByNumber.set(Number((month as { month?: number }).month), month);
    }

    console.log('[SRI TM] Meses indexados:', state.monthsByNumber.size);
  }

  function ensurePeriodsMatchCurrentSelection() {
    const currentKey = getCurrentPeriodsKey();

    if (!currentKey) {
      resetMonthVisibility();
      return;
    }

    if (state.periodDataKey === currentKey) {
      return;
    }

    resetMonthVisibility();

    state.periodData = null;
    state.periodDataKey = null;
    state.monthsByNumber.clear();

    if (!state.isRefreshingPeriods) {
      refreshPeriodsFromApi(true);
    }
  }

  return {
    refreshPeriodsFromApi,
    indexMonths: indexMonthsToState,
    ensurePeriodsMatchCurrentSelection,
  };
}