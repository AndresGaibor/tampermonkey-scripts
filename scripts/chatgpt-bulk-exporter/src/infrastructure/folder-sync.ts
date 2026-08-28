import { renderMarkdown } from '../domain/markdown.ts';
import { createFilename, uniqueFilename } from '../domain/filenames.ts';
import type { Conversation } from '../domain/conversation.ts';
import type { SidebarConversation } from '../domain/conversation-filter.ts';

const DB_NAME = 'cbe-local-sync';
const STORE_NAME = 'settings';
const HANDLE_KEY = 'directory';
const MANIFEST = 'manifest.json';

type SyncEntry = { id: string; filename: string; title: string; updatedAt: number | null };
export type SyncManifest = { version: 1; updatedAt: string; conversations: Record<string, SyncEntry> };
export type FolderSyncResult = { written: number; skipped: number; failed: string[] };

type DirectoryHandle = FileSystemDirectoryHandle;
type PermissionedDirectoryHandle = DirectoryHandle & { queryPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>; requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>; };

function indexedDb(): IDBFactory | null { return typeof indexedDB === 'undefined' ? null : indexedDB; }

export async function getSavedDirectory(): Promise<DirectoryHandle | null> {
  const db = indexedDb(); if (!db) return null;
  return new Promise((resolve, reject) => { const request = db.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME); request.onerror = () => reject(request.error); request.onsuccess = () => { const tx = request.result.transaction(STORE_NAME, 'readonly'); const get = tx.objectStore(STORE_NAME).get(HANDLE_KEY); get.onerror = () => reject(get.error); get.onsuccess = () => resolve((get.result as DirectoryHandle | undefined) ?? null); }; });
}

async function saveDirectory(handle: DirectoryHandle): Promise<void> {
  const db = indexedDb(); if (!db) throw new Error('Este navegador no permite guardar la carpeta local.');
  return new Promise((resolve, reject) => { const request = db.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME); request.onerror = () => reject(request.error); request.onsuccess = () => { const tx = request.result.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }; });
}

export async function chooseDirectory(): Promise<DirectoryHandle> {
  type PickerWindow = typeof globalThis & { showDirectoryPicker?: () => Promise<DirectoryHandle> };
  const sandboxWindow = globalThis as PickerWindow & { unsafeWindow?: PickerWindow };
  const pageWindow = sandboxWindow.unsafeWindow ?? sandboxWindow;
  const picker = pageWindow.showDirectoryPicker;
  if (!picker) throw new Error('Brave no expone selección de carpetas al userscript. Revisa que estés en https://chatgpt.com y usa Exportar ZIP como alternativa.');
  const handle = await picker.call(pageWindow); await saveDirectory(handle); return handle;
}

export async function hasDirectoryPermission(handle: DirectoryHandle): Promise<boolean> { return (await (handle as PermissionedDirectoryHandle).queryPermission({ mode: 'readwrite' })) === 'granted'; }

async function ensurePermission(handle: DirectoryHandle): Promise<void> {
  const permissioned = handle as PermissionedDirectoryHandle;
  const permission = await permissioned.queryPermission({ mode: 'readwrite' });
  if (permission === 'granted') return;
  const result = await permissioned.requestPermission({ mode: 'readwrite' });
  if (result !== 'granted') throw new Error('El permiso para escribir en la carpeta ChatGPT fue rechazado.');
}

async function readManifest(handle: DirectoryHandle): Promise<SyncManifest> {
  try { const fileHandle = await handle.getFileHandle(MANIFEST); const file = await fileHandle.getFile(); const parsed = JSON.parse(await file.text()) as Partial<SyncManifest>; if (parsed.version === 1 && parsed.conversations && typeof parsed.conversations === 'object') return parsed as SyncManifest; }
  catch { /* Primera sincronización o manifest inválido. */ }
  return { version: 1, updatedAt: new Date(0).toISOString(), conversations: {} };
}

async function writeText(handle: DirectoryHandle, filename: string, content: string): Promise<void> { const file = await handle.getFileHandle(filename, { create: true }); const writable = await file.createWritable(); try { await writable.write(content); await writable.close(); } catch (error) { await writable.abort(); throw error; } }

export async function syncConversations(options: { handle: DirectoryHandle; conversations: SidebarConversation[]; fetchConversation: (id: string, signal?: AbortSignal) => Promise<Conversation>; signal?: AbortSignal; now?: Date; }): Promise<FolderSyncResult> {
  await ensurePermission(options.handle);
  const manifest = await readManifest(options.handle); const used = new Set(Object.values(manifest.conversations).map(entry => entry.filename));
  const result: FolderSyncResult = { written: 0, skipped: 0, failed: [] };
  for (const item of options.conversations) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const previous = manifest.conversations[item.id]; const updatedAt = item.updatedAt?.getTime() ?? null;
    if (previous && updatedAt !== null && previous.updatedAt === updatedAt && previous.title === item.title) { result.skipped++; continue; }
    try {
      const conversation = await options.fetchConversation(item.id, options.signal);
      const filename = previous?.filename ?? uniqueFilename(createFilename(conversation.title, conversation.updatedAt), used); used.add(filename);
      await writeText(options.handle, filename, renderMarkdown(conversation, options.now));
      manifest.conversations[item.id] = { id: item.id, filename, title: conversation.title, updatedAt: conversation.updatedAt?.getTime() ?? updatedAt };
      result.written++;
    } catch (error) { if (options.signal?.aborted) throw error; result.failed.push(item.id); console.warn('[CBE] Local sync failed', item.id, error instanceof Error ? error.message : 'unknown error'); }
  }
  manifest.updatedAt = (options.now ?? new Date()).toISOString(); await writeText(options.handle, MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`); return result;
}

export function syncSummary(result: FolderSyncResult): string { return `${result.written} actualizado${result.written === 1 ? '' : 's'}, ${result.skipped} sin cambios${result.failed.length ? `, ${result.failed.length} fallido${result.failed.length === 1 ? '' : 's'}` : ''}.`; }
