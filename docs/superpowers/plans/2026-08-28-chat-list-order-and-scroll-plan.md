# Chat list ordering and scrolling implementation plan

## Task 1: Domain ordering

- Update `scripts/chatgpt-bulk-exporter/src/domain/conversation-filter.ts`.
- Add a non-mutating helper that filters by range and sorts descending by the active date field.
- Treat missing or invalid dates as unknown and place them last.
- Break ties by title, then ID.
- Add focused tests in `tests/chatgpt-bulk-exporter.test.ts` for both date fields, ties, unknown dates, and source immutability.

## Task 2: Presentation integration

- Update `scripts/chatgpt-bulk-exporter/src/presentation/sidebar.ts`.
- Use the ordered helper for rendered conversations and “Seleccionar visibles”.
- Make the list keyboard-focusable and give it an accessible label.

## Task 3: Native scrolling contract

- Update `scripts/chatgpt-bulk-exporter/src/presentation/styles.ts`.
- Retain the list as the flexible `overflow-y:auto` region and add contained overscroll, stable scrollbar space, and vertical touch panning.
- Add a focused style contract assertion.

## Task 4: Verification and publication

- Run `bun test tests/chatgpt-bulk-exporter.test.ts`.
- Run `bun run typecheck`.
- Run `bun run build:chatgpt-bulk-exporter`.
- Check generated artifacts and diff.
- Commit and push `feat/chatgpt-bulk-exporter` so Tampermonkey can update from the existing raw URL.
