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
  const button = target.ownerDocument.createElement('button'); button.type = 'button'; button.className = 'cbe-menu-item'; button.dataset.cbeSelectionTrigger = 'true'; button.setAttribute('aria-label', 'Seleccionar chats');
  button.innerHTML = `<span class="cbe-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 6.5h10M4 12h10M4 17.5h6"/><path d="m17 7 1.5 1.5L21 6"/><rect x="16" y="14" width="5" height="5" rx="1"/></svg></span><span class="cbe-menu-label">Seleccionar chats</span>`;
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
  let field: DateField = 'updated';
  root = document.createElement('div'); root.id = 'cbe-root';
  const actions = document.createElement('div'); actions.id = 'cbe-actions'; actions.hidden = true;
  const count = document.createElement('span'); count.dataset.cbeCount = 'true';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancelar';
  const exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.textContent = 'Exportar'; exportButton.disabled = true;
  const filterButton = document.createElement('button'); filterButton.type = 'button'; filterButton.textContent = 'Filtrar por fecha'; filterButton.dataset.cbeFilterToggle = 'true';
  const popover = document.createElement('section'); popover.className = 'cbe-popover'; popover.hidden = true; popover.dataset.cbePopover = 'true'; popover.setAttribute('aria-label', 'Filtrar chats por fecha');
  const select = document.createElement('select'); select.dataset.cbeDateField = 'true'; select.innerHTML = '<option value="updated">Última actualización</option><option value="created">Fecha de creación</option>';
  const fields = document.createElement('div'); fields.className = 'cbe-date-fields'; fields.append(dateInput(document, 'Desde', 'from'), dateInput(document, 'Hasta', 'to'));
  const error = document.createElement('div'); error.className = 'cbe-filter-error'; error.hidden = true;
  const list = document.createElement('div'); list.className = 'cbe-filter-list'; list.setAttribute('role', 'list');
  const selectAll = document.createElement('button'); selectAll.type = 'button'; selectAll.textContent = 'Seleccionar todos';
  const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Limpiar';
  const filterActions = document.createElement('div'); filterActions.className = 'cbe-filter-actions'; filterActions.append(selectAll, clear);
  popover.append(select, fields, error, filterActions, list); actions.append(count, filterButton, cancel, exportButton); root.append(actions, popover); target.prepend(root);

  const range = (): DateRange => ({ from: parseDateTimeInput(fields.querySelector<HTMLInputElement>('[data-cbe-date="from"]')?.value || ''), to: parseDateTimeInput(fields.querySelector<HTMLInputElement>('[data-cbe-date="to"]')?.value || '') });
  const refresh = () => {
    const conversations = findConversationLinks(); const current = range(); const invalid = hasInvertedRange(current); error.hidden = !invalid; error.textContent = invalid ? 'La fecha Desde debe ser anterior o igual a Hasta.' : '';
    const visible = invalid ? [] : filterConversations(conversations, field, current); count.textContent = `${store.size} seleccionado${store.size === 1 ? '' : 's'}`; exportButton.disabled = store.size === 0 || controller !== null; selectAll.disabled = visible.length === 0 || invalid;
    list.replaceChildren(); if (!visible.length) { const empty = document.createElement('div'); empty.className = 'cbe-empty'; empty.textContent = invalid ? 'Corrige el rango de fechas.' : 'No hay chats que coincidan.'; list.append(empty); }
    for (const conversation of visible) { const row = document.createElement('label'); row.className = 'cbe-filter-row'; const input = document.createElement('input'); input.type = 'checkbox'; input.checked = store.has(conversation.id); input.addEventListener('change', () => { input.checked ? store.add(conversation.id) : store.remove(conversation.id); refresh(); }); const text = document.createElement('span'); const title = document.createElement('strong'); title.textContent = conversation.title; const date = document.createElement('small'); const dateValue = field === 'created' ? conversation.createdAt : conversation.updatedAt; date.textContent = formatDateTime(dateValue); text.append(title, date); row.append(input, text); list.append(row); }
    if (selecting) for (const link of conversations) decorateConversation(link.element, store.has(link.id), checked => { checked ? store.add(link.id) : store.remove(link.id); refresh(); });
  };
  const exit = (message?: string) => { if (controller) controller.abort(); controller = null; selecting = false; store.clear(); actions.hidden = true; popover.hidden = true; for (const link of findConversationLinks()) link.element.querySelector('[data-cbe-checkbox]')?.remove(); if (message) trigger.textContent = message; refresh(); };
  const trigger = mountSelectionTrigger(target, () => { selecting = true; trigger.hidden = true; actions.hidden = false; refresh(); });
  filterButton.addEventListener('click', () => { popover.hidden = !popover.hidden; filterButton.setAttribute('aria-expanded', String(!popover.hidden)); refresh(); });
  select.addEventListener('change', () => { field = select.value as DateField; refresh(); }); fields.addEventListener('input', refresh);
  selectAll.addEventListener('click', () => { for (const conversation of filterConversations(findConversationLinks(), field, range())) store.add(conversation.id); refresh(); });
  clear.addEventListener('click', () => { store.clear(); refresh(); }); cancel.addEventListener('click', () => exit());
  exportButton.addEventListener('click', async () => { controller = new AbortController(); exportButton.disabled = true; const result = await exportBatch({ conversationIds: store.ids, signal: controller.signal, fetchConversation, onProgress: p => { if (p.state === 'fetching' || p.state === 'rendering') count.textContent = `Exportando ${p.index} de ${p.total}`; }, now: new Date() }); if (!result.cancelled && result.files.length) { const stamp = new Date(); const pad = (n: number) => String(n).padStart(2, '0'); downloadBytes(buildZip(result.files), `ChatGPT-chats-${stamp.getFullYear()}${pad(stamp.getMonth()+1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.zip`); } exit(result.cancelled ? 'Exportación cancelada' : result.failures.length ? `${result.files.length} exportados, ${result.failures.length} fallaron` : 'Exportación completada'); });
  refresh();
}
