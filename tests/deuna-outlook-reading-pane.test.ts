import { describe, expect, test } from 'bun:test';

class FakeElement {
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  textContent = '';
  disabled = false;
  private listeners = new Map<string, () => void | Promise<void>>();

  get className() {
    return this.attributes.get('class') ?? '';
  }

  set className(value: string) {
    this.attributes.set('class', value);
  }

  constructor(private tagName = 'div') {}

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child: FakeElement) {
    this.children.push(child);
    return child;
  }

  addEventListener(eventName: string, listener: () => void | Promise<void>) {
    this.listeners.set(eventName, listener);
  }

  async click() {
    await this.listeners.get('click')?.();
  }

  remove() {
    this.children = [];
  }

  querySelector(selector: string) {
    if (selector === ':scope > .deuna-sent-badge') {
      return this.children.find((child) => child.getAttribute('class') === 'deuna-sent-badge') ?? null;
    }

    return null;
  }
}

describe('deuna-outlook reading pane', () => {
  test('muestra el badge cuando el reading pane usa role=document en un tag no-div', async () => {
    const pane = new FakeElement('section') as unknown as HTMLElement;
    pane.setAttribute('role', 'document');
    pane.textContent = [
      'notificaciones@deunaapp.com',
      'Recargaste',
      'Monto: $5,00 USD',
      'Motivo: Recarga',
      'Fecha: 10 jun. 2026 - 12:30',
      'Número de transacción: 123456',
    ].join(' ');

    const store = new Map<string, string>([
      ['deuna_sent_txns', JSON.stringify(['123456'])],
      ['deuna_sent_signatures', JSON.stringify(['notificaciones deunaapp com|5 00|usd|recarga'])],
    ]);

    const documentMock = {
      readyState: 'complete',
      title: 'Inbox - Outlook',
      body: {
        textContent: '',
        appendChild: () => pane,
      },
      getElementById: (id: string) => (id === 'deuna-sricache-btn' ? null : null),
      addEventListener: () => undefined,
      querySelectorAll: () => [],
      querySelector: (selector: string) => {
        if (selector === '[role="document"]') return pane;
        if (selector === 'div[role="document"]') return null;
        return null;
      },
      createElement: (tagName: string) => new FakeElement(tagName),
    } as unknown as Document;

    const originalDocument = globalThis.document;
    const originalLocation = globalThis.location;
    const originalSetInterval = globalThis.setInterval;
    const originalLocalStorage = globalThis.localStorage;

    globalThis.document = documentMock;
    globalThis.location = { href: 'https://outlook.office.com/mail/' } as Location;
    globalThis.setInterval = (() => 0) as typeof setInterval;
    globalThis.localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    } as Storage;

    try {
      await import('../scripts/deuna-outlook/src/main.ts?reading-pane');

      const badge = pane.querySelector(':scope > .deuna-sent-badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('Enviado');
    } finally {
      globalThis.document = originalDocument;
      globalThis.location = originalLocation;
      globalThis.setInterval = originalSetInterval;
      globalThis.localStorage = originalLocalStorage;
    }
  });

  test('envía recarga cuando Outlook muestra los campos Deuna sin dos puntos', async () => {
    const pane = new FakeElement('div') as unknown as HTMLElement;
    pane.setAttribute('role', 'document');
    pane.textContent = [
      'notificaciones@deunaapp.com',
      'Hola, Andres 💸',
      'Recargaste $5,00 de saldo a tu cuenta Deuna',
      'Detalles de la transacción',
      'Monto $5,00 USD',
      'Motivo Recarga',
      'Fecha 26 jun 2026 - 17h41',
      'Cuenta de origen ******2091',
      'Cuenta de destino ******9311',
      'Número de transacción 207695488019',
    ].join(' ');

    const button = new FakeElement('button') as unknown as HTMLButtonElement;
    const store = new Map<string, string>([['api_base', 'http://localhost:3000']]);
    const postedUrls: string[] = [];
    const postedPayloads: string[] = [];

    const documentMock = {
      readyState: 'complete',
      title: 'Inbox - Outlook',
      body: {
        textContent: '',
        appendChild: () => button,
      },
      getElementById: () => null,
      addEventListener: () => undefined,
      querySelectorAll: () => [],
      querySelector: (selector: string) => {
        if (selector === '#ConversationReadingPaneContainer [id^="UniqueMessageBody_"]') return pane;
        if (selector === '#ConversationReadingPaneContainer [id$="_SUBJECT"] [title]') return null;
        if (selector === '#ConversationReadingPaneContainer [id$="_SUBJECT"]') return null;
        if (selector === '#ReadingPaneContainerId [id$="_SUBJECT"] [title]') return null;
        if (selector === '#ReadingPaneContainerId [id$="_SUBJECT"]') return null;
        if (selector === '#ConversationReadingPaneContainer') return pane;
        return null;
      },
      createElement: () => button,
    } as unknown as Document;

    const originalDocument = globalThis.document;
    const originalLocation = globalThis.location;
    const originalSetInterval = globalThis.setInterval;
    const originalSetTimeout = globalThis.setTimeout;
    const originalLocalStorage = globalThis.localStorage;
    const originalFetch = globalThis.fetch;
    const originalGm = globalThis.GM_xmlhttpRequest;
    const originalGmGetValue = globalThis.GM_getValue;

    globalThis.document = documentMock;
    globalThis.location = { href: 'https://outlook.office.com/mail/' } as Location;
    globalThis.setInterval = (() => 0) as typeof setInterval;
    globalThis.setTimeout = ((listener: () => void) => {
      listener();
      return 0;
    }) as typeof setTimeout;
    globalThis.localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    } as Storage;
    globalThis.GM_xmlhttpRequest = undefined;
    globalThis.GM_getValue = ((key: string, fallback: string) => store.get(key) ?? fallback) as typeof GM_getValue;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      postedUrls.push(String(url));
      postedPayloads.push(String(init?.body ?? ''));
      return new Response(JSON.stringify({ success: true }), { status: 201 });
    }) as typeof fetch;

    try {
      await import('../scripts/deuna-outlook/src/main.ts?deuna-no-colons');
      await button.click();

      expect(postedPayloads).toHaveLength(1);
      expect(postedUrls[0]).toBe('http://localhost:3000/api/deuna-imports/emails');
      expect(JSON.parse(postedPayloads[0])).toMatchObject({
        amount: 5,
        reason: 'Recarga',
        transactionDate: '26 jun 2026 - 17h41',
        sourceAccount: '******2091',
        destinationAccount: '******9311',
        transactionNumber: '207695488019',
      });
      expect(JSON.parse(store.get('deuna_sent_txns') ?? '[]')).toContain('207695488019');
    } finally {
      globalThis.document = originalDocument;
      globalThis.location = originalLocation;
      globalThis.setInterval = originalSetInterval;
      globalThis.setTimeout = originalSetTimeout;
      globalThis.localStorage = originalLocalStorage;
      globalThis.fetch = originalFetch;
      globalThis.GM_xmlhttpRequest = originalGm;
      globalThis.GM_getValue = originalGmGetValue;
    }
  });
});
