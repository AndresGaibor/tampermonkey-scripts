import { describe, expect, test } from 'bun:test';
import { createInvoiceSyncService } from '@sri/application/invoice-sync.ts';

globalThis.document = {} as any;

describe('invoice-sync', () => {
  function makeDeps(overrides: Record<string, any> = {}) {
    const state = {
      pageRuc: null as string | null,
      receiverRuc: null as string | null,
      apiData: null as any,
      byAccessKey: new Map<string, any>(),
      byDocumentNumber: new Map<string, any>(),
      isRefreshingInvoices: false,
      lastInvoicesRefreshAt: null as Date | null,
      lastInvoicesError: null as string | null,
    };

    const service = createInvoiceSyncService({
      config: {
        API_BASE: 'http://localhost:3000',
        API_INVOICES_PATH: '/api/tampermonkey/invoices',
        API_STATUS: 'all',
        RECEIVER_RUC_OVERRIDE: '',
        SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001: false,
      },
      state,
      requestJson: async () => ({ success: true, data: { invoices: [] } }),
      getCurrentPageRuc: () => '1234567890001',
      toApiReceiverRuc: (ruc: string) => ruc,
      indexInvoices: () => {},
      applyInvoiceStatusToTable: () => {},
      renderDashboard: () => {},
      updateDashboardStats: () => {},
      ...overrides,
    });

    return { state, ...service };
  }

  test('skip si no hay pageRuc', async () => {
    const messages: { status: string }[] = [];
    const { state, refreshInvoicesFromApi } = makeDeps({
      getCurrentPageRuc: () => null,
      renderDashboard: (opts: any) => messages.push(opts),
    });

    await refreshInvoicesFromApi();

    expect(messages[0]?.status).toBe('warning');
    expect(state.apiData).toBeNull();
  });

  test('skip si ya está refrescando', async () => {
    const { state, refreshInvoicesFromApi } = makeDeps();
    state.isRefreshingInvoices = true;

    await refreshInvoicesFromApi();

    expect(state.apiData).toBeNull();
  });

  test('usa cache si mismo pageRuc y ya hay data', async () => {
    let requestCount = 0;
    const { state, refreshInvoicesFromApi } = makeDeps({
      requestJson: async () => {
        requestCount++;
        return { success: true, data: { invoices: [] } };
      },
    });

    state.pageRuc = '1234567890001';
    state.apiData = { invoices: [] };

    await refreshInvoicesFromApi(false);

    expect(requestCount).toBe(0);
  });

  test('refresca si force=true aunque haya cache', async () => {
    let requestCount = 0;
    const { state, refreshInvoicesFromApi } = makeDeps({
      requestJson: async () => {
        requestCount++;
        return { success: true, data: { invoices: [] } };
      },
    });

    state.pageRuc = '1234567890001';
    state.apiData = { invoices: [] };

    await refreshInvoicesFromApi(true);

    expect(requestCount).toBe(1);
  });

  test('maneja error de API', async () => {
    const messages: { status: string }[] = [];
    const { state, refreshInvoicesFromApi } = makeDeps({
      requestJson: async () => { throw new Error('Network error'); },
      renderDashboard: (opts: any) => messages.push(opts),
    });

    await refreshInvoicesFromApi();

    expect(state.lastInvoicesError).toBe('Network error');
    expect(state.isRefreshingInvoices).toBe(false);
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg?.status).toBe('error');
  });

  test('maneja respuesta inválida', async () => {
    const messages: { status: string; message: string }[] = [];
    const { state, refreshInvoicesFromApi } = makeDeps({
      requestJson: async () => ({ success: false }) as any,
      renderDashboard: (opts: any) => messages.push(opts),
    });

    await refreshInvoicesFromApi();

    expect(state.lastInvoicesError).toBe('Formato inválido en /invoices.');
    expect(state.isRefreshingInvoices).toBe(false);
  });
});
