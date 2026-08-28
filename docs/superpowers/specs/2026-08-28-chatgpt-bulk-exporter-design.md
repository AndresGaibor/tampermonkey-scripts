# ChatGPT Bulk Exporter — Diseño

## Objetivo

Crear un userscript independiente para ChatGPT Web que permita seleccionar conversaciones visibles desde el sidebar y exportarlas secuencialmente como Markdown dentro de un único ZIP, sin exfiltrar datos ni modificar `better-chatgpt-assistant`.

## Arquitectura

- `domain/`: modelos normalizados, timestamps, Markdown y filenames; funciones puras.
- `infrastructure/chatgpt-api.ts`: único adaptador del endpoint same-origin de conversación. Traduce JSON interno a `Conversation` y lanza un error de formato ante estructuras no soportadas.
- `infrastructure/sidebar-dom.ts`: descubre links `/c/<id>`, deduplica por ID y ofrece operaciones DOM semánticas.
- `application/selection.ts`: conjunto de IDs seleccionado, con selección/deselección/limpieza idempotentes.
- `application/exporter.ts`: procesa IDs uno por uno, reporta estados, continúa errores individuales y respeta `AbortSignal`.
- `infrastructure/download.ts`: convierte Markdown exitosos a ZIP UTF-8 y dispara una sola descarga.
- `presentation/sidebar.ts` y `styles.ts`: acción, checkboxes, barra de acciones, progreso y errores integrados visualmente mediante variables CSS de ChatGPT.
- `main.ts`: inicialización, observer localizado y wiring.

## Flujo de datos

1. El script detecta el sidebar y añade “Seleccionar chats”.
2. En modo selección, cada conversación identificada por `a[href^="/c/"]` recibe un checkbox real, sin navegación al marcarlo.
3. La selección se guarda solo en memoria y usa conversation IDs deduplicados.
4. Al exportar, el orquestador obtiene cada conversación mediante `fetch` same-origin con credenciales del navegador.
5. El adaptador reconstruye la cadena `current_node -> parent` y conserva solo la rama activa.
6. El dominio filtra roles `user`/`assistant`, formatea fechas locales y genera Markdown.
7. Si el lote no fue cancelado, se empaquetan solo los éxitos en un ZIP y se descarga una vez.

## API y privacidad

El endpoint preferido es `GET /backend-api/conversation/:conversationId`, relativo al origen actual. La autenticación usa exclusivamente la sesión normal del navegador (`credentials: 'include'`); no se usan grants privilegiados, cookies manuales, tokens, analytics ni servidores externos. Los detalles del JSON permanecen aislados en el adaptador.

La API interna puede cambiar, devolver ramas o variar timestamps. Se soportan variantes conocidas de contenido y timestamps Unix en segundos/milisegundos; respuestas incompatibles fallan explícitamente y no producen Markdown vacío.

## Estados y errores

Estados de lote: `preparing`, `fetching`, `rendering`, `done`, `failed`, `cancelled`. Un fallo individual se registra y permite continuar. Al finalizar, se informa éxitos/fallos y se descarga ZIP solo si existe al menos un éxito y el lote no fue cancelado. Cancelar aborta el fetch activo y evita iniciar conversaciones posteriores.

## Testing

Se añadirán tests unitarios con Bun para normalización, ramas, fechas, Markdown, filenames, selección, descubrimiento/decoración DOM, secuencialidad, errores parciales, cancelación y ZIP. Cada bloque se desarrollará con ciclo RED/GREEN/REFACTOR.

## Alcance

No se persiste contenido de conversaciones, no se altera `main`, no se hace merge/push y no se implementa una API pública de ChatGPT. La prueba manual en navegador queda condicionada a disponer de una sesión autenticada.
