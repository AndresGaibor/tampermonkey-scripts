import { spawn } from 'node:child_process';
import { getScript, getScriptNames } from '../scripts.manifest.mjs';

const [mode, scriptName] = process.argv.slice(2);

if (!['dev', 'build'].includes(mode) || !scriptName) {
  console.error('Uso: bun tools/vite.mjs <dev|build> <script-name>');
  console.error(`Scripts disponibles: ${getScriptNames().join(', ')}`);
  process.exit(1);
}

if (!getScript(scriptName)) {
  console.error(`Script no encontrado: ${scriptName}`);
  console.error(`Scripts disponibles: ${getScriptNames().join(', ')}`);
  process.exit(1);
}

const bunx = process.platform === 'win32' ? 'bunx.cmd' : 'bunx';
const args = mode === 'dev' ? ['vite'] : ['vite', 'build'];

const child = spawn(bunx, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    SCRIPT: scriptName,
  },
});

child.on('exit', (code) => process.exit(code ?? 0));
