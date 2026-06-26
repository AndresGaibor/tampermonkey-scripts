export const scripts = {
  'sri-comprobantes': {
    fileName: 'sri-comprobantes.user.js',
    entry: 'scripts/sri-comprobantes/src/main.js',
    userscript: {
      name: 'SRI - Comprobantes sincronizados manual',
      namespace: 'https://github.com/AndresGaibor/userscripts',
      version: '2026.6.12.9',
      description:
        'Consulta API local, filtra meses, revisa TXT bajo demanda, pagina y descarga comprobantes recibidos en modo manual.',
      author: 'Andres',
      match: [
        'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/pages/consultas/recibidos/comprobantesRecibidos.jsf*',
      ],
      icon: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
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

  'demo-current-site': {
    fileName: 'demo-current-site.user.js',
    entry: 'scripts/demo-current-site/src/main.ts',
    userscript: {
      name: 'Demo - Current Site Helper',
      namespace: 'https://github.com/AndresGaibor/userscripts',
      version: '0.1.0',
      description: 'Script mínimo de ejemplo para crear nuevos userscripts desde este monorepo.',
      author: 'Andres',
      match: ['https://example.com/*'],
      grant: ['GM_addStyle', 'GM_getValue', 'GM_setValue', 'GM_registerMenuCommand'],
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
