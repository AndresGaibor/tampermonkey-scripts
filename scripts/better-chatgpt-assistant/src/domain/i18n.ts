import type { Language } from '../shared/state.ts';
import { LANG_KEY } from '../shared/constants.ts';

const I18N: Record<string, Record<string, string>> = {
  zh: {
    export: 'Exportar historial del chat',
    fold: 'Contraer/mostrar código',
    token: 'Estimación de tokens',
    lang: 'EN',
    optimize: 'Optimizar ahora',
    optimizeTip: 'Reduce ahora la carga de la página sin afectar el contenido del chat',
    newChat: 'Nueva conversación',
    help: 'Ayuda',
    health: 'Saludable',
  },
  en: {
    export: 'Export Chat Log',
    fold: 'Fold Code',
    token: 'Token Estimate',
    lang: 'Español',
    optimize: 'Optimize Now',
    optimizeTip: 'Reduce page load now, chat content stays safe',
    newChat: 'New chat',
    help: 'Help',
    health: 'Healthy',
  },
};

export function getLanguage(): Language {
  return (localStorage.getItem(LANG_KEY) as Language) || 'zh';
}

export function setLanguage(lang: Language) {
  localStorage.setItem(LANG_KEY, lang);
}

export function t(lang: Language, key: string): string {
  return (I18N[lang] && I18N[lang][key]) ? I18N[lang][key] : key;
}

export function toggleLanguage(current: Language): Language {
  return current === 'zh' ? 'en' : 'zh';
}
