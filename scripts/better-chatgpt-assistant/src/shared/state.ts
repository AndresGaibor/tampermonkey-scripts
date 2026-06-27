export type Language = 'zh' | 'en';

export interface PinnedPosition {
  x: number;
  y: number;
  side: 'left' | 'right';
  hidden: boolean;
}

export interface State {
  lang: Language;
  currentMode: 'performance' | 'balanced' | 'conservative';
  virtualizationEnabled: boolean;
  minimalMode: boolean;
  edgeSnap: boolean;
  pinned: boolean;
  wasOpen: boolean;
  ctrlFFreeze: boolean;
  lastVirtualizedCount: number;
  lastTurnsCount: number;
  folded: boolean;
  pinnedPos: PinnedPosition;
}

export const state: State = {
  lang: 'zh',
  currentMode: 'balanced',
  virtualizationEnabled: true,
  minimalMode: true,
  edgeSnap: true,
  pinned: false,
  wasOpen: false,
  ctrlFFreeze: false,
  lastVirtualizedCount: 0,
  lastTurnsCount: 0,
  folded: false,
  pinnedPos: { x: 18, y: 64, side: 'left', hidden: false },
};
