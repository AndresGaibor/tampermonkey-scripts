import { describe, expect, test } from 'bun:test';
import { buildBatchAdvanceMessage, buildBatchPageLoadingMessage } from '../scripts/sri-comprobantes/src/domain/batch/batch-messages.ts';

describe('SRI batch messages', () => {
  test('buildBatchPageLoadingMessage formatea la página y la cola', () => {
    expect(buildBatchPageLoadingMessage(0, 4)).toBe('Página 1: 4 archivo(s) pendiente(s).');
  });

  test('buildBatchAdvanceMessage describe el avance de página', () => {
    expect(buildBatchAdvanceMessage('Página 1 de 3')).toBe('Avanzando a la siguiente página desde Página 1 de 3...');
  });
});
