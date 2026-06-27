# Codemaps del repositorio

**Last Updated:** 2026-06-26

## Navegación

- [AI Agent Guide](../AI-AGENT-GUIDE.md) — ruta corta para crear nuevos scripts y reutilizar helpers.
- [Architecture Map](./ARCHITECTURE.md) — visión general, flujo de datos y relaciones entre scripts.
- [Module Map](./MODULES.md) — módulos públicos, dependencias y APIs clave.
- [File Map](./FILES.md) — estructura de carpetas y propósito de cada archivo importante.

## Entrada rápida

Si quieres entender el repo desde cero, lee en este orden:

1. `ARCHITECTURE.md`
2. `MODULES.md`
3. `FILES.md`

## Áreas principales

- `scripts/sri-comprobantes/` — userscript principal del SRI, con arquitectura por capas.
- `scripts/better-chatgpt-assistant/` — userscript de ChatGPT con virtualización y panel flotante.
- `scripts/demo-current-site/` — ejemplo mínimo para nuevos userscripts.
- `shared/` — helpers reutilizables entre scripts.
- `tools/` — comandos de build, listado y versionado.
- `dist/` — artefactos generados; no editar manualmente.
