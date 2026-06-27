# AI Agent Guide

Guía rápida para que agentes de IA naveguen este repo, reutilicen código y creen nuevos userscripts sin romper el pipeline.

## Empieza aquí

1. `README.md`
2. `docs/CODEMAPS/INDEX.md`
3. `scripts.manifest.ts`
4. `tools/vite.ts`
5. `tools/build-all.ts`

## Reglas de navegación

- La fuente de verdad de cada userscript está en `scripts.manifest.ts`.
- El código reusable vive en `shared/`.
- La lógica específica de cada script vive en `scripts/<name>/src/`.
- `dist/` es generado; no se edita a mano.
- Los hooks de Git automatizan versión + validación antes de commit.

## Cómo crear un userscript nuevo

### 1. Crear la carpeta base

```txt
scripts/mi-script/src/main.ts
```

### 2. Registrar el script

Agrega una entrada en `scripts.manifest.ts`:

```ts
'mi-script': {
  fileName: 'mi-script.user.js',
  entry: 'scripts/mi-script/src/main.ts',
  userscript: {
    name: 'Mi Script',
    namespace: 'https://github.com/AndresGaibor/userscripts',
    version: '0.1.0',
    description: 'Descripción breve del script',
    author: 'Andres',
    match: ['https://ejemplo.com/*'],
    grant: ['GM_addStyle'],
    'run-at': 'document-idle',
  },
},
```

### 3. Reutilizar código antes de copiar

- Helpers DOM genéricos: `shared/dom.ts`
- Red y fetch: `shared/http.ts`
- Texto/escape: `shared/text.ts`
- Storage: `shared/storage.ts`
- CSS: `shared/style.ts`
- Temporizadores: `shared/timing.ts`
- Matemática simple: `shared/math.ts`

Si el helper sirve para 2+ scripts, muévelo a `shared/`.

### 4. Mantener el script pequeño

Divide por responsabilidades:

- `shared/` → estado y constantes comunes al script
- `infrastructure/` → acceso a DOM, storage o APIs externas
- `domain/` → reglas puras y reutilizables
- `application/` → orquestación y casos de uso
- `presentation/` → render, hooks, estilos

### 5. Probar y compilar

```bash
bun test
bun run build:all
```

El `pre-commit` ya ejecuta:

```bash
bun run bump:userscripts
bun run typecheck
bun test
bun run build:all
```

## Flujo de versión

- No edites `dist/*.user.js` ni `dist/*.meta.js` a mano.
- La versión vive en `scripts.manifest.ts`.
- `bun run bump:userscripts` incrementa la versión solo de los scripts afectados.
- El hook de `pre-commit` stagea `scripts.manifest.ts` y `dist/` automáticamente.

## Dónde mirar primero por script

- `sri-comprobantes` → `scripts/sri-comprobantes/src/main.ts`
- `better-chatgpt-assistant` → `scripts/better-chatgpt-assistant/src/main.ts`
- `demo-current-site` → `scripts/demo-current-site/src/main.ts`

## Regla práctica para agentes

Antes de crear un helper nuevo, busca si ya existe en `shared/`.
Antes de crear un módulo nuevo, busca si ese flujo ya existe en otro script.
Si el cambio toca el comportamiento visible, agrega o actualiza tests en `tests/`.
