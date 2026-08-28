# File Map

**Last Updated:** 2026-06-26

## Raíz del repo

- `package.json` — scripts, dependencias y metadata del monorepo.
- `bun.lock` — lockfile.
- `README.md` — guía principal del proyecto.
- `docs/AI-AGENT-GUIDE.md` — ruta corta para agentes de IA.
- `docs/CODEMAPS/INDEX.md` — índice de navegación del repo.
- `scripts.manifest.ts` — catálogo de userscripts.
- `vite.config.ts` — configuración base de build.
- `tsconfig.json` — paths y compilación TypeScript.

## `tools/`

- `tools/list.ts` — imprime nombres y metadata de scripts.
- `tools/vite.ts` — wrapper para `vite dev/build` por script.
- `tools/build-all.ts` — build batch de todos los scripts.
- `tools/bump-userscript-versions.ts` — incrementa versiones antes de commit.

## `shared/`

- `shared/dom.ts` — waitForElement/onDomChange y re-export de texto.
- `shared/http.ts` — helpers HTTP compartidos.
- `shared/math.ts` — utilidades numéricas.
- `shared/storage.ts` — persistencia genérica.
- `shared/style.ts` — inyección de CSS.
- `shared/text.ts` — normalización/escape de texto.
- `shared/timing.ts` — debounce y temporizadores.

## `scripts/sri-comprobantes/`

- `src/main.ts` — entrypoint grande; hace wiring de config, state, application, infrastructure y presentation.
- `src/shared/config.ts` — flags de API, batch y visibilidad.
- `src/shared/state.ts` — estado compartido del script.
- `src/infrastructure/sri-api.ts` — cliente JSON para la API local.
- `src/infrastructure/sri-dom.ts` — lectura del DOM y extracción de datos del SRI.
- `src/infrastructure/sri-periods.ts` — visibilidad de meses y claves de periodo.
- `src/infrastructure/sri-timers.ts` — wrappers de timers.
- `src/application/*.ts` — servicios de sincronización y lote.
- `src/domain/comprobante/*.ts` — lógica pura de matching y estados.
- `src/presentation/*.ts` — dashboard, hooks, badges, tabla y estilos.

## `scripts/better-chatgpt-assistant/`

- `src/main.ts` — bootstrap del asistente para ChatGPT.
- `src/shared/constants.ts` — IDs, intervalos y claves.
- `src/shared/state.ts` — estado UI y persistencia.
- `src/domain/health.ts` — heurísticas de salud.
- `src/domain/i18n.ts` — traducciones ES/EN.
- `src/infrastructure/dom.ts` — lectura del DOM y export helpers.
- `src/infrastructure/storage.ts` — acceso a localStorage.
- `src/application/ui.ts` — render y lógica de panel.
- `src/application/virtualization.ts` — virtualización y guards.
- `src/presentation/dashboard.ts` — barrel de presentación.
- `src/presentation/dashboard-render.ts` — root flotante.
- `src/presentation/dashboard-hooks.ts` — bindings UI.
- `src/presentation/dashboard-styles.ts` — CSS inyectado.

## `scripts/chatgpt-bulk-exporter/`

- `src/main.ts` — bootstrap y observers del sidebar.
- `src/domain/` — normalización, fechas, Markdown y nombres.
- `src/application/` — selección y exportador secuencial.
- `src/infrastructure/` — API ChatGPT, DOM del sidebar y descarga ZIP.
- `src/presentation/` — UI y estilos.

## `scripts/demo-current-site/`

- `src/main.ts` — demo simple.
- `src/style.css` — estilos del demo.

## Tests

- `tests/*.test.ts` — validan contratos de build, versionado, dominio SRI y estado ChatGPT.
