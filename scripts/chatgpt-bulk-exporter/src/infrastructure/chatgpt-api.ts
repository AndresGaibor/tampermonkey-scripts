import { normalizeConversation, type Conversation } from '../domain/conversation.ts';
import { normalizeTimestamp } from '../domain/dates.ts';
import type { SidebarConversation } from '../domain/conversation-filter.ts';
import { conversationFromDocument } from './conversation-dom.ts';

export function conversationToSidebarMetadata(conversation: Conversation, href = `/c/${encodeURIComponent(conversation.id)}`): SidebarConversation {
  return { id: conversation.id, title: conversation.title, href, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt };
}

export class ConversationFormatError extends Error { name = 'ConversationFormatError'; }
export class ChatGptApiError extends Error {
  name = 'ChatGptApiError';
  constructor(message: string, public readonly status: number) { super(message); }
}

let sessionToken: string | null = null;
let pendingSessionToken: Promise<string> | null = null;

export function clearSessionTokenCache(): void { sessionToken = null; pendingSessionToken = null; }

async function getSessionToken(signal?: AbortSignal): Promise<string> {
  if (sessionToken) return sessionToken;
  if (!pendingSessionToken) {
    pendingSessionToken = (async () => {
      const response = await fetch('/api/auth/session', { credentials: 'include', signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new ChatGptApiError(`Session request failed (${response.status})`, response.status);
      const payload: unknown = await response.json();
      const token = payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).accessToken === 'string' ? (payload as Record<string, unknown>).accessToken as string : '';
      if (!token) throw new ChatGptApiError('Session token unavailable', response.status);
      sessionToken = token;
      return token;
    })().finally(() => { pendingSessionToken = null; });
  }
  return pendingSessionToken;
}

async function authenticatedFetch(path: string, signal?: AbortSignal, retry = true): Promise<Response> {
  const token = await getSessionToken(signal);
  const response = await fetch(path, { credentials: 'include', signal, headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
  if (response.status === 401 && retry) {
    if (sessionToken === token) sessionToken = null;
    return authenticatedFetch(path, signal, false);
  }
  return response;
}

export async function fetchConversation(conversationId: string, signal?: AbortSignal): Promise<Conversation> {
  const response = await authenticatedFetch(`/backend-api/conversation/${encodeURIComponent(conversationId)}`, signal);
  if (!response.ok) throw new ChatGptApiError(`Conversation request failed (${response.status})`, response.status);
  try { return normalizeConversation(await response.json()); }
  catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw error; throw new ConversationFormatError('Unsupported conversation response'); }
}

export interface ConversationExportFallbackOptions {
  document?: Document;
  pathname?: string;
  fetchConversation?: (id: string, signal?: AbortSignal) => Promise<Conversation>;
}

export async function fetchConversationForExport(conversationId: string, signal?: AbortSignal, options: ConversationExportFallbackOptions = {}): Promise<Conversation> {
  const fetchDetail = options.fetchConversation ?? fetchConversation;
  try { return await fetchDetail(conversationId, signal); }
  catch (error) {
    if (signal?.aborted) throw error;
    const documentValue = options.document ?? (typeof document === 'undefined' ? undefined : document);
    const pathname = options.pathname ?? (typeof location === 'undefined' ? '' : location.pathname);
    const fallback = documentValue ? conversationFromDocument(conversationId, documentValue, pathname) : null;
    if (fallback) return fallback;
    throw error;
  }
}

export interface ConversationHistoryProgress { loaded: number; total: number | null; }
export interface FetchConversationHistoryOptions { signal?: AbortSignal; pageSize?: number; onProgress?: (progress: ConversationHistoryProgress) => void; }
type HistoryItem = Record<string, unknown>;
type HistoryPayload = { items: unknown[]; total: number | null };

function readHistoryPayload(payload: unknown): HistoryPayload {
  if (Array.isArray(payload)) return { items: payload, total: null };
  if (!payload || typeof payload !== 'object') return { items: [], total: null };
  const record = payload as Record<string, unknown>;
  const candidates = [record.items, record.conversations, record.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return { items: candidate, total: typeof record.total === 'number' ? record.total : null };
    if (candidate && typeof candidate === 'object') {
      const nested = candidate as Record<string, unknown>;
      const items = Array.isArray(nested.items) ? nested.items : Array.isArray(nested.conversations) ? nested.conversations : null;
      if (items) return { items, total: typeof record.total === 'number' ? record.total : typeof nested.total === 'number' ? nested.total : null };
    }
  }
  return { items: [], total: typeof record.total === 'number' ? record.total : null };
}

function normalizeHistoryItem(item: unknown): SidebarConversation | null {
  if (!item || typeof item !== 'object') return null;
  const entry = item as HistoryItem;
  const id = typeof entry.conversation_id === 'string' ? entry.conversation_id : typeof entry.id === 'string' ? entry.id : '';
  if (!id.trim()) return null;
  const createdAt = normalizeTimestamp(entry.create_time ?? entry.created_at);
  const updatedAt = normalizeTimestamp(entry.update_time ?? entry.updated_at) ?? createdAt;
  return { id, title: typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : 'ChatGPT chat', href: `/c/${encodeURIComponent(id)}`, createdAt, updatedAt };
}

export async function fetchConversationHistory(options: FetchConversationHistoryOptions = {}): Promise<SidebarConversation[]> {
  const { signal, pageSize = 28, onProgress } = options;
  const conversations: SidebarConversation[] = []; const seen = new Set<string>();
  let offset = 0; let total: number | null = null;
  while (true) {
    const query = new URLSearchParams({ offset: String(offset), limit: String(pageSize), order: 'updated' });
    const response = await authenticatedFetch(`/backend-api/conversations?${query}`, signal);
    if (!response.ok) throw new ChatGptApiError(`Conversation history request failed (${response.status})`, response.status);
    const payload: unknown = await response.json();
    const page = readHistoryPayload(payload); const items = page.items;
    if (page.total !== null) total = page.total;
    if (items.length === 0) break;
    let added = 0;
    for (const item of items) { const conversation = normalizeHistoryItem(item); if (conversation && !seen.has(conversation.id)) { seen.add(conversation.id); conversations.push(conversation); added++; } }
    if (added === 0) break;
    onProgress?.({ loaded: conversations.length, total: total !== null && total > conversations.length ? total : null });
    offset += items.length;
  }
  return conversations;
}
