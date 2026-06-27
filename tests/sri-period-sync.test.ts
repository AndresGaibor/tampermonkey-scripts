import { describe, expect, test } from 'bun:test';
import { createPeriodSyncService } from '@sri/application/period-sync.ts';

globalThis.document = {} as any;

describe('period-sync', () => {
  let periodKey = '2024/FACT';

  function makeDeps(overrides: Record<string, any> = {}) {
    const state = {
      receiverRuc: null as string | null,
      periodData: null as any,
      periodDataKey: null as string | null,
      monthsByNumber: new Map<number, any>(),
      isRefreshingPeriods: false,
      lastPeriodsRefreshAt: null as Date | null,
      lastPeriodsError: null as string | null,
    };

    const service = createPeriodSyncService({
      config: {
        API_BASE: 'http://localhost:3000',
        API_PERIODS_PATH: '/api/tampermonkey/periods',
        RECEIVER_RUC_OVERRIDE: '',
        SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001: false,
        HIDE_MONTHS_USING_API: true,
      },
      state,
      requestJson: async () => ({ success: true, data: { months: [] } }),
      getCurrentPageRuc: () => '1234567890001',
      toApiReceiverRuc: (ruc: string) => ruc,
      getSelectedYear: () => 2024,
      getSelectedDocumentType: () => 'FACT',
      getCurrentPeriodsKey: () => periodKey,
      indexMonths: () => {},
      applyMonthVisibility: () => {},
      resetMonthVisibility: () => {},
      updateDashboardStats: () => {},
      ...overrides,
    });

    return { state, ...service };
  }

  test('skip si HIDE_MONTHS_USING_API es false', async () => {
    let requestCalled = false;
    const { refreshPeriodsFromApi } = makeDeps({
      config: {
        API_BASE: 'http://localhost:3000',
        API_PERIODS_PATH: '/api/tampermonkey/periods',
        RECEIVER_RUC_OVERRIDE: '',
        SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001: false,
        HIDE_MONTHS_USING_API: false,
      },
      requestJson: async () => {
        requestCalled = true;
        return { success: true, data: { months: [] } };
      },
    });

    await refreshPeriodsFromApi();

    expect(requestCalled).toBe(false);
  });

  test('skip silenciosamente si no hay pageRuc', async () => {
    const { state, refreshPeriodsFromApi } = makeDeps({
      getCurrentPageRuc: () => null,
    });

    await refreshPeriodsFromApi();

    expect(state.periodData).toBeNull();
  });

  test('resetMonthVisibility si falta receiverRuc', async () => {
    let resetCalled = false;
    const { refreshPeriodsFromApi } = makeDeps({
      toApiReceiverRuc: () => null,
      resetMonthVisibility: () => { resetCalled = true; },
    });

    await refreshPeriodsFromApi();

    expect(resetCalled).toBe(true);
  });

  test('skip si ya está refrescando', async () => {
    const { state, refreshPeriodsFromApi } = makeDeps();
    state.isRefreshingPeriods = true;

    await refreshPeriodsFromApi();

    expect(state.periodData).toBeNull();
  });

  test('usa cache si mismo periodKey y no force', async () => {
    let requestCount = 0;
    const { state, refreshPeriodsFromApi } = makeDeps({
      requestJson: async () => {
        requestCount++;
        return { success: true, data: { months: [] } };
      },
    });

    state.periodData = { months: [] };
    state.periodDataKey = '2024/FACT';

    await refreshPeriodsFromApi(false);

    expect(requestCount).toBe(0);
  });

  test('ensurePeriodsMatchCurrentSelection no refresca si key coincide', async () => {
    let requestCount = 0;
    const { state, ensurePeriodsMatchCurrentSelection } = makeDeps({
      requestJson: async () => {
        requestCount++;
        return { success: true, data: { months: [] } };
      },
    });

    state.periodDataKey = '2024/FACT';

    ensurePeriodsMatchCurrentSelection();

    expect(requestCount).toBe(0);
  });

  test('ensurePeriodsMatchCurrentSelection refresca si key cambió', async () => {
    let requestCount = 0;
    const { ensurePeriodsMatchCurrentSelection } = makeDeps({
      requestJson: async () => {
        requestCount++;
        return { success: true, data: { months: [] } };
      },
    });

    periodKey = '2024/COMP';

    ensurePeriodsMatchCurrentSelection();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requestCount).toBe(1);
  });

  test('maneja error de API', async () => {
    const { state, refreshPeriodsFromApi } = makeDeps({
      requestJson: async () => { throw new Error('Timeout'); },
    });

    await refreshPeriodsFromApi();

    expect(state.lastPeriodsError).toBe('Timeout');
    expect(state.isRefreshingPeriods).toBe(false);
  });
});
