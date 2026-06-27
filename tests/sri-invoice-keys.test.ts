import { describe, expect, test } from 'bun:test';
import {
  buildDocumentNumber,
  buildInvoiceIndexes,
  getDocumentNumberFromAccessKey,
} from '../scripts/sri-comprobantes/src/domain/invoice-keys.ts';

describe('SRI invoice keys', () => {
  test('buildDocumentNumber concatena serie y secuencial', () => {
    expect(buildDocumentNumber({ series: '001-002', sequential: '000000123' })).toBe('001002000000123');
  });

  test('buildDocumentNumber devuelve null cuando faltan datos', () => {
    expect(buildDocumentNumber({ series: '', sequential: '000000123' })).toBeNull();
    expect(buildDocumentNumber({ series: '001-002', sequential: '' })).toBeNull();
  });

  test('getDocumentNumberFromAccessKey extrae el número documento', () => {
    expect(getDocumentNumberFromAccessKey('12345678901234567890123400100200000012300000000')).toBe('001002000000123');
  });

  test('buildInvoiceIndexes indexa por clave de acceso y número de documento', () => {
    const invoices = [
      { access_key: '12345678901234567890123400100200000012300000000', series: '001-002', sequential: '000000123' },
    ];

    const indexes = buildInvoiceIndexes(invoices);
    expect(indexes.byAccessKey.get('12345678901234567890123400100200000012300000000')).toEqual(invoices[0]);
    expect(indexes.byDocumentNumber.get('001002000000123')).toEqual(invoices[0]);
  });
});
