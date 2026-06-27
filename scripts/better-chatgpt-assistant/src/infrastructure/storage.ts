import { clamp } from '@shared/math.ts';
import {
  KEY_ENABLED,
  KEY_MODE,
  KEY_PINNED,
  KEY_POS,
} from '../shared/constants.ts';
import type { PinnedPosition } from '../shared/state.ts';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function loadBool(storage: StorageLike, key: string, def: boolean): boolean {
  const v = storage.getItem(key);
  if (v === null || v === undefined) return def;
  return v === '1';
}

export function saveBool(storage: StorageLike, key: string, val: boolean): void {
  storage.setItem(key, val ? '1' : '0');
}

export function loadMode(storage: StorageLike): 'performance' | 'balanced' | 'conservative' {
  const v = storage.getItem(KEY_MODE);
  return (v === 'performance' || v === 'balanced' || v === 'conservative') ? v : 'balanced';
}

export function saveMode(storage: StorageLike, mode: 'performance' | 'balanced' | 'conservative'): void {
  storage.setItem(KEY_MODE, mode);
}

export function loadPos(storage: StorageLike, viewportWidth: number, viewportHeight: number): PinnedPosition {
  try {
    const raw = storage.getItem(KEY_POS);
    if (!raw) return { x: 18, y: 64, side: 'left', hidden: false };
    const p = JSON.parse(raw) as Partial<PinnedPosition>;
    if (typeof p.x === 'number' && typeof p.y === 'number') {
      return {
        x: clamp(p.x, 0, viewportWidth - 40),
        y: clamp(p.y, 0, viewportHeight - 40),
        side: p.side === 'right' ? 'right' : 'left',
        hidden: !!p.hidden,
      };
    }
  } catch {}
  return { x: 18, y: 64, side: 'left', hidden: false };
}

export function savePos(storage: StorageLike, pos: PinnedPosition): void {
  storage.setItem(KEY_POS, JSON.stringify(pos));
}
