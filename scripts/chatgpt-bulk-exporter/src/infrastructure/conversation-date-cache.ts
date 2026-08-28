import type { SidebarConversation } from '../domain/conversation-filter.ts';

export const CACHE_KEY = 'cbe:conversation-date-cache:v1';
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 500;

export interface CachedConversationDate {
  id: string;
  title: string;
  createdAt: number | null;
  updatedAt: number | null;
  validatedAt: number;
}

interface Storage { get(key: string): unknown; set(key: string, value: unknown): void; }

function validEntry(value: unknown): value is CachedConversationDate {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  const validDate = (date: unknown) => date === null || (typeof date === 'number' && Number.isFinite(date));
  return typeof entry.id === 'string' && entry.id.trim() !== '' && typeof entry.title === 'string' && validDate(entry.createdAt) && validDate(entry.updatedAt) && typeof entry.validatedAt === 'number' && Number.isFinite(entry.validatedAt);
}

export class ConversationDateCache {
  constructor(private readonly storage: Storage) {}
  load(now = Date.now()): CachedConversationDate[] {
    const raw = this.storage.get(CACHE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter(validEntry).filter(entry => now - entry.validatedAt < CACHE_TTL_MS).sort((a, b) => b.validatedAt - a.validatedAt).slice(0, CACHE_MAX_ENTRIES);
  }
  save(entries: CachedConversationDate[], now = Date.now()): void {
    const deduped = new Map<string, CachedConversationDate>();
    for (const entry of entries) if (validEntry(entry)) deduped.set(entry.id, { ...entry, validatedAt: Number.isFinite(entry.validatedAt) ? entry.validatedAt : now });
    this.storage.set(CACHE_KEY, [...deduped.values()].sort((a, b) => b.validatedAt - a.validatedAt).slice(0, CACHE_MAX_ENTRIES));
  }
}

export const tampermonkeyDateCache = new ConversationDateCache({
  get: key => (typeof GM_getValue === 'function' ? GM_getValue(key, []) : []),
  set: (key, value) => { if (typeof GM_setValue === 'function') GM_setValue(key, value); },
});

export function cachedToSidebarConversation(entry: CachedConversationDate, fallback: SidebarConversation): SidebarConversation {
  return { ...fallback, title: entry.title || fallback.title, createdAt: entry.createdAt === null ? null : new Date(entry.createdAt), updatedAt: entry.updatedAt === null ? null : new Date(entry.updatedAt) };
}
