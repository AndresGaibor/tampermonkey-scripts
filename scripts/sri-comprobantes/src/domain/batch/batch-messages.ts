export function buildBatchPageLoadingMessage(pageCount: number, queueLength: number) {
  return `Página ${pageCount || 1}: ${queueLength} archivo(s) pendiente(s).`;
}

export function buildBatchAdvanceMessage(beforeSignature: string) {
  return `Avanzando a la siguiente página desde ${beforeSignature}...`;
}
