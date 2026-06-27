import { describe, expect, test } from 'bun:test';
import { buildBatchStartState } from '../scripts/sri-comprobantes/src/domain/batch/batch-state.ts';

describe('SRI batch state', () => {
  test('buildBatchStartState inicializa el lote para una página', () => {
    expect(buildBatchStartState(false)).toEqual({
      isBatchDownloading: true,
      batchAcrossPages: false,
      batchDownloadedCount: 0,
      batchQueueTotal: 0,
      batchPageCount: 0,
      batchVisitedPages: new Set<string>(),
    });
  });

  test('buildBatchStartState inicializa el lote para múltiples páginas', () => {
    const state = buildBatchStartState(true);

    expect(state.batchAcrossPages).toBe(true);
    expect(state.isBatchDownloading).toBe(true);
  });
});
