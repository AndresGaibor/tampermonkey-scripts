export type TableIndexes = { type: number; access: number; xml: number; pdf: number };

export type RowData = {
  row: HTMLTableRowElement;
  cells: HTMLElement[];
  typeCell: HTMLElement | null;
  accessCell: HTMLElement | null;
  xmlCell: HTMLElement | null;
  pdfCell: HTMLElement | null;
  accessKey: string | null;
  documentNumber: string | null;
};

export type BatchServiceConfig = {
  AUTO_DOWNLOAD_XML: boolean;
  AUTO_DOWNLOAD_PDF: boolean;
  DOWNLOAD_DELAY_MS: number;
  MAX_BATCH_DOWNLOADS_PER_PAGE: number;
  PAGINATION_DELAY_MS: number;
  PAGE_AFTER_QUEUE_DELAY_MS: number;
  MAX_PAGES_PER_BATCH: number;
  REFRESH_AFTER_DOWNLOAD_MS: number[];
};

export type BatchServiceState = {
  isBatchDownloading: boolean;
  batchAcrossPages: boolean;
  batchDownloadedCount: number;
  batchQueueTotal: number;
  batchPageCount: number;
  batchVisitedPages: Set<string>;
};

export type BatchServiceDeps = {
  config: BatchServiceConfig;
  state: BatchServiceState;
  findComprobantesTbody: () => HTMLElement | null;
  getTableIndexes: (tbody: HTMLElement) => TableIndexes;
  extractRowData: (row: HTMLTableRowElement, indexes: TableIndexes) => RowData;
  findMatchingInvoice: (rowData: RowData) => { xml_status: unknown; pdf_status: unknown } | null;
  upsertRowBadge: (row: HTMLElement, accessCell: HTMLElement | null, text: string, type: string) => void;
  findNextPageButton: () => Element | null;
  getPaginationSignature: () => string;
  renderDashboard: (opts: { status: string; message: string }) => void;
  updateBatchButtons: () => void;
  refreshInvoicesFromApi: (force?: boolean) => Promise<void>;
  refreshReportStatusFromApi: (force?: boolean) => Promise<void>;
  shouldStopForCycle: (visited: Set<string>, signature: string) => boolean;
  shouldStopForPageLimit: (pageCount: number, limit: number) => boolean;
  registerVisitedPage: (visited: Set<string>, signature: string) => Set<string>;
  shouldAdvanceToNextPage: (acrossPages: boolean, hasNextButton: boolean, isStopped: boolean) => boolean;
  buildBatchFinishMessage: (count: number) => string;
  processCurrentPageForBatch: () => void;
  moveToNextPageAndContinue: () => boolean;
  finishBatch: (message: string, status: string) => void;
};
