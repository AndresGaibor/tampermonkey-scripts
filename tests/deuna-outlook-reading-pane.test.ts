import { describe, expect, test } from 'bun:test';

class FakeElement {
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  textContent = '';

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
});
