declare global {
  const unsafeWindow: Window & typeof globalThis;

  function GM_addStyle(css: string): void;
  function GM_getValue<T = unknown>(key: string, defaultValue?: T): T;
  function GM_setValue<T = unknown>(key: string, value: T): void;
  function GM_registerMenuCommand(name: string, callback: () => void): void;

  function GM_xmlhttpRequest(options: {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    data?: string;
    timeout?: number;
    onload?: (response: {
      status: number;
      statusText: string;
      responseText: string;
      response?: unknown;
    }) => void;
    onerror?: (error: unknown) => void;
    ontimeout?: () => void;
  }): void;

  interface Element {
    [key: string]: any;
  }

  interface EventTarget {
    [key: string]: any;
  }

  interface Window {
    [key: string]: any;
    tmSRI?: unknown;
    performance: Performance & {
      memory?: {
        usedJSHeapSize: number;
      };
    };
  }
}

export {};
