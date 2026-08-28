# Andres Userscripts

Monorepo para desarrollar varios userscripts con **Bun + Vite + vite-plugin-monkey**.

Incluye tu script actual del SRI como primer script:

```txt
scripts/sri-comprobantes/src/main.ts
```

La metadata de instalación ya no se edita dentro del archivo del script, sino en:

```txt
scripts.manifest.ts
```

## Instalar dependencias

```bash
bun install
```

## Habilitar hooks de Git

El repo trae un `pre-commit` en `.githooks/pre-commit`.

```bash
git config core.hooksPath .githooks
```

Ese hook ejecuta, en este orden:

- `bun run bump:userscripts`
- `bun run typecheck`
- `bun test`
- `bun run build:all`

## Ver scripts disponibles

```bash
bun run list
```

## Codemaps

- [AI Agent Guide](docs/AI-AGENT-GUIDE.md)
- [Architecture Map](docs/CODEMAPS/ARCHITECTURE.md)
- [Module Map](docs/CODEMAPS/MODULES.md)
- [File Map](docs/CODEMAPS/FILES.md)

## Scripts y comandos útiles

- `sri-comprobantes` - script del SRI para comprobantes sincronizados manual.
- `demo-current-site` - ejemplo mínimo para crear nuevos userscripts.
- `better-chatgpt-assistant` - asistente multifunción para ChatGPT web con virtualización, exportación y panel de control.
- `chatgpt-bulk-exporter` - selección y exportación secuencial de chats ChatGPT a un ZIP Markdown.
- `bump:userscripts` - actualiza las versiones de los userscripts antes del commit.

### Sincronización local de ChatGPT

En `chatgpt-bulk-exporter`, abre `Exportar chats` y usa `Elegir carpeta ChatGPT` para autorizar una carpeta local. El script guarda un Markdown por conversación y `manifest.json`; luego `Sincronizar ahora` solo procesa chats nuevos o modificados. Si la autorización continúa vigente, intenta sincronizar una vez al abrir ChatGPT. La función requiere un navegador con File System Access API (por ejemplo, Chrome/Edge); `Exportar ZIP` sigue disponible en cualquier navegador compatible con el userscript.

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
scripts.manifest.ts
vite.config.ts
```

O usa variables de entorno al compilar:

```bash
USERSCRIPTS_RAW_BASE="https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist" bun run build:all
```

## ChatGPT Bulk Exporter

Userscript independiente para seleccionar múltiples conversaciones desde el sidebar de ChatGPT y descargarlas secuencialmente como archivos Markdown dentro de un único ZIP. Usa la API same-origin de la sesión actual, conserva la rama activa y timestamps locales, y no envía datos a servidores externos.

Compilar:

```bash
bun run build:chatgpt-bulk-exporter
```

Salida: `dist/chatgpt-bulk-exporter.user.js` y `dist/chatgpt-bulk-exporter.meta.js`. Instala el `.user.js` en Tampermonkey mediante **Create a new script**, pegando el contenido generado o abriendo el archivo local.

## Agregar otro userscript

1. Crea una carpeta y un entrypoint:

```txt
scripts/mi-nuevo-script/src/main.ts
```

2. Agrega su entrada en `scripts.manifest.ts`:

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

3. Reutiliza helpers de `shared/` antes de crear nuevos módulos.

4. Agrega scripts opcionales en `package.json`:

```json
{
  "scripts": {
    "dev:mi-nuevo-script": "bun tools/vite.ts dev mi-nuevo-script",
    "build:mi-nuevo-script": "bun tools/vite.ts build mi-nuevo-script"
  }
}
```

## Estructura recomendada

```txt
scripts/
  sri-comprobantes/
    src/
      main.ts
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

## Guía para agentes de IA

Si vas a modificar o crear scripts, sigue este orden:

1. Lee `docs/AI-AGENT-GUIDE.md`.
2. Revisa el script más cercano en `scripts/<nombre>/src/main.ts`.
3. Busca helpers existentes en `shared/`.
4. Si la lógica cruza responsabilidades, separa `domain/`, `application/`, `infrastructure/` y `presentation/`.
5. Agrega tests en `tests/` para el comportamiento nuevo.
6. Ejecuta `bun run build:all` antes de pedir revisión.

## Siguiente refactor sugerido para el script SRI

Tu `main.ts` todavía conserva toda la lógica junta para no romper nada. Lo siguiente sería extraerlo así:

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
