import { findConversationLinks, decorateConversation } from '../infrastructure/sidebar-dom.ts';
import { SelectionStore } from '../application/selection.ts';
import { exportBatch } from '../application/exporter.ts';
import { fetchConversation } from '../infrastructure/chatgpt-api.ts';
import { buildZip, downloadBytes } from '../infrastructure/download.ts';

export function mountSidebar(): void {
  if (document.getElementById('cbe-root')) return;
  const links = findConversationLinks(); if (!links.length) return;
  const store = new SelectionStore(); let selecting = false; let controller: AbortController | null = null;
  const root = document.createElement('div'); root.id = 'cbe-root';
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Seleccionar chats'; button.dataset.cbeAction = 'start'; button.setAttribute('aria-label', 'Seleccionar chats');
  const actions = document.createElement('div'); actions.id = 'cbe-actions'; actions.hidden = true;
  const count = document.createElement('span'); count.dataset.cbeCount = 'true';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancelar';
  const exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.textContent = 'Exportar'; exportButton.disabled = true;
  actions.append(count, cancel, exportButton); root.append(button, actions); links[0].element.closest('aside')?.prepend(root);
  const refresh = () => { count.textContent = `${store.size} seleccionado${store.size === 1 ? '' : 's'}`; exportButton.disabled = store.size === 0 || controller !== null; for (const link of findConversationLinks()) if (selecting) decorateConversation(link.element, store.has(link.id), checked => { checked ? store.add(link.id) : store.remove(link.id); refresh(); }); };
  const exit = (message?: string) => { controller = null; selecting = false; store.clear(); actions.hidden = true; button.hidden = false; for (const link of findConversationLinks()) link.element.querySelector('[data-cbe-checkbox]')?.remove(); if (message) button.textContent = message; refresh(); };
  button.addEventListener('click', () => { selecting = true; button.hidden = true; actions.hidden = false; refresh(); });
  cancel.addEventListener('click', () => { if (controller) controller.abort(); else exit(); });
  exportButton.addEventListener('click', async () => { controller = new AbortController(); exportButton.disabled = true; cancel.textContent = 'Cancelar'; const result = await exportBatch({ conversationIds: store.ids, signal: controller.signal, fetchConversation, onProgress: p => { count.textContent = p.state === 'fetching' || p.state === 'rendering' ? `Exportando ${p.index} de ${p.total}` : count.textContent; }, now: new Date() }); if (!result.cancelled && result.files.length) { const stamp = new Date(); const pad = (n: number) => String(n).padStart(2, '0'); downloadBytes(buildZip(result.files), `ChatGPT-chats-${stamp.getFullYear()}${pad(stamp.getMonth()+1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.zip`); } exit(result.cancelled ? 'Exportación cancelada' : result.failures.length ? `${result.files.length} exportados, ${result.failures.length} fallaron` : 'Exportación completada'); });
  (root as any).__cbeRefresh = refresh; refresh();
}
