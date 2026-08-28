import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { normalizeTimestamp, formatDateTime } from '../scripts/chatgpt-bulk-exporter/src/domain/dates.ts';
import { clearSessionTokenCache, fetchConversation, fetchConversationForExport, fetchConversationHistory } from '../scripts/chatgpt-bulk-exporter/src/infrastructure/chatgpt-api.ts';
import { conversationFromDocument } from '../scripts/chatgpt-bulk-exporter/src/infrastructure/conversation-dom.ts';
import { normalizeConversation, getActiveBranch } from '../scripts/chatgpt-bulk-exporter/src/domain/conversation.ts';
import { renderMarkdown } from '../scripts/chatgpt-bulk-exporter/src/domain/markdown.ts';
import { createFilename, uniqueFilename } from '../scripts/chatgpt-bulk-exporter/src/domain/filenames.ts';
import { SelectionStore } from '../scripts/chatgpt-bulk-exporter/src/application/selection.ts';
import { findConversationLinks, decorateConversation, findSidebarMountTarget } from '../scripts/chatgpt-bulk-exporter/src/infrastructure/sidebar-dom.ts';
import { formatExportSummary, mountSelectionTrigger } from '../scripts/chatgpt-bulk-exporter/src/presentation/sidebar.ts';
import { exportBatch } from '../scripts/chatgpt-bulk-exporter/src/application/exporter.ts';
import { buildZip } from '../scripts/chatgpt-bulk-exporter/src/infrastructure/download.ts';
import { filterAndSortConversations, filterConversations, hasInvertedRange, parseDateInput, type SidebarConversation } from '../scripts/chatgpt-bulk-exporter/src/domain/conversation-filter.ts';
import { CACHE_KEY, CACHE_MAX_ENTRIES, CACHE_TTL_MS, ConversationDateCache, type CachedConversationDate } from '../scripts/chatgpt-bulk-exporter/src/infrastructure/conversation-date-cache.ts';
import { indexConversationDates } from '../scripts/chatgpt-bulk-exporter/src/application/progressive-date-indexer.ts';
import { conversationToSidebarMetadata } from '../scripts/chatgpt-bulk-exporter/src/infrastructure/chatgpt-api.ts';
import { styles } from '../scripts/chatgpt-bulk-exporter/src/presentation/styles.ts';

const raw = (current_node = 'a') => ({
  conversation_id: 'c1', title: 'Demo', create_time: 1724672589, update_time: 1724672706,
  current_node, mapping: {
    root: { id: 'root', parent: null, message: null },
    u: { id: 'u', parent: 'root', message: { id: 'u', author: { role: 'user' }, create_time: 1724672589, content: { content_type: 'text', parts: ['Pregunta'] } } },
    a: { id: 'a', parent: 'u', message: { id: 'a', author: { role: 'assistant' }, create_time: 1724672592, content: { content_type: 'text', parts: ['Respuesta'] } } },
    old: { id: 'old', parent: 'u', message: { id: 'old', author: { role: 'assistant' }, create_time: 1724672593, content: { content_type: 'text', parts: ['Regenerada'] } } },
  },
});

describe('ChatGPT Bulk Exporter domain', () => {
  test('normaliza conversación y reconstruye rama activa sin respuesta regenerada', () => {
    const conversation = normalizeConversation(raw());
    expect(conversation.id).toBe('c1');
    expect(getActiveBranch(conversation).map(m => m.content)).toEqual(['Pregunta', 'Respuesta']);
  });
  test('usa fechas de mensajes cuando faltan fechas de metadata', () => {
    const conversation = normalizeConversation({ ...raw(), create_time: null, update_time: null });
    expect(conversation.createdAt?.getTime()).toBe(1724672589000);
    expect(conversation.updatedAt?.getTime()).toBe(1724672593000);
  });
  test('normaliza timestamp segundos, milisegundos, epoch string, ISO, faltante e inválido', () => {
    expect(normalizeTimestamp(1779990000)?.getTime()).toBe(1779990000000);
    expect(normalizeTimestamp(1779990000000)?.getTime()).toBe(1779990000000);
    expect(normalizeTimestamp('1779990000')?.getTime()).toBe(1779990000000);
    expect(normalizeTimestamp('2026-08-28T07:00:00.000Z')?.getTime()).toBe(Date.parse('2026-08-28T07:00:00.000Z'));
    expect(normalizeTimestamp('invalid')).toBeNull();
    expect(normalizeTimestamp('')).toBeNull();
    expect(normalizeTimestamp(null)).toBeNull();
    expect(formatDateTime(null)).toBe('Fecha no disponible');
  });
  test('renderiza metadata, Prompt/Response, fechas locales, multilinea y código', () => {
    const md = renderMarkdown(normalizeConversation(raw()), new Date('2026-08-28T02:15:23Z'), 'en-US');
    expect(md).toContain('# Demo');
    expect(md).toContain('**Created:**'); expect(md).toContain('**Updated:**'); expect(md).toContain('**Exported:**');
    expect(md).toContain('**Link:** https://chatgpt.com/c/c1');
    expect(md).toContain('## Prompt:'); expect(md).toContain('## Response:');
    expect(md).toContain('Pregunta'); expect(md).toContain('Respuesta');
    expect(md).toContain(formatDateTime(new Date(1724672589000), 'en-US'));
  });
  test('ignora system/tool y conserva user/assistant', () => {
    const c = normalizeConversation({ ...raw(), mapping: { ...raw().mapping, sys: { id: 'sys', parent: 'a', message: { id: 'sys', author: { role: 'system' }, content: { parts: ['noise'] } } } } });
    const md = renderMarkdown(c, new Date(0));
    expect(md).not.toContain('noise'); expect(md).toContain('Pregunta');
  });
  test('sanitiza, limita títulos y deduplica filenames', () => {
    const name = createFilename(' /Bad:*? "<>| ', new Date('2026-08-26T19:55:00Z'));
    expect(name).toBe('ChatGPT-Bad-20260826-1955.md');
    expect(createFilename('', null)).toBe('ChatGPT-chat.md');
    expect(createFilename('x'.repeat(300), null).length).toBeLessThanOrEqual(120);
    expect(uniqueFilename('ChatGPT-A.md', new Set(['ChatGPT-A.md']))).toBe('ChatGPT-A-2.md');
  });
});

describe('filtro de chats por fecha y hora', () => {
  const at = (value: string) => new Date(value);
  const chats: SidebarConversation[] = [
    { id: 'old', title: 'Old', href: '/c/old', createdAt: at('2024-01-01T10:00:00Z'), updatedAt: at('2024-01-02T10:00:00Z') },
    { id: 'new', title: 'New', href: '/c/new', createdAt: at('2024-02-01T10:00:00Z'), updatedAt: at('2024-03-01T10:00:00Z') },
    { id: 'unknown', title: 'Unknown', href: '/c/unknown', createdAt: null, updatedAt: null },
  ];
  test('filtra por creación/actualización con límites inclusivos y fechas desconocidas', () => {
    const range = { from: at('2024-01-01T10:00:00Z').getTime(), to: at('2024-02-01T10:00:00Z').getTime() };
    expect(filterConversations(chats, 'created', range).map(chat => chat.id)).toEqual(['old', 'new']);
    expect(filterConversations(chats, 'updated', range).map(chat => chat.id)).toEqual(['old']);
    expect(filterConversations(chats, 'created', { from: null, to: null }).map(chat => chat.id)).toEqual(['old', 'new', 'unknown']);
  });
  test('ordena por el campo activo, deja fechas desconocidas al final y no muta la fuente', () => {
    const tied: SidebarConversation[] = [
      { id: 'z', title: 'Beta', href: '/c/z', createdAt: at('2024-04-01T10:00:00Z'), updatedAt: at('2024-02-01T10:00:00Z') },
      { id: 'a', title: 'Alpha', href: '/c/a', createdAt: at('2024-03-01T10:00:00Z'), updatedAt: at('2024-02-01T10:00:00Z') },
      { id: 'b', title: 'Alpha', href: '/c/b', createdAt: null, updatedAt: null },
      { id: 'a2', title: 'Alpha', href: '/c/a2', createdAt: null, updatedAt: null },
      { id: 'invalid', title: 'Invalid', href: '/c/invalid', createdAt: new Date(Number.NaN), updatedAt: new Date(Number.NaN) },
    ];
    const original = tied.map(chat => chat.id);
    expect(filterAndSortConversations(tied, 'created', { from: null, to: null }).map(chat => chat.id)).toEqual(['z', 'a', 'a2', 'b', 'invalid']);
    expect(filterAndSortConversations(tied, 'updated', { from: null, to: null }).map(chat => chat.id)).toEqual(['a', 'z', 'a2', 'b', 'invalid']);
    expect(tied.map(chat => chat.id)).toEqual(original);
  });
  test('mantiene solo la lista como región flexible de scroll nativo', () => {
    expect(styles).toContain('.cbe-filter-list{min-height:0;flex:1 1 auto;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable;touch-action:pan-y');
  });
  test('detecta rangos invertidos y convierte días completos en hora local', () => {
    expect(hasInvertedRange({ from: 20, to: 10 })).toBe(true);
    expect(hasInvertedRange({ from: 10, to: 20 })).toBe(false);
    expect(parseDateInput('', 'start')).toBeNull();
    const start = parseDateInput('2024-01-01', 'start')!;
    const end = parseDateInput('2024-01-01', 'end')!;
    expect(new Date(start).getHours()).toBe(0);
    expect(new Date(end).getHours()).toBe(23);
    expect(end - start).toBe(86_399_999);
    expect(parseDateInput('2024-02-31', 'start')).toBeNull();
  });
});

describe('selection and sidebar', () => {
  test.each([
    ['completo', '<div id="stage-slideover-sidebar"><nav aria-label="Historial del chat"><div id="history"><a data-sidebar-item="true" href="/c/one">One</a></div></nav></div>'],
    ['simplificado', '<div id="stage-slideover-sidebar"><div data-sidebar-root="true"><div>Chats</div><div id="history"><a data-sidebar-item="true" href="/c/one">One</a></div></div></div>'],
  ])('monta trigger en sidebar %s', (_name, html) => {
    const dom = new JSDOM(html); const root = dom.window.document;
    const target = findSidebarMountTarget(root);
    expect(target).not.toBeNull();
    mountSelectionTrigger(target!);
    const trigger = root.querySelector<HTMLButtonElement>('[data-cbe-selection-trigger="true"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.classList.contains('cbe-menu-item')).toBe(true);
    expect(trigger?.querySelector('svg')).not.toBeNull();
    expect(trigger?.querySelector('.cbe-menu-label')?.textContent).toBe('Exportar chats');
    mountSelectionTrigger(target!);
    expect(root.querySelectorAll('[data-cbe-selection-trigger="true"]')).toHaveLength(1);
  });
  test('selecciona, deselecciona, deduplica y limpia', () => {
    const store = new SelectionStore(); store.toggle('a'); store.toggle('a'); store.toggle('a'); store.toggle('a');
    expect(store.size).toBe(0); store.add('a'); store.add('a'); store.add('b'); expect(store.ids).toEqual(['a', 'b']); store.clear(); expect(store.size).toBe(0);
  });
  test('encuentra metadatos de fecha del elemento del chat', () => {
    const dom = new JSDOM('<aside><div data-sidebar-item="true" data-create-time="1724672589" data-update-time="1724672706"><a href="/c/one">One</a></div></aside>');
    const conversation = findConversationLinks(dom.window.document.querySelector('aside')!)[0];
    expect(conversation.createdAt?.getTime()).toBe(1724672589000);
    expect(conversation.updatedAt?.getTime()).toBe(1724672706000);
  });
  test('encuentra fechas guardadas en historyItem de las props React del sidebar', () => {
    const dom = new JSDOM('<aside><a href="/c/one">One</a></aside>');
    const link = dom.window.document.querySelector('a')! as HTMLAnchorElement & Record<string, unknown>;
    link.__reactFiber$test = { memoizedProps: { label: { props: { historyItem: { id: 'one', create_time: '2026-08-26T19:43:09Z', update_time: '2026-08-26T19:55:06Z' } } } }, return: null };
    const conversation = findConversationLinks(dom.window.document)[0];
    expect(conversation.createdAt?.toISOString()).toBe('2026-08-26T19:43:09.000Z');
    expect(conversation.updatedAt?.toISOString()).toBe('2026-08-26T19:55:06.000Z');
  });
  test('encuentra solo links de conversación y decora idempotentemente', () => {
    const dom = new JSDOM('<aside><a href="/c/one">One</a><a href="/settings">Settings</a><a href="/c/one">Duplicate</a></aside>');
    const aside = dom.window.document.querySelector('aside')!;
    expect(findConversationLinks(aside).map(x => x.id)).toEqual(['one']);
    const row = aside.querySelector('a')!;
    expect(decorateConversation(row, false)).toBeTruthy();
    decorateConversation(row, false); expect(row.querySelectorAll('[data-cbe-checkbox]').length).toBe(1);
  });
});

describe('cliente autenticado y fallback DOM', () => {
  test('envía Bearer y renueva una sola vez después de 401', async () => {
    clearSessionTokenCache();
    const originalFetch = globalThis.fetch; const tokens: string[] = []; let sessions = 0; let details = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/session') return new Response(JSON.stringify({ accessToken: `token-${++sessions}` }), { status: 200 });
      details++; tokens.push(new Headers(init?.headers).get('Authorization') || '');
      if (details === 1) return new Response('{}', { status: 401 });
      return new Response(JSON.stringify(raw()), { status: 200 });
    }) as typeof fetch;
    try { const result = await fetchConversation('c1'); expect(result.id).toBe('c1'); expect(tokens).toEqual(['Bearer token-1', 'Bearer token-2']); expect(sessions).toBe(2); }
    finally { globalThis.fetch = originalFetch; clearSessionTokenCache(); }
  });
  test('no incluye el token en errores de la API', async () => {
    clearSessionTokenCache(); const originalFetch = globalThis.fetch; const secret = 'token-super-secreto';
    globalThis.fetch = (async (input: RequestInfo | URL) => String(input) === '/api/auth/session' ? new Response(JSON.stringify({ accessToken: secret }), { status: 200 }) : new Response('{}', { status: 500 })) as typeof fetch;
    try { await expect(fetchConversation('c1')).rejects.not.toThrow(secret); }
    finally { globalThis.fetch = originalFetch; clearSessionTokenCache(); }
  });
  test('extrae solo turnos semánticos y elimina controles del chat abierto', () => {
    const dom = new JSDOM('<title>Chat visible</title><aside><div data-message-author-role="assistant">No incluir</div></aside><main><article data-message-author-role="user" data-message-id="u1">Pregunta<button>Copiar</button></article><article data-message-author-role="assistant" data-message-id="a1"><p>Respuesta</p><div aria-hidden="true">Oculto</div></article></main>', { url: 'https://chatgpt.com/c/open' });
    const result = conversationFromDocument('open', dom.window.document, dom.window.location.pathname);
    expect(result?.title).toBe('Chat visible'); expect(result?.messages.map(message => message.content)).toEqual(['Pregunta', 'Respuesta']); expect(result?.currentNode).toBe('a1');
    expect(conversationFromDocument('other', dom.window.document, dom.window.location.pathname)).toBeNull();
  });
  test('usa el DOM únicamente cuando falla la API del chat actualmente abierto', async () => {
    const dom = new JSDOM('<title>Respaldo</title><main><div data-message-author-role="user">Hola</div><div data-message-author-role="assistant">Hola también</div></main>', { url: 'https://chatgpt.com/c/open' });
    const fetchApi = async () => { throw new Error('Conversation request failed (404)'); };
    const result = await fetchConversationForExport('open', undefined, { document: dom.window.document, pathname: dom.window.location.pathname, fetchConversation: fetchApi });
    expect(result.messages).toHaveLength(2);
    await expect(fetchConversationForExport('other', undefined, { document: dom.window.document, pathname: dom.window.location.pathname, fetchConversation: fetchApi })).rejects.toThrow('404');
  });
});

describe('historial paginado', () => {
  test('recupera páginas, deduplica, normaliza fechas y reporta progreso', async () => {
    clearSessionTokenCache(); const calls: string[] = []; const progress: { loaded: number; total: number | null }[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input); if (url === '/api/auth/session') return new Response(JSON.stringify({ accessToken: 'history-token' }), { status: 200 }); calls.push(url);
      if (url.includes('offset=0')) return new Response(JSON.stringify({ items: [{ id: 'chat-1', title: ' Uno ', create_time: '2026-08-25T10:00:00.000Z', update_time: '2026-08-28T10:00:00.000Z' }, { id: 'chat-2', title: 'Dos', create_time: '2026-08-24T10:00:00.000Z', update_time: '2026-08-27T10:00:00.000Z' }], total: 3 }), { status: 200 });
      return new Response(JSON.stringify({ data: { items: [{ id: 'chat-2', title: 'Duplicado' }, { id: 'chat-3', title: 'Tres', create_time: '2026-08-23T10:00:00.000Z', update_time: '2026-08-26T10:00:00.000Z' }], total: 3 } }), { status: 200 });
    }) as typeof fetch;
    try {
      const result = await fetchConversationHistory({ pageSize: 2, onProgress: value => progress.push(value) });
      expect(calls[0]).toContain('offset=0'); expect(calls[0]).toContain('limit=2'); expect(calls[1]).toContain('offset=2');
      expect(result.map(chat => chat.id)).toEqual(['chat-1', 'chat-2', 'chat-3']); expect(result).toHaveLength(3);
      expect(result[0].href).toBe('/c/chat-1'); expect(result[0].createdAt).not.toBeNull(); expect(result[0].updatedAt).not.toBeNull();
      expect(progress).toEqual([{ loaded: 2, total: 3 }, { loaded: 3, total: null }]);
    } finally { globalThis.fetch = originalFetch; clearSessionTokenCache(); }
  });
  test('continúa después de una página corta aunque el total reportado ya se alcanzó', async () => {
    clearSessionTokenCache(); const calls: string[] = []; const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input); if (url === '/api/auth/session') return new Response(JSON.stringify({ accessToken: 'history-token' }), { status: 200 }); calls.push(url);
      if (url.includes('offset=0')) return new Response(JSON.stringify({ items: [{ id: 'chat-1', title: 'Uno' }, { id: 'chat-2', title: 'Dos' }], total: 2 }), { status: 200 });
      if (url.includes('offset=2')) return new Response(JSON.stringify({ items: [{ id: 'chat-3', title: 'Tres' }], total: 2 }), { status: 200 });
      return new Response(JSON.stringify({ items: [], total: 2 }), { status: 200 });
    }) as typeof fetch;
    try {
      const result = await fetchConversationHistory({ pageSize: 28 });
      expect(calls).toHaveLength(3); expect(calls[1]).toContain('offset=2'); expect(calls[2]).toContain('offset=3');
      expect(result.map(chat => chat.id)).toEqual(['chat-1', 'chat-2', 'chat-3']);
    } finally { globalThis.fetch = originalFetch; clearSessionTokenCache(); }
  });
  test('usa create_time como fallback y omite entradas sin ID', async () => {
    clearSessionTokenCache(); const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => String(input) === '/api/auth/session' ? new Response(JSON.stringify({ accessToken: 'history-token' }), { status: 200 }) : new Response(JSON.stringify([{ id: 'only-created', title: '', create_time: '2026-08-25T10:00:00.000Z', update_time: null }, { title: 'sin id' }]), { status: 200 })) as typeof fetch;
    try { const result = await fetchConversationHistory({ pageSize: 28 }); expect(result).toHaveLength(1); expect(result[0].title).toBe('ChatGPT chat'); expect(result[0].updatedAt?.getTime()).toBe(result[0].createdAt?.getTime()); } finally { globalThis.fetch = originalFetch; clearSessionTokenCache(); }
  });
});

describe('índice progresivo y caché de fechas', () => {
  const base = (id: string): SidebarConversation => ({ id, title: id, href: `/c/${id}`, createdAt: null, updatedAt: null });
  test('carga solo entradas válidas y vigentes y limita la caché a 500', () => {
    const values = new Map<string, unknown>();
    values.set(CACHE_KEY, [{ id: 'fresh', title: 'Fresh', createdAt: 1, updatedAt: 2, validatedAt: 1_000 }, { id: 'expired', title: 'Old', createdAt: 1, updatedAt: 2, validatedAt: 0 }, { id: '', title: 'Bad', createdAt: 1, updatedAt: 2, validatedAt: 1_000 }]);
    const cache = new ConversationDateCache({ get: key => values.get(key), set: (key, value) => values.set(key, value) });
    expect(cache.load(1_000 + CACHE_TTL_MS - 1).map(entry => entry.id)).toEqual(['fresh']);
    cache.save(Array.from({ length: 501 }, (_, index) => ({ id: `c${index}`, title: '', createdAt: null, updatedAt: null, validatedAt: index })), 2_000);
    expect((values.get(CACHE_KEY) as CachedConversationDate[])).toHaveLength(CACHE_MAX_ENTRIES);
  });
  test('no deja que una caché incompleta borre fechas del historial y la reintenta', async () => {
    const values = new Map<string, unknown>([[CACHE_KEY, [{ id: 'a', title: 'cached', createdAt: null, updatedAt: null, validatedAt: 1_000 }]]]);
    const cache = new ConversationDateCache({ get: key => values.get(key), set: (key, value) => values.set(key, value) });
    const updates: SidebarConversation[] = [];
    await indexConversationDates({ conversations: [{ ...base('a'), createdAt: new Date(10), updatedAt: new Date(20) }], cache, now: 2_000, fetchConversation: async id => normalizeConversation({ ...raw(), conversation_id: id, create_time: 30, update_time: 40 }), onUpdate: chat => updates.push(chat) });
    expect(updates[0].createdAt?.getTime()).toBe(10);
    expect(updates.at(-1)?.createdAt?.getTime()).toBe(30_000);
  });
  test('convierte metadata de detalle e indexa progresivamente con errores aislados', async () => {
    const values = new Map<string, unknown>(); const cache = new ConversationDateCache({ get: key => values.get(key), set: (key, value) => values.set(key, value) });
    const updates: string[] = []; const progress: string[] = [];
    await indexConversationDates({ conversations: [base('a'), base('bad'), base('c')], cache, concurrency: 1, now: 2_000, fetchConversation: async id => { if (id === 'bad') throw new Error('no'); return normalizeConversation({ ...raw(), conversation_id: id, create_time: 30, update_time: 40 }); }, onUpdate: chat => updates.push(`${chat.id}:${chat.createdAt?.getTime()}`), onProgress: value => progress.push(`${value.loaded}/${value.total}`) });
    expect(updates).toEqual(['a:30000', 'c:30000']); expect(progress).toEqual(['1/3', '2/3', '3/3']);
    const converted = conversationToSidebarMetadata(normalizeConversation(raw())); expect(converted.id).toBe('c1');
  });
  test('respeta concurrencia y aborta sin iniciar trabajos posteriores', async () => {
    const cache = new ConversationDateCache({ get: () => [], set: () => {} }); let active = 0; let max = 0; const controller = new AbortController();
    await indexConversationDates({ conversations: ['a', 'b', 'c', 'd'].map(base), cache, concurrency: 2, signal: controller.signal, fetchConversation: async id => { active++; max = Math.max(max, active); await new Promise(resolve => setTimeout(resolve, 2)); active--; if (id === 'a') controller.abort(); return normalizeConversation({ ...raw(), conversation_id: id }); } });
    expect(max).toBeLessThanOrEqual(2);
  });
});

describe('exportBatch and zip', () => {
  test('resume éxitos y fallos del lote', () => {
    expect(formatExportSummary(2, 1)).toBe('2 exportados, 1 fallido.');
    expect(formatExportSummary(1, 0)).toBe('1 chat exportado correctamente.');
    expect(formatExportSummary(0, 3)).toBe('0 exportados, 3 fallidos.');
  });
  test('procesa secuencialmente, continúa errores y reporta progreso', async () => {
    const order: string[] = []; const progress: string[] = [];
    const result = await exportBatch({ conversationIds: ['a', 'bad', 'c'], fetchConversation: async id => { order.push(id); if (id === 'bad') throw new Error('no'); return normalizeConversation(raw()); }, onProgress: p => { if (p.state === 'done' || p.state === 'failed') progress.push(`${p.index}/${p.total}`); }, now: new Date(0) });
    expect(order).toEqual(['a', 'bad', 'c']); expect(result.files).toHaveLength(2); expect(result.failures).toEqual(['bad']); expect(progress).toEqual(['1/3', '2/3', '3/3']);
  });
  test('cancelación impide iniciar chats posteriores', async () => {
    const controller = new AbortController(); const order: string[] = [];
    const result = await exportBatch({ conversationIds: ['a', 'b'], signal: controller.signal, fetchConversation: async id => { order.push(id); controller.abort(); return normalizeConversation(raw()); }, now: new Date(0) });
    expect(order).toEqual(['a']); expect(result.cancelled).toBe(true);
  });
  test('ZIP contiene solo éxitos y UTF-8', async () => {
    const bytes = buildZip([{ name: 'ChatGPT-á.md', content: '# Hola ñ' }]);
    expect(bytes.length).toBeGreaterThan(20); expect(new TextDecoder().decode(bytes)).not.toContain('# Hola');
  });
});
