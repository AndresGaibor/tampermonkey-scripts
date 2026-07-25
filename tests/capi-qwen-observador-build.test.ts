import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('el artefacto de Qwen es ejecutable y no concatena use strict con un IIFE', () => {
  const contenido = readFileSync(join(import.meta.dir, '..', 'dist', 'capi-qwen-observador.user.js'), 'utf8');
  expect(contenido).toContain('window.__CAPI_QWEN_BRIDGE__');
  expect(contenido).not.toContain('"use strict"(() =>');
  expect(() => new Function(contenido.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, ''))).not.toThrow();
});
