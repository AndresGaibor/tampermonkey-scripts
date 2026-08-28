# Progressive Chat Date Indexing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve exact ChatGPT creation and update dates, even when the history endpoint is unavailable, by progressively indexing conversation details and caching only their metadata locally.

**Architecture:** Add a focused metadata-cache adapter backed by Tampermonkey values, and a progressive indexer that enriches sidebar links from cache and then from bounded detail requests. The sidebar keeps a partial, date-filterable list while the indexer runs; closing the popover aborts the outstanding work. `fetchConversationHistory` remains the preferred source whenever it returns usable timestamps.

**Tech Stack:** TypeScript, Bun test runner, JSDOM, Vite, vite-plugin-monkey, Tampermonkey `GM_getValue`/`GM_setValue`, same-origin `fetch`.

## Global Constraints

- Store only conversation ID, title, normalized creation/update timestamps, and cache validation time; never persist messages, mappings, cookies, tokens, or exported Markdown.
- Add `GM_getValue` and `GM_setValue` to the `chatgpt-bulk-exporter` manifest grants.
- Use `/backend-api/conversation/:id` with `credentials: 'include'`; do not contact third parties.
- Keep the normal paginated history endpoint as the primary source when it yields usable dates.
- On fallback, use a bounded worker pool, update visible results incrementally, and abort it when the popover closes.
- A failed detail request affects only its ID. Chats without the selected date remain visible with no active date range and are excluded when a range is active.
- Cache entries expire after 24 hours, and the store is bounded to 500 entries, evicting oldest validation times first.

---

## File Structure

- Create `scripts/chatgpt-bulk-exporter/src/infrastructure/conversation-date-cache.ts`: validate, load, merge, expire, cap, and persist metadata-only cache entries.
- Create `scripts/chatgpt-bulk-exporter/src/application/progressive-date-indexer.ts`: hydrate sidebar conversations from cache and enrich stale/missing entries through a concurrency-limited fetch worker pool.
- Modify `scripts/chatgpt-bulk-exporter/src/infrastructure/chatgpt-api.ts`: expose a detail-to-sidebar metadata adapter while retaining `fetchConversation` for export.
- Modify `scripts/chatgpt-bulk-exporter/src/presentation/sidebar.ts`: start the fallback indexer, render partial progress, and cancel it on exit.
- Modify `scripts.manifest.ts`: declare the two Tampermonkey storage grants.
- Modify `tests/chatgpt-bulk-exporter.test.ts`: unit-test cache, metadata extraction, indexing progression, bounded concurrency, failure isolation, and cancellation.
- Modify `tests/scripts.manifest.test.ts`: assert the exporter’s storage grants.

### Task 1: Metadata cache adapter

**Files:**
- Create: `scripts/chatgpt-bulk-exporter/src/infrastructure/conversation-date-cache.ts`
- Modify: `tests/chatgpt-bulk-exporter.test.ts`

**Interfaces:**
- Produces `CachedConversationDate { id: string; title: string; createdAt: number | null; updatedAt: number | null; validatedAt: number }`.
- Produces `ConversationDateCache` with `load(now?: number): CachedConversationDate[]` and `save(entries: CachedConversationDate[], now?: number): void`.
- Produces `CACHE_TTL_MS = 86_400_000` and `CACHE_MAX_ENTRIES = 500`.

- [ ] **Step 1: Write failing cache tests**

```ts
test('carga solo entradas válidas y vigentes y limita la caché a 500', () => {
  const values = new Map<string, unknown>();
  values.set('cbe:conversation-date-cache:v1', [
    { id: 'fresh', title: 'Fresh', createdAt: 1, updatedAt: 2, validatedAt: 1_000 },
    { id: 'expired', title: 'Old', createdAt: 1, updatedAt: 2, validatedAt: 0 },
    { id: '', title: 'Bad', createdAt: 1, updatedAt: 2, validatedAt: 1_000 },
  ]);
  const cache = new ConversationDateCache({ get: key => values.get(key), set: (key, value) => values.set(key, value) });
  expect(cache.load(1_000 + CACHE_TTL_MS - 1).map(entry => entry.id)).toEqual(['fresh']);
  cache.save(Array.from({ length: 501 }, (_, index) => ({ id: `c${index}`, title: '', createdAt: null, updatedAt: null, validatedAt: index })), 2_000);
  expect((values.get('cbe:conversation-date-cache:v1') as CachedConversationDate[])).toHaveLength(CACHE_MAX_ENTRIES);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/chatgpt-bulk-exporter.test.ts --test-name-pattern="carga solo entradas"`
Expected: FAIL because `ConversationDateCache` and cache constants are not defined.

- [ ] **Step 3: Implement metadata-only persistence and validation**

```ts
export const CACHE_KEY = 'cbe:conversation-date-cache:v1';
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 500;

export class ConversationDateCache {
  constructor(private readonly storage: { get(key: string): unknown; set(key: string, value: unknown): void }) {}
  load(now = Date.now()): CachedConversationDate[] { /* validate shape, remove expired, sort newest first */ }
  save(entries: CachedConversationDate[], now = Date.now()): void { /* validate, deduplicate by id, cap, write */ }
}

export const tampermonkeyDateCache = new ConversationDateCache({
  get: key => GM_getValue(key, []),
  set: (key, value) => GM_setValue(key, value),
});
```

Validation must reject non-array storage values, blank IDs, non-string titles, non-finite date values, and invalid validation times. `null` remains the only representation of an unknown date.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `bun test tests/chatgpt-bulk-exporter.test.ts --test-name-pattern="carga solo entradas|filtro de chats por fecha y hora"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/chatgpt-bulk-exporter/src/infrastructure/conversation-date-cache.ts tests/chatgpt-bulk-exporter.test.ts
git commit -m "feat: cache ChatGPT conversation date metadata"
```

### Task 2: Detail metadata adapter and progressive indexer

**Files:**
- Create: `scripts/chatgpt-bulk-exporter/src/application/progressive-date-indexer.ts`
- Modify: `scripts/chatgpt-bulk-exporter/src/infrastructure/chatgpt-api.ts`
- Modify: `tests/chatgpt-bulk-exporter.test.ts`

**Interfaces:**
- Consumes `fetchConversation(id, signal): Promise<Conversation>` and `ConversationDateCache`.
- Produces `conversationToSidebarMetadata(conversation, href?): SidebarConversation`.
- Produces `indexConversationDates(options): Promise<void>` where options include `conversations`, `cache`, `fetchConversation`, `signal`, `concurrency`, `now`, `onUpdate`, and `onProgress`.
- `onUpdate(conversation: SidebarConversation)` receives each cache hydrate or successful remote enrichment. `onProgress({ loaded, total })` counts processed IDs, including individual failures.

- [ ] **Step 1: Write failing tests for metadata conversion and partial index updates**

```ts
test('hidrata fechas cacheadas y recupera faltantes progresivamente', async () => {
  const updates: string[] = []; const progress: string[] = [];
  const cache = new ConversationDateCache({ get: () => [{ id: 'cached', title: 'Cached', createdAt: 10, updatedAt: 20, validatedAt: 1_000 }], set: () => {} });
  await indexConversationDates({
    conversations: [base('cached'), base('remote')], cache, now: 2_000, concurrency: 2,
    fetchConversation: async id => normalizeConversation({ ...raw(), conversation_id: id, create_time: 30, update_time: 40 }),
    onUpdate: chat => updates.push(`${chat.id}:${chat.createdAt?.getTime()}`),
    onProgress: value => progress.push(`${value.loaded}/${value.total}`),
  });
  expect(updates).toEqual(['cached:10', 'remote:30000']);
  expect(progress).toEqual(['1/1']);
});
```

Add separate tests proving: no more than `concurrency` fetches run at once; a rejection still advances progress and indexes remaining IDs; a pre-aborted signal starts no requests; and aborting during a request starts no subsequent IDs.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/chatgpt-bulk-exporter.test.ts --test-name-pattern="hidrata fechas|concurrencia|abort"`
Expected: FAIL because `indexConversationDates` and `conversationToSidebarMetadata` are absent.

- [ ] **Step 3: Add the detail conversion adapter**

```ts
export function conversationToSidebarMetadata(conversation: Conversation, href = `/c/${encodeURIComponent(conversation.id)}`): SidebarConversation {
  return { id: conversation.id, title: conversation.title, href, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt };
}
```

Keep `fetchConversation` unchanged for export. The indexer must call it once per stale/missing ID and translate the returned `Conversation` through this adapter.

- [ ] **Step 4: Implement cache-first bounded indexing**

```ts
await indexConversationDates({
  conversations, cache, fetchConversation, signal, concurrency = 3, now = Date.now(), onUpdate, onProgress,
});
```

First update each matching conversation with a fresh cache entry and queue only entries missing from cache or older than `CACHE_TTL_MS`. Run at most three async workers; each takes one queued conversation, skips if `signal.aborted`, fetches detail with that signal, calls `onUpdate`, merges a metadata-only entry for successful results, calls `onProgress` after every attempted ID, and writes the merged cache once after workers settle. Re-throw `AbortError`; swallow other per-ID errors after progress reporting.

- [ ] **Step 5: Run focused tests to verify they pass**

Run: `bun test tests/chatgpt-bulk-exporter.test.ts --test-name-pattern="hidrata fechas|concurrencia|abort|historial paginado"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/chatgpt-bulk-exporter/src/application/progressive-date-indexer.ts scripts/chatgpt-bulk-exporter/src/infrastructure/chatgpt-api.ts tests/chatgpt-bulk-exporter.test.ts
git commit -m "feat: progressively index ChatGPT conversation dates"
```

### Task 3: Sidebar fallback integration and date filtering during progress

**Files:**
- Modify: `scripts/chatgpt-bulk-exporter/src/presentation/sidebar.ts`
- Modify: `tests/chatgpt-bulk-exporter.test.ts`

**Interfaces:**
- Consumes `indexConversationDates`, `tampermonkeyDateCache`, and `conversationToSidebarMetadata` through the indexer.
- Produces fallback state `historyState = 'indexing'` and `progress = { loaded: number; total: number | null }`.

- [ ] **Step 1: Write a DOM-level failure test for partial date display**

```ts
test('muestra fechas y permite filtrar resultados parciales mientras indexa', async () => {
  // Mount a sidebar with two /c/ links, replace the indexer dependency with callbacks,
  // emit one dated update, enter a matching date range, and assert that only that row renders.
  expect(status.textContent).toBe('Indexando fechas 1/2');
  expect(list.textContent).toContain('Creado:');
  expect(list.textContent).not.toContain('Second chat');
});
```

Refactor `mountSidebar` only enough to accept optional dependencies (`fetchHistory`, `indexDates`, `cache`) for deterministic JSDOM tests; the production defaults remain existing adapters.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `bun test tests/chatgpt-bulk-exporter.test.ts --test-name-pattern="muestra fechas y permite filtrar"`
Expected: FAIL because no indexing state or injectable dependency exists.

- [ ] **Step 3: Integrate fallback without disabling filtering**

```ts
if (conversations.length === 0 || conversations.every(chat => !chat.createdAt && !chat.updatedAt)) {
  conversations = visibleLinks();
  historyState = 'indexing';
  status.textContent = `Indexando fechas 0/${conversations.length}`;
  void indexDates({ conversations, signal: activeController.signal, onUpdate: replaceConversation, onProgress: setIndexProgress });
}
```

`refresh()` must treat `indexing` differently from `loading`: it renders and filters the known partial `conversations`, enables date controls, and reports `Indexando fechas X/Y`. `replaceConversation` must merge title/dates by ID and immediately call `refresh()`. Closing the popover continues to abort `indexController`; callbacks must ignore events unless their controller is still active. Preserve the existing visible-chat fallback when no links exist, with its clear status message.

- [ ] **Step 4: Run the sidebar and filter tests to verify they pass**

Run: `bun test tests/chatgpt-bulk-exporter.test.ts --test-name-pattern="muestra fechas|filtro de chats|selection and sidebar"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/chatgpt-bulk-exporter/src/presentation/sidebar.ts tests/chatgpt-bulk-exporter.test.ts
git commit -m "feat: show progressive date indexing in exporter"
```

### Task 4: Tampermonkey permissions, build, and regression verification

**Files:**
- Modify: `scripts.manifest.ts:102-115`
- Modify: `tests/scripts.manifest.test.ts`

**Interfaces:**
- The `chatgpt-bulk-exporter` manifest exposes `grant: ['GM_getValue', 'GM_setValue']`.

- [ ] **Step 1: Write failing manifest assertion**

```ts
test('declara almacenamiento Tampermonkey para el índice de fechas del exporter', () => {
  const exporter = getScript('chatgpt-bulk-exporter');
  expect(exporter.userscript.grant).toEqual(['GM_getValue', 'GM_setValue']);
});
```

- [ ] **Step 2: Run manifest test to verify it fails**

Run: `bun test tests/scripts.manifest.test.ts --test-name-pattern="almacenamiento Tampermonkey"`
Expected: FAIL because the grant list is empty.

- [ ] **Step 3: Declare the minimal permissions**

```ts
grant: ['GM_getValue', 'GM_setValue'],
```

Do not add `GM_xmlhttpRequest`, `connect`, or any remote permission: all HTTP remains same-origin browser `fetch`.

- [ ] **Step 4: Run focused tests, typecheck, and production build**

Run: `bun test tests/chatgpt-bulk-exporter.test.ts && bun test tests/scripts.manifest.test.ts && bun run typecheck && bun run build:chatgpt-bulk-exporter`
Expected: every command exits `0`; the generated userscript declares both storage grants and has no TypeScript errors.

- [ ] **Step 5: Perform authenticated manual smoke test**

Open ChatGPT with a valid session, open **Exportar chats**, and confirm: cached dates appear immediately on a second opening; status progresses as `Indexando fechas X/Y`; creation/update date ranges filter dated rows; closing cancels outstanding requests; and no values besides metadata appear under the `cbe:conversation-date-cache:v1` Tampermonkey key.

- [ ] **Step 6: Commit**

```bash
git add scripts.manifest.ts tests/scripts.manifest.test.ts
git commit -m "feat: grant metadata cache storage to bulk exporter"
```

## Self-review

- Spec coverage: Task 1 implements metadata-only cache, 24-hour expiry, and 500-entry eviction. Task 2 handles cache-first hydration, detail extraction, concurrency, individual failures, and abort propagation. Task 3 renders partial progress and maintains date filtering. Task 4 supplies the required Tampermonkey grants and focused verification.
- Placeholder scan: no unresolved placeholders, unspecified error handling, or implicit test steps remain.
- Type consistency: all tasks use `CachedConversationDate`, `ConversationDateCache`, `conversationToSidebarMetadata`, and `indexConversationDates` with the signatures defined above.
