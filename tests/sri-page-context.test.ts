import { describe, expect, test } from 'bun:test';
import {
  buildCurrentPeriodsKey,
  getSelectedDay,
  getSelectedDocumentType,
  getSelectedMonth,
  getSelectedYear,
  getCurrentPageRuc,
  toApiReceiverRuc,
} from '../scripts/sri-comprobantes/src/infrastructure/sri-dom.ts';

function createDocument(elements: Record<string, { value?: string; textContent?: string }>) {
  return {
    getElementById(id: string) {
      return elements[id] ? ({ ...elements[id] } as never) : null;
    },
    querySelector(selector: string) {
      if (selector === '.area-usuario-blue span') {
        return elements.topbar ? ({ ...elements.topbar } as never) : null;
      }

      if (selector === 'input[id$="txtParametro"]') return elements.txtParametroSuffix ? ({ ...elements.txtParametroSuffix } as never) : null;
      if (selector === 'input[name$="txtParametro"]') return elements.txtParametroName ? ({ ...elements.txtParametroName } as never) : null;
      if (selector === 'input.sri-input-txt-paramtero') return elements.txtParametroClass ? ({ ...elements.txtParametroClass } as never) : null;

      return null;
    },
  } as never;
}

describe('SRI page context', () => {
  test('convierte RUC 001 a base10 cuando está habilitado', () => {
    expect(toApiReceiverRuc('1790010014001', true)).toBe('1790010014');
    expect(toApiReceiverRuc('1790010014001', false)).toBe('1790010014001');
  });

  test('lee el RUC actual desde el documento', () => {
    const document = createDocument({
      'frmPrincipal:txtParametro': { value: 'RUC 1790010014001' },
    });

    expect(getCurrentPageRuc(document, '')).toBe('1790010014001');
  });

  test('lee el RUC desde la barra superior cuando no hay input', () => {
    const document = createDocument({
      topbar: { textContent: 'Contribuyente 1790010014001' },
    });

    expect(getCurrentPageRuc(document, '')).toBe('1790010014001');
  });

  test('lee los selectores de periodo', () => {
    const document = createDocument({
      'frmPrincipal:ano': { value: '2024' },
      'frmPrincipal:mes': { value: '7' },
      'frmPrincipal:dia': { value: '15' },
      'frmPrincipal:cmbTipoComprobante': { value: '01' },
    });

    expect(getSelectedYear(document)).toBe(2024);
    expect(getSelectedMonth(document)).toBe(7);
    expect(getSelectedDay(document)).toBe(15);
    expect(getSelectedDocumentType(document)).toBe('01');
  });

  test('construye la clave actual de periodos', () => {
    expect(
      buildCurrentPeriodsKey({
        pageRuc: '1790010014001',
        receiverRucOverride: '',
        sendReceiverAsBase10WhenEnds001: true,
        year: 2024,
        documentType: '01',
      }),
    ).toBe('1790010014:2024:01');
  });
});
