import { describe, expect, test } from 'bun:test';
import {
  bumpManifestVersions,
  detectScriptsToBump,
  incrementVersion,
} from '../tools/bump-userscript-versions.ts';

describe('version bump helper', () => {
  test('incrementVersion sube el último segmento numérico', () => {
    expect(incrementVersion('8.2.3.6')).toBe('8.2.3.7');
    expect(incrementVersion('2026.6.12.10')).toBe('2026.6.12.11');
  });

  test('detectScriptsToBump identifica el script afectado y shared como global', () => {
    const scripts = {
      'sri-comprobantes': { entry: 'scripts/sri-comprobantes/src/main.ts' },
      'better-chatgpt-assistant': {
        entry: 'scripts/better-chatgpt-assistant/src/main.ts',
      },
      'demo-current-site': { entry: 'scripts/demo-current-site/src/main.ts' },
    };

    expect(
      detectScriptsToBump(['scripts/better-chatgpt-assistant/src/presentation/dashboard.ts'], scripts),
    ).toEqual(['better-chatgpt-assistant']);

    expect(detectScriptsToBump(['shared/text.ts'], scripts)).toEqual([
      'sri-comprobantes',
      'better-chatgpt-assistant',
      'demo-current-site',
    ]);

    expect(detectScriptsToBump(['tests/version-bump.test.ts'], scripts)).toEqual([]);
  });

  test('bumpManifestVersions actualiza la versión de cada script seleccionado', () => {
    const manifest = `export const scripts = {\n  'sri-comprobantes': {\n    userscript: {\n      version: '2026.6.12.10',\n    },\n  },\n  'better-chatgpt-assistant': {\n    userscript: {\n      version: '8.2.3.6',\n    },\n  },\n};\n`;

    const updated = bumpManifestVersions(
      manifest,
      ['sri-comprobantes', 'better-chatgpt-assistant'],
      {
        'sri-comprobantes': '2026.6.12.11',
        'better-chatgpt-assistant': '8.2.3.7',
      },
    );

    expect(updated).toContain("version: '2026.6.12.11'");
    expect(updated).toContain("version: '8.2.3.7'");
  });
});
