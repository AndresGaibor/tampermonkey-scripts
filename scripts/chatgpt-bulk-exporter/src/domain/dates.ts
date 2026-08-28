export function normalizeTimestamp(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const milliseconds = number < 1e11 ? number * 1000 : number;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(date: Date | null, locale = 'default'): string {
  if (!date || Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' }).format(date);
}

export function compactDate(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return 'unknown';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}
