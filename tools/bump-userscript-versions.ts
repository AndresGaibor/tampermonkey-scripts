import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { getScript, getScriptNames } from '../scripts.manifest.ts';

const execFileAsync = promisify(execFile);
const manifestPath = 'scripts.manifest.ts';

export function incrementVersion(version: string): string {
  const parts = version.split('.');

  if (parts.length === 0 || parts.some((part) => !/^\d+$/.test(part))) {
    throw new Error(`Versión inválida: ${version}`);
  }

  parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
  return parts.join('.');
}

export function detectScriptsToBump(
  changedFiles: string[],
  availableScripts: Record<string, { entry: string }>,
): string[] {
  const normalizedFiles = changedFiles.map((file) => file.replace(/\\/g, '/'));
  const scriptNames = Object.keys(availableScripts);

  if (
    normalizedFiles.some(
      (file) =>
        file === manifestPath ||
        file.startsWith('shared/') ||
        file.startsWith('tools/') ||
        file === 'vite.config.ts' ||
        file === 'package.json' ||
        file.startsWith('tsconfig'),
    )
  ) {
    return scriptNames;
  }

  return scriptNames.filter((scriptName) => {
    const entry = availableScripts[scriptName]?.entry?.replace(/\\/g, '/');

    if (!entry) {
      return false;
    }

    const entryDir = entry.replace(/\/[^/]+$/, '/');
    return normalizedFiles.some((file) => file.startsWith(entryDir));
  });
}

export function bumpManifestVersions(
  manifestContent: string,
  scriptNames: string[],
  nextVersions: Record<string, string>,
): string {
  let updated = manifestContent;

  for (const scriptName of scriptNames) {
    const nextVersion = nextVersions[scriptName];

    if (!nextVersion) {
      throw new Error(`No se encontró versión para ${scriptName}`);
    }

    const escapedName = scriptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `(\'${escapedName}\'\\s*:\\s*\\{[\\s\\S]*?version:\\s*\')(\\d+(?:\\.\\d+)*)(\')`,
    );
    const nextContent = updated.replace(pattern, `$1${nextVersion}$3`);

    if (nextContent === updated) {
      throw new Error(`No se pudo actualizar la versión de ${scriptName}`);
    }

    updated = nextContent;
  }

  return updated;
}

async function main() {
  const changedFiles = await getStagedFiles();
  const scriptsToBump = detectScriptsToBump(changedFiles, getScriptsWithEntries());

  if (scriptsToBump.length === 0) {
    console.log('=== version bump: no userscript changes detected ===');
    return;
  }

  const manifestContent = await readFile(manifestPath, 'utf8');
  const currentVersions = getCurrentVersions(scriptsToBump);
  const nextContent = bumpManifestVersions(manifestContent, scriptsToBump, currentVersions);

  await writeFile(manifestPath, nextContent);

  const bumpedVersions = scriptsToBump.map((scriptName) => `${scriptName}=${currentVersions[scriptName]}`);

  console.log(`=== version bump: ${bumpedVersions.join(', ')} ===`);
}

async function getStagedFiles(): Promise<string[]> {
  const { stdout } = await execFileAsync('git', [
    'diff',
    '--cached',
    '--name-only',
    '--diff-filter=ACMR',
  ]);

  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function getScriptsWithEntries(): Record<string, { entry: string }> {
  return Object.fromEntries(
    getScriptNames().map((scriptName) => {
      const script = getScript(scriptName);
      return [scriptName, { entry: script?.entry ?? '' }];
    }),
  );
}

function getCurrentVersions(scriptNames: string[]): Record<string, string> {
  return Object.fromEntries(
    scriptNames.map((scriptName) => {
      const script = getScript(scriptName);

      if (!script?.userscript.version) {
        throw new Error(`No se encontró versión para ${scriptName}`);
      }

      return [scriptName, incrementVersion(script.userscript.version)];
    }),
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`version bump failed: ${message}`);
    process.exit(1);
  });
}
