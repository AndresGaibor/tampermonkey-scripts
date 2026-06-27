import { describe, expect, test } from 'bun:test';
import {
  domLevel,
  estimateRemainingTurns,
  memoryLevel,
  modeLabel,
  suggestionText,
} from '../scripts/better-chatgpt-assistant/src/lib/health.ts';
import {
  loadBool,
  loadMode,
  loadPos,
  saveBool,
  saveMode,
  savePos,
} from '../scripts/better-chatgpt-assistant/src/lib/storage.ts';

describe('Better ChatGPT state helpers', () => {
  test('storage helpers round-trip values', () => {
    const storage = new Map<string, string>();
    const api = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    expect(loadBool(api, 'enabled', true)).toBe(true);
    saveBool(api, 'enabled', false);
    expect(loadBool(api, 'enabled', true)).toBe(false);

    expect(loadMode(api)).toBe('balanced');
    saveMode(api, 'performance');
    expect(loadMode(api)).toBe('performance');

    const pos = loadPos(api, 1000, 800);
    expect(pos).toEqual({ x: 18, y: 64, side: 'left', hidden: false });

    savePos(api, { x: 9999, y: -100, side: 'right', hidden: true });
    expect(loadPos(api, 400, 300)).toEqual({ x: 360, y: 0, side: 'right', hidden: true });
  });

  test('health helpers classify memory and DOM load', () => {
    expect(memoryLevel(null, 'zh')).toEqual({ label: 'No disponible', level: 'na' });
    expect(domLevel(5000)).toEqual({ label: '5000', level: 'ok' });
    expect(estimateRemainingTurns(100, 20)).toBeGreaterThan(0);
    expect(modeLabel('performance', 'en')).toBe('performance');
    expect(suggestionText({ virtualizationEnabled: false, ctrlFFreeze: false, domNodes: 1000, usedMB: 100, virtCount: 0, turns: 20, lang: 'en' })).toContain('Virtualization is paused');
  });
});
