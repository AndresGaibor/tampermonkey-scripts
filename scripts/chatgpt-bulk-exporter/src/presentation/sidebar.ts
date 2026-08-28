import { findConversationLinks, decorateConversation, findSidebarMountTarget } from '../infrastructure/sidebar-dom.ts';
import { SelectionStore } from '../application/selection.ts';
import { exportBatch } from '../application/exporter.ts';
import { fetchConversation, fetchConversationForExport, fetchConversationHistory } from '../infrastructure/chatgpt-api.ts';
import { indexConversationDates } from '../application/progressive-date-indexer.ts';
import { tampermonkeyDateCache } from '../infrastructure/conversation-date-cache.ts';
import { buildZip, downloadBytes } from '../infrastructure/download.ts';
import { filterAndSortConversations, hasInvertedRange, parseDateInput, type DateField, type DateRange, type SidebarConversation } from '../domain/conversation-filter.ts';
import { formatDateTime } from '../domain/dates.ts';

export function formatExportSummary(exported: number, failed: number): string {
  if (failed) return `${exported} exportado${exported === 1 ? '' : 's'}, ${failed} fallido${failed === 1 ? '' : 's'}.`;
  return `${exported} chat${exported === 1 ? '' : 's'} exportado${exported === 1 ? '' : 's'} correctamente.`;
}

export function mountSelectionTrigger(target: HTMLElement, onClick?: () => void): HTMLButtonElement {
  const existing = target.ownerDocument.querySelector<HTMLButtonElement>('[data-cbe-selection-trigger="true"]');
  if (existing?.isConnected) return existing;
  const button = target.ownerDocument.createElement('button'); button.type = 'button'; button.className = 'cbe-menu-item'; button.dataset.cbeSelectionTrigger = 'true'; button.setAttribute('aria-label', 'Exportar chats');
  button.innerHTML = '<span class="cbe-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 14v5h14v-5"/></svg></span><span class="cbe-menu-label">Exportar chats</span>';
  button.addEventListener('click', () => onClick?.()); target.prepend(button); return button;
}

function dateInput(document: Document, label: string, key: 'from' | 'to'): HTMLLabelElement {
  const wrapper = document.createElement('label'); wrapper.className = 'cbe-date-field'; wrapper.append(document.createTextNode(label));
  const input = document.createElement('input'); input.type = 'date'; input.dataset.cbeDate = key; wrapper.append(input); return wrapper;
}

export function mountSidebar(): void {
  const target = findSidebarMountTarget(); if (!target) return;
  let root = document.getElementById('cbe-root'); if (root?.isConnected) return;
  const store = new SelectionStore(); let selecting = false; let controller: AbortController | null = null; let indexController: AbortController | null = null;
  let conversations: SidebarConversation[] = []; let historyState: 'idle' | 'loading' | 'indexing' | 'ready' | 'error' = 'idle'; let progress = { loaded: 0, total: null as number | null };
  let field: DateField = 'updated'; let filterOpen = false; let exportSummary: { exported: number; failed: number } | null = null;
  root = document.createElement('div'); root.id = 'cbe-root';
  const overlay = document.createElement('div'); overlay.className = 'cbe-modal-overlay'; overlay.hidden = true; overlay.dataset.cbeOverlay = 'true';
  const popover = document.createElement('section'); popover.className = 'cbe-popover'; popover.hidden = true; popover.dataset.cbePopover = 'true'; popover.setAttribute('role', 'dialog'); popover.setAttribute('aria-modal', 'true'); popover.setAttribute('aria-label', 'Exportar chats');
  const header = document.createElement('div'); header.className = 'cbe-popover-header'; const heading = document.createElement('strong'); heading.textContent = 'Exportar chats'; const count = document.createElement('span'); count.dataset.cbeCount = 'true'; const close = document.createElement('button'); close.type = 'button'; close.className = 'cbe-icon-button'; close.setAttribute('aria-label', 'Cerrar'); close.textContent = '×'; header.append(heading, count, close);
  const filterToggle = document.createElement('button'); filterToggle.type = 'button'; filterToggle.className = 'cbe-filter-toggle'; filterToggle.setAttribute('aria-expanded', 'false'); filterToggle.innerHTML = '<span>Filtrar por fecha</span><span aria-hidden="true">⌄</span>';
  const filterPanel = document.createElement('div'); filterPanel.className = 'cbe-filter-panel'; filterPanel.hidden = true; const select = document.createElement('select'); select.dataset.cbeDateField = 'true'; select.innerHTML = '<option value="updated">Última actualización</option><option value="created">Fecha de creación</option>'; const fields = document.createElement('div'); fields.className = 'cbe-date-fields'; fields.append(dateInput(document, 'Desde', 'from'), dateInput(document, 'Hasta', 'to')); const error = document.createElement('div'); error.className = 'cbe-filter-error'; error.hidden = true; filterPanel.append(select, fields, error);
  const status = document.createElement('div'); status.className = 'cbe-index-status'; const list = document.createElement('div'); list.className = 'cbe-filter-list'; list.setAttribute('role', 'list'); list.setAttribute('aria-label', 'Conversaciones disponibles'); list.tabIndex = 0; const empty = document.createElement('div'); empty.className = 'cbe-empty'; empty.hidden = true;
  const actions = document.createElement('div'); actions.className = 'cbe-selection-actions'; const selectAll = document.createElement('button'); selectAll.type = 'button'; selectAll.className = 'cbe-secondary-button'; selectAll.textContent = 'Seleccionar visibles'; const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'cbe-secondary-button'; clear.textContent = 'Limpiar selección'; actions.append(selectAll, clear);
  const footer = document.createElement('div'); footer.className = 'cbe-popover-footer'; const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'cbe-secondary-button'; cancel.textContent = 'Cancelar'; const exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.className = 'cbe-primary-button'; footer.append(cancel, exportButton); popover.append(header, status, filterToggle, filterPanel, actions, list, empty, footer); root.append(overlay, popover); document.body.append(root);

  const range = (): DateRange => ({ from: parseDateInput(fields.querySelector<HTMLInputElement>('[data-cbe-date="from"]')?.value || '', 'start'), to: parseDateInput(fields.querySelector<HTMLInputElement>('[data-cbe-date="to"]')?.value || '', 'end') });
  const visibleLinks = () => findConversationLinks(document);
  const refresh = () => {
    const current = range(); const invalid = hasInvertedRange(current); error.hidden = !invalid; error.textContent = invalid ? 'Desde debe ser anterior o igual a Hasta.' : '';
    count.textContent = exportSummary ? `${exportSummary.exported} exportado${exportSummary.exported === 1 ? '' : 's'}` : `${store.size} seleccionado${store.size === 1 ? '' : 's'}`; exportButton.textContent = exportSummary ? 'Cerrar' : `Exportar (${store.size})`; exportButton.disabled = exportSummary ? false : store.size === 0 || controller !== null;
    const filteringDisabled = exportSummary !== null; select.disabled = filteringDisabled; fields.querySelectorAll('input').forEach(input => { input.disabled = filteringDisabled; });
    const visible = invalid ? [] : filterAndSortConversations(conversations, field, current); selectAll.disabled = visible.length === 0 || invalid || exportSummary !== null; clear.disabled = store.size === 0 || exportSummary !== null;
    overlay.hidden = popover.hidden;
    list.replaceChildren(); empty.hidden = historyState === 'loading' || visible.length > 0; empty.textContent = invalid ? 'Corrige el rango de fechas.' : conversations.length === 0 ? 'No hay chats disponibles.' : 'No hay chats que coincidan con este filtro.'; if (historyState === 'indexing') status.textContent = `Indexando fechas ${progress.loaded}/${progress.total ?? conversations.length}`;
    for (const conversation of visible) { const row = document.createElement('label'); row.className = `cbe-filter-row${store.has(conversation.id) ? ' is-selected' : ''}`; const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'cbe-visually-hidden'; input.checked = store.has(conversation.id); input.setAttribute('aria-label', `Seleccionar ${conversation.title}`); input.addEventListener('change', () => { input.checked ? store.add(conversation.id) : store.remove(conversation.id); refresh(); }); const mark = document.createElement('span'); mark.className = 'cbe-row-check'; mark.setAttribute('aria-hidden', 'true'); const text = document.createElement('span'); const title = document.createElement('strong'); title.textContent = conversation.title; const date = document.createElement('small'); const dateValue = field === 'created' ? conversation.createdAt : conversation.updatedAt; date.textContent = `${field === 'created' ? 'Creado' : 'Actualizado'}: ${formatDateTime(dateValue)}`; text.append(title, date); row.append(input, mark, text); list.append(row); }
    for (const link of visibleLinks()) decorateConversation(link.element, store.has(link.id), checked => { checked ? store.add(link.id) : store.remove(link.id); refresh(); });
  };
  const startProgressiveIndex = (activeController: AbortController) => {
    historyState = conversations.length ? 'indexing' : 'error'; progress = { loaded: 0, total: conversations.length }; status.textContent = conversations.length ? `Indexando fechas 0/${conversations.length}` : 'No se encontraron chats. Abre o recarga el historial e inténtalo de nuevo.'; refresh();
    if (!conversations.length) return;
    void indexConversationDates({ conversations, cache: tampermonkeyDateCache, fetchConversation, signal: activeController.signal, onUpdate: updated => { if (indexController !== activeController) return; conversations = conversations.map(chat => chat.id === updated.id ? updated : chat); refresh(); }, onProgress: value => { if (indexController !== activeController) return; progress = value; refresh(); } }).then(() => { if (indexController === activeController && !activeController.signal.aborted) { historyState = 'ready'; status.textContent = `${conversations.length} chats disponibles`; refresh(); } }).catch(caught => { if (!(caught instanceof DOMException && caught.name === 'AbortError') && indexController === activeController) { historyState = 'error'; status.textContent = 'No se pudieron indexar todas las fechas; los resultados disponibles siguen utilizables.'; refresh(); } });
  };
  const loadHistory = async () => {
    indexController?.abort(); const activeController = new AbortController(); indexController = activeController; historyState = 'loading'; conversations = []; progress = { loaded: 0, total: null }; status.textContent = 'Cargando historial…'; refresh();
    try {
      conversations = await fetchConversationHistory({ signal: activeController.signal, onUpdate: loaded => { if (indexController !== activeController) return; conversations = loaded; refresh(); }, onProgress: value => { if (indexController !== activeController) return; progress = value; status.textContent = value.total === null ? `Cargando historial… ${value.loaded}` : `Cargando historial… ${value.loaded}/${value.total}`; refresh(); } });
      if (indexController !== activeController) return;
      const hasIncompleteDates = conversations.some(chat => !chat.createdAt || !chat.updatedAt);
      if (!conversations.length || hasIncompleteDates) { if (!conversations.length) conversations = visibleLinks(); startProgressiveIndex(activeController); } else { historyState = 'ready'; status.textContent = `${conversations.length} chats disponibles`; refresh(); indexController = null; }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return; if (indexController !== activeController) return;
      conversations = visibleLinks(); startProgressiveIndex(activeController);
    }
  };
  const exit = () => { controller?.abort(); indexController?.abort(); controller = null; indexController = null; exportSummary = null; selecting = false; store.clear(); popover.hidden = true; overlay.hidden = true; filterOpen = false; filterPanel.hidden = true; filterToggle.setAttribute('aria-expanded', 'false'); for (const link of visibleLinks()) { link.element.querySelector('[data-cbe-checkbox]')?.remove(); link.element.querySelector('[data-cbe-selection-marker]')?.remove(); link.element.classList.remove('cbe-is-selected'); } conversations = []; historyState = 'idle'; trigger.hidden = false; refresh(); };
  const trigger = mountSelectionTrigger(target, () => { selecting = true; popover.hidden = false; overlay.hidden = false; trigger.hidden = true; trigger.setAttribute('aria-expanded', 'true'); popover.style.width = `${Math.min(390, window.innerWidth - 24)}px`; void loadHistory(); }); trigger.setAttribute('aria-controls', 'cbe-export-popover'); popover.id = 'cbe-export-popover';
  for (const eventName of ['pointerdown', 'mousedown', 'click', 'touchstart'] as const) popover.addEventListener(eventName, event => event.stopPropagation());
  overlay.addEventListener('click', exit); close.addEventListener('click', exit); cancel.addEventListener('click', exit); filterToggle.addEventListener('click', () => { filterOpen = !filterOpen; filterPanel.hidden = !filterOpen; filterToggle.setAttribute('aria-expanded', String(filterOpen)); }); select.addEventListener('change', () => { field = select.value as DateField; refresh(); }); fields.addEventListener('input', refresh);
  selectAll.addEventListener('click', () => { for (const conversation of filterAndSortConversations(conversations, field, range())) store.add(conversation.id); refresh(); }); clear.addEventListener('click', () => { store.clear(); refresh(); });
  exportButton.addEventListener('click', async () => {
    if (exportSummary) { exit(); return; }
    if (!store.size) return;
    controller = new AbortController(); const activeController = controller; refresh();
    try {
      const result = await exportBatch({ conversationIds: store.ids, signal: activeController.signal, fetchConversation: fetchConversationForExport, onProgress: p => { if (p.state === 'fetching' || p.state === 'rendering') count.textContent = `Exportando ${p.index} de ${p.total}`; }, now: new Date() });
      if (result.cancelled) { exit(); return; }
      if (result.files.length) { const stamp = new Date(); const pad = (n: number) => String(n).padStart(2, '0'); downloadBytes(buildZip(result.files), `ChatGPT-chats-${stamp.getFullYear()}${pad(stamp.getMonth()+1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.zip`); }
      controller = null; exportSummary = { exported: result.files.length, failed: result.failures.length }; refresh();
      status.textContent = formatExportSummary(result.files.length, result.failures.length);
    } catch (caught) {
      controller = null; exportSummary = { exported: 0, failed: store.size }; refresh(); status.textContent = caught instanceof Error ? `No se pudo completar la exportación: ${caught.message}` : 'No se pudo completar la exportación.';
    }
  });
  status.textContent = 'Cargando historial…'; refresh();
}
