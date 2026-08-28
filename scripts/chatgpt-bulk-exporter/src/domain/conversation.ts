import { normalizeTimestamp } from './dates.ts';

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool' | 'unknown';
export interface ConversationMessage { id: string; parentId: string | null; role: MessageRole; createdAt: Date | null; content: string; }
export interface Conversation { id: string; title: string; createdAt: Date | null; updatedAt: Date | null; currentNode: string | null; messages: ConversationMessage[]; }

function roleOf(value: unknown): MessageRole {
  const role = typeof value === 'string' ? value : '';
  return ['user', 'assistant', 'system', 'tool'].includes(role) ? role as MessageRole : 'unknown';
}
function contentOf(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content.parts)) return content.parts.map((part: any) => typeof part === 'string' ? part : JSON.stringify(part)).join('\n');
  if (typeof content.text === 'string') return content.text;
  return '';
}
export function normalizeConversation(raw: any): Conversation {
  if (!raw || typeof raw !== 'object' || typeof raw.conversation_id !== 'string' || !raw.mapping || typeof raw.mapping !== 'object') throw new Error('Unsupported conversation format');
  const messages = Object.entries(raw.mapping).flatMap(([key, node]: [string, any]) => node?.message ? [{ id: String(node.message.id ?? key), parentId: node.parent ?? null, role: roleOf(node.message.author?.role), createdAt: normalizeTimestamp(node.message.create_time), content: contentOf(node.message.content) }] : []);
  return { id: raw.conversation_id, title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'ChatGPT chat', createdAt: normalizeTimestamp(raw.create_time), updatedAt: normalizeTimestamp(raw.update_time), currentNode: typeof raw.current_node === 'string' ? raw.current_node : null, messages };
}
export function getActiveBranch(conversation: Conversation): ConversationMessage[] {
  const byId = new Map(conversation.messages.map(message => [message.id, message]));
  const result: ConversationMessage[] = []; const seen = new Set<string>(); let id = conversation.currentNode;
  while (id && !seen.has(id)) { seen.add(id); const message = byId.get(id); if (!message) break; result.push(message); id = message.parentId; }
  return result.reverse();
}
