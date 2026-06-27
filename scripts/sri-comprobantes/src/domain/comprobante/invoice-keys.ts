import { onlyDigits } from '@shared/text.ts';

export type InvoiceLike = {
  access_key?: string | null;
  series?: string | null;
  sequential?: string | null;
};

export type InvoiceIndexes<TInvoice> = {
  byAccessKey: Map<string, TInvoice>;
  byDocumentNumber: Map<string, TInvoice>;
};

export function buildDocumentNumber(invoice: InvoiceLike): string | null {
  const series = onlyDigits(invoice.series ?? '');
  const sequential = onlyDigits(invoice.sequential ?? '');

  if (!series || !sequential) return null;
  return `${series}${sequential}`;
}

export function getDocumentNumberFromAccessKey(accessKey: string | null | undefined): string | null {
  const key = onlyDigits(accessKey ?? '');

  if (key.length < 39) return null;

  const series = key.slice(24, 30);
  const sequential = key.slice(30, 39);

  return `${series}${sequential}`;
}

export function buildInvoiceIndexes<TInvoice extends InvoiceLike>(invoices: TInvoice[]): InvoiceIndexes<TInvoice> {
  const byAccessKey = new Map<string, TInvoice>();
  const byDocumentNumber = new Map<string, TInvoice>();

  for (const invoice of invoices) {
    const accessKey = onlyDigits(invoice.access_key ?? '');

    if (accessKey) byAccessKey.set(accessKey, invoice);

    const documentNumber = buildDocumentNumber(invoice);
    if (documentNumber) byDocumentNumber.set(documentNumber, invoice);

    const documentNumberFromAccessKey = getDocumentNumberFromAccessKey(accessKey);
    if (documentNumberFromAccessKey) byDocumentNumber.set(documentNumberFromAccessKey, invoice);
  }

  return { byAccessKey, byDocumentNumber };
}
