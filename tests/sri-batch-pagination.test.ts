import { describe, expect, test } from 'bun:test';
import {
  registerVisitedPage,
  shouldAdvanceToNextPage,
  shouldStopForCycle,
  shouldStopForPageLimit,
} from '../scripts/sri-comprobantes/src/domain/batch/batch-pagination.ts';

describe('SRI batch pagination', () => {
  test('registerVisitedPage agrega la firma sin mutar el Set original', () => {
    const visited = new Set(['pagina-1']);
    const result = registerVisitedPage(visited, 'pagina-2');

    expect(result.has('pagina-2')).toBe(true);
    expect(visited.has('pagina-2')).toBe(false);
  });

  test('shouldStopForCycle detecta páginas repetidas', () => {
    expect(shouldStopForCycle(new Set(['pagina-1']), 'pagina-1')).toBe(true);
    expect(shouldStopForCycle(new Set(['pagina-1']), 'pagina-2')).toBe(false);
  });

  test('shouldStopForPageLimit detiene al superar el límite', () => {
    expect(shouldStopForPageLimit(31, 30)).toBe(true);
    expect(shouldStopForPageLimit(3, 30)).toBe(false);
  });

  test('shouldAdvanceToNextPage solo avanza cuando corresponde', () => {
    expect(shouldAdvanceToNextPage(false, false, false)).toBe(false);
    expect(shouldAdvanceToNextPage(true, false, false)).toBe(false);
    expect(shouldAdvanceToNextPage(true, true, false)).toBe(true);
  });
});
