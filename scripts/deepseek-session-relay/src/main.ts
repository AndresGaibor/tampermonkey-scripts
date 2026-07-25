'use strict';

import { getStoredValue, setStoredValue } from '../../../shared/storage.ts';
import { injectCss } from '../../../shared/style.ts';

const BRIDGE_URL = 'http://localhost:3847/api/deepseek/session';
const STORAGE_KEY_ENABLED = 'deepseek:enabled';
const STORAGE_KEY_MANUAL_DS_SESSION = 'deepseek:manualDsSessionId';

let authorization: string | null = null;
let thumbcache: string | null = null;
let awsWafToken: string | null = null;
let panel: HTMLElement | null = null;
let statusEl: HTMLElement | null = null;
let sentBadge: HTMLElement | null = null;
let retryCount = 0;
const MAX_RETRIES = 120;
const RETRY_INTERVAL_MS = 3000;

function hideToken(valor: string | null): string {
  if (!valor || valor.length < 20) return 'no disponible';
  return `${valor.slice(0, 12)}…${valor.slice(-6)}`;
}

function normalizeAuthorization(valor: string | null): string | null {
  if (!valor || typeof valor !== 'string') return null;
  const limpio = valor.trim();
  if (!limpio) return null;
  if (/^Bearer\s+/i.test(limpio)) return limpio;
  return `Bearer ${limpio}`;
}

function tieneCredenciales(): boolean {
  return !!(authorization && thumbcache && awsWafToken);
}

function hashBundle(): string {
  return [authorization, thumbcache, awsWafToken].join('|');
}

function construirBundle(): object {
  return {
    source: 'deepseek',
    capturedAt: new Date().toISOString(),
    authorization,
    cookies: {
      thumbcache,
      awsWafToken,
      dsSessionId: getStoredValue<string | null>(STORAGE_KEY_MANUAL_DS_SESSION, null),
    },
  };
}

function enviarAlBridge(): void {
  if (!tieneCredenciales()) return;

  const bundle = construirBundle();
  const json = JSON.stringify(bundle);

  GM_xmlhttpRequest({
    method: 'POST',
    url: BRIDGE_URL,
    headers: { 'Content-Type': 'application/json' },
    data: json,
    timeout: 8000,
    onload: (res) => {
      if (res.status >= 200 && res.status < 300) {
        retryCount = 0;
        actualizarInterfazExito();
        console.info('[DeepSeek Session] Sesión enviada al bridge correctamente');
      } else {
        console.warn(`[DeepSeek Session] Bridge respondió ${res.status}`);
        programarReintento();
      }
    },
    onerror: () => {
      programarReintento();
    },
    ontimeout: () => {
      programarReintento();
    },
  });
}

function programarReintento(): void {
  if (retryCount >= MAX_RETRIES) {
    if (statusEl) {
      statusEl.textContent = 'CLI no disponible';
      (statusEl as HTMLElement).style.color = '#ef4444';
    }
    return;
  }

  retryCount++;
  if (statusEl) {
    statusEl.textContent = `Esperando CLI... (${retryCount}/${MAX_RETRIES})`;
    (statusEl as HTMLElement).style.color = '#f59e0b';
  }

  setTimeout(enviarAlBridge, RETRY_INTERVAL_MS);
}

function actualizarInterfazExito(): void {
  if (!statusEl || !sentBadge) return;
  statusEl.textContent = 'Enviado a capi ✓';
  (statusEl as HTMLElement).style.color = '#22c55e';
  sentBadge.style.display = 'block';
}

function actualizarInterfaz(): void {
  if (!panel || !statusEl) return;

  if (tieneCredenciales()) {
    statusEl.textContent = 'Credenciales listas — enviando...';
    (statusEl as HTMLElement).style.color = '#a78bfa';
    enviarAlBridge();
  } else {
    statusEl.textContent = `Esperando: ${hideToken(authorization)}`;
    (statusEl as HTMLElement).style.color = '#f59e0b';
  }
}

function crearInterfaz(): void {
  if (document.getElementById('deepseek-session-panel')) return;

  panel = document.createElement('div');
  panel.id = 'deepseek-session-panel';
  injectCss(`
    #deepseek-session-panel {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483647;
      padding: 14px;
      min-width: 210px;
      border-radius: 12px;
      background: rgba(15, 15, 20, 0.97);
      border: 1px solid rgba(255,255,255,0.14);
      box-shadow: 0 10px 32px rgba(0,0,0,0.45);
      color: #fff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
    }
    #deepseek-session-panel h3 {
      margin: 0 0 8px 0;
      font-size: 14px;
      font-weight: 700;
      color: #a78bfa;
    }
    #deepseek-session-panel .ds-status {
      font-weight: 600;
      margin-bottom: 6px;
      font-size: 12px;
    }
    #deepseek-session-panel .ds-sent {
      display: none;
      font-size: 11px;
      color: #22c55e;
      margin-bottom: 6px;
    }
    #deepseek-session-panel .ds-note {
      font-size: 11px;
      color: rgba(255,255,255,0.4);
      line-height: 1.4;
    }
  `, 'deepseek-session-panel-style');

  statusEl = document.createElement('div');
  statusEl.className = 'ds-status';
  statusEl.textContent = 'Esperando credenciales...';

  sentBadge = document.createElement('div');
  sentBadge.className = 'ds-sent';
  sentBadge.textContent = '✓ Sesión enviada a capi';

  const note = document.createElement('div');
  note.className = 'ds-note';
  note.textContent = 'ds_session_id (HttpOnly) se configura manualmente en capi auth deepseek setDsSession';

  panel.innerHTML = '<h3>🔑 DeepSeek Session</h3>';
  panel.append(statusEl);
  panel.append(sentBadge);
  panel.append(note);
  document.body.appendChild(panel);

  actualizarInterfaz();
}

function capturarAuthorization(valor: string, origen: string): void {
  const auth = normalizeAuthorization(valor);
  if (!auth) return;
  const token = auth.replace(/^Bearer\s+/i, '');
  if (token.length < 20) return;
  if (authorization === auth) return;
  authorization = auth;
  console.info(`[DeepSeek Session] Authorization capturada desde ${origen}`);
  actualizarInterfaz();
}

function leerCookies(): void {
  try {
    const cookies = document.cookie.split('; ');
    for (const cookie of cookies) {
      if (cookie.startsWith('.thumbcache_') && cookie !== thumbcache) {
        thumbcache = cookie;
        console.info('[DeepSeek Session] thumbcache capturada');
        actualizarInterfaz();
      }
      if (cookie.startsWith('aws-waf-token=') && cookie !== awsWafToken) {
        awsWafToken = cookie;
        console.info('[DeepSeek Session] aws-waf-token capturado');
        actualizarInterfaz();
      }
    }
  } catch (error) {
    console.warn('[DeepSeek Session] Error leyendo cookies:', error);
  }
}

function leerLocalStorage(): void {
  try {
    const raw = localStorage.getItem('userToken');
    if (!raw) return;
    let token: string;
    try {
      const parsed = JSON.parse(raw);
      token = typeof parsed === 'string' ? parsed : (parsed?.value ?? '');
    } catch {
      token = raw as string;
    }
    if (typeof token === 'string' && token.length >= 20) {
      capturarAuthorization(token, 'localStorage.userToken');
    }
  } catch (error) {
    console.warn('[DeepSeek Session] Error en localStorage:', error);
  }
}

function interceptarXMLHttpRequest(): void {
  const OrigXHR = unsafeWindow.XMLHttpRequest;
  if (!OrigXHR || (OrigXHR.prototype as any).__deepseekInterceptado) return;

  const originalSetHeader = OrigXHR.prototype.setRequestHeader;
  (OrigXHR.prototype as any).__deepseekInterceptado = true;

  OrigXHR.prototype.setRequestHeader = function (nombre: string, valor: string) {
    if (String(nombre).toLowerCase() === 'authorization') {
      capturarAuthorization(String(valor), 'XMLHttpRequest');
    }
    return originalSetHeader.apply(this, arguments as any);
  } as typeof OrigXHR.prototype.setRequestHeader;
}

function interceptarFetch(): void {
  if (typeof unsafeWindow.fetch !== 'function' || (unsafeWindow.fetch as any).__deepseekInterceptado) return;

  const original = unsafeWindow.fetch;
  (unsafeWindow.fetch as any).__deepseekInterceptado = true;

  unsafeWindow.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    try {
      const headers = new Headers(init?.headers as any);
      const auth = headers.get('authorization');
      if (auth) capturarAuthorization(auth, 'fetch');
    } catch {}
    return original.apply(this, arguments as any);
  } as typeof fetch;
}

function interceptarFetchStream(): void {
  if (typeof unsafeWindow.fetch !== 'function' || (unsafeWindow as any).__capiStreamPatched) return;

  (unsafeWindow as any).__capiStreamPatched = true;
  const original = unsafeWindow.fetch;
  (unsafeWindow.fetch as any).__capiStreamPatched = true;

  unsafeWindow.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);

    (window as any).__capiAllFetchCalls = (window as any).__capiAllFetchCalls || [];
    (window as any).__capiAllFetchCalls.push({ url, time: Date.now() });

    console.log('[DeepSeek Stream] fetch called:', url);

    (window as any).__capiFetchCalled = true;
    (window as any).__capiFetchUrl = url;

    if (!url.includes('chat/completion')) {
      return original.apply(this, arguments as any) as Promise<Response>;
    }

    console.log('[DeepSeek Stream] Intercepted chat/completion fetch!');
    (window as any).__capiStreamIntercepted = true;

    try {
      const response = await original.apply(this, arguments as any);

      if (!response.ok || !response.body) {
        return response;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const newStream = new ReadableStream({
        async start(controller) {
          const process = () => {
            reader.read().then(({ done, value }) => {
              if (done) {
                try { controller.close(); } catch {}
                (window as any).__capiStreamDone = true;
                return;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const raw = line.slice(6).trim();
                if (!raw || raw === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(raw);
                  let obj = parsed;
                  if (parsed.data !== undefined) {
                    const dd = parsed.data;
                    obj = typeof dd === 'string' ? JSON.parse(dd) : (dd || parsed);
                  }

                  (window as any).__capiStreamChunks = (window as any).__capiStreamChunks || [];

                  if (obj.p?.startsWith('response/fragments')) {
                    if (obj.p === 'response/fragments/-1/content') {
                      const chunk = obj.v || '';
                      (window as any).__capiStreamResponse = ((window as any).__capiStreamResponse || '') + chunk;
                      (window as any).__capiStreamChunks.push({ type: 'RESPONSE', chunk });
                    }
                  } else if (obj.v?.response?.fragments) {
                    for (const f of obj.v.response.fragments) {
                      if (f.type === 'THINK') {
                        (window as any).__capiStreamThink = ((window as any).__capiStreamThink || '') + (f.content || '');
                        (window as any).__capiStreamChunks.push({ type: 'THINK', chunk: f.content || '' });
                      } else if (f.type === 'RESPONSE') {
                        (window as any).__capiStreamResponse = ((window as any).__capiStreamResponse || '') + (f.content || '');
                        (window as any).__capiStreamChunks.push({ type: 'RESPONSE', chunk: f.content || '' });
                      }
                    }
                  } else if (obj.event === 'close') {
                    (window as any).__capiStreamDone = true;
                  }
                } catch {}
              }

              try { controller.enqueue(value); } catch {}
              process();
            }).catch((err) => {
              try { controller.error(err); } catch {}
            });
          };

          process();
        },
      });

      return new Response(newStream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (err) {
      return original.apply(this, arguments as any) as Promise<Response>;
    }
  } as typeof fetch;
}

function iniciar(): void {
  leerCookies();
  leerLocalStorage();
  interceptarXMLHttpRequest();
  interceptarFetch();
  interceptarFetchStream();
}

function boot(): void {
  if (!getStoredValue(STORAGE_KEY_ENABLED, true)) return;

  iniciar();

  setInterval(iniciar, 2000);

  GM_registerMenuCommand('DeepSeek Session: Activar/Desactivar', () => {
    const enabled = getStoredValue(STORAGE_KEY_ENABLED, true);
    setStoredValue(STORAGE_KEY_ENABLED, !enabled);
    location.reload();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', crearInterfaz, { once: true });
  } else {
    crearInterfaz();
  }
}

boot();
