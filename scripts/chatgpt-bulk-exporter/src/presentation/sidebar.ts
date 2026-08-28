import { findConversationLinks, decorateConversation, findSidebarMountTarget } from '../infrastructure/sidebar-dom.ts';
import { SelectionStore } from '../application/selection.ts';
import { exportBatch } from '../application/exporter.ts';
import { fetchConversation } from '../infrastructure/chatgpt-api.ts';
import { buildZip, downloadBytes } from '../infrastructure/download.ts';

export function mountSelectionTrigger(target: HTMLElement, onClick?: () => void): HTMLButtonElement {
  const existing = target.ownerDocument.querySelector<HTMLButtonElement>('[data-cbe-selection-trigger="true"]');
  if (existing?.isConnected) return existing;
  const button = target.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'cbe-menu-item';
  button.dataset.cbeSelectionTrigger = 'true';
  button.setAttribute('aria-label', 'Seleccionar chats');
  button.innerHTML = `<span class="cbe-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 6.5h10M4 12h10M4 17.5h6"/><path d="m17 7 1.5 1.5L21 6"/><rect x="16" y="14" width="5" height="5" rx="1"/></svg></span><span class="cbe-menu-label">Seleccionar chats</span>`;
  button.addEventListener('click', () => onClick?.());
  target.prepend(button); return button;
}

export function mountSidebar(): void {
  const target = findSidebarMountTarget(); if (!target) return;
  let root = document.getElementById('cbe-root');
  if (root?.isConnected) return;
  const store = new SelectionStore(); let selecting = false; let controller: AbortController | null = null;
  root = document.createElement('div'); root.id = 'cbe-root';
  const actions = document.createElement('div'); actions.id = 'cbe-actions'; actions.hidden = true;
  const count = document.createElement('span'); count.dataset.cbeCount = 'true';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancelar';
  const exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.textContent = 'Exportar'; exportButton.disabled = true;
  actions.append(count, cancel, exportButton); root.append(actions); target.prepend(root);
  const refresh = () => { count.textContent = `${store.size} seleccionado${store.size === 1 ? '' : 's'}`; exportButton.disabled = store.size === 0 || controller !== null; for (const link of findConversationLinks()) if (selecting) decorateConversation(link.element, store.has(link.id), checked => { checked ? store.add(link.id) : store.remove(link.id); refresh(); }); };
  const exit = (message?: string) => { controller = null; selecting = false; store.clear(); actions.hidden = true; for (const link of findConversationLinks()) link.element.querySelector('[data-cbe-checkbox]')?.remove(); if (message) trigger.textContent = message; refresh(); };
  const trigger = mountSelectionTrigger(target, () => { selecting = true; trigger.hidden = true; actions.hidden = false; refresh(); });
  cancel.addEventListener('click', () => { if (controller) controller.abort(); else exit(); });
  exportButton.addEventListener('click', async () => { controller = new AbortController(); exportButton.disabled = true; const result = await exportBatch({ conversationIds: store.ids, signal: controller.signal, fetchConversation, onProgress: p => { if (p.state === 'fetching' || p.state === 'rendering') count.textContent = `Exportando ${p.index} de ${p.total}`; }, now: new Date() }); if (!result.cancelled && result.files.length) { const stamp = new Date(); const pad = (n: number) => String(n).padStart(2, '0'); downloadBytes(buildZip(result.files), `ChatGPT-chats-${stamp.getFullYear()}${pad(stamp.getMonth()+1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.zip`); } exit(result.cancelled ? 'Exportación cancelada' : result.failures.length ? `${result.files.length} exportados, ${result.failures.length} fallaron` : 'Exportación completada'); });
  refresh();
}
