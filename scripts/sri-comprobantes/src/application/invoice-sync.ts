import { buildInvoiceIndexes } from '../domain/comprobante/invoice-keys.ts';

export type InvoiceSyncServiceDeps = {
  config: {
    API_BASE: string;
    API_INVOICES_PATH: string;
    API_STATUS: string;
    RECEIVER_RUC_OVERRIDE: string;
    SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001: boolean;
  };
  state: {
    pageRuc: string | null;
    receiverRuc: string | null;
    apiData: { invoices?: unknown[]; summary?: { total?: number; downloaded?: number; missing?: number } } | null;
    byAccessKey: Map<string, unknown>;
    byDocumentNumber: Map<string, unknown>;
    isRefreshingInvoices: boolean;
    lastInvoicesRefreshAt: Date | null;
    lastInvoicesError: string | null;
  };
  requestJson: (url: string) => Promise<{ success: boolean; data: unknown }>;
  getCurrentPageRuc: (document: Document, override: string) => string | null;
  toApiReceiverRuc: (pageRuc: string, sendAsBase10: boolean) => string | null;
  indexInvoices: (invoices: unknown[]) => void;
  applyInvoiceStatusToTable: () => void;
  renderDashboard: (opts: { status: string; message: string }) => void;
  updateDashboardStats: () => void;
};

type InvoiceApiResponse = { invoices?: unknown[] };

export function createInvoiceSyncService(deps: InvoiceSyncServiceDeps) {
  const {
    config,
    state,
    requestJson,
    getCurrentPageRuc,
    toApiReceiverRuc,
    indexInvoices,
    applyInvoiceStatusToTable,
    renderDashboard,
    updateDashboardStats,
  } = deps;

  async function refreshInvoicesFromApi(force = false) {
    const pageRuc = getCurrentPageRuc(document, config.RECEIVER_RUC_OVERRIDE);

    if (!pageRuc) {
      renderDashboard({
        status: 'warning',
        message: 'No se pudo leer el RUC del receptor en el SRI.',
      });
      return;
    }

    const receiverRuc = toApiReceiverRuc(pageRuc, config.SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001);

    if (!receiverRuc) {
      renderDashboard({
        status: 'warning',
        message: 'No se pudo calcular el receiverRuc para la API.',
      });
      return;
    }

    if (!force && state.pageRuc === pageRuc && state.apiData) {
      applyInvoiceStatusToTable();
      return;
    }

    if (state.isRefreshingInvoices) {
      console.log('[SRI TM] Ya hay una consulta de facturas en proceso.');
      return;
    }

    state.isRefreshingInvoices = true;
    state.pageRuc = pageRuc;
    state.receiverRuc = receiverRuc;

    renderDashboard({
      status: 'loading',
      message: `Consultando facturas en API local para receptor ${receiverRuc}...`,
    });

    try {
      const url =
        `${config.API_BASE}${config.API_INVOICES_PATH}` +
        `?receiverRuc=${encodeURIComponent(receiverRuc)}` +
        `&status=${encodeURIComponent(config.API_STATUS)}`;

      console.log('[SRI TM] GET invoices:', url);

      const response = (await requestJson(url)) as { success: boolean; data: InvoiceApiResponse };

      if (!response || response.success !== true || !response.data) {
        throw new Error('Formato inválido en /invoices.');
      }

      state.apiData = response.data;
      state.lastInvoicesRefreshAt = new Date();
      state.lastInvoicesError = null;

      indexInvoices(response.data.invoices || []);
      applyInvoiceStatusToTable();

      renderDashboard({
        status: 'success',
        message: `Facturas sincronizadas. Receptor: ${receiverRuc}`,
      });
    } catch (error: unknown) {
      state.lastInvoicesError = error instanceof Error ? error.message : String(error);

      console.error('[SRI TM] Error invoices:', error);

      renderDashboard({
        status: 'error',
        message: `Error facturas: ${state.lastInvoicesError}`,
      });
    } finally {
      state.isRefreshingInvoices = false;
      updateDashboardStats();
    }
  }

  function indexInvoicesToState(invoices: unknown[]) {
    const indexes = buildInvoiceIndexes(invoices);
    state.byAccessKey = indexes.byAccessKey;
    state.byDocumentNumber = indexes.byDocumentNumber;

    console.log('[SRI TM] Facturas indexadas:', {
      accessKeys: state.byAccessKey.size,
      documentNumbers: state.byDocumentNumber.size,
    });
  }

  function findMatchingInvoice(accessKey: string | null, documentNumber: string | null) {
    if (accessKey && state.byAccessKey.has(accessKey)) {
      return state.byAccessKey.get(accessKey);
    }

    if (documentNumber && state.byDocumentNumber.has(documentNumber)) {
      return state.byDocumentNumber.get(documentNumber);
    }

    return null;
  }

  return {
    refreshInvoicesFromApi,
    indexInvoices: indexInvoicesToState,
    findMatchingInvoice,
  };
}