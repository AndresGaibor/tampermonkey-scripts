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

El endpoint preferido es `GET /backend-api/conversation/:conversationId`, relativo al origen actual. Antes de consultar endpoints internos, el adaptador obtiene el `accessToken` de la sesión mediante `GET /api/auth/session` y envía `Authorization: Bearer <token>` junto con `credentials: 'include'`. El token se conserva exclusivamente en memoria, nunca se registra, persiste, incluye en errores ni sale de `chatgpt.com`. Ante un `401`, el adaptador invalida el token, obtiene uno nuevo y repite la solicitud una sola vez.

No se usan grants privilegiados, cookies manuales, analytics ni servidores externos. Los detalles del JSON y la autenticación permanecen aislados en el adaptador. La API interna puede cambiar, devolver ramas o variar timestamps. Se soportan variantes conocidas de contenido y timestamps Unix en segundos/milisegundos; respuestas incompatibles fallan explícitamente y no producen Markdown vacío.

## Recuperación de conversaciones inaccesibles y lotes parciales

El mismo cliente autenticado se reutiliza para historial, detalle e indexación progresiva. Si el detalle continúa fallando después de renovar la sesión y el ID solicitado coincide con la ruta activa `/c/:conversationId`, el exportador puede reconstruir un respaldo desde el DOM ya renderizado. Este respaldo recorre en orden los contenedores semánticos con `data-message-author-role="user"` o `data-message-author-role="assistant"`, clona cada turno, elimina botones, controles y elementos marcados como ocultos, y conserva el texto visible. El título procede del encabezado/documento con fallback `ChatGPT chat`; las fechas DOM desconocidas quedan en `null`. No se usa este mecanismo para conversaciones que no están abiertas y no se automatiza la navegación entre chats.

Un fallo individual nunca invalida los éxitos anteriores. Al terminar, se genera el ZIP si existe al menos una conversación exportada y la interfaz muestra un resumen explícito de exportadas y fallidas. Si todas fallan, no se dispara descarga. El modal permanece abierto con el resultado hasta que el usuario lo cierre; cancelar sigue abortando el lote sin descargar resultados incompletos.

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

Se añadirán tests unitarios con Bun para normalización, ramas, fechas, Markdown, filenames, selección, descubrimiento/decoración DOM, secuencialidad, errores parciales, cancelación y ZIP. Para esta ampliación se cubrirán además extracción de metadatos, formato local fecha/hora, límites inclusivos, rango invertido, timestamps desconocidos, filtrado por ambos campos, sincronización de selección, envío del token Bearer, renovación única tras `401`, ausencia de filtración del token en errores, extracción DOM limitada al chat abierto y resumen de lotes parciales. Cada bloque se desarrollará con ciclo RED/GREEN/REFACTOR.

## Sincronización local aprobada

La interfaz conserva `Exportar ZIP` y añade `Elegir carpeta ChatGPT` y `Sincronizar ahora`. La carpeta se autoriza mediante File System Access API y el `FileSystemDirectoryHandle` se conserva en IndexedDB; no se persisten tokens ni contenido de conversaciones en el almacenamiento del userscript. La primera sincronización obtiene el historial y exporta cada conversación a un Markdown individual dentro de la carpeta elegida, junto con `manifest.json`.

El manifest registra por ID el nombre de archivo, título y `update_time`. Las sincronizaciones posteriores comparan esos metadatos y solo solicitan/escriben conversaciones nuevas o modificadas. No se borran archivos locales cuando una conversación desaparece del historial remoto. La sincronización se ejecuta automáticamente una vez al cargar ChatGPT si existe un handle autorizado y también puede iniciarse manualmente. Si el navegador no ofrece File System Access API o el permiso fue revocado, se muestra un error accionable y el ZIP continúa funcionando.

La escritura usa nombres saneados y evita colisiones, escribe el Markdown y después actualiza el manifest. Los fallos individuales no detienen el lote; la interfaz informa procesadas, omitidas y fallidas. Todo el contenido permanece en ChatGPT y en la carpeta local seleccionada.

## Rediseño visual aprobado

La interfaz debe sentirse como una extensión nativa del sidebar de ChatGPT, no como una toolbar independiente:

- El estado normal mostrará una sola acción discreta: `Exportar chats`.
- Al activarla se abrirá un popover flotante compacto, anclado al control y limitado al ancho disponible del sidebar; nunca deberá provocar scroll horizontal.
- El popover usará fondo, tipografía, bordes, sombras, colores de hover y focus basados en variables CSS heredadas de ChatGPT, con fallback neutro.
- Durante la selección no se mostrarán checkboxes nativos permanentes que deformen las filas. Las conversaciones seleccionadas se indicarán con fondo sutil y un check minimalista; el checkbox accesible podrá existir como control visualmente oculto.
- El encabezado mostrará solo el contador y acciones compactas. Las acciones serán `Seleccionar todo`, `Limpiar` y `Exportar`; `Cancelar` quedará como cierre secundario.
- El filtro aparecerá dentro de una sección plegable `Filtrar por fecha`, cerrada inicialmente, para evitar una barra saturada. Sus valores se conservarán mientras dure la sesión.
- Todos los botones tendrán área táctil suficiente, labels accesibles, focus visible y estados disabled claros. Los iconos serán SVG inline, no emojis.
- El layout será fluido para sidebars estrechos: textos truncados, controles apilables y `max-width: 100%`.

La lógica de selección, filtrado, exportación secuencial, privacidad y ZIP no cambia; solo se reorganiza la presentación y su interacción.

## Índice progresivo de fechas (aprobado)

Cuando `GET /backend-api/conversations` falle, devuelva una lista vacía o no contenga timestamps útiles, el script construirá un índice de fechas progresivo a partir de los enlaces de conversación descubiertos en el sidebar. Para cada ID que no tenga un registro vigente en caché, consultará `GET /backend-api/conversation/:id`, extraerá y normalizará `create_time` y `update_time` de la respuesta de detalle, y actualizará la fila sin esperar a completar todos los chats.

El índice se guardará con `GM_getValue`/`GM_setValue` como metadatos mínimos por ID (título, fechas, momento de validación); nunca se guardará contenido, mensajes ni nodos de conversación. Los registros tendrán una expiración definida. Al abrir el selector, los datos cacheados se mostrarán de inmediato; únicamente los faltantes o vencidos se revalidarán. La caché se depurará por antigüedad y tendrá un límite de entradas para evitar crecimiento indefinido.

Las solicitudes de detalle tendrán concurrencia limitada, respetarán un único `AbortSignal` y se detendrán al cerrar el popover. Un error de una conversación se registrará como fecha desconocida solo para esa conversación y no bloqueará el resto. La interfaz indicará `Indexando fechas X/Y` mientras haya trabajo pendiente y mantendrá funcional el filtro con el subconjunto ya fechado: las conversaciones sin fecha se excluyen únicamente cuando el usuario haya activado un rango o campo temporal.

La fuente principal seguirá siendo el índice de ChatGPT cuando esté disponible; el índice progresivo es el fallback para recuperar fechas reales, no una sustitución de la exportación. Las pruebas cubrirán lectura/escritura/expiración de caché, extracción de fechas del detalle, progreso parcial, concurrencia, cancelación y continuidad ante fallos individuales.

## Alcance

No se persiste contenido ni tokens de conversaciones, no se altera `main`, no se hace merge/push y no se implementa una API pública de ChatGPT. La prueba manual en navegador queda condicionada a disponer de una sesión autenticada.
