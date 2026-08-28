# Chat list ordering and scrolling design

## Goal

Make the ChatGPT Bulk Exporter conversation picker predictable and usable with long histories. Conversations must appear newest first according to the active date field, and the central list must scroll independently while controls remain visible.

## Behavior

- After filtering, sort conversations descending by the active field: `updatedAt` for “Última actualización” and `createdAt` for “Fecha de creación”.
- Put conversations without a valid date after all dated conversations.
- Preserve deterministic order for equal or missing dates by comparing title and then conversation ID.
- Re-sort immediately when the active date field changes or progressive indexing supplies a new date.
- Keep the complete history returned by the existing paginated loader; scrolling must not depend on which sidebar rows ChatGPT currently rendered.
- Keep the modal header, status, filter controls, selection actions, and footer visible. Only the conversation list is the flexible, vertically scrollable region.
- Support normal wheel, trackpad, keyboard, and touch scrolling through native CSS overflow behavior.

## Architecture

Add a pure domain helper that filters and orders conversations without mutating the source array. The presentation layer will use that helper both when rendering rows and when selecting all visible rows, ensuring visual order and selection scope share the same filtering rules.

Adjust the existing flex-column modal styles so the list has `min-height: 0`, flexible available height, and `overflow-y: auto`. No custom scroll event handler, virtualization, pagination control, or ordering UI is needed.

## Error and edge cases

- An invalid date range continues to render no rows and the existing validation message.
- Empty histories and filters with no matches retain their existing empty states.
- Invalid or missing timestamps remain usable and appear at the end when no bounded filter excludes them.
- Sorting must not mutate `conversations`, avoiding side effects during progressive date updates.

## Verification

- Domain tests: newest-first for both fields, deterministic ties, unknown dates last, and source array not mutated.
- Presentation/style contract test: list is the scroll container and can shrink inside the modal.
- Existing focused userscript tests, TypeScript check, and userscript build must pass.
