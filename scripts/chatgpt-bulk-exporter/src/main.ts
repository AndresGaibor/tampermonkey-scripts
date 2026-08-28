import { mountSidebar } from './presentation/sidebar.ts';
import { styles } from './presentation/styles.ts';

function start(): void {
  const style = document.createElement('style'); style.dataset.cbeStyles = 'true'; style.textContent = styles; document.head.append(style);
  let scheduled = false; let sidebarObserver: MutationObserver | null = null; let observedAside: Element | null = null;
  const refresh = () => { scheduled = false; mountSidebar(); const aside = document.querySelector('aside'); if (aside !== observedAside) { sidebarObserver?.disconnect(); observedAside = aside; if (aside) { sidebarObserver = new MutationObserver(schedule); sidebarObserver.observe(aside, { childList: true, subtree: true }); } } };
  const schedule = () => { if (!scheduled) { scheduled = true; queueMicrotask(refresh); } };
  const bodyObserver = new MutationObserver(schedule);
  bodyObserver.observe(document.body, { childList: true });
  refresh();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
