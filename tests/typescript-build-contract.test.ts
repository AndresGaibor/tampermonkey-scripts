import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { getScript, getScriptNames } from '../scripts.manifest.mjs';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

describe('typescript build contract', () => {
  test('all script entrypoints are TypeScript', () => {
    for (const scriptName of getScriptNames()) {
      const script = getScript(scriptName);
      expect(script?.entry).toMatch(/\.ts$/);
    }
  });

  test('CLI scripts invoke TypeScript tooling', () => {
    const scripts = packageJson.scripts as Record<string, string>;

    expect(scripts['list']).toContain('tools/list.ts');
    expect(scripts['dev:sri']).toContain('tools/vite.ts');
    expect(scripts['build:sri']).toContain('tools/vite.ts');
    expect(scripts['dev:demo']).toContain('tools/vite.ts');
    expect(scripts['build:demo']).toContain('tools/vite.ts');
    expect(scripts['dev:better-chatgpt-assistant']).toContain('tools/vite.ts');
    expect(scripts['build:better-chatgpt-assistant']).toContain('tools/vite.ts');
    expect(scripts['build:all']).toContain('tools/build-all.ts');
  });
});
