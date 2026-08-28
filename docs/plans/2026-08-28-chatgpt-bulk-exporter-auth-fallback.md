# Plan: autenticación y fallback de exportación

1. Añadir un cliente same-origin en `chatgpt-api.ts` que obtenga y mantenga en memoria el `accessToken` de `/api/auth/session`, adjunte `Authorization: Bearer`, renueve una vez tras `401` y no exponga el token en errores.
2. Reutilizar el cliente en historial y detalle, conservando paginación exhaustiva, normalización y `AbortSignal`.
3. Añadir `conversation-dom.ts` para reconstruir únicamente la conversación abierta desde turnos semánticos `user`/`assistant`, eliminando controles del clon.
4. Exponer un fetch de exportación que use API primero y DOM solo si el ID coincide con `/c/:id`.
5. Mantener el modal abierto al terminar, descargar ZIP solo con éxitos y mostrar el resumen de exportados/fallidos.
6. Cubrir autenticación, renovación, fallback, aislamiento por ID y lote parcial en `tests/chatgpt-bulk-exporter.test.ts`.
7. Verificar con `bun test tests/chatgpt-bulk-exporter.test.ts`, `bun run typecheck` y `bun run build:chatgpt-bulk-exporter`.
