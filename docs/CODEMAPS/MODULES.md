# Module Map

**Last Updated:** 2026-06-26

## Monorepo tooling

### `scripts.manifest.ts`

**Purpose**: catálogo central de userscripts y metadata de instalación.

**Location**: `./`

**Key Files**:
- `scripts.manifest.ts` - nombres, match patterns, grants y versiones.

**Dependencies**:
- `tools/list.ts`
- `tools/vite.ts`
- `tools/bump-userscript-versions.ts`

**Exports**:
- `scripts` - definición de scripts disponibles.
- `getScript(name)` - obtiene un script por nombre.
- `getScriptNames()` - lista nombres de scripts.

**Usage Example**:
```ts
import { getScript } from '../scripts.manifest.ts'
```

### `tools/`

**Purpose**: comandos de consola para listar, compilar y versionar scripts.

**Location**: `tools/`

**Key Files**:
- `tools/list.ts` - imprime scripts disponibles.
- `tools/vite.ts` - wrapper de Vite por script.
- `tools/build-all.ts` - compila todos los scripts.
- `tools/bump-userscript-versions.ts` - ajusta versiones antes del commit.

**Dependencies**:
- `scripts.manifest.ts`

**Exports**:
- Principalmente ejecutables CLI; no hay API pública estable.

## Shared utilities

### `shared/`

**Purpose**: helpers reutilizables entre scripts.

**Location**: `shared/`

**Key Files**:
- `dom.ts` - espera de elementos y observación del DOM.
- `http.ts` - helpers de red.
- `math.ts` - utilidades numéricas como `clamp()`.
- `storage.ts` - helpers de persistencia.
- `style.ts` - inyección de CSS.
- `text.ts` - normalización, escape y limpieza de texto.
- `timing.ts` - debounce/throttle y temporizadores.

**Dependencies**:
- Consumido por ambos scripts principales.

## `sri-comprobantes`

### `scripts/sri-comprobantes/src`

**Purpose**: userscript principal para sincronizar comprobantes del SRI.

**Location**: `scripts/sri-comprobantes/src/`

**Key Files**:
- `main.ts` - wiring de servicios, observers y bootstrap.
- `shared/config.ts` - constantes de configuración.
- `shared/state.ts` - estado mutable compartido.
- `infrastructure/sri-dom.ts` - lectura del DOM del SRI.
- `infrastructure/sri-api.ts` - cliente JSON contra la API local.
- `application/*.ts` - sincronización, TXT, lote y orquestación.
- `domain/comprobante/*.ts` - matching, estados y claves.
- `presentation/*.ts` - dashboard, hooks, tabla y estilos.

**Dependencies**:
- `shared/*`
- `tools/vite.ts` via build pipeline

**Exports**:
- No expone API pública; el entrypoint se ejecuta por side effects.

**Usage Example**:
```ts
import './scripts/sri-comprobantes/src/main'
```

## `better-chatgpt-assistant`

### `scripts/better-chatgpt-assistant/src`

**Purpose**: userscript para mejorar la experiencia de ChatGPT web.

**Location**: `scripts/better-chatgpt-assistant/src/`

**Key Files**:
- `main.ts` - bootstrap, route guards y loop principal.
- `shared/constants.ts` - IDs, intervalos y claves storage.
- `shared/state.ts` - estado UI y preferencias.
- `domain/health.ts` - heurísticas de salud y recomendaciones.
- `domain/i18n.ts` - idioma y traducciones.
- `infrastructure/dom.ts` - lectura del DOM de ChatGPT.
- `infrastructure/storage.ts` - persistencia en localStorage.
- `application/ui.ts` - render y posicionamiento del panel.
- `application/virtualization.ts` - plegado/restore de mensajes.
- `presentation/*` - root flotante, hooks y estilos.

**Dependencies**:
- `shared/*`
- `shared/math.ts`

**Exports**:
- No expone API pública; el entrypoint se ejecuta por side effects.

**Usage Example**:
```ts
import './scripts/better-chatgpt-assistant/src/main'
```

## `demo-current-site`

### `scripts/demo-current-site/src`

**Purpose**: plantilla mínima de userscript.

**Location**: `scripts/demo-current-site/src/`

**Key Files**:
- `main.ts` - demo simple con helpers compartidos.
- `style.css` - estilos del ejemplo.

**Dependencies**:
- `shared/dom.ts`
- `shared/style.ts`
- `shared/storage.ts`

**Exports**:
- No expone API pública.

## Relaciones clave

- `sri-comprobantes` depende más de `shared/text.ts`, `shared/timing.ts` y su propia separación por capas.
- `better-chatgpt-assistant` depende de `shared/math.ts` y concentra más lógica en `application/`.
- `demo-current-site` solo prueba el pipeline y reutiliza helpers simples.
