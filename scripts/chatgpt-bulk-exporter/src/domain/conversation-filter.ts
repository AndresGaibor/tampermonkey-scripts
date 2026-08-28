import { normalizeTimestamp } from './dates.ts';

export type DateField = 'created' | 'updated';
export interface DateRange { from: number | null; to: number | null; }
export interface SidebarConversation { id: string; title: string; href: string; createdAt: Date | null; updatedAt: Date | null; }

export function parseDateTimeInput(value: string): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function isInDateRange(conversation: SidebarConversation, field: DateField, range: DateRange): boolean {
  const date = field === 'created' ? conversation.createdAt : conversation.updatedAt;
  if (!date) return range.from === null && range.to === null;
  const time = date.getTime();
  return (range.from === null || time >= range.from) && (range.to === null || time <= range.to);
}

export function filterConversations(conversations: SidebarConversation[], field: DateField, range: DateRange): SidebarConversation[] {
  return conversations.filter(conversation => isInDateRange(conversation, field, range));
}

export function hasInvertedRange(range: DateRange): boolean {
  return range.from !== null && range.to !== null && range.from > range.to;
}

export function normalizeSidebarTimestamp(value: unknown): Date | null {
  return normalizeTimestamp(value);
}
