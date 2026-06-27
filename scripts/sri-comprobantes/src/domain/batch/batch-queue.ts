export type BatchQueueResult<T> = {
  item?: T;
  remaining: T[];
};

export function dequeueBatchItem<T>(queue: readonly T[]): BatchQueueResult<T> {
  const [item, ...remaining] = queue;

  return {
    item,
    remaining,
  };
}

export function buildBatchProgressMessage(
  fileLabel: string,
  downloadedCount: number,
  queueTotal: number,
  remainingInPage: number,
) {
  return (
    `Descargando ${fileLabel} ${downloadedCount}/${queueTotal}. ` +
    `Restantes en página: ${remainingInPage}.`
  );
}
