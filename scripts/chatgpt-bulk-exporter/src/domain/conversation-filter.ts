import { normalizeTimestamp } from './dates.ts';

export type DateField = 'created' | 'updated';
export interface DateRange { from: number | null; to: number | null; }
export interface SidebarConversation { id: string; title: string; href: string; createdAt: Date | null; updatedAt: Date | null; }

export function parseDateInput(value: string, boundary: 'start' | 'end'): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const date = boundary === 'start'
    ? new Date(year, month - 1, day, 0, 0, 0, 0)
    : new Date(year, month - 1, day, 23, 59, 59, 999);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date.getTime() : null;
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

function dateTime(conversation: SidebarConversation, field: DateField): number | null {
  const value = field === 'created' ? conversation.createdAt : conversation.updatedAt;
  const time = value?.getTime();
  return typeof time === 'number' && Number.isFinite(time) ? time : null;
}

export function filterAndSortConversations(conversations: SidebarConversation[], field: DateField, range: DateRange): SidebarConversation[] {
  return filterConversations(conversations, field, range).sort((left, right) => {
    const leftTime = dateTime(left, field); const rightTime = dateTime(right, field);
    if (leftTime !== null && rightTime !== null && leftTime !== rightTime) return rightTime - leftTime;
    if (leftTime === null && rightTime !== null) return 1;
    if (leftTime !== null && rightTime === null) return -1;
    const titleOrder = left.title.localeCompare(right.title); return titleOrder || left.id.localeCompare(right.id);
  });
}

export function hasInvertedRange(range: DateRange): boolean {
  return range.from !== null && range.to !== null && range.from > range.to;
}

export function normalizeSidebarTimestamp(value: unknown): Date | null { return normalizeTimestamp(value); }
