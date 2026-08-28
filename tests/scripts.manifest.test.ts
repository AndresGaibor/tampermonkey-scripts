import { describe, expect, test } from 'bun:test';
import { getScript, getScriptNames } from '../scripts.manifest.ts';

describe('scripts.manifest', () => {
  test('registra ChatGPT Bulk Exporter independiente', () => {
    const script = getScript('chatgpt-bulk-exporter');
    expect(script?.entry).toBe('scripts/chatgpt-bulk-exporter/src/main.ts');
    expect(script?.userscript.name).toBe('ChatGPT - Bulk Markdown Exporter');
    expect(script?.userscript.grant).toEqual([]);
    expect(script?.userscript.match).toContain('https://chatgpt.com/*');
  });
  test('registra el script Better ChatGPT Assistant', () => {
    expect(getScriptNames()).toContain('better-chatgpt-assistant');

    const script = getScript('better-chatgpt-assistant');
    expect(script).not.toBeNull();
    expect(script?.fileName).toBe('better-chatgpt-assistant.user.js');
    expect(script?.entry).toBe('scripts/better-chatgpt-assistant/src/main.ts');
    expect(script?.userscript.name).toContain('Better ChatGPT Assistant');
    expect(script?.userscript.namespace).toBe('https://github.com/3150214587/chatgpt-virtual-scrollGPT-');
    expect(script?.userscript.match).toEqual([
      'https://chat.openai.com/*',
      'https://chatgpt.com/*',
    ]);
    expect(script?.userscript.grant).toEqual([]);
  });
});
