import {
  buildCurrentPeriodsKey,
  getCurrentPageRuc,
  getSelectedDocumentType,
  getSelectedYear,
} from './sri-dom.ts';

export function getCurrentPeriodsKey(CONFIG: {
  RECEIVER_RUC_OVERRIDE: string;
  SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001: boolean;
}): string | null {
  const pageRuc = getCurrentPageRuc(document, CONFIG.RECEIVER_RUC_OVERRIDE);
  const year = getSelectedYear(document);
  const documentType = getSelectedDocumentType(document);

  return buildCurrentPeriodsKey({
    pageRuc,
    receiverRucOverride: CONFIG.RECEIVER_RUC_OVERRIDE,
    sendReceiverAsBase10WhenEnds001: CONFIG.SEND_RECEIVER_AS_BASE10_WHEN_ENDS_001,
    year,
    documentType,
  });
}

export function resetMonthVisibility(
  state: { hiddenMonthsCount: number },
  updateDashboardStats: () => void,
) {
  const monthSelect = document.getElementById('frmPrincipal:mes') as HTMLSelectElement | null;

  if (!monthSelect) {
    return;
  }

  for (const option of Array.from(monthSelect.options) as HTMLOptionElement[]) {
    option.hidden = false;
    option.disabled = false;
    option.title = '';
    option.dataset.tmSriHidden = 'false';
  }

  state.hiddenMonthsCount = 0;
  updateDashboardStats();
}

export function applyMonthVisibility(
  state: {
    hiddenMonthsCount: number;
    periodData: unknown;
    periodDataKey: string | null;
    monthsByNumber: Map<number, unknown>;
  },
  CONFIG: { NEVER_HIDE_SELECTED_MONTH: boolean },
  getCurrentPeriodsKeyFn: () => string | null,
  resetMonthVisibilityFn: () => void,
  updateDashboardStats: () => void,
) {
  const monthSelect = document.getElementById('frmPrincipal:mes') as HTMLSelectElement | null;

  if (!monthSelect) {
    return;
  }

  const currentKey = getCurrentPeriodsKeyFn();

  if (
    !currentKey ||
    !state.periodData ||
    !state.periodDataKey ||
    state.periodDataKey !== currentKey ||
    state.monthsByNumber.size === 0
  ) {
    resetMonthVisibilityFn();
    return;
  }

  const selectedMonth = Number(monthSelect.value);
  let hiddenCount = 0;

  for (const option of Array.from(monthSelect.options) as HTMLOptionElement[]) {
    const monthNumber = Number(option.value);
    const metadata = state.monthsByNumber.get(monthNumber) as {
      can_hide?: boolean;
      status?: string;
      total?: number;
      downloaded?: number;
      missing?: number;
    } | undefined;

    if (!metadata) {
      option.hidden = false;
      option.disabled = false;
      option.title = '';
      option.dataset.tmSriHidden = 'false';
      continue;
    }

    let shouldHide = Boolean(metadata.can_hide);

    if (CONFIG.NEVER_HIDE_SELECTED_MONTH && monthNumber === selectedMonth) {
      shouldHide = false;
    }

    option.hidden = shouldHide;
    option.disabled = shouldHide;
    option.dataset.tmSriHidden = shouldHide ? 'true' : 'false';

    option.title = `Estado: ${metadata.status || '-'}. Total: ${metadata.total ?? 0}. Descargadas: ${metadata.downloaded ?? 0}. Pendientes: ${metadata.missing ?? 0}.`;

    if (shouldHide) {
      hiddenCount++;
    }
  }

  state.hiddenMonthsCount = hiddenCount;
  updateDashboardStats();
}
