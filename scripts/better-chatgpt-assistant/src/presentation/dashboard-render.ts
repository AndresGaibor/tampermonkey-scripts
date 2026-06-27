import { state } from '../shared/state.ts';
import { injectStyles } from './dashboard-styles.ts';
import { t } from '../domain/i18n.ts';
import { ROOT_ID, BTN_ID, DOT_ID, PANEL_ID, HELP_ID, FP_ID } from '../shared/constants.ts';

export function ensureRoot() {
  injectStyles();
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = `
    <div id="${BTN_ID}" role="button" tabindex="0" aria-label="ChatGPT Virtual Scroll Engine">
      <span id="${DOT_ID}"></span>
      <span id="cgpt-vs-miniText">${t(state.lang, 'health')}</span>
    </div>

    <div id="${PANEL_ID}">
      <div class="cgpt-vs-toprow">
        <div style="flex:1">
          <div class="cgpt-vs-seg" aria-label="virtualization mode">
            <button type="button" data-mode="performance">${state.lang === 'zh' ? 'Rendimiento 1' : 'Performance'}</button>
            <button type="button" data-mode="balanced">${state.lang === 'zh' ? 'Equilibrado2' : 'Balanced'}</button>
            <button type="button" data-mode="conservative">${state.lang === 'zh' ? 'Conservador 3' : 'Conservative'}</button>
          </div>
        </div>
      </div>
      <div class="cgpt-vs-controls">
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button class="cgpt-vs-chip primary" id="cgpt-vs-toggle">--</button>
          <button class="cgpt-vs-chip" id="cgpt-vs-minimal">--</button>
        </div>
        <div class="cgpt-vs-chiprow"><button class="cgpt-vs-chip" id="cgpt-vs-pin">📌</button><button class="cgpt-vs-chip" id="cgpt-vs-helpBtn">?</button></div>
      </div>
      <div class="cgpt-vs-hr"></div>
      <div class="cgpt-vs-row"><span class="cgpt-vs-k">${state.lang === 'zh' ? 'Modo actual' : 'Mode'}</span><span class="cgpt-vs-v" data-k="mode">--</span></div>
      <div class="cgpt-vs-row"><span class="cgpt-vs-k">DOM</span><span class="cgpt-vs-v" data-k="dom">--</span></div>
      <div class="cgpt-vs-row"><span class="cgpt-vs-k">${state.lang === 'zh' ? 'Memoria (heap JS)' : 'Memory (JS Heap)'}</span><span class="cgpt-vs-v" data-k="mem">--</span></div>
      <div class="cgpt-vs-row"><span class="cgpt-vs-k">${state.lang === 'zh' ? 'Virtualización' : 'Virtualization'}</span><span class="cgpt-vs-v" data-k="virt">--</span></div>
      <div class="cgpt-vs-row"><span class="cgpt-vs-k">${state.lang === 'zh' ? 'Turnos del chat' : 'Turns'}</span><span class="cgpt-vs-v" data-k="turns">--</span></div>
      <div class="cgpt-vs-row"><span class="cgpt-vs-k">${state.lang === 'zh' ? 'Restante estimado' : 'Estimated remaining'}</span><span class="cgpt-vs-v" data-k="remain">--</span></div>
      <div class="cgpt-vs-hr"></div>
      <div class="cgpt-vs-controls" style="margin-top:8px;"><button class="cgpt-vs-chip" id="cgpt-vs-forceClean" title="${t(state.lang, 'optimizeTip')}">${t(state.lang, 'optimize')}</button><button class="cgpt-vs-chip" id="cgpt-vs-newChat">${t(state.lang, 'newChat')}</button></div>
      <div class="cgpt-vs-hr"></div><div class="cgpt-vs-tip" data-k="tip">--</div><div class="cgpt-vs-hr"></div><div id="${FP_ID}"></div>
    </div>
  `;

  const help = document.createElement('div');
  help.id = HELP_ID;
  help.innerHTML = `
    <div class="cgpt-vs-helpCard" role="dialog" aria-label="Help">
      <button class="cgpt-vs-helpClose" id="cgpt-vs-helpClose">${state.lang === 'zh' ? 'Cerrar' : 'Close'}</button>
      <div class="cgpt-vs-helpTitle">${state.lang === 'zh' ? 'Panel acelerador para conversaciones largas (guía simple)' : 'Long Chat Accelerator (Quick Guide)'}</div>
      <div style="margin:8px 0 10px;"><b>${state.lang === 'zh' ? '¿Qué significa el punto verde/amarillo/rojo?' : 'What is the green/yellow/red dot?'}</b><br/>${state.lang === 'zh' ? 'Es el indicador de salud de la página: verde = buen estado; amarillo = carga alta; rojo = cerca de la zona de lentitud.' : 'It indicates page health: green=good, yellow=high load, red=near lag.'}</div>
      <div style="margin:10px 0;"><b>${state.lang === 'zh' ? '¿Cómo elegir los tres modos?' : 'How to choose modes?'}</b><br/>${state.lang === 'zh' ? 'Rendimiento = menor consumo y máxima optimización, útil para conversaciones antiguas; Equilibrado = recomendado para uso diario; Conservador = conserva más historial pero consume más recursos, útil en conversaciones nuevas.' : 'Performance=lowest resource; Balanced=recommended; Conservative=keeps more history but uses more resources.'}</div>
      <div style="margin:10px 0;"><b>${state.lang === 'zh' ? '¿Cuál es la diferencia entre pausar y activar?' : 'Pause vs Enable?'}</b><br/>${state.lang === 'zh' ? 'Activado pliega el historial fuera de pantalla en marcadores para reducir carga; pausado muestra todo el contenido, pero puede volverse más lento.' : 'Enable folds off-screen history to reduce load; Pause shows full history but may lag.'}</div>
      <div style="margin:10px 0;"><b>${state.lang === 'zh' ? '¿"Optimizar ahora" borra contenido?' : 'Does "Optimize Now" delete content?'}</b><br/>${state.lang === 'zh' ? 'No. Solo pliega el historial más lejano para aligerar la página; al desplazarte hacia esa zona se restaura automáticamente.' : 'No. It only folds far history to reduce load; scrolling there restores it automatically.'}</div>
      <div style="margin:10px 0;"><b>${state.lang === 'zh' ? '¿Por qué Ctrl+F puede ponerse más lento?' : 'Why Find (Ctrl+F) can be slower?'}</b><br/>${state.lang === 'zh' ? 'Para que puedas buscar en todo el historial, el script restaura temporalmente el contenido completo; al presionar Esc se reactiva la optimización.' : 'To let you search all history, the script temporarily restores full content; press Esc to resume acceleration.'}</div>
      <div style="margin:10px 0;"><b>${state.lang === 'zh' ? 'Privacidad y declaración' : 'Privacy'}</b><br/>${state.lang === 'zh' ? 'Este script no sube el contenido de tus conversaciones. Toda la lógica se ejecuta localmente en el navegador.' : 'This script does not upload your chat. Everything runs locally in your browser.'}</div>
    </div>
  `;

  document.body.appendChild(root);
  document.body.appendChild(help);

  root.classList.toggle('minimal', state.minimalMode);
  root.classList.toggle('open', !!state.wasOpen);

  return root;
}
