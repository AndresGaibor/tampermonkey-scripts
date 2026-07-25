export const scripts = {
  'sri-comprobantes': {
    fileName: 'sri-comprobantes.user.js',
    entry: 'scripts/sri-comprobantes/src/main.ts',
    userscript: {
      name: 'SRI - Comprobantes sincronizados manual',
      namespace: 'https://github.com/AndresGaibor/userscripts',
      version: '2026.6.12.21',
      description:
        'Consulta API local, filtra meses, revisa TXT bajo demanda, pagina y descarga comprobantes recibidos en modo manual.',
      author: 'Andres',
      match: [
        'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/pages/consultas/recibidos/comprobantesRecibidos.jsf*',
      ],
      icon: 'https://www.google.com/s2/favicons?sz=64&domain=srienlinea.sri.gob.ec',
      grant: [
        'GM_xmlhttpRequest',
        'unsafeWindow',
        'GM_getValue',
        'GM_setValue',
      ],
      connect: ['localhost', '127.0.0.1'],
      'run-at': 'document-idle',
    },
  },

  'deuna-outlook': {
    fileName: 'deuna-outlook.user.js',
    entry: 'scripts/deuna-outlook/src/main.ts',
    userscript: {
      name: 'Deuna Outlook → SriCache',
      namespace: 'https://github.com/AndresGaibor/userscripts',
      version: '1.0.18',
      description: 'Extrae recargas Deuna desde Outlook Web y las envía a SriCache',
      author: 'SriCache',
      match: [
        'https://outlook.live.com/*',
        'https://outlook.office.com/*',
      ],
      icon: 'https://www.google.com/s2/favicons?sz=64&domain=outlook.live.com',
      grant: [
        'GM_xmlhttpRequest',
        'GM_getValue',
        'GM_setValue',
      ],
      connect: [
        'localhost',
        '127.0.0.1',
        '192.168.*',
      ],
      'run-at': 'document-idle',
    },
  },

  'demo-current-site': {
    fileName: 'demo-current-site.user.js',
    entry: 'scripts/demo-current-site/src/main.ts',
    userscript: {
      name: 'Demo - Current Site Helper',
      namespace: 'https://github.com/AndresGaibor/userscripts',
      version: '0.1.11',
      description: 'Script mínimo de ejemplo para crear nuevos userscripts desde este monorepo.',
      author: 'Andres',
      match: ['https://example.com/*'],
      grant: ['GM_addStyle', 'GM_getValue', 'GM_setValue', 'GM_registerMenuCommand'],
      'run-at': 'document-idle',
    },
  },

  'capi-qwen-observador': {
    fileName: 'capi-qwen-observador.user.js',
    entry: 'scripts/capi-qwen-observador/src/main.ts',
    userscript: {
      name: 'CAPI - Qwen Observer',
      namespace: 'https://github.com/AndresGaibor/userscripts',
      version: '1.0.1',
      description: 'Publica telemetría local saneada del estado de Qwen para CAPI sin capturar prompts, respuestas, cookies ni tokens.',
      author: 'Andres',
      match: ['https://chat.qwen.ai/*'],
      grant: [],
      'run-at': 'document-start',
    },
  },

  'deepseek-session-relay': {
    fileName: 'deepseek-session-relay.user.js',
    entry: 'scripts/deepseek-session-relay/src/main.ts',
    userscript: {
      name: 'DeepSeek - Session Relay + Stream Catcher',
      namespace: 'https://github.com/AndresGaibor/userscripts',
      version: '0.2.5',
      description: 'Captura Authorization y cookies de DeepSeek Chat y las envía al bridge local de capi. También intercepta el stream SSE para streaming en consola.',
      author: 'Andres',
      match: ['https://chat.deepseek.com/*'],
      grant: ['GM_xmlhttpRequest', 'GM_getValue', 'GM_setValue', 'GM_registerMenuCommand'],
      connect: ['localhost', '127.0.0.1'],
      'run-at': 'document-start',
    },
  },

  'better-chatgpt-assistant': {
    fileName: 'better-chatgpt-assistant.user.js',
    entry: 'scripts/better-chatgpt-assistant/src/main.ts',
    userscript: {
      name: 'Better ChatGPT Assistant (asistente multifunción mejorado para ChatGPT web)',
      namespace: 'https://github.com/3150214587/chatgpt-virtual-scrollGPT-',
      version: '8.2.3.16',
      description:
        'Better ChatGPT Assistant con Virtual Scroll Engine 6.0: chats largos ultra fluidos, exportación, monitor de tokens, i18n y más.',
      homepageURL: 'https://github.com/3150214587/chatgpt-virtual-scrollGPT-',
      supportURL: 'https://github.com/3150214587/chatgpt-virtual-scrollGPT-/issues',
      author: '3150214587',
      license: 'MIT',
      icon: 'https://www.google.com/s2/favicons?sz=64&domain=chatgpt.com',
      match: ['https://chat.openai.com/*', 'https://chatgpt.com/*'],
      grant: [],
      $extra: {
        'description:es':
          'Asistente multifunción estable para ChatGPT: virtualización de conversaciones largas + indicador superior minimalista (verde/amarillo/rojo) + panel con 3 modos / pausa / optimización forzada / nueva conversación / ayuda + atenuación al escribir + Ctrl+F + resize + exportación Markdown (UTF-8 BOM) + plegado de código + estimación de tokens + cambio ES/EN',
      },
      'run-at': 'document-idle',
    },
  },
};

export function getScript(name) {
  return scripts[name] ?? null;
}

export function getScriptNames() {
  return Object.keys(scripts);
}
