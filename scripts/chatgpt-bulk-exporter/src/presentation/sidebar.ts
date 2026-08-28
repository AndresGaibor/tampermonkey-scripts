import { findConversationLinks, decorateConversation, findSidebarMountTarget } from '../infrastructure/sidebar-dom.ts';
import { SelectionStore } from '../application/selection.ts';
import { exportBatch } from '../application/exporter.ts';
import { fetchConversation, fetchConversationHistory } from '../infrastructure/chatgpt-api.ts';
import { buildZip, downloadBytes } from '../infrastructure/download.ts';
import { filterConversations, hasInvertedRange, parseDateInput, type DateField, type DateRange, type SidebarConversation } from '../domain/conversation-filter.ts';
import { formatDateTime } from '../domain/dates.ts';

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
  let conversations: SidebarConversation[] = []; let historyState: 'idle' | 'loading' | 'ready' | 'error' = 'idle'; let progress = { loaded: 0, total: null as number | null };
  let field: DateField = 'updated'; let filterOpen = false;
  root = document.createElement('div'); root.id = 'cbe-root';
  const overlay = document.createElement('div'); overlay.className = 'cbe-modal-overlay'; overlay.hidden = true; overlay.dataset.cbeOverlay = 'true';
  const popover = document.createElement('section'); popover.className = 'cbe-popover'; popover.hidden = true; popover.dataset.cbePopover = 'true'; popover.setAttribute('role', 'dialog'); popover.setAttribute('aria-modal', 'true'); popover.setAttribute('aria-label', 'Exportar chats');
  const header = document.createElement('div'); header.className = 'cbe-popover-header'; const heading = document.createElement('strong'); heading.textContent = 'Exportar chats'; const count = document.createElement('span'); count.dataset.cbeCount = 'true'; const close = document.createElement('button'); close.type = 'button'; close.className = 'cbe-icon-button'; close.setAttribute('aria-label', 'Cerrar'); close.textContent = '×'; header.append(heading, count, close);
  const filterToggle = document.createElement('button'); filterToggle.type = 'button'; filterToggle.className = 'cbe-filter-toggle'; filterToggle.setAttribute('aria-expanded', 'false'); filterToggle.innerHTML = '<span>Filtrar por fecha</span><span aria-hidden="true">⌄</span>';
  const filterPanel = document.createElement('div'); filterPanel.className = 'cbe-filter-panel'; filterPanel.hidden = true; const select = document.createElement('select'); select.dataset.cbeDateField = 'true'; select.innerHTML = '<option value="updated">Última actualización</option><option value="created">Fecha de creación</option>'; const fields = document.createElement('div'); fields.className = 'cbe-date-fields'; fields.append(dateInput(document, 'Desde', 'from'), dateInput(document, 'Hasta', 'to')); const error = document.createElement('div'); error.className = 'cbe-filter-error'; error.hidden = true; filterPanel.append(select, fields, error);
  const status = document.createElement('div'); status.className = 'cbe-index-status'; const list = document.createElement('div'); list.className = 'cbe-filter-list'; list.setAttribute('role', 'list'); const empty = document.createElement('div'); empty.className = 'cbe-empty'; empty.hidden = true;
  const actions = document.createElement('div'); actions.className = 'cbe-selection-actions'; const selectAll = document.createElement('button'); selectAll.type = 'button'; selectAll.className = 'cbe-secondary-button'; selectAll.textContent = 'Seleccionar visibles'; const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'cbe-secondary-button'; clear.textContent = 'Limpiar selección'; actions.append(selectAll, clear);
  const footer = document.createElement('div'); footer.className = 'cbe-popover-footer'; const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'cbe-secondary-button'; cancel.textContent = 'Cancelar'; const exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.className = 'cbe-primary-button'; footer.append(cancel, exportButton); popover.append(header, status, filterToggle, filterPanel, actions, list, empty, footer); root.append(overlay, popover); document.body.append(root);

  const range = (): DateRange => ({ from: parseDateInput(fields.querySelector<HTMLInputElement>('[data-cbe-date="from"]')?.value || '', 'start'), to: parseDateInput(fields.querySelector<HTMLInputElement>('[data-cbe-date="to"]')?.value || '', 'end') });
  const visibleLinks = () => findConversationLinks(document);
  const refresh = () => {
    const current = range(); const invalid = hasInvertedRange(current); error.hidden = !invalid; error.textContent = invalid ? 'Desde debe ser anterior o igual a Hasta.' : '';
    count.textContent = `${store.size} seleccionado${store.size === 1 ? '' : 's'}`; exportButton.textContent = `Exportar (${store.size})`; exportButton.disabled = store.size === 0 || controller !== null;
    const filteringDisabled = historyState === 'loading' || historyState === 'error'; select.disabled = filteringDisabled; fields.querySelectorAll('input').forEach(input => { input.disabled = filteringDisabled; });
    const visible = historyState === 'loading' ? [] : invalid ? [] : filterConversations(conversations, field, current); selectAll.disabled = visible.length === 0 || invalid || historyState === 'loading'; clear.disabled = store.size === 0;
    overlay.hidden = popover.hidden;
    list.replaceChildren(); empty.hidden = historyState === 'loading' || visible.length > 0; empty.textContent = invalid ? 'Corrige el rango de fechas.' : historyState === 'error' && visible.length === 0 ? '' : conversations.length === 0 ? 'No hay chats disponibles.' : 'No hay chats que coincidan con este filtro.';
    for (const conversation of visible) { const row = document.createElement('label'); row.className = `cbe-filter-row${store.has(conversation.id) ? ' is-selected' : ''}`; const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'cbe-visually-hidden'; input.checked = store.has(conversation.id); input.setAttribute('aria-label', `Seleccionar ${conversation.title}`); input.addEventListener('change', () => { input.checked ? store.add(conversation.id) : store.remove(conversation.id); refresh(); }); const mark = document.createElement('span'); mark.className = 'cbe-row-check'; mark.setAttribute('aria-hidden', 'true'); const text = document.createElement('span'); const title = document.createElement('strong'); title.textContent = conversation.title; const date = document.createElement('small'); const dateValue = field === 'created' ? conversation.createdAt : conversation.updatedAt; date.textContent = `${field === 'created' ? 'Creado' : 'Actualizado'}: ${formatDateTime(dateValue)}`; text.append(title, date); row.append(input, mark, text); list.append(row); }
    for (const link of visibleLinks()) decorateConversation(link.element, store.has(link.id), checked => { checked ? store.add(link.id) : store.remove(link.id); refresh(); });
  };
  const loadHistory = async () => {
    indexController?.abort(); const activeController = new AbortController(); indexController = activeController; historyState = 'loading'; conversations = []; progress = { loaded: 0, total: null }; status.textContent = 'Cargando historial…'; refresh();
    try {
      conversations = await fetchConversationHistory({ signal: activeController.signal, onProgress: value => { if (indexController !== activeController) return; progress = value; status.textContent = value.total === null ? `Cargando historial… ${value.loaded}` : `Cargando historial… ${value.loaded}/${value.total}`; } });
      if (indexController !== activeController) return; historyState = 'ready'; status.textContent = `${conversations.length} chats disponibles`; refresh();
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return; if (indexController !== activeController) return;
      conversations = visibleLinks(); historyState = 'error'; status.textContent = 'No se pudo cargar el historial completo. Puedes exportar los chats visibles, pero el filtro por fecha no está disponible.'; refresh();
    } finally { if (indexController === activeController) indexController = null; }
  };
  const exit = () => { controller?.abort(); indexController?.abort(); controller = null; indexController = null; selecting = false; store.clear(); popover.hidden = true; overlay.hidden = true; filterOpen = false; filterPanel.hidden = true; filterToggle.setAttribute('aria-expanded', 'false'); for (const link of visibleLinks()) { link.element.querySelector('[data-cbe-checkbox]')?.remove(); link.element.querySelector('[data-cbe-selection-marker]')?.remove(); link.element.classList.remove('cbe-is-selected'); } conversations = []; historyState = 'idle'; trigger.hidden = false; refresh(); };
  const trigger = mountSelectionTrigger(target, () => { selecting = true; popover.hidden = false; overlay.hidden = false; trigger.hidden = true; trigger.setAttribute('aria-expanded', 'true'); popover.style.width = `${Math.min(390, window.innerWidth - 24)}px`; void loadHistory(); }); trigger.setAttribute('aria-controls', 'cbe-export-popover'); popover.id = 'cbe-export-popover';
  for (const eventName of ['pointerdown', 'mousedown', 'click', 'touchstart'] as const) popover.addEventListener(eventName, event => event.stopPropagation());
  overlay.addEventListener('click', exit); close.addEventListener('click', exit); cancel.addEventListener('click', exit); filterToggle.addEventListener('click', () => { filterOpen = !filterOpen; filterPanel.hidden = !filterOpen; filterToggle.setAttribute('aria-expanded', String(filterOpen)); }); select.addEventListener('change', () => { field = select.value as DateField; refresh(); }); fields.addEventListener('input', refresh);
  selectAll.addEventListener('click', () => { for (const conversation of filterConversations(conversations, field, range())) store.add(conversation.id); refresh(); }); clear.addEventListener('click', () => { store.clear(); refresh(); });
  exportButton.addEventListener('click', async () => { if (!store.size) return; controller = new AbortController(); refresh(); try { const result = await exportBatch({ conversationIds: store.ids, signal: controller.signal, fetchConversation, onProgress: p => { if (p.state === 'fetching' || p.state === 'rendering') count.textContent = `Exportando ${p.index} de ${p.total}`; }, now: new Date() }); if (!result.cancelled && result.files.length) { const stamp = new Date(); const pad = (n: number) => String(n).padStart(2, '0'); downloadBytes(buildZip(result.files), `ChatGPT-chats-${stamp.getFullYear()}${pad(stamp.getMonth()+1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.zip`); } } finally { controller = null; exit(); } });
  status.textContent = 'Cargando historial…'; refresh();
}
