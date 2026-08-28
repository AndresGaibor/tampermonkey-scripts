import type { Conversation, ConversationMessage, MessageRole } from '../domain/conversation.ts';

function conversationIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/c\/([^/?#]+)/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}

function cleanMessageText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('button, input, textarea, select, option, [role="button"], [aria-hidden="true"], [hidden], script, style').forEach(node => node.remove());
  return (clone.textContent || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function documentTitle(document: Document): string {
  const heading = document.querySelector<HTMLElement>('main h1')?.textContent?.trim();
  const title = heading || document.title.replace(/\s*[|–—-]\s*ChatGPT\s*$/i, '').trim();
  return title || 'ChatGPT chat';
}

export function conversationFromDocument(conversationId: string, document: Document, pathname: string): Conversation | null {
  if (conversationIdFromPath(pathname) !== conversationId) return null;
  const elements = [...document.querySelectorAll<HTMLElement>('main [data-message-author-role="user"], main [data-message-author-role="assistant"]')];
  const messages: ConversationMessage[] = [];
  for (const [index, element] of elements.entries()) {
    const content = cleanMessageText(element);
    if (!content) continue;
    const role = element.dataset.messageAuthorRole as MessageRole;
    const id = element.dataset.messageId || `dom-message-${index + 1}`;
    messages.push({ id, parentId: messages.at(-1)?.id ?? null, role, createdAt: null, content });
  }
  if (!messages.length) return null;
  return { id: conversationId, title: documentTitle(document), createdAt: null, updatedAt: null, currentNode: messages.at(-1)?.id ?? null, messages };
}
