import { describe, expect, test } from 'bun:test';
import { buildBatchProgressMessage, dequeueBatchItem } from '../scripts/sri-comprobantes/src/domain/batch/batch-queue.ts';

describe('SRI batch queue', () => {
  test('dequeueBatchItem no muta la cola original', () => {
    const queue = [{ id: 'a' }, { id: 'b' }];
    const result = dequeueBatchItem(queue);

    expect(result.item).toEqual({ id: 'a' });
    expect(result.remaining).toEqual([{ id: 'b' }]);
    expect(queue).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  test('buildBatchProgressMessage formatea el progreso', () => {
    expect(buildBatchProgressMessage('XML', 2, 5, 3)).toBe(
      'Descargando XML 2/5. Restantes en página: 3.',
    );
  });
});
