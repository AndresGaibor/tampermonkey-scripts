'use strict';

import { state } from './shared/state.ts';
import { CHECK_INTERVAL_MS, ROOT_ID, ROUTE_GUARD_MS } from './shared/constants.ts';
import { loadBool, loadMode, loadPos } from './infrastructure/storage.ts';
import { KEY_ENABLED, KEY_MINIMAL, KEY_EDGE_SNAP, KEY_PINNED, KEY_LAST_OPEN } from './shared/constants.ts';
import { getLanguage } from './domain/i18n.ts';
import { ensureRoot, bindUI } from './presentation/dashboard.ts';
import {
  scheduleVirtualize,
  installFindGuards,
  installImageLoadHook,
  installResizeFix,
  installTypingDim,
} from './application/virtualization.ts';
import {
  updateUI,
  applyPinnedState,
  startFollowPositionLoop,
  positionNearModelButton,
  renderFeaturePack,
  setLangFromStorage,
} from './application/ui.ts';

function startRouteGuards() {
  setInterval(() => {
    const root = document.getElementById(ROOT_ID);
    if (!root || !document.body.contains(root)) {
      try {
        ensureRoot();
        applyPinnedState();
        updateUI();
        scheduleVirtualize();
        startFollowPositionLoop();
      } catch {}
    } else {
      if (!state.pinned) positionNearModelButton();
      renderFeaturePack(false);
    }
  }, ROUTE_GUARD_MS);
}

export function initStateFromStorage() {
  setLangFromStorage();
  state.currentMode = loadMode(localStorage);
  state.virtualizationEnabled = loadBool(localStorage, KEY_ENABLED, true);
  state.minimalMode = loadBool(localStorage, KEY_MINIMAL, true);
  state.edgeSnap = loadBool(localStorage, KEY_EDGE_SNAP, true);
  state.pinned = loadBool(localStorage, KEY_PINNED, false);
  state.wasOpen = loadBool(localStorage, KEY_LAST_OPEN, false);
  state.pinnedPos = loadPos(localStorage, window.innerWidth, window.innerHeight);
}

function boot() {
  initStateFromStorage();

  const root = ensureRoot();
  applyPinnedState();
  startFollowPositionLoop();

  const help = document.getElementById('cgpt-vs-help')!;
  bindUI(root, help);

  installFindGuards();
  installTypingDim();
  installImageLoadHook();
  installResizeFix();
  startRouteGuards();

  window.addEventListener('scroll', () => scheduleVirtualize(), { passive: true });
  scheduleVirtualize();
  updateUI();

  setInterval(() => updateUI(), CHECK_INTERVAL_MS);
}

setTimeout(boot, 900);
