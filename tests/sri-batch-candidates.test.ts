import { describe, expect, test } from 'bun:test';
import { buildBatchDownloadCandidates } from '../scripts/sri-comprobantes/src/domain/batch/batch-candidates.ts';

describe('SRI batch candidates', () => {
  test('omite filas sin factura o ya descargadas y conserva enlaces válidos', () => {
    const candidates = buildBatchDownloadCandidates({
      rows: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }],
      extractRowData: (row) => ({ row }),
      findMatchingInvoice: (rowData) => {
        if (rowData.row.id === 'r1') {
          return {
            xml_status: 'pending',
            pdf_status: 'pending',
          };
        }

        if (rowData.row.id === 'r2') {
          return {
            xml_status: 'pending',
            pdf_status: 'pending',
          };
        }

        return null;
      },
      getAccessCell: (rowData) => ({ id: `${rowData.row.id}-access` } as HTMLElement),
      getAccessKey: (rowData) => `${rowData.row.id}-access-key`,
      getXmlLink: (rowData) => (rowData.row.id === 'r1' ? ({ id: 'xml-r1' } as HTMLAnchorElement) : null),
      getPdfLink: (rowData) => (rowData.row.id === 'r1' ? ({ id: 'pdf-r1' } as HTMLAnchorElement) : null),
      shouldTreatAsDownloaded: (invoice, { hideWhenXmlIsAvailable }) =>
        hideWhenXmlIsAvailable && invoice.xml_status === 'pending' && invoice.pdf_status === 'pending',
      hideWhenXmlIsAvailable: false,
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0].row.id).toBe('r1');
    expect(candidates[0].accessKey).toBe('r1-access-key');
    expect(candidates[0].xmlLink?.id).toBe('xml-r1');
    expect(candidates[1].row.id).toBe('r2');
  });

  test('respeta el filtro de descargadas', () => {
    const candidates = buildBatchDownloadCandidates({
      rows: [{ id: 'r1' }],
      extractRowData: (row) => ({ row }),
      findMatchingInvoice: () => ({ xml_status: 'pending', pdf_status: 'pending' }),
      getAccessCell: () => null,
      getAccessKey: () => 'k1',
      getXmlLink: () => ({ id: 'xml' } as HTMLAnchorElement),
      getPdfLink: () => ({ id: 'pdf' } as HTMLAnchorElement),
      shouldTreatAsDownloaded: () => true,
      hideWhenXmlIsAvailable: true,
    });

    expect(candidates).toEqual([]);
  });
});
