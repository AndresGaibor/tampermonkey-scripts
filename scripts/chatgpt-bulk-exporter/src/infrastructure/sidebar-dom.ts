export interface ConversationLink { id: string; element: HTMLAnchorElement; }

export function findConversationLinks(root: ParentNode = document): ConversationLink[] {
  const seen = new Set<string>(); const result: ConversationLink[] = [];
  root.querySelectorAll<HTMLAnchorElement>('a[href^="/c/"]').forEach(element => {
    const match = element.getAttribute('href')?.match(/^\/c\/([^/?#]+)/); if (!match) return;
    const id = decodeURIComponent(match[1]); if (!seen.has(id)) { seen.add(id); result.push({ id, element }); }
  });
  return result;
}

export function findSidebarMountTarget(root: ParentNode = document): HTMLElement | null {
  const history = root.querySelector<HTMLElement>('#history');
  if (history) return history;
  const nav = root.querySelector<HTMLElement>('nav[aria-label="Historial del chat"]');
  if (nav) return nav;
  const firstConversation = findConversationLinks(root)[0]?.element;
  if (firstConversation) return firstConversation.closest<HTMLElement>('[data-sidebar-item]')?.parentElement || firstConversation.parentElement;
  return root.querySelector<HTMLElement>('#stage-slideover-sidebar [data-sidebar-root], #stage-slideover-sidebar')
    || root.querySelector<HTMLElement>('[data-sidebar-root]');
}

export function decorateConversation(link: HTMLAnchorElement, checked: boolean, onChange?: (checked: boolean) => void): HTMLInputElement {
  let input = link.querySelector<HTMLInputElement>('[data-cbe-checkbox]');
  if (!input) {
    input = link.ownerDocument.createElement('input'); input.type = 'checkbox'; input.dataset.cbeCheckbox = 'true';
    input.setAttribute('aria-label', `Seleccionar ${link.textContent?.trim() || 'chat'}`);
    input.addEventListener('click', event => event.stopPropagation()); input.addEventListener('change', () => onChange?.(input!.checked)); link.prepend(input);
  }
  input.checked = checked; return input;
}
