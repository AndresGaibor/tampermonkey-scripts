export function onlyDigits(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function normalizeSpaces(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeText(value: string | number | null | undefined): string {
  return normalizeSpaces(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
