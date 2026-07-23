'use strict';

import { getStoredValue, setStoredValue } from '../../../shared/storage.ts';
import { injectCss } from '../../../shared/style.ts';

const BRIDGE_URL = 'http://127.0.0.1:3847/api/deepseek/session';
const STORAGE_KEY_AUTH = 'deepseek:authorization';
const STORAGE_KEY_THUMBCACHE = 'deepseek:thumbcache';
const STORAGE_KEY_AWS_WAF = 'deepseek:awsWafToken';
const STORAGE_KEY_LAST_SENT = 'deepseek:lastSent';
const STORAGE_KEY_ENABLED = 'deepseek:enabled';
const STORAGE_KEY_MANUAL_DS_SESSION = 'deepseek:manualDsSessionId';

let authorization: string | null = null;
let thumbcache: string | null = null;
let awsWafToken: string | null = null;
let panel: HTMLElement | null = null;
let statusEl: HTMLElement | null = null;
let sendBtn: HTMLButtonElement | null = null;
let copyBtn: HTMLButtonElement | null = null;

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

function guardarToken(valor: string, origen: string): void {
  const auth = normalizeAuthorization(valor);
  if (!auth) return;
  const token = auth.replace(/^Bearer\s+/i, '');
  if (token.length < 20) return;
  if (authorization === auth) return;
  authorization = auth;
  console.info(`[DeepSeek Session] Authorization capturada desde ${origen}: ${hideToken(auth)}`);
  actualizarInterfaz();
}

function leerCookies(): void {
  try {
    const cookies = document.cookie.split('; ');
    for (const cookie of cookies) {
      if (cookie.startsWith('.thumbcache_')) {
        thumbcache = cookie;
        console.info(`[DeepSeek Session] thumbcache capturada`);
      }
      if (cookie.startsWith('aws-waf-token=')) {
        awsWafToken = cookie;
        console.info(`[DeepSeek Session] aws-waf-token capturado`);
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
      guardarToken(token, 'localStorage.userToken');
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
      guardarToken(String(valor), 'XMLHttpRequest');
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
      if (auth) guardarToken(auth, 'fetch');
    } catch {}
    return original.apply(this, arguments as any);
  } as typeof fetch;
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
  const bundle = construirBundle();
  const json = JSON.stringify(bundle, null, 2);
  setStoredValue(STORAGE_KEY_LAST_SENT, Date.now());

  try {
    GM_xmlhttpRequest({
      method: 'POST',
      url: BRIDGE_URL,
      headers: { 'Content-Type': 'application/json' },
      data: json,
      timeout: 8000,
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) {
          if (sendBtn) sendBtn.textContent = 'Enviado ✓';
          setTimeout(() => { if (sendBtn) sendBtn.textContent = 'Enviar al CLI'; }, 1800);
        } else {
          if (sendBtn) sendBtn.textContent = `Error ${res.status}`;
          setTimeout(() => { if (sendBtn) sendBtn.textContent = 'Enviar al CLI'; }, 2000);
        }
      },
      onerror: () => {
        if (sendBtn) sendBtn.textContent = 'CLI no responde';
        setTimeout(() => { if (sendBtn) sendBtn.textContent = 'Enviar al CLI'; }, 2000);
      },
      ontimeout: () => {
        if (sendBtn) sendBtn.textContent = 'Timeout';
        setTimeout(() => { if (sendBtn) sendBtn.textContent = 'Enviar al CLI'; }, 2000);
      },
    });
  } catch {
    if (sendBtn) sendBtn.textContent = 'Error';
    setTimeout(() => { if (sendBtn) sendBtn.textContent = 'Enviar al CLI'; }, 2000);
  }
}

function copiarJson(): void {
  const bundle = construirBundle();
  const json = JSON.stringify(bundle, null, 2);
  try {
    GM_setClipboard(json, 'text');
    if (copyBtn) copyBtn.textContent = 'Copiado ✓';
    setTimeout(() => { if (copyBtn) copyBtn.textContent = 'Copiar JSON'; }, 1500);
  } catch {}
}

function tieneCredenciales(): boolean {
  return !!(authorization && thumbcache && awsWafToken);
}

function actualizarInterfaz(): void {
  if (!panel || !statusEl || !sendBtn || !copyBtn) return;

  if (tieneCredenciales()) {
    statusEl.textContent = 'Listo para enviar';
    (statusEl as HTMLElement).style.color = '#22c55e';
    sendBtn.disabled = false;
    sendBtn.style.opacity = '1';
    sendBtn.style.cursor = 'pointer';
    copyBtn.style.display = 'inline-block';
  } else {
    statusEl.textContent = `Auth: ${hideToken(authorization)}`;
    (statusEl as HTMLElement).style.color = '#f59e0b';
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.5';
    sendBtn.style.cursor = 'not-allowed';
    copyBtn.style.display = 'none';
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
      min-width: 200px;
      border-radius: 12px;
      background: rgba(15, 15, 20, 0.97);
      border: 1px solid rgba(255,255,255,0.14);
      box-shadow: 0 10px 32px rgba(0,0,0,0.45);
      color: #fff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
    }
    #deepseek-session-panel h3 {
      margin: 0 0 10px 0;
      font-size: 14px;
      font-weight: 700;
      color: #a78bfa;
    }
    #deepseek-session-panel .ds-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      font-size: 12px;
    }
    #deepseek-session-panel .ds-status {
      font-weight: 600;
      margin-bottom: 10px;
    }
    #deepseek-session-panel .ds-btns {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    #deepseek-session-panel button {
      flex: 1;
      min-width: 90px;
      padding: 7px 10px;
      border: none;
      border-radius: 7px;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
    }
    #deepseek-session-panel .btn-send {
      background: #7c3aed;
      color: #fff;
    }
    #deepseek-session-panel .btn-copy {
      background: #374151;
      color: #fff;
    }
    #deepseek-session-panel .ds-note {
      margin-top: 10px;
      font-size: 11px;
      color: rgba(255,255,255,0.45);
      line-height: 1.4;
    }
  `, 'deepseek-session-panel-style');

  statusEl = document.createElement('div');
  statusEl.className = 'ds-status';

  sendBtn = document.createElement('button');
  sendBtn.className = 'btn-send';
  sendBtn.textContent = 'Enviar al CLI';
  sendBtn.disabled = true;
  sendBtn.style.opacity = '0.5';
  sendBtn.style.cursor = 'not-allowed';
  sendBtn.addEventListener('click', enviarAlBridge);

  copyBtn = document.createElement('button');
  copyBtn.className = 'btn-copy';
  copyBtn.textContent = 'Copiar JSON';
  copyBtn.style.display = 'none';
  copyBtn.addEventListener('click', copiarJson);

  const note = document.createElement('div');
  note.className = 'ds-note';
  note.textContent = 'ds_session_id debe ingresarse manualmente en la CLI (es HttpOnly).';

  panel.innerHTML = '<h3>🔑 DeepSeek Session</h3>';
  panel.append(statusEl);
  const btnsRow = document.createElement('div');
  btnsRow.className = 'ds-btns';
  panel.append(btnsRow);
  btnsRow.append(sendBtn, copyBtn);
  panel.append(note);
  document.body.appendChild(panel);

  actualizarInterfaz();
}

function iniciar(): void {
  leerCookies();
  leerLocalStorage();
  interceptarXMLHttpRequest();
  interceptarFetch();
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

  actualizarInterfaz();
}

boot();
