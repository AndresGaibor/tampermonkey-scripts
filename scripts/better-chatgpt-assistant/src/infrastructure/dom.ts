export function getMessageNodes(): HTMLElement[] {
  let nodes = document.querySelectorAll('div[data-message-id]');
  if (nodes && nodes.length) return Array.from(nodes) as HTMLElement[];

  nodes = document.querySelectorAll('[data-testid="conversation-turn"]');
  if (nodes && nodes.length) return Array.from(nodes) as HTMLElement[];

  const main = document.querySelector('main');
  if (!main) return [];
  nodes = main.querySelectorAll('div[role="presentation"]');
  return nodes && nodes.length ? (Array.from(nodes) as HTMLElement[]) : [];
}

export function findModelButton() {
  const header = document.querySelector('header');
  if (!header) return null;

  const btns = header.querySelectorAll('button, [role="button"]');
  const candidates: HTMLElement[] = [];
  for (const b of btns) {
    const txt = ((b.innerText || b.textContent || '')).trim();
    if (!txt) continue;

    const hit = /chatgpt/i.test(txt) || /\bgpt\b/i.test(txt) || txt.includes('modelo') || txt.includes('cambiar') || txt.includes('ChatGPT');
    if (hit) candidates.push(b as HTMLElement);
  }

  if (!candidates.length) return null;
  let best = candidates[0];
  let bestScore = Infinity;
  for (const c of candidates) {
    const r = c.getBoundingClientRect();
    const score = (r.top * 10) + r.left;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export function tryClickNewChat() {
  const candidates = document.querySelectorAll('a, button, [role="button"]');
  for (const el of candidates) {
    const tx = ((el.innerText || el.textContent || '')).trim();
    if (!tx) continue;
    if (tx === 'Nuevo chat' || tx === 'New chat' || tx.includes('Nueva conversación') || tx.includes('New chat') || tx.includes('Nueva charla')) {
      try {
        (el as HTMLElement).click();
        return true;
      } catch {}
    }
  }
  return false;
}

export function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}

export function exportChatMarkdown() {
  let md = '# ChatGPT Chat Log\n\n';
  const nodes = getMessageNodes();
  for (const m of nodes) {
    const chunk = (m.innerText || '').trim();
    if (chunk) md += chunk + '\n\n---\n\n';
  }

  const bom = '\uFEFF';
  const blob = new Blob([bom + md], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'chatgpt-chat.md';
  a.click();
}

export function toggleCode() {
  const preElements = document.querySelectorAll('pre');
  const anyVisible = Array.from(preElements).some(p => p.style.display !== 'none');
  const hide = anyVisible;

  for (const p of preElements) {
    p.style.display = hide ? 'none' : '';
  }

  return !hide;
}

export function getUsedHeapMB(): number | null {
  const p = window.performance;
  if (!p || !(p as any).memory || !(p as any).memory.usedJSHeapSize) return null;
  return (p as any).memory.usedJSHeapSize / (1024 * 1024);
}
