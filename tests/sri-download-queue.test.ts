import { describe, expect, test } from 'bun:test';
import { buildDownloadQueue } from '../scripts/sri-comprobantes/src/domain/download-queue.ts';

describe('SRI download queue', () => {
  test('solo encola archivos faltantes y respeta el límite máximo', () => {
    const queue = buildDownloadQueue(
      [
        {
          row: { id: 'r1' },
          accessCell: null,
          accessKey: 'k1',
          downloaded: false,
          xmlAvailable: false,
          pdfOk: false,
          xmlLink: { id: 'xml1' } as HTMLAnchorElement,
          pdfLink: { id: 'pdf1' } as HTMLAnchorElement,
        },
        {
          row: { id: 'r2' },
          accessCell: null,
          accessKey: 'k2',
          downloaded: true,
          xmlAvailable: false,
          pdfOk: false,
          xmlLink: { id: 'xml2' } as HTMLAnchorElement,
          pdfLink: { id: 'pdf2' } as HTMLAnchorElement,
        },
      ],
      {
        autoDownloadXml: true,
        autoDownloadPdf: true,
        maxBatchDownloadsPerPage: 1,
      },
    );

    expect(queue).toHaveLength(1);
    expect(queue[0].file).toBe('xml');
    expect(queue[0].accessKey).toBe('k1');
  });
});
