export function buildBatchStartState(acrossPages: boolean) {
  return {
    isBatchDownloading: true,
    batchAcrossPages: Boolean(acrossPages),
    batchDownloadedCount: 0,
    batchQueueTotal: 0,
    batchPageCount: 0,
    batchVisitedPages: new Set<string>(),
  };
}
