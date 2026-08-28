import type { Conversation } from '../domain/conversation.ts';
import { renderMarkdown } from '../domain/markdown.ts';
import { createFilename, uniqueFilename } from '../domain/filenames.ts';
export type ExportState = 'preparing' | 'fetching' | 'rendering' | 'done' | 'failed' | 'cancelled';
export interface ExportProgress { index: number; total: number; id: string; state: ExportState; title?: string; }
export interface ExportResult { files: { name: string; content: string }[]; failures: string[]; cancelled: boolean; rateLimited: boolean; }

function waitFor(ms: number, signal?: AbortSignal): Promise<void> {
  if (!ms) return Promise.resolve();
  return new Promise((resolve, reject) => { const timer = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true }); });
}

function isRateLimited(error: unknown): boolean { return typeof error === 'object' && error !== null && 'status' in error && (error as { status?: unknown }).status === 429; }

export async function exportBatch(options: { conversationIds: string[]; fetchConversation: (id: string, signal?: AbortSignal) => Promise<Conversation>; signal?: AbortSignal; delayMs?: number; wait?: (ms: number, signal?: AbortSignal) => Promise<void>; onProgress?: (progress: ExportProgress) => void; now?: Date }): Promise<ExportResult> {
  const files: ExportResult['files'] = []; const failures: string[] = []; const used = new Set<string>(); const ids = options.conversationIds; const delayMs = options.delayMs ?? 3_000; const wait = options.wait ?? waitFor;
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index];
    if (options.signal?.aborted) return { files, failures, cancelled: true, rateLimited: false };
    if (index > 0) await wait(delayMs, options.signal);
    options.onProgress?.({ index: index + 1, total: ids.length, id, state: 'fetching' });
    try {
      const conversation = await options.fetchConversation(id, options.signal);
      options.onProgress?.({ index: index + 1, total: ids.length, id, state: 'rendering', title: conversation.title });
      const name = uniqueFilename(createFilename(conversation.title, conversation.updatedAt), used); used.add(name); files.push({ name, content: renderMarkdown(conversation, options.now) }); options.onProgress?.({ index: index + 1, total: ids.length, id, state: 'done', title: conversation.title });
    } catch (error) {
      if (options.signal?.aborted) return { files, failures, cancelled: true, rateLimited: false };
      if (isRateLimited(error)) return { files, failures, cancelled: false, rateLimited: true };
      console.warn('[CBE] Conversation export failed', id, error instanceof Error ? error.message : 'unknown error'); failures.push(id); options.onProgress?.({ index: index + 1, total: ids.length, id, state: 'failed' });
    }
  }
  return { files, failures, cancelled: false, rateLimited: false };
}
