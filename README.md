# Andres Userscripts

Monorepo para desarrollar varios userscripts con **Bun + Vite + vite-plugin-monkey**.

Incluye tu script actual del SRI como primer script:

```txt
scripts/sri-comprobantes/src/main.js
```

La metadata de instalación ya no se edita dentro del archivo del script, sino en:

```txt
scripts.manifest.mjs
```

## Instalar dependencias

```bash
bun install
```

## Ver scripts disponibles

```bash
bun run list
```

## Desarrollar el script del SRI

```bash
bun run dev:sri
```

Vite abrirá una URL `.user.js` de desarrollo para instalarla en Tampermonkey o Violentmonkey.

## Compilar solo SRI

```bash
bun run build:sri
```

Salida esperada:

```txt
dist/sri-comprobantes.user.js
dist/sri-comprobantes.meta.js
```

## Compilar todos los scripts

```bash
bun run build:all
```

## Publicar en GitHub

Sube el repo y publica la carpeta `dist/`.

URL instalable ejemplo:

```txt
https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/sri-comprobantes.user.js
```

Antes de publicar, cambia el nombre del repo o la cuenta en:

```txt
scripts.manifest.mjs
vite.config.mjs
```

O usa variables de entorno al compilar:

```bash
USERSCRIPTS_RAW_BASE="https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist" bun run build:all
```

## Agregar otro userscript

1. Crea una carpeta:

```txt
scripts/mi-nuevo-script/src/main.ts
```

2. Agrega su entrada en `scripts.manifest.mjs`:

```js
'mi-nuevo-script': {
  fileName: 'mi-nuevo-script.user.js',
  entry: 'scripts/mi-nuevo-script/src/main.ts',
  userscript: {
    name: 'Mi Nuevo Script',
    namespace: 'https://github.com/AndresGaibor/userscripts',
    version: '0.1.0',
    description: 'Descripción del script',
    author: 'Andres',
    match: ['https://sitio.com/*'],
    grant: ['GM_addStyle'],
    'run-at': 'document-idle',
  },
},
```

3. Agrega scripts opcionales en `package.json`:

```json
{
  "scripts": {
    "dev:mi-nuevo-script": "bun tools/vite.mjs dev mi-nuevo-script",
    "build:mi-nuevo-script": "bun tools/vite.mjs build mi-nuevo-script"
  }
}
```

## Estructura recomendada

```txt
scripts/
  sri-comprobantes/
    src/
      main.js
  demo-current-site/
    src/
      main.ts
shared/
  dom.ts
  http.ts
  storage.ts
  style.ts
dist/
  *.user.js
```

## Siguiente refactor sugerido para el script SRI

Tu `main.js` todavía conserva toda la lógica junta para no romper nada. Lo siguiente sería extraerlo así:

```txt
scripts/sri-comprobantes/src/
  main.ts
  config.ts
  state.ts
  api/
    sri-api.ts
  dom/
    sri-selectors.ts
    table.ts
    months.ts
  features/
    dashboard.ts
    invoice-status.ts
    batch-download.ts
    txt-report.ts
  styles/
    dashboard.css
```

Primero verifica que el build actual funcione. Luego conviene refactorizar por partes.
