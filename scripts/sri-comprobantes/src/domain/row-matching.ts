import { normalizeSpaces, normalizeText } from '../../../../shared/text.ts';

export type RowInvoiceLike = {
  downloaded?: boolean;
  xml_status?: unknown;
  pdf_status?: unknown;
};

export type RowMatchingConfig = {
  hideWhenXmlIsAvailable: boolean;
};

export type TableIndexes = { type: number; access: number; xml: number; pdf: number };

export function buildTableIndexes(headers: string[]): TableIndexes {
  const normalizedHeaders = headers.map((header) => normalizeText(header));

  const findHeader = (...needles: string[]): number | null => {
    const index = normalizedHeaders.findIndex((text) =>
      needles.some((needle) => text.includes(needle)),
    );

    return index >= 0 ? index : null;
  };

  return {
    type: findHeader('tipo y serie') ?? 2,
    access: findHeader('clave de acceso', 'autorizacion') ?? 3,
    xml: findHeader('documento') ?? 9,
    pdf: findHeader('ride') ?? 10,
  };
}

export function extractAccessKeyFromText(text: string): string | null {
  const accessKeyMatch = text.match(/\b\d{49}\b/);
  return accessKeyMatch ? accessKeyMatch[0] : null;
}

export function extractDocumentNumberFromTypeText(text: string): string | null {
  const typeText = normalizeSpaces(text);
  const docMatch = typeText.match(/(\d{3})\s*-\s*(\d{3})\s*-\s*(\d{9})/);

  if (!docMatch) return null;

  return `${docMatch[1]}${docMatch[2]}${docMatch[3]}`;
}

export function shouldTreatAsDownloaded(
  invoice: RowInvoiceLike,
  config: RowMatchingConfig,
): boolean {
  const xmlAvailable = String(invoice.xml_status ?? '').toLowerCase() === 'available';
  const pdfValue = String(invoice.pdf_status ?? '').toLowerCase();
  const pdfOk = pdfValue !== '' && pdfValue !== 'missing';

  return Boolean(
    invoice.downloaded === true ||
      (config.hideWhenXmlIsAvailable && xmlAvailable) ||
      (xmlAvailable && pdfOk),
  );
}
