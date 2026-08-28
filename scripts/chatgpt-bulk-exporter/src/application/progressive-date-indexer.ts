import type { Conversation } from '../domain/conversation.ts';
import type { SidebarConversation } from '../domain/conversation-filter.ts';
import { conversationToSidebarMetadata } from '../infrastructure/chatgpt-api.ts';
import { CACHE_TTL_MS, ConversationDateCache, cachedToSidebarConversation, type CachedConversationDate } from '../infrastructure/conversation-date-cache.ts';

export interface DateIndexProgress { loaded: number; total: number; }
export interface DateIndexOptions {
  conversations: SidebarConversation[];
  cache: ConversationDateCache;
  fetchConversation: (id: string, signal?: AbortSignal) => Promise<Conversation>;
  signal?: AbortSignal;
  concurrency?: number;
  now?: number;
  onUpdate?: (conversation: SidebarConversation) => void;
  onProgress?: (progress: DateIndexProgress) => void;
}

export async function indexConversationDates(options: DateIndexOptions): Promise<void> {
  const { conversations, cache, fetchConversation, signal, onUpdate, onProgress } = options;
  const now = options.now ?? Date.now();
  const entries = cache.load(now);
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const stale: SidebarConversation[] = [];
  for (const conversation of conversations) {
    const cached = byId.get(conversation.id);
    if (cached) onUpdate?.(cachedToSidebarConversation(cached, conversation));
    if (!cached || now - cached.validatedAt >= CACHE_TTL_MS) stale.push(conversation);
  }
  let loaded = 0;
  const report = () => onProgress?.({ loaded: ++loaded, total: stale.length });
  let cursor = 0;
  const worker = async () => {
    while (true) {
      if (signal?.aborted) return;
      const conversation = stale[cursor++];
      if (!conversation) return;
      try {
        const result = await fetchConversation(conversation.id, signal);
        if (signal?.aborted) return;
        const metadata = conversationToSidebarMetadata(result, conversation.href);
        byId.set(conversation.id, { id: metadata.id, title: metadata.title, createdAt: metadata.createdAt?.getTime() ?? null, updatedAt: metadata.updatedAt?.getTime() ?? null, validatedAt: now });
        onUpdate?.(metadata);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      } finally {
        report();
      }
    }
  };
  const count = Math.min(Math.max(options.concurrency ?? 3, 1), Math.max(stale.length, 1));
  await Promise.all(Array.from({ length: count }, worker));
  if (!signal?.aborted) cache.save([...byId.values()], now);
}
