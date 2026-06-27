export type DownloadQueueCandidate<TRow> = {
  row: TRow;
  accessCell: HTMLElement | null;
  accessKey: string | null;
  downloaded: boolean;
  xmlAvailable: boolean;
  pdfOk: boolean;
  xmlLink: HTMLAnchorElement | null;
  pdfLink: HTMLAnchorElement | null;
};

export type DownloadQueueConfig = {
  autoDownloadXml: boolean;
  autoDownloadPdf: boolean;
  maxBatchDownloadsPerPage: number;
};

export type DownloadQueueItem<TRow> = {
  row: TRow;
  link: HTMLAnchorElement;
  accessCell: HTMLElement | null;
  accessKey: string | null;
  file: 'xml' | 'pdf';
};

export function buildDownloadQueue<TRow>(
  candidates: DownloadQueueCandidate<TRow>[],
  config: DownloadQueueConfig,
): DownloadQueueItem<TRow>[] {
  const queue: DownloadQueueItem<TRow>[] = [];

  for (const candidate of candidates) {
    if (candidate.downloaded) continue;

    if (config.autoDownloadXml && !candidate.xmlAvailable && candidate.xmlLink) {
      queue.push({
        row: candidate.row,
        link: candidate.xmlLink,
        accessCell: candidate.accessCell,
        accessKey: candidate.accessKey,
        file: 'xml',
      });
    }

    if (config.autoDownloadPdf && !candidate.pdfOk && candidate.pdfLink) {
      queue.push({
        row: candidate.row,
        link: candidate.pdfLink,
        accessCell: candidate.accessCell,
        accessKey: candidate.accessKey,
        file: 'pdf',
      });
    }
  }

  return queue.slice(0, config.maxBatchDownloadsPerPage);
}
