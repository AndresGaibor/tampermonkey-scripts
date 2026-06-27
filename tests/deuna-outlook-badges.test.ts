import { describe, expect, test } from 'bun:test';

class FakeElement {
  tagName: string;
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  textContent = '';
  disabled = false;

  get className() {
    return this.attributes.get('class') ?? '';
  }

  set className(value: string) {
    this.attributes.set('class', value);
  }

  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
  }

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

  addEventListener() {
    return undefined;
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

describe('deuna-outlook badges', () => {
  test('muestra el badge en Outlook cuando el item role=option no es div', async () => {
    const option = new FakeElement('article') as unknown as HTMLElement;
    option.setAttribute('role', 'option');
    option.setAttribute(
      'aria-label',
      'notificaciones@deunaapp.com ¡Listo! Recargaste $5,00 en tu cuenta Deuna ✅ Lun 10/06/2026',
    );

    const storedSignatures = JSON.stringify(['notificaciones deunaapp com|5 00|usd|recarga']);
    const store = new Map<string, string>([['deuna_sent_signatures', storedSignatures]]);

    const documentMock = {
      readyState: 'complete',
      title: 'Inbox - Outlook',
      body: {
        textContent: '',
        appendChild: () => option,
      },
      getElementById: (id: string) => (id === 'deuna-sricache-btn' ? null : null),
      addEventListener: () => undefined,
      querySelectorAll: (selector: string) => {
        if (selector === '[role="option"][aria-label]') return [option];
        if (selector === 'div[role="option"][aria-label]') return [];
        return [];
      },
      querySelector: () => null,
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
      await import('../scripts/deuna-outlook/src/main.ts');

      const badge = option.querySelector(':scope > .deuna-sent-badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('Enviado');
    } finally {
      globalThis.document = originalDocument;
      globalThis.location = originalLocation;
      globalThis.setInterval = originalSetInterval;
      globalThis.localStorage = originalLocalStorage;
    }
  });

  test('hidrata firmas desde SriCache-2 y muestra badges históricos en la lista', async () => {
    const option = new FakeElement('article') as unknown as HTMLElement;
    option.setAttribute('role', 'option');
    option.setAttribute(
      'aria-label',
      'notificaciones@deunaapp.com ¡Listo! Recargaste $7,00 en tu cuenta Deuna ✅ Vie 19/6 Andres Alexander Gaibor Recargaste $7,00 de saldo a tu cuenta Deuna Detalles de la transacción Monto $7,00 USD Motivo Recarga Fecha 19 jun 2026 - 12h58 Número de transacción 777',
    );

    const store = new Map<string, string>();
    const urls: string[] = [];

    const documentMock = {
      readyState: 'complete',
      title: 'Inbox - Outlook',
      body: {
        textContent: '',
        appendChild: () => option,
      },
      getElementById: () => null,
      addEventListener: () => undefined,
      querySelectorAll: (selector: string) => {
        if (selector === '[role="option"][aria-label]') return [option];
        return [];
      },
      querySelector: () => null,
      createElement: (tagName: string) => new FakeElement(tagName),
    } as unknown as Document;

    const originalDocument = globalThis.document;
    const originalLocation = globalThis.location;
    const originalSetInterval = globalThis.setInterval;
    const originalLocalStorage = globalThis.localStorage;
    const originalFetch = globalThis.fetch;
    const originalGm = globalThis.GM_xmlhttpRequest;

    globalThis.document = documentMock;
    globalThis.location = { href: 'https://outlook.office.com/mail/' } as Location;
    globalThis.setInterval = (() => 0) as typeof setInterval;
    globalThis.GM_xmlhttpRequest = undefined;
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
    globalThis.fetch = (async (url: string | URL | Request) => {
      urls.push(String(url));
      return new Response(JSON.stringify({
        success: true,
        data: {
          items: [
            {
              sender: 'notificaciones@deunaapp.com',
              subject: '¡Listo! Recargaste $7,00 en tu cuenta Deuna ✅',
              received_at: 'Vie 19/6',
              customer_name: 'Andres Alexander Gaibor',
              masked_id: '******3836',
              amount: 7,
              currency: 'USD',
              reason: 'Recarga',
              transaction_date: '19 jun 2026 - 12h58',
              source_account: null,
              destination_account: null,
              transaction_number: '777',
              support_phone: null,
            },
          ],
        },
      }), { status: 200 });
    }) as typeof fetch;

    try {
      await import('../scripts/deuna-outlook/src/main.ts?hydrate-list');
      await Promise.resolve();
      await Promise.resolve();

      expect(urls[0]).toBe('http://localhost:3000/api/deuna-imports/emails?pageSize=2000');
      const badge = option.querySelector(':scope > .deuna-sent-badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('Enviado');
      expect(JSON.parse(store.get('deuna_sent_txns') ?? '[]')).toContain('777');
    } finally {
      globalThis.document = originalDocument;
      globalThis.location = originalLocation;
      globalThis.setInterval = originalSetInterval;
      globalThis.localStorage = originalLocalStorage;
      globalThis.fetch = originalFetch;
      globalThis.GM_xmlhttpRequest = originalGm;
    }
  });
});
