export const CHECK_INTERVAL_MS = 1100;
export const ROUTE_GUARD_MS = 800;
export const INPUT_DIM_IDLE_MS = 850;
export const IMAGE_LOAD_RETRY_MS = 250;
export const POS_FOLLOW_MS = 450;
export const POS_FOLLOW_WHEN_OPEN_MS = 250;

export const MODE_TO_MARGIN_SCREENS: Record<string, number> = {
  performance: 1,
  balanced: 2,
  conservative: 3,
};

export const MEM_STABLE_MB = 220;
export const MEM_WARNING_MB = 520;
export const DOM_OK = 7000;
export const DOM_WARN = 15000;
export const FORCE_CLEAN_MARGIN_SCREENS = 0.4;

export const LANG_KEY = 'vs_lang';

export const KEY_MODE = 'cgpt_vs_mode';
export const KEY_ENABLED = 'cgpt_vs_enabled';
export const KEY_PINNED = 'cgpt_vs_pinned';
export const KEY_POS = 'cgpt_vs_pos';
export const KEY_MINIMAL = 'cgpt_vs_minimal';
export const KEY_EDGE_SNAP = 'cgpt_vs_edge_snap';
export const KEY_LAST_OPEN = 'cgpt_vs_open';

export const STYLE_ID = 'cgpt-vs-style';
export const ROOT_ID = 'cgpt-vs-root';
export const DOT_ID = 'cgpt-vs-dot';
export const BTN_ID = 'cgpt-vs-btn';
export const PANEL_ID = 'cgpt-vs-panel';
export const HELP_ID = 'cgpt-vs-help';
export const FP_ID = 'cgpt-vs-featurepack';
