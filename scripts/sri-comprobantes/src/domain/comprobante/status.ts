export function isAvailable(status: unknown): boolean {
  return String(status ?? '').toLowerCase() === 'available';
}

export function isPdfOk(status: unknown): boolean {
  const value = String(status ?? '').toLowerCase();
  return value !== '' && value !== 'missing';
}
