import { describe, expect, test } from 'bun:test';
import { createTxtService } from '@sri/application/txt-service.ts';

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
} as any;

describe('txt-service', () => {
  const baseState = {
    isDownloadingTxtReport: false,
    receiverRuc: '1234567890001',
    reportStatusData: null as any,
  };

  let currentLink: HTMLElement | null = null;

  const baseDeps = {
    state: baseState,
    renderDashboard: () => {},
    updateTxtButtons: () => {},
    refreshReportStatusFromApi: async () => {},
    refreshPeriodsFromApi: async () => {},
    refreshInvoicesFromApi: async () => {},
    getSelectedYear: () => 2024,
    getSelectedMonth: () => 11,
    getSelectedDay: () => 1,
    getSelectedDocumentType: () => 'FACT',
    REFRESH_AFTER_DOWNLOAD_MS: [3000],
  };

  test('downloadTxtSmart skip si ya está descargando', async () => {
    const messages: { status: string }[] = [];

    const { downloadTxtSmart } = createTxtService({
      ...baseDeps,
      state: { ...baseState, isDownloadingTxtReport: true },
      renderDashboard: (opts) => messages.push(opts),
    });

    await downloadTxtSmart();

    expect(messages[0]?.status).toBe('warning');
  });

  test('downloadTxtSmart skip si no hay reportStatusData', async () => {
    const messages: { status: string }[] = [];

    const { downloadTxtSmart } = createTxtService({
      ...baseDeps,
      state: { ...baseState, reportStatusData: null },
      renderDashboard: (opts) => messages.push(opts),
    });

    await downloadTxtSmart();

    expect(messages[0]?.status).toBe('error');
  });

  test('downloadTxtSmart skip si no debe descargar', async () => {
    const messages: { status: string; message: string }[] = [];

    const { downloadTxtSmart } = createTxtService({
      ...baseDeps,
      state: {
        ...baseState,
        reportStatusData: { should_download_txt: false, status: 'ok', reason: 'Ya descargado' },
      },
      renderDashboard: (opts) => messages.push(opts),
    });

    await downloadTxtSmart();

    expect(messages[0]?.status).toBe('success');
    expect(messages[0]?.message).toContain('Ya descargado');
  });

  test('downloadTxtForce warning si no hay link', async () => {
    const messages: { status: string; message: string }[] = [];

    const { downloadTxtForce } = createTxtService({
      ...baseDeps,
      renderDashboard: (opts) => messages.push(opts),
    });

    downloadTxtForce();

    expect(messages[0]?.status).toBe('warning');
    expect(messages[0]?.message).toContain('No se encontró');
  });
});
