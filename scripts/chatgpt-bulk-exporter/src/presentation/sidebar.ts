import { findConversationLinks, decorateConversation, findSidebarMountTarget } from '../infrastructure/sidebar-dom.ts';
import { SelectionStore } from '../application/selection.ts';
import { exportBatch } from '../application/exporter.ts';
import { fetchConversation } from '../infrastructure/chatgpt-api.ts';
import { buildZip, downloadBytes } from '../infrastructure/download.ts';
import { filterConversations, hasInvertedRange, parseDateTimeInput, type DateField, type DateRange } from '../domain/conversation-filter.ts';
import { formatDateTime } from '../domain/dates.ts';

export function mountSelectionTrigger(target: HTMLElement, onClick?: () => void): HTMLButtonElement {
  const existing = target.ownerDocument.querySelector<HTMLButtonElement>('[data-cbe-selection-trigger="true"]');
  if (existing?.isConnected) return existing;
  const button = target.ownerDocument.createElement('button');
  button.type = 'button'; button.className = 'cbe-menu-item'; button.dataset.cbeSelectionTrigger = 'true';
  button.setAttribute('aria-label', 'Exportar chats');
  button.innerHTML = `<span class="cbe-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 14v5h14v-5"/></svg></span><span class="cbe-menu-label">Exportar chats</span>`;
  button.addEventListener('click', () => onClick?.()); target.prepend(button); return button;
}

function dateInput(document: Document, label: string, key: 'from' | 'to'): HTMLLabelElement {
  const wrapper = document.createElement('label'); wrapper.className = 'cbe-date-field'; wrapper.textContent = label;
  const input = document.createElement('input'); input.type = 'datetime-local'; input.dataset.cbeDate = key; wrapper.append(input); return wrapper;
}

export function mountSidebar(): void {
  const target = findSidebarMountTarget(); if (!target) return;
  let root = document.getElementById('cbe-root'); if (root?.isConnected) return;
  const store = new SelectionStore(); let selecting = false; let controller: AbortController | null = null;
  let field: DateField = 'updated'; let filterOpen = false;
  root = document.createElement('div'); root.id = 'cbe-root';
  const popover = document.createElement('section'); popover.className = 'cbe-popover'; popover.hidden = true; popover.dataset.cbePopover = 'true'; popover.setAttribute('role', 'dialog'); popover.setAttribute('aria-label', 'Exportar chats');
  const header = document.createElement('div'); header.className = 'cbe-popover-header';
  const heading = document.createElement('strong'); heading.textContent = 'Exportar chats';
  const count = document.createElement('span'); count.dataset.cbeCount = 'true';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'cbe-icon-button'; close.setAttribute('aria-label', 'Cerrar'); close.innerHTML = '×'; header.append(heading, count, close);
  const filterToggle = document.createElement('button'); filterToggle.type = 'button'; filterToggle.className = 'cbe-filter-toggle'; filterToggle.setAttribute('aria-expanded', 'false'); filterToggle.innerHTML = '<span>Filtrar por fecha</span><span aria-hidden="true">⌄</span>';
  const filterPanel = document.createElement('div'); filterPanel.className = 'cbe-filter-panel'; filterPanel.hidden = true;
  const select = document.createElement('select'); select.dataset.cbeDateField = 'true'; select.innerHTML = '<option value="updated">Última actualización</option><option value="created">Fecha de creación</option>';
  const fields = document.createElement('div'); fields.className = 'cbe-date-fields'; fields.append(dateInput(document, 'Desde', 'from'), dateInput(document, 'Hasta', 'to'));
  const error = document.createElement('div'); error.className = 'cbe-filter-error'; error.hidden = true; filterPanel.append(select, fields, error);
  const list = document.createElement('div'); list.className = 'cbe-filter-list'; list.setAttribute('role', 'list');
  const empty = document.createElement('div'); empty.className = 'cbe-empty'; empty.hidden = true;
  const footer = document.createElement('div'); footer.className = 'cbe-popover-footer';
  const selectAll = document.createElement('button'); selectAll.type = 'button'; selectAll.className = 'cbe-secondary-button'; selectAll.textContent = 'Seleccionar todo';
  const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'cbe-secondary-button'; clear.textContent = 'Limpiar';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'cbe-secondary-button'; cancel.textContent = 'Cancelar';
  const exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.className = 'cbe-primary-button'; exportButton.textContent = 'Exportar'; exportButton.disabled = true;
  footer.append(selectAll, clear, cancel, exportButton); popover.append(header, filterToggle, filterPanel, list, empty, footer); root.append(popover); target.prepend(root);

  const range = (): DateRange => ({ from: parseDateTimeInput(fields.querySelector<HTMLInputElement>('[data-cbe-date="from"]')?.value || ''), to: parseDateTimeInput(fields.querySelector<HTMLInputElement>('[data-cbe-date="to"]')?.value || '') });
  const refresh = () => {
    const conversations = findConversationLinks(); const current = range(); const invalid = hasInvertedRange(current); error.hidden = !invalid; error.textContent = invalid ? 'Desde debe ser anterior o igual a Hasta.' : '';
    const visible = invalid ? [] : filterConversations(conversations, field, current); count.textContent = store.size ? `${store.size} seleccionado${store.size === 1 ? '' : 's'}` : 'Selecciona los chats';
    exportButton.disabled = store.size === 0 || controller !== null; selectAll.disabled = visible.length === 0 || invalid; clear.disabled = store.size === 0;
    list.replaceChildren(); empty.hidden = visible.length > 0; empty.textContent = invalid ? 'Corrige el rango de fechas.' : 'No hay chats que coincidan.';
    for (const conversation of visible) { const row = document.createElement('label'); row.className = `cbe-filter-row${store.has(conversation.id) ? ' is-selected' : ''}`; const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'cbe-visually-hidden'; input.checked = store.has(conversation.id); input.setAttribute('aria-label', `Seleccionar ${conversation.title}`); input.addEventListener('change', () => { input.checked ? store.add(conversation.id) : store.remove(conversation.id); refresh(); }); const mark = document.createElement('span'); mark.className = 'cbe-row-check'; mark.setAttribute('aria-hidden', 'true'); const text = document.createElement('span'); const title = document.createElement('strong'); title.textContent = conversation.title; const date = document.createElement('small'); const dateValue = field === 'created' ? conversation.createdAt : conversation.updatedAt; date.textContent = formatDateTime(dateValue); text.append(title, date); row.append(input, mark, text); list.append(row); }
    if (selecting) for (const link of conversations) decorateConversation(link.element, store.has(link.id), checked => { checked ? store.add(link.id) : store.remove(link.id); refresh(); });
  };
  const exit = () => { if (controller) controller.abort(); controller = null; selecting = false; store.clear(); popover.hidden = true; filterOpen = false; filterPanel.hidden = true; filterToggle.setAttribute('aria-expanded', 'false'); for (const link of findConversationLinks()) link.element.querySelector('[data-cbe-checkbox]')?.remove(); trigger.hidden = false; refresh(); };
  const trigger = mountSelectionTrigger(target, () => { selecting = true; popover.hidden = false; trigger.setAttribute('aria-expanded', 'true'); refresh(); }); trigger.setAttribute('aria-controls', 'cbe-export-popover'); popover.id = 'cbe-export-popover';
  close.addEventListener('click', exit); cancel.addEventListener('click', exit);
  filterToggle.addEventListener('click', () => { filterOpen = !filterOpen; filterPanel.hidden = !filterOpen; filterToggle.setAttribute('aria-expanded', String(filterOpen)); });
  select.addEventListener('change', () => { field = select.value as DateField; refresh(); }); fields.addEventListener('input', refresh);
  selectAll.addEventListener('click', () => { for (const conversation of filterConversations(findConversationLinks(), field, range())) store.add(conversation.id); refresh(); });
  clear.addEventListener('click', () => { store.clear(); refresh(); });
  exportButton.addEventListener('click', async () => { controller = new AbortController(); exportButton.disabled = true; const result = await exportBatch({ conversationIds: store.ids, signal: controller.signal, fetchConversation, onProgress: p => { if (p.state === 'fetching' || p.state === 'rendering') count.textContent = `Exportando ${p.index} de ${p.total}`; }, now: new Date() }); if (!result.cancelled && result.files.length) { const stamp = new Date(); const pad = (n: number) => String(n).padStart(2, '0'); downloadBytes(buildZip(result.files), `ChatGPT-chats-${stamp.getFullYear()}${pad(stamp.getMonth()+1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.zip`); } exit(); });
  refresh();
}
