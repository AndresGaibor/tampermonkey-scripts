export type Language = 'zh' | 'en';

const MEM_STABLE_MB = 220;
const MEM_WARNING_MB = 520;
const DOM_OK = 7000;
const DOM_WARN = 15000;

export function memoryLevel(usedMB: number | null, lang: Language) {
  if (usedMB == null) return { label: lang === 'zh' ? 'No disponible' : 'N/A', level: 'na' as const };
  if (usedMB < MEM_STABLE_MB) return { label: `${usedMB.toFixed(0)}MB${lang === 'zh' ? ' (estable y fluido)' : ' (OK)'}`, level: 'ok' as const };
  if (usedMB < MEM_WARNING_MB) return { label: `${usedMB.toFixed(0)}MB${lang === 'zh' ? ' (alto, puede ir lento)' : ' (High)'}`, level: 'warn' as const };
  return { label: `${usedMB.toFixed(0)}MB${lang === 'zh' ? ' (riesgo de bloqueo)' : ' (Warn)'}`, level: 'bad' as const };
}

export function domLevel(domNodes: number) {
  if (domNodes < DOM_OK) return { label: `${domNodes}`, level: 'ok' as const };
  if (domNodes < DOM_WARN) return { label: `${domNodes}`, level: 'warn' as const };
  return { label: `${domNodes}`, level: 'bad' as const };
}

export function estimateRemainingTurns(usedMB: number | null, turns: number) {
  if (usedMB == null || !turns || turns < 12) return null;
  const avg = usedMB / turns;
  if (!isFinite(avg) || avg <= 0) return null;
  const headroom = MEM_WARNING_MB - usedMB;
  return Math.max(0, Math.min(9999, Math.floor(headroom / avg)));
}

export function modeLabel(mode: 'performance' | 'balanced' | 'conservative', lang: Language) {
  if (lang === 'en') return mode;
  if (mode === 'conservative') return 'Conservador c';
  if (mode === 'balanced') return 'Equilibrado b';
  return 'Rendimiento a';
}

export function suggestionText(input: {
  virtualizationEnabled: boolean;
  ctrlFFreeze: boolean;
  domNodes: number;
  usedMB: number | null;
  virtCount: number;
  turns: number;
  lang: Language;
}) {
  const mem = memoryLevel(input.usedMB, input.lang).level;
  const dom = domLevel(input.domNodes).level;

  if (!input.virtualizationEnabled) {
    return input.lang === 'zh'
      ? 'Consejo: la virtualización está pausada. El historial completo queda visible, pero los chats largos pueden ponerse lentos. Actívala cuando necesites fluidez.'
      : 'Tip: Virtualization is paused. Full history is visible, but long chats may lag. Enable it for smooth scrolling.';
  }

  if (input.ctrlFFreeze) {
    return input.lang === 'zh'
      ? 'Consejo: estás usando la búsqueda del navegador (Ctrl+F). La virtualización se pausó para permitir buscar en todo el historial. Se restaurará automáticamente al salir de la búsqueda.'
      : 'Tip: Browser Find (Ctrl+F) is active. Virtualization is paused so you can search all history. It will resume after you exit Find.';
  }

  if (mem === 'bad' || dom === 'bad') {
    return input.lang === 'zh'
      ? 'Consejo: la página entró en zona de lentitud. Pulsa “Optimizar ahora” para reducir la carga; exporta o respalda el contenido importante antes de refrescar o abrir una nueva conversación.'
      : 'Tip: Near lag zone. Click “Optimize Now” to reduce load. Export/backup important content before refreshing or starting a new chat.';
  }
  if (mem === 'warn' || dom === 'warn') {
    return input.lang === 'zh'
      ? 'Consejo: la carga está alta, pero puedes seguir conversando. Evita desplazarte mucho por el historial de una sola vez; para revisar contenido antiguo puedes cambiar temporalmente a “Conservador”.'
      : 'Tip: Load is higher but still OK. Avoid long scroll sessions. Switch to “Conservative” when browsing old history.';
  }
  if (input.virtCount > 0 && input.turns > 220) {
    return input.lang === 'zh'
      ? 'Consejo: el estado es bueno. Para buscar contenido antiguo, usa la búsqueda o exporta el chat; evita bajar repetidamente hasta el final.'
      : 'Tip: Healthy. Use search or export to view old history, instead of repeatedly scrolling to the bottom.';
  }
  return input.lang === 'zh' ? 'Consejo: el estado es bueno.' : 'Tip: Healthy.';
}
