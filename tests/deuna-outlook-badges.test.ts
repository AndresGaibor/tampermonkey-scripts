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
});
