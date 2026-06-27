export function registerVisitedPage(visitedPages: ReadonlySet<string>, pageSignature: string) {
  const nextVisitedPages = new Set(visitedPages);

  nextVisitedPages.add(pageSignature);

  return nextVisitedPages;
}

export function shouldStopForCycle(visitedPages: ReadonlySet<string>, pageSignature: string) {
  return visitedPages.has(pageSignature);
}

export function shouldStopForPageLimit(pageCount: number, maxPagesPerBatch: number) {
  return pageCount > maxPagesPerBatch;
}

export function shouldAdvanceToNextPage(
  acrossPages: boolean,
  hasNextPage: boolean,
  isBatchStopping: boolean,
) {
  return acrossPages && hasNextPage && !isBatchStopping;
}
