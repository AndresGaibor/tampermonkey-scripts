import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('el artefacto de Qwen es ejecutable y no concatena use strict con un IIFE', () => {
  const contenido = readFileSync(join(import.meta.dir, '..', 'dist', 'capi-qwen-observador.user.js'), 'utf8');
  expect(contenido).toContain('window.__CAPI_QWEN_BRIDGE__');
  expect(contenido).not.toContain('"use strict"(() =>');
  expect(() => new Function(contenido.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, ''))).not.toThrow();
});

import { test as testMeta, expect as expectMeta } from 'bun:test';
import { readFileSync } from 'node:fs';
testMeta('Qwen se publica en MAIN_WORLD y en canal DOM compartido',()=>{const s=readFileSync('dist/capi-qwen-observador.user.js','utf8');expectMeta(s).toContain('// @grant        none');expectMeta(s).toContain('// @sandbox      raw');expectMeta(s).toContain('dataset.capiQwenBridge');});

import { test as testInstancia, expect as expectInstancia } from 'bun:test';
testInstancia('expone version e instancia y reemplaza observadores antiguos',()=>{const s=readFileSync('dist/capi-qwen-observador.user.js','utf8');expectInstancia(s).toContain('versionObservador');expectInstancia(s).toContain('instanciaId');expectInstancia(s).toContain('__CAPI_QWEN_OBSERVER_CONTROL__');expectInstancia(s).toContain('.detener()');});
