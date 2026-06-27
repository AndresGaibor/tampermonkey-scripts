import {
  buildBatchStartState,
} from '../domain/batch/batch-state.ts';
import type { BatchServiceConfig, BatchServiceState, BatchServiceDeps } from './batch-types.ts';

export function createBatchOrchestrator(deps: BatchServiceDeps) {
  const { state, renderDashboard, updateBatchButtons } = deps;

  function startBatchDownloadCurrentPage() {
    startBatchDownload({ acrossPages: false });
  }

  function startBatchDownloadAllPages() {
    startBatchDownload({ acrossPages: true });
  }

  function startBatchDownload({ acrossPages }: { acrossPages: boolean }) {
    if (state.isBatchDownloading) {
      renderDashboard({
        status: 'warning',
        message: 'Ya hay una descarga por lote en proceso.',
      });
      return;
    }

    const nextState = buildBatchStartState(acrossPages);
    state.isBatchDownloading = nextState.isBatchDownloading;
    state.batchAcrossPages = nextState.batchAcrossPages;
    state.batchDownloadedCount = nextState.batchDownloadedCount;
    state.batchQueueTotal = nextState.batchQueueTotal;
    state.batchPageCount = nextState.batchPageCount;
    state.batchVisitedPages = nextState.batchVisitedPages;

    updateBatchButtons();

    renderDashboard({
      status: 'loading',
      message: acrossPages
        ? 'Descarga por lote iniciada en todas las páginas.'
        : 'Descarga por lote iniciada en la página actual.',
    });

    deps.processCurrentPageForBatch();
  }

  return {
    startBatchDownloadCurrentPage,
    startBatchDownloadAllPages,
    startBatchDownload,
  };
}