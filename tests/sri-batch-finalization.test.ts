import { describe, expect, test } from 'bun:test';
import {
  buildBatchFinishMessage,
  buildBatchFinishState,
  buildBatchStopState,
} from '../scripts/sri-comprobantes/src/domain/batch/batch-finalization.ts';

describe('SRI batch finalization', () => {
  test('buildBatchFinishState cierra el proceso', () => {
    expect(buildBatchFinishState({ isBatchDownloading: true, batchAcrossPages: true })).toEqual({
      isBatchDownloading: false,
      batchAcrossPages: false,
    });
  });

  test('buildBatchStopState conserva el estado sin descargar', () => {
    expect(buildBatchStopState({ isBatchDownloading: true, batchAcrossPages: true })).toEqual({
      isBatchDownloading: false,
      batchAcrossPages: true,
    });
  });

  test('buildBatchFinishMessage incluye el total procesado', () => {
    expect(buildBatchFinishMessage(7)).toBe('Descarga finalizada. Archivos procesados: 7.');
  });
});
