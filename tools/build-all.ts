import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { getScriptNames } from '../scripts.manifest.ts';

await rm('dist', { recursive: true, force: true });

for (const scriptName of getScriptNames()) {
  console.log(`
▶ Building ${scriptName}...`);
  await run(scriptName);
}

console.log(`
✅ Todos los userscripts se generaron en dist/`);

function run(scriptName) {
  return new Promise((resolve, reject) => {
    const bunx = process.platform === 'win32' ? 'bunx.cmd' : 'bunx';
    const child = spawn(bunx, ['vite', 'build'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        SCRIPT: scriptName,
      },
    });

    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Falló build de ${scriptName} con código ${code}`));
    });
  });
}
