import { describe, expect, test } from 'bun:test';
import { createSyncOrchestrator } from '@sri/application/sync-orchestrator.ts';

describe('sync-orchestrator', () => {
  test('refreshAllFromApi llama a los 3 servicios en secuencia', async () => {
    const calls: string[] = [];

    const orchestrator = createSyncOrchestrator({
      refreshInvoicesFromApi: async (force) => {
        calls.push(`invoices(force=${force})`);
      },
      refreshPeriodsFromApi: async (force) => {
        calls.push(`periods(force=${force})`);
      },
      refreshReportStatusFromApi: async (force) => {
        calls.push(`reportStatus(force=${force})`);
      },
    });

    await orchestrator.refreshAllFromApi();

    expect(calls).toEqual([
      'invoices(force=true)',
      'periods(force=true)',
      'reportStatus(force=true)',
    ]);
  });

  test('refreshAllFromApi continúa si un servicio falla', async () => {
    const calls: string[] = [];

    const orchestrator = createSyncOrchestrator({
      refreshInvoicesFromApi: async () => {
        calls.push('invoices');
        throw new Error('Fallo en invoices');
      },
      refreshPeriodsFromApi: async () => {
        calls.push('periods');
      },
      refreshReportStatusFromApi: async () => {
        calls.push('reportStatus');
      },
    });

    await expect(orchestrator.refreshAllFromApi()).rejects.toThrow();
    expect(calls).toContain('invoices');
  });
});
