declare const unsafeWindow: Window & typeof globalThis;

declare function GM_addStyle(css: string): void;
declare function GM_getValue<T = unknown>(key: string, defaultValue?: T): T;
declare function GM_setValue<T = unknown>(key: string, value: T): void;
declare function GM_registerMenuCommand(name: string, callback: () => void): void;

declare function GM_xmlhttpRequest(options: {
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
