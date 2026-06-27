import { describe, expect, test } from 'bun:test';
import { clamp } from '../shared/math.ts';
import { escapeHtml, normalizeText } from '../shared/text.ts';
import { debounce } from '../shared/timing.ts';

describe('shared modules', () => {
  test('clamp bounds a number inside the provided range', () => {
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
  });

  test('normalizeText removes accents and extra spaces', () => {
    expect(normalizeText('  Árbol   grande  ')).toBe('arbol grande');
  });

  test('escapeHtml encodes HTML-sensitive characters', () => {
    expect(escapeHtml(`5 < 7 & "x"`)).toBe('5 &lt; 7 &amp; &quot;x&quot;');
  });

  test('debounce delays execution until calls settle', async () => {
    let count = 0;
    const fn = debounce(() => {
      count += 1;
    }, 20);

    fn();
    fn();
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(count).toBe(1);
  });
});
