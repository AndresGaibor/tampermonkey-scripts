import { state } from '../shared/state.ts';
import { t } from '../domain/i18n.ts';
import { ROOT_ID, BTN_ID, PANEL_ID, HELP_ID, FP_ID } from '../shared/constants.ts';
import { clamp } from '@shared/math.ts';
import { saveBool, saveMode, savePos } from '../infrastructure/storage.ts';
import { toggleLanguage, setLanguage } from '../domain/i18n.ts';
import {
  scheduleVirtualize,
  unvirtualizeAll,
  installFindGuards,
  installImageLoadHook,
  installResizeFix,
  installTypingDim,
} from '../application/virtualization.ts';
import {
  updateUI,
  applyPinnedState,
  startFollowPositionLoop,
  stopFollowPositionLoop,
  updatePinnedHiddenClass,
  snapToEdgeIfNeeded,
  refreshSegUI,
  renderFeaturePack,
  flashDot,
} from '../application/ui.ts';
import { tryClickNewChat } from '../infrastructure/dom.ts';
import {
  KEY_ENABLED,
  KEY_LAST_OPEN,
  KEY_MINIMAL,
  KEY_PINNED,
  FORCE_CLEAN_MARGIN_SCREENS,
} from '../shared/constants.ts';

export function installDrag(root: HTMLElement) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  const btn = root.querySelector(`#${BTN_ID}`);
  if (!btn) return;

  btn.addEventListener('pointerdown', (ev: PointerEvent) => {
    if (!state.pinned) return;
    if (ev.button !== 0) return;

    dragging = true;
    root.classList.add('dragging');
    (btn as HTMLElement).setPointerCapture(ev.pointerId);

    startX = ev.clientX;
    startY = ev.clientY;

    const rect = root.getBoundingClientRect();
    originX = rect.left;
    originY = rect.top;

    state.pinnedPos.hidden = false;
    updatePinnedHiddenClass();

    ev.preventDefault();
    ev.stopPropagation();
  });

  btn.addEventListener('pointermove', (ev: PointerEvent) => {
    if (!dragging) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;

    const nx = clamp(originX + dx, 0, window.innerWidth - 40);
    const ny = clamp(originY + dy, 0, window.innerHeight - 40);

    state.pinnedPos.x = nx;
    state.pinnedPos.y = ny;
    savePos(localStorage, state.pinnedPos);

    root.style.left = `${nx}px`;
    root.style.top = `${ny}px`;
  });

  btn.addEventListener('pointerup', (ev: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('dragging');
    snapToEdgeIfNeeded();
    updatePinnedHiddenClass();
    ev.preventDefault();
    ev.stopPropagation();
  });

  btn.addEventListener('pointercancel', () => {
    dragging = false;
    root.classList.remove('dragging');
    updatePinnedHiddenClass();
  });
}

export function bindUI(root: HTMLElement, help: HTMLElement) {
  const btn = root.querySelector(`#${BTN_ID}`);
  const panel = root.querySelector(`#${PANEL_ID}`);
  const toggleBtn = root.querySelector('#cgpt-vs-toggle');
  const minimalBtn = root.querySelector('#cgpt-vs-minimal');
  const pinBtn = root.querySelector('#cgpt-vs-pin');
  const helpBtn = root.querySelector('#cgpt-vs-helpBtn');
  const helpClose = help.querySelector('#cgpt-vs-helpClose');
  const forceCleanBtn = root.querySelector('#cgpt-vs-forceClean');
  const newChatBtn = root.querySelector('#cgpt-vs-newChat');

  function setOpen(open: boolean) {
    root.classList.toggle('open', open);
    saveBool(localStorage, KEY_LAST_OPEN, open);
    startFollowPositionLoop();
  }

  btn?.addEventListener('click', () => {
    if (root.classList.contains('dragging')) return;
    setOpen(!root.classList.contains('open'));
  });

  btn?.addEventListener('mouseenter', () => {
    if (!state.pinned && state.minimalMode) setOpen(true);
  });
  root.addEventListener('mouseleave', () => {
    if (!state.pinned && state.minimalMode) setOpen(false);
  });

  btn?.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      setOpen(!root.classList.contains('open'));
    }
  });

  document.addEventListener('click', (e) => {
    if (!root.classList.contains('open')) return;
    if (root.contains(e.target as Node)) return;
    setOpen(false);
  }, true);

  panel?.querySelectorAll('.cgpt-vs-seg button').forEach((b) => {
    b.addEventListener('click', () => {
      const mode = b.getAttribute('data-mode');
      if (mode !== 'performance' && mode !== 'balanced' && mode !== 'conservative') return;
      state.currentMode = mode;
      saveMode(localStorage, mode);
      refreshSegUI(root);
      scheduleVirtualize();
      updateUI();
    });
  });

  toggleBtn?.addEventListener('click', () => {
    state.virtualizationEnabled = !state.virtualizationEnabled;
    saveBool(localStorage, KEY_ENABLED, state.virtualizationEnabled);
    if (!state.virtualizationEnabled) unvirtualizeAll();
    else scheduleVirtualize();
    updateUI();
  });

  minimalBtn?.addEventListener('click', () => {
    state.minimalMode = !state.minimalMode;
    saveBool(localStorage, KEY_MINIMAL, state.minimalMode);
    root.classList.toggle('minimal', state.minimalMode);
    updateUI();
  });

  helpBtn?.addEventListener('click', () => help.classList.add('show'));
  helpClose?.addEventListener('click', () => help.classList.remove('show'));
  help.addEventListener('click', (e) => {
    if (e.target === help) help.classList.remove('show');
  });

  pinBtn?.addEventListener('click', () => {
    state.pinned = !state.pinned;
    saveBool(localStorage, KEY_PINNED, state.pinned);
    applyPinnedState();
    updateUI();
  });

  forceCleanBtn?.addEventListener('click', () => {
    if (!state.virtualizationEnabled) {
      state.virtualizationEnabled = true;
      saveBool(localStorage, KEY_ENABLED, true);
    }
    scheduleVirtualize(FORCE_CLEAN_MARGIN_SCREENS);
    flashDot();
  });

  newChatBtn?.addEventListener('click', () => {
    const ok = tryClickNewChat();
    if (!ok) window.open(location.origin + '/', '_blank', 'noopener,noreferrer');
  });

  installDrag(root);
  refreshSegUI(root);
  renderFeaturePack(true);
}
