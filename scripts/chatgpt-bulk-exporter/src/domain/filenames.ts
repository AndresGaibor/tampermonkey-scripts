import { compactDate } from './dates.ts';
const INVALID = /[\\/:*?"<>|]/g;
export function createFilename(title: string, date: Date | null): string { const clean = (title || '').replace(INVALID, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '').slice(0, 100).trim(); return `ChatGPT-${clean || 'chat'}${date ? `-${compactDate(date)}` : ''}.md`; }
export function uniqueFilename(name: string, used: Set<string>): string { if (!used.has(name)) return name; const dot = name.lastIndexOf('.'); const base = name.slice(0, dot), ext = name.slice(dot); let n = 2; while (used.has(`${base}-${n}${ext}`)) n++; return `${base}-${n}${ext}`; }
