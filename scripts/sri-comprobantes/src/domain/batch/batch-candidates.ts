import { type DownloadQueueCandidate } from '../download-queue.ts';

export type BatchCandidateOptions<TRow, TRowData, TInvoice> = {
  rows: readonly TRow[];
  extractRowData: (row: TRow) => TRowData;
  findMatchingInvoice: (rowData: TRowData) => TInvoice | null;
  shouldTreatAsDownloaded: (invoice: TInvoice, options: { hideWhenXmlIsAvailable: boolean }) => boolean;
  hideWhenXmlIsAvailable: boolean;
  getAccessCell: (rowData: TRowData) => HTMLElement | null;
  getAccessKey: (rowData: TRowData) => string | null;
  getXmlLink: (rowData: TRowData) => HTMLAnchorElement | null;
  getPdfLink: (rowData: TRowData) => HTMLAnchorElement | null;
};

export function buildBatchDownloadCandidates<
  TRow,
  TRowData,
  TInvoice extends { xml_status: unknown; pdf_status: unknown },
>(
  options: BatchCandidateOptions<TRow, TRowData, TInvoice>,
): DownloadQueueCandidate<TRow>[] {
  const candidates: DownloadQueueCandidate<TRow>[] = [];

  for (const row of options.rows) {
    const rowData = options.extractRowData(row);
    const invoice = options.findMatchingInvoice(rowData);

    if (!invoice) continue;

    const xmlAvailable = Boolean(invoice.xml_status);
    const pdfOk = Boolean(invoice.pdf_status);
    const downloaded = options.shouldTreatAsDownloaded(invoice, {
      hideWhenXmlIsAvailable: options.hideWhenXmlIsAvailable,
    });

    if (downloaded) continue;

    candidates.push({
      row,
      accessCell: options.getAccessCell(rowData),
      accessKey: options.getAccessKey(rowData),
      downloaded,
      xmlAvailable,
      pdfOk,
      xmlLink: options.getXmlLink(rowData),
      pdfLink: options.getPdfLink(rowData),
    });
  }

  return candidates;
}
