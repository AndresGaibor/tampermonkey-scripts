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

## Filtro por fecha y hora

El modo de selección incluirá un popover compacto anclado al control principal, con apariencia integrada al sidebar de ChatGPT: fondo y tipografía heredados, bordes suaves, sombra discreta, estados hover/focus accesibles y controles nativos de fecha/hora sin introducir una librería visual.

El popover permitirá elegir el campo temporal:

- `Creación`: `create_time` de la conversación.
- `Última actualización`: `update_time` de la conversación.

Mostrará controles opcionales `Desde` y `Hasta` de tipo fecha/hora. Los límites serán inclusivos; para comparar se usarán timestamps normalizados en milisegundos. Si solo se completa un límite, se aplicará como límite abierto. Si `Desde` es posterior a `Hasta`, se mostrará un error inline y no se modificará la selección.

Cada conversación visible conservará título, ID, enlace y metadatos temporales normalizados. La lista del popover mostrará la fecha y hora local exactas mediante `Intl.DateTimeFormat`; las conversaciones sin el campo elegido mostrarán `Fecha desconocida` y quedarán fuera de un filtro activo, pero seguirán disponibles cuando no haya filtro. El filtro solo operará sobre conversaciones descubiertas en el sidebar y no hará una petición individual por conversación.

Las acciones serán `Seleccionar todos`, `Limpiar` y `Exportar seleccionados`. `Seleccionar todos` afectará únicamente a los resultados actualmente visibles del filtro; los checks existentes se mantendrán sincronizados con el conjunto de IDs en memoria. Cerrar el popover no perderá la selección ni los valores del filtro durante la sesión.

## Flujo de datos actualizado

1. El descubridor del sidebar obtiene enlaces y metadatos temporales disponibles en el DOM o en la respuesta de listado ya cargada por ChatGPT.
2. La capa de dominio normaliza `create_time` y `update_time` y expone una comparación inclusiva reutilizable y testeable.
3. La presentación renderiza el popover y filtra localmente; no se envían fechas ni contenido a terceros.
4. La exportación continúa usando los IDs seleccionados y el endpoint de detalle definido arriba.

Si ChatGPT no expone un timestamp de creación o actualización en el listado actual, la interfaz lo indicará como desconocido en lugar de inferirlo desde el texto o hacer llamadas masivas de detalle.

## Estados y errores

Estados de lote: `preparing`, `fetching`, `rendering`, `done`, `failed`, `cancelled`. Un fallo individual se registra y permite continuar. Al finalizar, se informa éxitos/fallos y se descarga ZIP solo si existe al menos un éxito y el lote no fue cancelado. Cancelar aborta el fetch activo y evita iniciar conversaciones posteriores.

El filtro valida límites antes de cambiar resultados. Un timestamp inválido se trata como desconocido; no rompe el popover ni la exportación. Si no hay coincidencias, se muestra un estado vacío explícito y se deshabilita `Seleccionar todos`/`Exportar seleccionados` cuando corresponda.

## Testing

Se añadirán tests unitarios con Bun para normalización, ramas, fechas, Markdown, filenames, selección, descubrimiento/decoración DOM, secuencialidad, errores parciales, cancelación y ZIP. Para esta ampliación se cubrirán además extracción de metadatos, formato local fecha/hora, límites inclusivos, rango invertido, timestamps desconocidos, filtrado por ambos campos y sincronización de selección. Cada bloque se desarrollará con ciclo RED/GREEN/REFACTOR.

## Alcance

No se persiste contenido de conversaciones, no se altera `main`, no se hace merge/push y no se implementa una API pública de ChatGPT. La prueba manual en navegador queda condicionada a disponer de una sesión autenticada. El filtro no intenta recuperar metadatos faltantes mediante una petición por cada chat.
