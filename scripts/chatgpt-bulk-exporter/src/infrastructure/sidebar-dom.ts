import { normalizeTimestamp } from '../domain/dates.ts';
import type { SidebarConversation } from '../domain/conversation-filter.ts';

export interface ConversationLink extends SidebarConversation { element: HTMLAnchorElement; }

function readTimestamp(element: Element, names: string[]): Date | null {
  let current: Element | null = element;
  while (current) {
    for (const name of names) {
      const value = current.getAttribute(name) ?? (current as HTMLElement).dataset?.[name.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
      const date = normalizeTimestamp(value); if (date) return date;
    }
    current = current.parentElement;
  }
  return null;
}

export function findConversationLinks(root: ParentNode = document): ConversationLink[] {
  const seen = new Set<string>(); const result: ConversationLink[] = [];
  root.querySelectorAll<HTMLAnchorElement>('a[href^="/c/"]').forEach(element => {
    const href = element.getAttribute('href') || ''; const match = href.match(/^\/c\/([^/?#]+)/); if (!match) return;
    const id = decodeURIComponent(match[1]); if (seen.has(id)) return; seen.add(id);
    const row = element.closest<HTMLElement>('[data-sidebar-item], [data-conversation-id]') || element;
    result.push({ id, href, title: element.textContent?.trim() || 'ChatGPT chat', element,
      createdAt: readTimestamp(row, ['data-create-time', 'data-created-at', 'data-created']),
      updatedAt: readTimestamp(row, ['data-update-time', 'data-updated-at', 'data-updated']) });
  });
  return result;
}

export function findSidebarMountTarget(root: ParentNode = document): HTMLElement | null {
  const history = root.querySelector<HTMLElement>('#history'); if (history) return history;
  const nav = root.querySelector<HTMLElement>('nav[aria-label="Historial del chat"]'); if (nav) return nav;
  const firstConversation = findConversationLinks(root)[0]?.element;
  if (firstConversation) return firstConversation.closest<HTMLElement>('[data-sidebar-item]')?.parentElement || firstConversation.parentElement;
  return root.querySelector<HTMLElement>('#stage-slideover-sidebar [data-sidebar-root], #stage-slideover-sidebar') || root.querySelector<HTMLElement>('[data-sidebar-root]');
}

export function decorateConversation(link: HTMLAnchorElement, checked: boolean, onChange?: (checked: boolean) => void): HTMLInputElement {
  let input = link.querySelector<HTMLInputElement>('[data-cbe-checkbox]');
  if (!input) { input = link.ownerDocument.createElement('input'); input.type = 'checkbox'; input.dataset.cbeCheckbox = 'true'; input.className = 'cbe-visually-hidden'; input.setAttribute('aria-label', `Seleccionar ${link.textContent?.trim() || 'chat'}`); input.addEventListener('click', event => event.stopPropagation()); input.addEventListener('change', () => onChange?.(input!.checked)); link.prepend(input); }
  input.checked = checked; link.classList.toggle('cbe-is-selected', checked);
  let marker = link.querySelector<HTMLElement>('[data-cbe-selection-marker]');
  if (!marker) { marker = link.ownerDocument.createElement('span'); marker.dataset.cbeSelectionMarker = 'true'; marker.className = 'cbe-selection-marker'; marker.setAttribute('aria-hidden', 'true'); link.prepend(marker); }
  return input;
}
