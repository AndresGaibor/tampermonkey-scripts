export function buildBatchFinishMessage(downloadedCount: number) {
  return `Descarga finalizada. Archivos procesados: ${downloadedCount}.`;
}

export function buildBatchFinishState<T extends { isBatchDownloading: boolean; batchAcrossPages: boolean }>(
  state: T,
) {
  return {
    isBatchDownloading: false,
    batchAcrossPages: false,
  };
}

export function buildBatchStopState<T extends { isBatchDownloading: boolean; batchAcrossPages: boolean }>(
  state: T,
) {
  return {
    isBatchDownloading: false,
    batchAcrossPages: state.batchAcrossPages,
  };
}
