import { describe, expect, test } from 'bun:test';
import { createReportStatusSyncService } from '@sri/application/report-status-sync.ts';

globalThis.document = {} as any;

describe('report-status-sync', () => {
  function makeDeps(overrides: Record<string, any> = {}) {
    const state = {
      receiverRuc: null as string | null,
      reportStatusData: null as any,
      isRefreshingReportStatus: false,
      lastReportStatusAt: null as Date | null,
      lastReportStatusError: null as string | null,
    };

    const service = createReportStatusSyncService({
      config: {
        API_BASE: 'http://localhost:3000',
        API_REPORT_STATUS_PATH: '/api/tampermonkey/report-status',
        RECEIVER_RUC_OVERRIDE: '',
        SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001: false,
      },
      state,
      requestJson: async () => ({ success: true, data: {} }),
      getCurrentPageRuc: () => '1234567890001',
      toApiReceiverRuc: (ruc: string) => ruc,
      getSelectedYear: () => 2024,
      getSelectedMonth: () => 11,
      getSelectedDay: () => 1,
      getSelectedDocumentType: () => 'FACT',
      updateDashboardStats: () => {},
      ...overrides,
    });

    return { state, ...service };
  }

  test('buildReportUrl construye URL correcta', () => {
    const { buildReportUrl } = makeDeps({
      config: {
        API_BASE: 'http://api.test:8080',
        API_REPORT_STATUS_PATH: '/custom/path',
        RECEIVER_RUC_OVERRIDE: '',
        SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001: false,
      },
    });

    const url = buildReportUrl('1234567890001', 2024, 11, 1, 'FACT');

    expect(url).toBe(
      'http://api.test:8080/custom/path' +
        '?receiverRuc=1234567890001' +
        '&year=2024' +
        '&month=11' +
        '&day=1' +
        '&documentType=FACT'
    );
  });

  test('buildReportUrl escapa valores especiales', () => {
    const { buildReportUrl } = makeDeps();

    const url = buildReportUrl('user/name', 2024, 1, 1, 'FACT/type');

    expect(url).toContain(encodeURIComponent('user/name'));
    expect(url).toContain(encodeURIComponent('FACT/type'));
    expect(url).not.toContain('user/name');
  });

  test('skip si no hay pageRuc', async () => {
    const { state, refreshReportStatusFromApi } = makeDeps({
      getCurrentPageRuc: () => null,
    });

    await refreshReportStatusFromApi();

    expect(state.reportStatusData).toBeNull();
  });

  test('skip si refresh en progreso', async () => {
    const { state, refreshReportStatusFromApi } = makeDeps();
    state.isRefreshingReportStatus = true;

    await refreshReportStatusFromApi();

    expect(state.reportStatusData).toBeNull();
  });

  test('usa cache si no force y data existe', async () => {
    let requestCount = 0;
    const { state, refreshReportStatusFromApi } = makeDeps({
      requestJson: async () => {
        requestCount++;
        return { success: true, data: { should_download_txt: true } };
      },
    });

    state.reportStatusData = { should_download_txt: false };

    await refreshReportStatusFromApi(false);

    expect(requestCount).toBe(0);
  });
});
