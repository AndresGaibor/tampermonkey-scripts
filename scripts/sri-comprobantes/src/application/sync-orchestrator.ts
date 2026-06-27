export type SyncOrchestratorDeps = {
  refreshInvoicesFromApi: (force?: boolean) => Promise<void>;
  refreshPeriodsFromApi: (force?: boolean) => Promise<void>;
  refreshReportStatusFromApi: (force?: boolean) => Promise<void>;
};

export function createSyncOrchestrator(deps: SyncOrchestratorDeps) {
  const { refreshInvoicesFromApi, refreshPeriodsFromApi, refreshReportStatusFromApi } = deps;

  async function refreshAllFromApi() {
    await refreshInvoicesFromApi(true);
    await refreshPeriodsFromApi(true);
    await refreshReportStatusFromApi(true);
  }

  return {
    refreshAllFromApi,
  };
}