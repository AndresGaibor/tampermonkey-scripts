# Architecture Map

**Last Updated:** 2026-06-26

## Visión general

Este repo es un monorepo de userscripts para Tampermonkey/Violentmonkey construido con Bun, Vite y `vite-plugin-monkey`.

```txt
package.json
├── tools/*.ts        # CLI de build, listado y versionado
├── scripts.manifest  # fuente única de metadata de userscripts
├── shared/*.ts       # helpers comunes
└── scripts/
    ├── sri-comprobantes/
    ├── better-chatgpt-assistant/
    ├── chatgpt-bulk-exporter/
    └── demo-current-site/
```

## Relación entre componentes

```txt
tools/* ──> scripts.manifest.ts ──> Vite/Bun builds ──> dist/*.user.js
                         ├──> scripts/sri-comprobantes/src/main.ts
                         ├──> scripts/better-chatgpt-assistant/src/main.ts
                         └──> scripts/demo-current-site/src/main.ts

shared/* ──> imported by multiple scripts
```

## Arquitectura por script

### `sri-comprobantes`

```txt
infrastructure/  → lee DOM del SRI, navega página, llama API local
application/     → sincronización, lote, TXT, orquestación
domain/          → reglas puras de matching, colas y estados
presentation/    → dashboard, hooks, tabla, estilos
shared/          → config y estado mutable del script
main.ts          → wiring central
```

Flujo principal:

```txt
DOM SRI + API local
        ↓
infrastructure/sri-dom.ts + sri-api.ts
        ↓
application/* services
        ↓
presentation/*
        ↓
tabla + dashboard + acciones
```

### `better-chatgpt-assistant`

```txt
infrastructure/  → DOM de ChatGPT y storage/localStorage
application/     → virtualización, UI y health loop
domain/          → salud, i18n y reglas de texto
presentation/    → root flotante, panel y estilos
shared/          → constantes y estado global
main.ts          → arranque y route guards
```

Flujo principal:

```txt
ChatGPT DOM
   ↓
infrastructure/dom.ts
   ↓
application/virtualization.ts + ui.ts
   ↓
presentation/dashboard-*.ts
   ↓
overlay flotante + control de render
```

### `demo-current-site`

```txt
main.ts + style.css
```

Es un ejemplo mínimo para validar el pipeline y servir como plantilla de nuevos scripts.

## Cómo añadir un script nuevo

```txt
scripts/mi-script/src/main.ts
scripts.manifest.ts -> registrar fileName, entry y userscript metadata
package.json -> opcionalmente añadir dev:mi-script y build:mi-script
tests/ -> agregar cobertura del comportamiento nuevo
```

Regla de reutilización:

- Si una utilidad sirve a 2+ scripts, muévela a `shared/`.
- Si una regla de negocio solo pertenece a un script, mantenla dentro de su propia carpeta.
- Si un cambio afecta `shared/`, considera que todos los scripts pueden requerir rebuild y bump de versión.

## Dependencias externas

- **Bun** — ejecución de scripts y tests.
- **Vite** — bundling de userscripts.
- **vite-plugin-monkey** — empaquetado para extensiones userscript.

## Puntos de entrada

- `scripts.manifest.ts` — catálogo de scripts.
- `tools/vite.ts` — wrapper principal para `dev`/`build`.
- `tools/build-all.ts` — compila todos los scripts.
- `tools/bump-userscript-versions.ts` — versionado antes de commit.
