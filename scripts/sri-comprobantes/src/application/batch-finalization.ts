import {
  buildBatchFinishMessage,
  buildBatchFinishState,
  buildBatchStopState,
} from '../domain/batch/batch-finalization.ts';
import type { BatchServiceDeps } from './batch-types.ts';

export function createBatchFinalization(deps: BatchServiceDeps) {
  const { state, updateBatchButtons, renderDashboard, refreshInvoicesFromApi, refreshReportStatusFromApi } = deps;

  function stopBatchDownloadPending() {
    if (!state.isBatchDownloading) {
      renderDashboard({
        status: 'warning',
        message: 'No hay una descarga por lote activa.',
      });
      return;
    }

    const nextState = buildBatchStopState(state);
    state.isBatchDownloading = nextState.isBatchDownloading;
    state.batchAcrossPages = nextState.batchAcrossPages;
    updateBatchButtons();

    renderDashboard({
      status: 'warning',
      message: 'Se solicitó detener la descarga por lote.',
    });
  }

  function finishBatch(message: string, status: string) {
    const nextState = buildBatchFinishState(state);
    state.isBatchDownloading = nextState.isBatchDownloading;
    state.batchAcrossPages = nextState.batchAcrossPages;
    updateBatchButtons();

    renderDashboard({
      status,
      message,
    });

    refreshInvoicesFromApi(true);
    refreshReportStatusFromApi(true);
  }

  return {
    stopBatchDownloadPending,
    finishBatch,
  };
}