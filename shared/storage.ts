export function getStoredValue<T>(key: string, fallback: T): T {
  try {
    return GM_getValue<T>(key, fallback);
  } catch {
    return fallback;
  }
}

export function setStoredValue<T>(key: string, value: T): void {
  GM_setValue(key, value);
}
