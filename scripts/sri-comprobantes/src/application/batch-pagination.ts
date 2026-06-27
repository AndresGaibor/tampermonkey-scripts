import { buildBatchAdvanceMessage } from '../domain/batch/batch-messages.ts';
import type { BatchServiceDeps } from './batch-types.ts';

export function createBatchPagination(deps: BatchServiceDeps) {
  const { config, state, findNextPageButton, getPaginationSignature, renderDashboard, refreshInvoicesFromApi } = deps;

  function moveToNextPageAndContinue() {
    const nextButton = findNextPageButton();

    if (!deps.shouldAdvanceToNextPage(state.batchAcrossPages, Boolean(nextButton), !state.isBatchDownloading)) {
      return false;
    }

    const beforeSignature = getPaginationSignature();

    renderDashboard({
      status: 'loading',
      message: buildBatchAdvanceMessage(beforeSignature),
    });

    nextButton.click();

    setTimeout(async () => {
      await refreshInvoicesFromApi(true);
      deps.processCurrentPageForBatch();
    }, config.PAGINATION_DELAY_MS);

    return true;
  }

  return {
    moveToNextPageAndContinue,
  };
}