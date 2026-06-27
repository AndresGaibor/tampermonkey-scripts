import { normalizeSpaces } from '@shared/text.ts';

export function buildPaginationSignature(currentText: string | null | undefined, tableText: string | null | undefined, timestamp = Date.now()) {
  const current = normalizeSpaces(currentText || '');

  if (current) {
    return current;
  }

  if (tableText == null) {
    return 'sin-tabla';
  }

  const text = normalizeSpaces(tableText || '');
  const accessKey = text.match(/\b\d{49}\b/)?.[0];

  return accessKey || `pagina-${timestamp}`;
}
