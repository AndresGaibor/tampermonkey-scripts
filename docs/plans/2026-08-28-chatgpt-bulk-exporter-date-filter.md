# Plan: filtro de chats por fecha y hora

> Implementar en la rama `feat/chatgpt-bulk-exporter`, siguiendo la especificación aprobada en `docs/superpowers/specs/2026-08-28-chatgpt-bulk-exporter-design.md`.

## Resultado esperado

El modo “Seleccionar chats” mostrará un popover integrado al sidebar de ChatGPT. Permitirá elegir creación o última actualización, establecer límites inclusivos de fecha/hora, ver la fecha local de cada chat y seleccionar/exportar solo los resultados visibles.

## Paso 1 — Modelo y reglas puras

Archivos:
- `scripts/chatgpt-bulk-exporter/src/domain/conversation.ts`
- `scripts/chatgpt-bulk-exporter/src/domain/dates.ts`
- nuevo módulo `src/domain/conversation-filter.ts`

Cambios:
- Añadir un modelo liviano de conversación de sidebar: ID, título, enlace, `createdAt`, `updatedAt`.
- Reutilizar `normalizeTimestamp` para segundos, milisegundos y valores inválidos.
- Añadir tipos para campo seleccionado (`created`/`updated`) y rango opcional en milisegundos.
- Implementar filtro inclusivo con límites abiertos, rango invertido detectable y exclusión de fechas desconocidas cuando hay filtro activo.
- Mantener `formatDateTime` como formateador local y añadir conversión segura de `datetime-local` a timestamp.

Pruebas:
- límites exactos incluidos;
- solo Desde, solo Hasta y sin filtro;
- creación frente a actualización;
- rango invertido;
- timestamp inválido/desconocido;
- formato local con fecha y hora.

## Paso 2 — Descubrimiento de metadatos del sidebar

Archivo:
- `scripts/chatgpt-bulk-exporter/src/infrastructure/sidebar-dom.ts`

Cambios:
- Extender `ConversationLink` para devolver título y metadatos temporales cuando ChatGPT los exponga en atributos o propiedades del elemento/fila.
- Aislar la extracción en una función pura/pequeña y no inferir timestamps desde el texto visible.
- Conservar compatibilidad con el descubrimiento actual de enlaces `/c/<id>` y su deduplicación.
- No realizar una petición individual por chat ni enviar datos a terceros.

Pruebas:
- extracción de `create_time`/`update_time` desde las formas DOM soportadas;
- ausencia e invalidez producen `null`;
- links duplicados siguen produciendo un solo registro;
- settings u otros links no aparecen.

Nota de implementación: si el DOM actual no contiene los timestamps, la UI mostrará “Fecha desconocida” de forma explícita; no se inventará una fecha usando el texto del sidebar.

## Paso 3 — Estado de filtro y presentación

Archivos:
- `scripts/chatgpt-bulk-exporter/src/presentation/sidebar.ts`
- `scripts/chatgpt-bulk-exporter/src/presentation/styles.ts`
- posiblemente nuevo `src/presentation/date-filter.ts`

Cambios:
- Mantener el estado del filtro en memoria junto al `SelectionStore` durante la sesión.
- Al abrir selección, mostrar popover compacto anclado al trigger.
- Añadir selector Creación/Última actualización, inputs Desde/Hasta, resumen de coincidencias y lista de chats con checkbox, título y fecha/hora.
- Renderizar “Fecha desconocida” para metadatos ausentes.
- Validar rango invertido inline sin alterar resultados ni selección.
- “Seleccionar todos” actúa solo sobre coincidencias; “Limpiar” vacía la selección; exportar usa los IDs seleccionados.
- Mantener sincronizados los checks existentes y la lista del popover.
- Usar HTML semántico, `aria-expanded`, `aria-controls`, labels, focus visible y eventos que impidan navegar al marcar.
- Añadir estilos con variables heredadas del sitio, sin depender de clases internas frágiles de ChatGPT.

Pruebas:
- montaje idempotente;
- apertura/cierre sin perder filtro ni selección;
- filtrado de lista y estado vacío;
- botones deshabilitados correctamente;
- selección masiva solo de resultados;
- cancelación/exportación conserva los estados ya existentes.

## Paso 4 — Integración y compatibilidad

Archivos:
- `src/main.ts` solo si el observer necesita cubrir el nuevo popover;
- `tests/chatgpt-bulk-exporter.test.ts` y/o nuevo test dedicado.

Cambios:
- Confirmar que las mutaciones del sidebar no duplican root, trigger ni popover.
- Evitar que el observer borre selección al repintar elementos.
- Mantener la exportación secuencial, el ZIP y el flujo de errores sin cambios funcionales.

## Paso 5 — Verificación

Ejecutar, en este orden:

1. `bun test tests/chatgpt-bulk-exporter.test.ts`
2. `bun test tests/scripts.manifest.test.ts`
3. `bun run typecheck`
4. `bun run build:chatgpt-bulk-exporter`

Si los cambios compartidos afectan otros scripts, ejecutar `bun test` y `bun run build:all`. Revisar el diff y el estado de Git; no sobrescribir ni descartar cambios preexistentes.
