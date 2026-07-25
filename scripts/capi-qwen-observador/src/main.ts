export type EstadoQwenCapi = 'esperando_turno'|'pensando'|'esperando_respuesta'|'respondiendo'|'completado'|'error'|'desconocido';
export interface EstadoQwenCapiV2 {
  version: 2; versionObservador: '1.1.5'; instanciaId: string; iniciadoEn: number; proveedor: 'qwen'; conversacionId: string|null; turnoId: string|null;
  estado: EstadoQwenCapi; generando: boolean; actualizadoEn: number; ultimoCambioRealEn: number;
  mutacionesTotales: number; cambiosRelevantes: number; firmaTurno: string|null; firmaEstado: string; disponible: true;
}
declare global { interface Window { __CAPI_QWEN_BRIDGE__?: EstadoQwenCapiV2; __CAPI_QWEN_OBSERVER_CONTROL__?: { versionObservador:string; detener:()=>void } } }

const selectoresTurno = [
  '[data-message-author-role="assistant"]',
  '[data-role="assistant"]',
  'article[data-testid*="assistant"]',
  '[class*="message"][class*="assistant"]',
  '[class*="assistant-message"]'
];
const selectoresAreaConversacion = [
  'main',
  '[class*="chat-content"]',
  '[class*="conversation"]',
  '[class*="message-list"]',
  '[class*="chat-list"]'
];
const visible=(e:Element)=>{const r=(e as HTMLElement).getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
const hash=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)};
export function conversacionActual(pathname=location.pathname):string|null { return pathname.match(/\/c\/([^/?#]+)/)?.[1]??null; }
export function ultimoTurnoAsistente(doc:Document=document):HTMLElement|null {
  const areas=selectoresAreaConversacion.flatMap(sel=>[...doc.querySelectorAll(sel)]).filter(visible);
  const raices=areas.length?areas:[doc.body];
  const vistos=new Set<Element>(); const candidatos:HTMLElement[]=[];
  for(const raiz of raices) for(const sel of selectoresTurno) for(const e of raiz.querySelectorAll(sel)) {
    if(vistos.has(e)||!visible(e)||e.closest('#sidebar,.sidebar,.session-list,.sidebar-wrapper')) continue;
    vistos.add(e); candidatos.push(e as HTMLElement);
  }
  return candidatos.at(-1)??null;
}
export function inspeccionarQwen(doc:Document=document, pathname=location.pathname, ahora=Date.now()):Omit<EstadoQwenCapiV2,'mutacionesTotales'|'cambiosRelevantes'|'ultimoCambioRealEn'> {
  const turno=ultimoTurnoAsistente(doc); const controles=[...doc.querySelectorAll<HTMLElement>('button,[role="button"]')];
  const generando=controles.some(b=>visible(b)&&/stop|detener|cancel generation/i.test(`${b.getAttribute('aria-label')??''} ${b.textContent??''}`));
  const texto=(turno?.innerText||turno?.textContent||'').trim();
  const toolbar=!!turno?.querySelector('button,[role="toolbar"],[data-testid*="copy"]');
  const error=!!turno?.querySelector('[role="alert"],[class*="error"]');
  const completado=/pensamiento completado/i.test(texto);
  const longitudBucket=Math.min(99,Math.floor(texto.length/200));
  const nodos=turno?.querySelectorAll('*').length??0;
  const turnoId=turno?.getAttribute('data-message-id')||turno?.id||turno?.getAttribute('data-id')||null;
  const firmaTurno=turno?hash(`${turnoId??'anon'}:${nodos}:${longitudBucket}:${toolbar?1:0}:${generando?1:0}`):null;
  const estado:EstadoQwenCapi=error?'error':generando?'pensando':!turno?'esperando_turno':toolbar?'completado':completado?'esperando_respuesta':texto?'respondiendo':'desconocido';
  return {version:2,versionObservador:'1.1.5',instanciaId:'pendiente',iniciadoEn:ahora,proveedor:'qwen',conversacionId:conversacionActual(pathname),turnoId,estado,generando,actualizadoEn:ahora,firmaTurno,firmaEstado:hash(`${estado}:${generando?1:0}:${firmaTurno??'none'}`),disponible:true};
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.__CAPI_QWEN_OBSERVER_CONTROL__?.detener();
  const iniciadoEn=Date.now();
  const instanciaId=`qwen-${iniciadoEn}-${Math.random().toString(36).slice(2,8)}`;
  const inicial=inspeccionarQwen(document,location.pathname,iniciadoEn);
  const estado:EstadoQwenCapiV2={...inicial,versionObservador:'1.1.5',instanciaId,iniciadoEn,ultimoCambioRealEn:iniciadoEn,mutacionesTotales:0,cambiosRelevantes:0};
  function publicarCompartido(){
    window.__CAPI_QWEN_BRIDGE__=estado;
    document.documentElement.dataset.capiQwenBridge=JSON.stringify(estado);
  }
  publicarCompartido();
  let temporizador:number|undefined; let intervalo:number|undefined; let observador:MutationObserver|undefined;
  function publicar(){const actual=inspeccionarQwen();estado.mutacionesTotales++;if(actual.firmaEstado!==estado.firmaEstado){estado.cambiosRelevantes++;estado.ultimoCambioRealEn=actual.actualizadoEn}Object.assign(estado,actual);publicarCompartido();window.dispatchEvent(new CustomEvent('capi:qwen-estado',{detail:{...estado}}));}
  function programar(){estado.mutacionesTotales++;if(temporizador)clearTimeout(temporizador);temporizador=window.setTimeout(publicar,300)}
  function detener(){if(temporizador)clearTimeout(temporizador);if(intervalo)clearInterval(intervalo);observador?.disconnect();}
  function iniciar(){observador=new MutationObserver(programar);observador.observe(document.documentElement,{subtree:true,childList:true,attributes:true});intervalo=window.setInterval(publicar,15_000);window.__CAPI_QWEN_OBSERVER_CONTROL__={versionObservador:'1.1.5',detener};publicar()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar,{once:true});else iniciar();
}
