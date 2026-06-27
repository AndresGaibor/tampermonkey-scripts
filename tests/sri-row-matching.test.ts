import { describe, expect, test } from 'bun:test';
import {
  buildTableIndexes,
  extractAccessKeyFromText,
  extractDocumentNumberFromTypeText,
  shouldTreatAsDownloaded,
} from '../scripts/sri-comprobantes/src/domain/comprobante/row-matching.ts';

describe('SRI row matching', () => {
  test('buildTableIndexes usa encabezados conocidos y fallback seguro', () => {
    expect(
      buildTableIndexes([
        'Tipo y Serie',
        'Clave de acceso',
        'Documento',
        'RIDE',
      ]),
    ).toEqual({ type: 0, access: 1, xml: 2, pdf: 3 });

    expect(buildTableIndexes(['sin', 'encabezados'])).toEqual({ type: 2, access: 3, xml: 9, pdf: 10 });
  });

  test('extractAccessKeyFromText extrae una clave de 49 dígitos', () => {
    expect(extractAccessKeyFromText('foo 1234567890123456789012345678901234567890123456789 bar')).toBe(
      '1234567890123456789012345678901234567890123456789',
    );
  });

  test('extractDocumentNumberFromTypeText concatena serie y secuencial', () => {
    expect(extractDocumentNumberFromTypeText('001 - 002 - 000000123')).toBe('001002000000123');
  });

  test('shouldTreatAsDownloaded respeta XML, PDF y configuración', () => {
    expect(
      shouldTreatAsDownloaded(
        { downloaded: false, xml_status: 'available', pdf_status: 'available' },
        { hideWhenXmlIsAvailable: false },
      ),
    ).toBe(true);

    expect(
      shouldTreatAsDownloaded(
        { downloaded: false, xml_status: 'available', pdf_status: 'missing' },
        { hideWhenXmlIsAvailable: false },
      ),
    ).toBe(false);

    expect(
      shouldTreatAsDownloaded(
        { downloaded: false, xml_status: 'available', pdf_status: 'missing' },
        { hideWhenXmlIsAvailable: true },
      ),
    ).toBe(true);
  });
});
