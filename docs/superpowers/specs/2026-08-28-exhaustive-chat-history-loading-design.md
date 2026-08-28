# Exhaustive chat history loading design

## Goal

Load every conversation available from ChatGPT’s paginated history endpoint so the exporter list can scroll beyond the conversations initially visible in ChatGPT’s sidebar.

## Behavior

- Request history pages sequentially with the existing `offset`, `limit`, and `order=updated` query parameters.
- Continue after a non-empty short page; a page containing fewer items than the requested limit does not prove that history is exhausted.
- Treat the reported total as an advisory progress hint, not an exhaustion signal; ChatGPT may report a capped total such as 30 while older conversations still exist.
- Stop when the API returns an empty page or a non-empty page adds no new conversation IDs.
- Advance `offset` by the raw number of items returned, including duplicates, so the next request follows the API’s pagination positions.
- Continue reporting accumulated unique conversations through the existing progress callback. Report the total only while it remains greater than the loaded count, avoiding misleading progress such as `58/30`.
- Keep the existing fallback to currently rendered sidebar links if the history request fails.

## Safety

The no-new-ID condition prevents an infinite request loop if ChatGPT repeats a page or ignores the offset. An empty page remains the normal completion signal; the reported total cannot safely terminate loading.

## Verification

Add a regression test where the first page is shorter than the requested page size but reports more conversations. The loader must request the next offset and include its conversations. Retain the existing tests for deduplication, date normalization, progress, and malformed entries.
