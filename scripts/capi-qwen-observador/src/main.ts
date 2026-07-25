export {};

type EstadoQwenCapi = {
  version: 1;
  estado: 'desconocido' | 'pensando' | 'esperando_respuesta' | 'esperando_turno';
  generando: boolean;
  actualizadoEn: number;
  turnoId: string | null;
  mutaciones: number;
};

declare global {
  interface Window {
    __CAPI_QWEN_BRIDGE__?: EstadoQwenCapi;
  }
}

const estado: EstadoQwenCapi = {
  version: 1,
  estado: 'desconocido',
  generando: false,
  actualizadoEn: Date.now(),
  turnoId: null,
  mutaciones: 0,
};

window.__CAPI_QWEN_BRIDGE__ = estado;

function actualizarEstado(): void {
  const texto = document.body?.innerText ?? '';
  const botones = [...document.querySelectorAll<HTMLElement>('button,[role="button"]')];
  const generando = botones.some((boton) =>
    /stop|detener/i.test(`${boton.getAttribute('aria-label') ?? ''} ${boton.textContent ?? ''}`),
  );
  const pensamientoCompletado = /pensamiento completado/i.test(texto);

  estado.generando = generando;
  estado.estado = generando
    ? 'pensando'
    : pensamientoCompletado
      ? 'esperando_respuesta'
      : 'esperando_turno';
  estado.actualizadoEn = Date.now();
  estado.mutaciones += 1;

  window.dispatchEvent(new CustomEvent('capi:qwen-estado', { detail: { ...estado } }));
}

function iniciarObservador(): void {
  const raiz = document.documentElement;
  if (raiz) {
    new MutationObserver(actualizarEstado).observe(raiz, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  }
  window.setInterval(actualizarEstado, 15_000);
  actualizarEstado();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarObservador, { once: true });
} else {
  iniciarObservador();
}
