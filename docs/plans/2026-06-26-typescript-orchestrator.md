# TypeScript Userscript Orchestrator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the monorepo so all source lives in TypeScript, multiple userscripts are built from one orchestrator, and every compiled artifact is emitted together into `dist/`.

**Architecture:** Keep a single manifest as the source of truth for userscript metadata, but move script logic into per-script TypeScript entrypoints under `scripts/*/src/main.ts`. Introduce a build orchestrator that reads the manifest and builds every registered script in sequence, emitting one `.user.js` and one `.meta.js` per script into `dist/` with shared naming rules. Shared helpers stay in `shared/` and are imported from TypeScript only, so the monorepo no longer depends on handwritten JS for source code.

**Tech Stack:** Bun, TypeScript, Vite, vite-plugin-monkey, bun:test

### Task 1: Define the build contract in tests

**Files:**
- Create: `tests/orchestrator.test.ts`
- Modify: `tests/scripts.manifest.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { getScriptNames } from '../scripts.manifest.mjs';

describe('orchestrator contract', () => {
  test('declares all scripts that the orchestrator must build', () => {
    expect(getScriptNames()).toEqual(
      expect.arrayContaining([
        'sri-comprobantes',
        'demo-current-site',
        'better-chatgpt-assistant',
      ]),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/orchestrator.test.ts`
Expected: PASS only after the manifest/orchestrator contract is fully wired; for now, use the current state as the RED baseline if any missing script or path is detected.

**Step 3: Write minimal implementation**

No production code yet. This task is only to pin the contract that the orchestrator must preserve.

**Step 4: Run test to verify it passes**

Run: `bun test tests/orchestrator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/orchestrator.test.ts tests/scripts.manifest.test.ts
git commit -m "test: define orchestrator build contract"
```

### Task 2: Move script sources to TypeScript

**Files:**
- Create: `scripts/sri-comprobantes/src/main.ts`
- Create: `scripts/demo-current-site/src/main.ts` (if needed to replace JS-only source paths)
- Create: `scripts/better-chatgpt-assistant/src/main.ts`
- Modify: `scripts.manifest.mjs`

**Step 1: Write the failing test**

Add an integration-style manifest test that asserts every script entry ends with `.ts` and every build output still ends with `.user.js`.

**Step 2: Run test to verify it fails**

Run: `bun test tests/scripts.manifest.test.ts`
Expected: FAIL until every entry is TypeScript.

**Step 3: Write minimal implementation**

Rename/migrate the current script entrypoints to `.ts`, keeping behavior unchanged. Update imports so shared code remains TypeScript-safe.

**Step 4: Run test to verify it passes**

Run: `bun test tests/scripts.manifest.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts.manifest.mjs scripts/**/src/main.ts tests/scripts.manifest.test.ts
git commit -m "feat: migrate userscript entrypoints to TypeScript"
```

### Task 3: Introduce the orchestrator

**Files:**
- Create: `tools/build-orchestrator.mjs` or `tools/build-orchestrator.ts`
- Modify: `tools/build-all.mjs`
- Modify: `package.json`

**Step 1: Write the failing test**

Add tests for the orchestrator helper that prove it iterates every registered script and invokes the Vite build with the current `SCRIPT` value.

**Step 2: Run test to verify it fails**

Run: `bun test tests/orchestrator.test.ts`
Expected: FAIL until the orchestrator helper exists.

**Step 3: Write minimal implementation**

Implement a single build entrypoint that reads `scripts.manifest.mjs`, loops through all scripts, and invokes the existing Vite build logic for each one.

**Step 4: Run test to verify it passes**

Run: `bun test tests/orchestrator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tools/build-orchestrator.mjs tools/build-all.mjs package.json
git commit -m "feat: add userscript build orchestrator"
```

### Task 4: Normalize output and documentation

**Files:**
- Modify: `vite.config.mjs`
- Modify: `README.md`
- Modify: `.github/workflows/build.yml` if needed

**Step 1: Write the failing test**

Add a manifest/build test that asserts `build:all` still produces one `.user.js` and one `.meta.js` per script into `dist/`.

**Step 2: Run test to verify it fails**

Run: `bun test tests/orchestrator.test.ts`
Expected: FAIL until output expectations are updated.

**Step 3: Write minimal implementation**

Keep `dist/` as the single publish directory, update docs to describe the orchestrator, and ensure GitHub Actions build the same artifacts.

**Step 4: Run test to verify it passes**

Run: `bun run build:all && bun test tests/orchestrator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add vite.config.mjs README.md .github/workflows/build.yml tests/orchestrator.test.ts
git commit -m "docs: document orchestrated dist build"
```
