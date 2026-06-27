import { state } from '../shared/state.ts';
import { getMessageNodes } from '../infrastructure/dom.ts';
import {
  IMAGE_LOAD_RETRY_MS,
  INPUT_DIM_IDLE_MS,
  MODE_TO_MARGIN_SCREENS,
  ROOT_ID,
} from '../shared/constants.ts';
import { updateUI } from './ui.ts';

let rafPending = false;
let typingDimTimer: ReturnType<typeof setTimeout> | null = null;
let lastInputAt = 0;

function getMarginScreens() {
  return MODE_TO_MARGIN_SCREENS[state.currentMode] ?? MODE_TO_MARGIN_SCREENS.balanced;
}

export function unvirtualizeAll() {
  const msgs = getMessageNodes();
  for (const msg of msgs) {
    if (msg.dataset.vsSlimmed) {
      msg.innerHTML = msg.dataset.vsBackup || msg.innerHTML;
      delete msg.dataset.vsSlimmed;
      delete msg.dataset.vsBackup;
      delete msg.dataset.vsH;
    }
  }
}

export function virtualizeOnce(marginScreensOverride?: number) {
  if (!state.virtualizationEnabled || state.ctrlFFreeze) {
    state.lastVirtualizedCount = 0;
    state.lastTurnsCount = getMessageNodes().length || 0;
    return;
  }

  const marginScreens = (typeof marginScreensOverride === 'number') ? marginScreensOverride : getMarginScreens();
  const msgs = getMessageNodes();
  state.lastTurnsCount = msgs.length;

  const viewportTop = window.scrollY;
  const viewportBottom = viewportTop + window.innerHeight;
  const keepTop = viewportTop - window.innerHeight * marginScreens;
  const keepBottom = viewportBottom + window.innerHeight * marginScreens;

  let slimmedCount = 0;

  for (const msg of msgs) {
    const rect = msg.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const bottom = top + rect.height;
    const shouldKeep = bottom > keepTop && top < keepBottom;

    if (!shouldKeep) {
      if (!msg.dataset.vsSlimmed) {
        msg.dataset.vsSlimmed = '1';
        msg.dataset.vsBackup = msg.innerHTML;
        const h = Math.max(24, Math.round(rect.height));
        msg.dataset.vsH = String(h);
        msg.innerHTML = `<div class="cgpt-vs-ph" style="height:${h}px"></div>`;
      } else {
        const oldH = Number(msg.dataset.vsH || 0);
        const newH = Math.max(24, Math.round(rect.height));
        if (oldH && Math.abs(newH - oldH) > 180) {
          msg.dataset.vsH = String(newH);
          const ph: HTMLElement | null = msg.querySelector('.cgpt-vs-ph');
          if (ph) ph.style.height = `${newH}px`;
        }
      }
      slimmedCount += 1;
    } else if (msg.dataset.vsSlimmed) {
      msg.innerHTML = msg.dataset.vsBackup || msg.innerHTML;
      delete msg.dataset.vsSlimmed;
      delete msg.dataset.vsBackup;
      delete msg.dataset.vsH;
    }
  }

  state.lastVirtualizedCount = slimmedCount;
}

export function scheduleVirtualize(marginOverride?: number) {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    virtualizeOnce(marginOverride);
    updateUI();
  });
}

export function installFindGuards() {
  window.addEventListener('keydown', (e) => {
    const isFind = ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F'));
    if (isFind) {
      if (!state.ctrlFFreeze) {
        state.ctrlFFreeze = true;
        unvirtualizeAll();
        updateUI();
      }
    }
    if (e.key === 'Escape') setTimeout(() => {
      if (state.ctrlFFreeze) {
        state.ctrlFFreeze = false;
        scheduleVirtualize();
      }
    }, 120);
  }, true);
}

export function installImageLoadHook() {
  window.addEventListener('load', (e) => {
    const t = (e && e.target) as HTMLImageElement | null;
    if (t && t.tagName && t.tagName.toLowerCase() === 'img') {
      setTimeout(() => scheduleVirtualize(), IMAGE_LOAD_RETRY_MS);
    }
  }, true);
}

export function installResizeFix() {
  window.addEventListener('resize', () => {
    unvirtualizeAll();
    requestAnimationFrame(() => scheduleVirtualize());
  }, { passive: true });
}

export function installTypingDim() {
  const dim = () => {
    lastInputAt = Date.now();
    const root = document.getElementById(ROOT_ID);
    if (root) root.classList.add('dim');
    if (typingDimTimer) clearTimeout(typingDimTimer);
    typingDimTimer = setTimeout(() => {
      const idle = Date.now() - lastInputAt;
      if (idle >= INPUT_DIM_IDLE_MS) {
        const el = document.getElementById(ROOT_ID);
        if (el) el.classList.remove('dim');
      }
    }, INPUT_DIM_IDLE_MS + 20);
  };

  document.addEventListener('input', (e) => {
    if (!e || !e.target) return;
    const el = e.target as HTMLElement | null;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input') dim();
  }, true);

  document.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement | null;
    if (!el) return;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input') dim();
  }, true);

  document.addEventListener('focusout', () => {
    setTimeout(() => {
      const root = document.getElementById(ROOT_ID);
      if (root) root.classList.remove('dim');
    }, 220);
  }, true);
}
