import { describe, expect, test } from 'bun:test';
import { buildPaginationSignature } from '../scripts/sri-comprobantes/src/domain/comprobante/pagination-signature.ts';

describe('SRI pagination signature', () => {
  test('prefiere el texto del paginador cuando existe', () => {
    expect(buildPaginationSignature('  Página 1 de 3  ', 'irrelevante', 123)).toBe('Página 1 de 3');
  });

  test('extrae la primera clave de acceso de 49 dígitos del texto de la tabla', () => {
    expect(buildPaginationSignature('', 'abc 1234567890123456789012345678901234567890123456789 xyz', 123)).toBe(
      '1234567890123456789012345678901234567890123456789',
    );
  });

  test('usa un fallback temporal cuando no hay firma visible', () => {
    expect(buildPaginationSignature(null, null, 999)).toBe('sin-tabla');
  });
});
