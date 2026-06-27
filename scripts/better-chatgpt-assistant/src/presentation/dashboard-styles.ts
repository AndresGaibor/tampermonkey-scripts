import { STYLE_ID } from '../shared/constants.ts';

export function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #cgpt-vs-root{position:fixed;z-index:2147483647;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Apple Color Emoji","Segoe UI Emoji";user-select:none;-webkit-user-select:none;transform:translateZ(0);opacity:1;transition:opacity 160ms ease;}
    #cgpt-vs-root.dim{opacity:0.2} #cgpt-vs-root.fallback{filter:saturate(1.02)}
    #cgpt-vs-btn{display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 10px;border-radius:999px;border:1px solid rgba(0,0,0,0.12);background:rgba(255,255,255,0.78);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 6px 18px rgba(0,0,0,0.10);cursor:pointer;font-size:12px;color:rgba(0,0,0,0.78)}
    #cgpt-vs-btn:hover{background:rgba(255,255,255,0.92)} #cgpt-vs-root.minimal #cgpt-vs-miniText{display:none}
    #cgpt-vs-miniText{max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0.9}
    #cgpt-vs-dot{width:9px;height:9px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,0.16);transition:transform 140ms ease}
    #cgpt-vs-dot.warn{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,0.16)} #cgpt-vs-dot.bad{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,0.16)} #cgpt-vs-dot.off{background:rgba(0,0,0,0.28);box-shadow:0 0 0 3px rgba(0,0,0,0.08)}
    #cgpt-vs-panel{margin-top:8px;width:360px;max-width:min(420px, calc(100vw - 16px));padding:12px;border-radius:16px;border:1px solid rgba(0,0,0,0.12);background:rgba(255,255,255,0.86);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 14px 40px rgba(0,0,0,0.16);display:none;color:rgba(0,0,0,0.86);font-size:12px;line-height:1.5}
    #cgpt-vs-root.open #cgpt-vs-panel{display:block} .cgpt-vs-toprow{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
    .cgpt-vs-seg{display:flex;align-items:center;width:100%;padding:3px;border-radius:999px;background:rgba(0,0,0,0.06);border:1px solid rgba(0,0,0,0.08);box-shadow:inset 0 1px 0 rgba(255,255,255,0.7)}
    .cgpt-vs-seg button{flex:1;height:28px;border:0;background:transparent;border-radius:999px;cursor:pointer;font-size:12px;color:rgba(0,0,0,0.62);transition:background 140ms ease, box-shadow 140ms ease, color 140ms ease}
    .cgpt-vs-seg button.active{background:rgba(255,255,255,0.92);color:rgba(0,0,0,0.86);box-shadow:0 8px 18px rgba(0,0,0,0.10)}
    .cgpt-vs-controls{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;flex-wrap:wrap} .cgpt-vs-chiprow{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .cgpt-vs-chip{height:28px;padding:0 10px;border-radius:999px;border:1px solid rgba(0,0,0,0.12);background:rgba(255,255,255,0.88);cursor:pointer;font-size:12px;color:rgba(0,0,0,0.78);box-shadow:0 6px 14px rgba(0,0,0,0.08)}
    .cgpt-vs-chip:hover{background:rgba(255,255,255,0.96)} .cgpt-vs-chip.primary{border-color:rgba(0,0,0,0.14);font-weight:600}
    .cgpt-vs-row{display:flex;justify-content:space-between;gap:12px;padding:4px 0} .cgpt-vs-k{color:rgba(0,0,0,0.56)} .cgpt-vs-v{font-variant-numeric:tabular-nums}
    .mem-ok{color:#16a34a;font-weight:600} .mem-warn{color:#d97706;font-weight:600} .mem-bad{color:#dc2626;font-weight:700}
    .cgpt-vs-hr{height:1px;background:rgba(0,0,0,0.08);margin:10px 0 8px} .cgpt-vs-tip{color:rgba(0,0,0,0.74)}
    .cgpt-vs-about{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:8px 2px 2px;flex-wrap:wrap} .cgpt-vs-aboutLeft{min-width:0} .cgpt-vs-aboutTitle{font-weight:800;letter-spacing:0.1px} .cgpt-vs-aboutSub{margin-top:3px;color:rgba(0,0,0,0.62);font-size:11px} .cgpt-vs-aboutLinks{margin-top:6px;display:flex;gap:10px;flex-wrap:wrap;align-items:center} .cgpt-vs-link{color:rgba(37,99,235,0.95);text-decoration:none;font-weight:600;font-size:12px} .cgpt-vs-link:hover{text-decoration:underline} .cgpt-vs-supportHint{margin-top:6px;color:rgba(0,0,0,0.66);font-size:11px}
    #cgpt-vs-featurepack{margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;width:100%} #cgpt-vs-featurepack .fp-left{display:flex;gap:6px;flex-wrap:wrap;align-items:center} #cgpt-vs-featurepack .fp-right{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;align-items:center} #cgpt-vs-featurepack .fp-token{font-size:12px;color:rgba(0,0,0,0.66);padding:0 2px}
    #cgpt-vs-help{position:fixed;inset:0;background:rgba(0,0,0,0.30);display:none;align-items:center;justify-content:center;z-index:2147483647} #cgpt-vs-help.show{display:flex}
    .cgpt-vs-helpCard{width:min(720px, calc(100vw - 20px));max-height:min(78vh, 680px);overflow:auto;padding:16px 16px;border-radius:18px;border:1px solid rgba(0,0,0,0.14);background:rgba(255,255,255,0.92);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 18px 60px rgba(0,0,0,0.24);color:rgba(0,0,0,0.86);line-height:1.55}
    .cgpt-vs-helpTitle{font-size:14px;font-weight:800;margin-bottom:8px} .cgpt-vs-helpClose{position:sticky;top:0;float:right;height:30px;padding:0 12px;border-radius:999px;border:1px solid rgba(0,0,0,0.14);background:rgba(255,255,255,0.94);cursor:pointer}
    #cgpt-vs-root.pinned #cgpt-vs-btn{cursor:grab} #cgpt-vs-root.pinned.dragging #cgpt-vs-btn{cursor:grabbing;box-shadow:0 18px 44px rgba(0,0,0,0.24)} #cgpt-vs-root.pinned.hiddenLeft{transform:translateX(-62%)} #cgpt-vs-root.pinned.hiddenRight{transform:translateX(62%)} #cgpt-vs-root.pinned.hiddenLeft:hover, #cgpt-vs-root.pinned.hiddenRight:hover{transform:translateX(0)} #cgpt-vs-root.open.hiddenLeft, #cgpt-vs-root.open.hiddenRight{transform:translateX(0)}
  `;
  document.documentElement.appendChild(style);
}
