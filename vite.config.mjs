import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import { getScript, getScriptNames } from './scripts.manifest.mjs';

const scriptName = process.env.SCRIPT || 'sri-comprobantes';
const script = getScript(scriptName);

if (!script) {
  throw new Error(
    `Script no encontrado: ${scriptName}. Disponibles: ${getScriptNames().join(', ')}`,
  );
}

const rawBase =
  process.env.USERSCRIPTS_RAW_BASE ||
  'https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist';

const supportBase =
  process.env.USERSCRIPTS_SUPPORT_BASE ||
  'https://github.com/AndresGaibor/tampermonkey-scripts/issues';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT || 5173),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    minify: false,
  },
  plugins: [
    // vite-plugin-monkey debe quedar al final de la lista de plugins.
    monkey({
      entry: script.entry,
      userscript: {
        ...script.userscript,
        updateURL: `${rawBase}/${script.fileName}`,
        downloadURL: `${rawBase}/${script.fileName}`,
        supportURL: supportBase,
      },
      server: {
        open: true,
        prefix: `dev:${scriptName}:`,
        // Útil para scripts legacy que usan GM_* como globales.
        mountGmApi: true,
      },
      build: {
        fileName: script.fileName,
        metaFileName: true,
      },
    }),
  ],
});
