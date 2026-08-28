import { normalizeConversation, type Conversation } from '../domain/conversation.ts';
import { normalizeTimestamp } from '../domain/dates.ts';
import type { SidebarConversation } from '../domain/conversation-filter.ts';

export class ConversationFormatError extends Error { name = 'ConversationFormatError'; }

export async function fetchConversation(conversationId: string, signal?: AbortSignal): Promise<Conversation> {
  const response = await fetch(`/backend-api/conversation/${encodeURIComponent(conversationId)}`, { credentials: 'include', signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Conversation request failed (${response.status})`);
  try { return normalizeConversation(await response.json()); }
  catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw error; throw new ConversationFormatError('Unsupported conversation response'); }
}

export interface ConversationHistoryProgress { loaded: number; total: number | null; }
export interface FetchConversationHistoryOptions { signal?: AbortSignal; pageSize?: number; onProgress?: (progress: ConversationHistoryProgress) => void; }
type HistoryItem = Record<string, unknown>;

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
    const response = await fetch(`/backend-api/conversations?${query}`, { credentials: 'include', signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Conversation history request failed (${response.status})`);
    const payload: unknown = await response.json();
    const items = Array.isArray(payload) ? payload : payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown[] }).items) ? (payload as { items: unknown[] }).items : [];
    if (!Array.isArray(payload) && payload && typeof payload === 'object' && typeof (payload as { total?: unknown }).total === 'number') total = (payload as { total: number }).total;
    if (items.length === 0) break;
    let added = 0;
    for (const item of items) { const conversation = normalizeHistoryItem(item); if (conversation && !seen.has(conversation.id)) { seen.add(conversation.id); conversations.push(conversation); added++; } }
    onProgress?.({ loaded: conversations.length, total });
    if (added === 0 || (total !== null && conversations.length >= total) || (total === null && items.length < pageSize)) break;
    offset += items.length;
  }
  return conversations;
}
