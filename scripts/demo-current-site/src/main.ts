import { normalizeText } from '../../../shared/dom';
import { injectCss } from '../../../shared/style';
import { getStoredValue, setStoredValue } from '../../../shared/storage';
import './style.css?inline';

const enabledKey = 'demo-current-site:enabled';

function main() {
  const enabled = getStoredValue(enabledKey, true);

  GM_registerMenuCommand(enabled ? 'Desactivar demo' : 'Activar demo', () => {
    setStoredValue(enabledKey, !enabled);
    location.reload();
  });

  if (!enabled) return;

  injectCss(`
    #ag-userscript-demo {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 999999;
      padding: 10px 12px;
      border-radius: 10px;
      background: #111827;
      color: #fff;
      font-family: Arial, sans-serif;
      font-size: 13px;
      box-shadow: 0 4px 18px rgba(0, 0, 0, .25);
    }
  `, 'ag-userscript-demo-style');

  const box = document.createElement('div');
  box.id = 'ag-userscript-demo';
  box.textContent = `Userscript activo: ${normalizeText(document.title) || location.hostname}`;
  document.body.appendChild(box);
}

main();
