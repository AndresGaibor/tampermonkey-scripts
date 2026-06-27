import { state } from '../shared/state.ts';
import type { PinnedPosition } from '../shared/state.ts';
import { getMessageNodes, findModelButton, getUsedHeapMB, estimateTokens, toggleCode, exportChatMarkdown } from '../infrastructure/dom.ts';
import { memoryLevel, domLevel, estimateRemainingTurns, modeLabel, suggestionText } from '../domain/health.ts';
import { t, toggleLanguage, setLanguage } from '../domain/i18n.ts';
import type { Language } from '../shared/state.ts';
import {
  POS_FOLLOW_MS,
  POS_FOLLOW_WHEN_OPEN_MS,
  FORCE_CLEAN_MARGIN_SCREENS,
  MODE_TO_MARGIN_SCREENS,
  CHECK_INTERVAL_MS,
  ROOT_ID,
  DOT_ID,
  BTN_ID,
  PANEL_ID,
  FP_ID,
} from '../shared/constants.ts';
import { clamp } from '@shared/math.ts';
import { ensureRoot } from '../presentation/dashboard-render.ts';


let followTimer: ReturnType<typeof setTimeout> | null = null;

function getMarginScreens() {
  return MODE_TO_MARGIN_SCREENS[state.currentMode] ?? MODE_TO_MARGIN_SCREENS.balanced;
}

export function flashDot() {
  const dot = document.getElementById(DOT_ID);
  if (!dot) return;
  dot.style.transform = 'scale(1.14)';
  setTimeout(() => { dot.style.transform = 'scale(1)'; }, 140);
}

export function positionNearModelButton() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  if (state.pinned) return;

  const btn = findModelButton();
  if (!btn) {
    root.style.left = '12px';
    root.style.top = '10px';
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    root.classList.add('fallback');
    return;
  }

  const r = btn.getBoundingClientRect();
  const x = Math.round(r.left + r.width + 10);
  const y = Math.round(r.top + (r.height - 28) / 2);

  root.style.left = `${clamp(x, 6, window.innerWidth - 360)}px`;
  root.style.top = `${clamp(y, 6, window.innerHeight - 60)}px`;
  root.style.right = 'auto';
  root.style.bottom = 'auto';

  root.classList.remove('fallback');
}

export function startFollowPositionLoop() {
  stopFollowPositionLoop();
  const tick = () => {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const open = root.classList.contains('open');
    positionNearModelButton();
    followTimer = setTimeout(tick, open ? POS_FOLLOW_WHEN_OPEN_MS : POS_FOLLOW_MS);
  };
  tick();
}

export function stopFollowPositionLoop() {
  if (followTimer) clearTimeout(followTimer);
  followTimer = null;
}

export function updatePinnedHiddenClass() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  root.classList.remove('hiddenLeft', 'hiddenRight');
  if (!state.pinned) return;
  if (!state.edgeSnap) return;
  if (root.classList.contains('open')) return;

  if (state.pinnedPos.hidden) {
    if (state.pinnedPos.side === 'right') root.classList.add('hiddenRight');
    else root.classList.add('hiddenLeft');
  }
}

export function applyPinnedState() {
  const root = ensureRoot();
  root.classList.toggle('pinned', state.pinned);

  if (state.pinned) {
    stopFollowPositionLoop();
    root.style.left = `${clamp(state.pinnedPos.x, 0, window.innerWidth - 60)}px`;
    root.style.top = `${clamp(state.pinnedPos.y, 0, window.innerHeight - 60)}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    updatePinnedHiddenClass();
  } else {
    root.classList.remove('hiddenLeft', 'hiddenRight');
    startFollowPositionLoop();
    positionNearModelButton();
  }
}

export function snapToEdgeIfNeeded() {
  if (!state.pinned || !state.edgeSnap) return;

  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  const rect = root.getBoundingClientRect();
  const leftDist = rect.left;
  const rightDist = window.innerWidth - rect.right;
  const snapLeft = leftDist <= rightDist;

  if (snapLeft) {
    state.pinnedPos.x = 8;
    state.pinnedPos.side = 'left';
  } else {
    state.pinnedPos.x = Math.max(8, window.innerWidth - rect.width - 8);
    state.pinnedPos.side = 'right';
  }

  state.pinnedPos.hidden = true;
  applyPinnedState();
}

export function refreshSegUI(root: HTMLElement) {
  const panel = root.querySelector(`#${PANEL_ID}`);
  if (!panel) return;
  panel.querySelectorAll('.cgpt-vs-seg button').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-mode') === state.currentMode);
  });
}

export function renderFeaturePack(forceRebuild: boolean) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const slot = root.querySelector(`#${FP_ID}`);
  if (!slot) return;
  if (!forceRebuild && slot.childElementCount) return;

  slot.innerHTML = '';

  const left = document.createElement('div');
  left.className = 'fp-left';
  const right = document.createElement('div');
  right.className = 'fp-right';

  const mkBtn = (label: string, fn: () => void, title?: string) => {
    const b = document.createElement('button');
    b.className = 'cgpt-vs-chip';
    b.textContent = label;
    if (title) b.title = title;
    b.addEventListener('click', fn);
    return b;
  };

  const exportBtn = mkBtn(t(state.lang, 'export'), exportChatMarkdown);
  const foldFn = () => { state.folded = toggleCode(); };
  const foldBtn = mkBtn(t(state.lang, 'fold'), foldFn);
  const token = document.createElement('span');
  token.className = 'fp-token';
  const langBtn = mkBtn(t(state.lang, 'lang'), () => {
    state.lang = toggleLanguage(state.lang);
    setLanguage(state.lang);
    updateUI();
    renderFeaturePack(true);
  });

  left.append(exportBtn, foldBtn);
  right.append(token, langBtn);
  slot.append(left, right);

  const tick = () => {
    if (!document.body.contains(token)) return;
    const text = getMessageNodes().map(m => m.innerText || '').join('');
    token.textContent = `${t(state.lang, 'token')}: ${estimateTokens(text)}`;
    setTimeout(tick, 1500);
  };
  tick();
}

export function updateUI() {
  const root = ensureRoot();
  const domNodes = document.getElementsByTagName('*').length;
  const usedMB = getUsedHeapMB();
  const memInfo = memoryLevel(usedMB, state.lang);
  const domInfo = domLevel(domNodes);
  const turns = state.lastTurnsCount || (getMessageNodes().length || 0);
  const virt = state.virtualizationEnabled ? (state.lastVirtualizedCount || 0) : 0;
  const remainTurns = estimateRemainingTurns(usedMB, turns);
  const remainText = (remainTurns == null)
    ? (state.lang === 'zh' ? 'No se puede estimar' : 'N/A')
    : (state.lang === 'zh' ? `${remainTurns} turnos aprox.` : `~${remainTurns} turns`);

  const virtText = (!state.virtualizationEnabled)
    ? (state.lang === 'zh' ? 'Pausado (vista completa)' : 'Paused (full visible)')
    : (state.ctrlFFreeze
      ? (state.lang === 'zh' ? 'Pausado (búsqueda Ctrl+F activa)' : 'Paused (Find active)')
      : (virt > 0 ? (state.lang === 'zh' ? `Activado (${virt} elementos virtualizados)` : `On (${virt} virtualized)`) : (state.lang === 'zh' ? 'Activado (no hace falta virtualizar ahora)' : 'On (no need now)'))
    );

  const worst = (!state.virtualizationEnabled) ? 'off' as const
    : (memInfo.level === 'bad' || domInfo.level === 'bad') ? 'bad' as const
    : (memInfo.level === 'warn' || domInfo.level === 'warn') ? 'warn' as const
    : 'ok' as const;

  const dot = root.querySelector(`#${DOT_ID}`);
  if (dot) {
    dot.classList.remove('warn', 'bad', 'off');
    if (worst === 'warn') dot.classList.add('warn');
    if (worst === 'bad') dot.classList.add('bad');
    if (worst === 'off') dot.classList.add('off');
  }

  const mini = root.querySelector('#cgpt-vs-miniText');
  if (mini) {
    const status = worst === 'bad' ? (state.lang === 'zh' ? 'Riesgo' : 'Risk')
      : worst === 'warn' ? (state.lang === 'zh' ? 'Atención' : 'Caution')
      : worst === 'off' ? (state.lang === 'zh' ? 'Pausar' : 'Paused')
      : (state.lang === 'zh' ? 'Saludable' : 'Healthy');
    mini.textContent = `${modeLabel(state.currentMode, state.lang)} · ${status}`;
  }

  const setText = (k: string, v: string) => {
    const el = root.querySelector(`[data-k="${k}"]`);
    if (el) el.textContent = v;
  };

  setText('mode', `${modeLabel(state.currentMode, state.lang)} (×${getMarginScreens()} pantallas)`);
  setText('dom', domInfo.label);

  const memEl = root.querySelector('[data-k="mem"]');
  if (memEl) {
    memEl.textContent = memInfo.label;
    memEl.classList.remove('mem-ok', 'mem-warn', 'mem-bad');
    if (memInfo.level === 'ok') memEl.classList.add('mem-ok');
    if (memInfo.level === 'warn') memEl.classList.add('mem-warn');
    if (memInfo.level === 'bad') memEl.classList.add('mem-bad');
  }

  setText('virt', virtText);
  setText('turns', `${turns}`);
  setText('remain', remainText);
  setText('tip', suggestionText({
    virtualizationEnabled: state.virtualizationEnabled,
    ctrlFFreeze: state.ctrlFFreeze,
    domNodes,
    usedMB,
    virtCount: virt,
    turns,
    lang: state.lang,
  }));

  const toggleBtn = root.querySelector('#cgpt-vs-toggle');
  if (toggleBtn) toggleBtn.textContent = state.virtualizationEnabled
    ? (state.lang === 'zh' ? 'Pausar' : 'Pause')
    : (state.lang === 'zh' ? 'Activar' : 'Enable');

  const minimalBtn = root.querySelector('#cgpt-vs-minimal');
  if (minimalBtn) minimalBtn.textContent = state.minimalMode
    ? (state.lang === 'zh' ? 'Mostrar datos' : 'Show stats')
    : (state.lang === 'zh' ? 'Modo minimalista' : 'Minimal');

  const pinBtn = root.querySelector('#cgpt-vs-pin');
  if (pinBtn) pinBtn.textContent = state.pinned
    ? (state.lang === 'zh' ? '📌Anclado' : '📌Pinned')
    : (state.lang === 'zh' ? '📌Anclar' : '📌Pin');

  updatePinnedHiddenClass();
}

export function setLangFromStorage() {
  const stored = localStorage.getItem('vs_lang') as Language | null;
  if (stored === 'zh' || stored === 'en') {
    state.lang = stored;
  }
}
