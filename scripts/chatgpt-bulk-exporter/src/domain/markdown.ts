import type { Conversation } from './conversation.ts';
import { formatDateTime } from './dates.ts';
import { getActiveBranch } from './conversation.ts';
export function renderMarkdown(conversation: Conversation, exportedAt = new Date(), locale = 'default'): string {
  const lines = [`# ${conversation.title}`, '', '**User:** Anonymous  ', `**Created:** ${formatDateTime(conversation.createdAt, locale)}`, `**Updated:** ${formatDateTime(conversation.updatedAt, locale)}`, `**Exported:** ${formatDateTime(exportedAt, locale)}`, `**Link:** https://chatgpt.com/c/${conversation.id}`, ''];
  for (const message of getActiveBranch(conversation)) { if (message.role !== 'user' && message.role !== 'assistant') continue; lines.push(`## ${message.role === 'user' ? 'Prompt' : 'Response'}:`, '', formatDateTime(message.createdAt, locale), '', message.content.trim(), ''); }
  return `${lines.join('\n').trim()}\n`;
}
