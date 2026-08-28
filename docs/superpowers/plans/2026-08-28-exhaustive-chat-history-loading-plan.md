# Exhaustive chat history loading implementation plan

1. Update `fetchConversationHistory` to stop treating a short page as exhaustion.
2. Preserve the existing empty-page, reported-total, and no-new-ID stop conditions.
3. Add a regression test proving a short first page advances by its raw item count and loads the next page.
4. Run the focused exporter test, TypeScript check, and exporter build.
5. Commit and push the updated userscript artifact to the existing feature branch.
