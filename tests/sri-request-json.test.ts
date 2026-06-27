import { describe, expect, test } from 'bun:test';
import { createRequestJson } from '../scripts/sri-comprobantes/src/infrastructure/sri-api.ts';

describe('SRI request json', () => {
  test('resuelve JSON válido desde un cliente inyectado', async () => {
    const requestJson = createRequestJson((options) => {
      options.onload?.({ status: 200, responseText: '{"success":true}' } as never);
    });

    await expect(requestJson('https://example.com')).resolves.toEqual({ success: true });
  });

  test('rechaza respuestas HTTP no exitosas', async () => {
    const requestJson = createRequestJson((options) => {
      options.onload?.({ status: 500, responseText: 'oops' } as never);
    });

    await expect(requestJson('https://example.com')).rejects.toThrow('HTTP 500');
  });

  test('rechaza JSON inválido', async () => {
    const requestJson = createRequestJson((options) => {
      options.onload?.({ status: 200, responseText: 'not-json' } as never);
    });

    await expect(requestJson('https://example.com')).rejects.toThrow();
  });

  test('rechaza timeout y error de red', async () => {
    const timeoutClient = createRequestJson((options) => {
      options.ontimeout?.();
    });
    const errorClient = createRequestJson((options) => {
      options.onerror?.();
    });

    await expect(timeoutClient('https://example.com')).rejects.toThrow('Tiempo de espera agotado');
    await expect(errorClient('https://example.com')).rejects.toThrow('Error de red');
  });
});
