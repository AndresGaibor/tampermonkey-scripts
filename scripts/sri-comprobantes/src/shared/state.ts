import { CONFIG } from './config.ts';

export const state = {
  pageRuc: null as string | null,
  receiverRuc: null as string | null,
  periodDataKey: null as string | null,
  apiData: null as any,
  periodData: null as any,
  reportStatusData: null as any,

  byAccessKey: new Map<string, any>(),
  byDocumentNumber: new Map<string, any>(),
  monthsByNumber: new Map<number, any>(),

  viewFilter: GM_getValue('viewFilter', CONFIG.DEFAULT_VIEW_FILTER),
  compactMode: GM_getValue('compactMode', false),

  isRefreshingInvoices: false,
  isRefreshingPeriods: false,
  isRefreshingReportStatus: false,

  isDownloadingTxtReport: false,

  isBatchDownloading: false,
  batchAcrossPages: false,
  batchDownloadedCount: 0,
  batchQueueTotal: 0,
  batchPageCount: 0,
  batchVisitedPages: new Set<string>(),

  lastInvoicesUrl: null as string | null,
  lastPeriodsUrl: null as string | null,
  lastReportStatusUrl: null as string | null,

  lastInvoicesRefreshAt: null as Date | null,
  lastPeriodsRefreshAt: null as Date | null,
  lastReportStatusAt: null as Date | null,

  lastInvoicesError: null as string | null,
  lastPeriodsError: null as string | null,
  lastReportStatusError: null as string | null,

  hiddenMonthsCount: 0,

  lastPageStats: {
    rows: 0,
    downloaded: 0,
    missing: 0,
    unknown: 0,
    hidden: 0
  }
};