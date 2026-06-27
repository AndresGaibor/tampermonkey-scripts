import { getStoredValue } from '@shared/storage';
import './style.css';

const SENT_KEY = 'deuna_sent_txns';
const SENT_SIGNATURES_KEY = 'deuna_sent_signatures';
const POLL_INTERVAL = 5000;
const SENT_BADGE_TEXT = 'Enviado';

interface DeunaEmailReceipt {
  sender: string;
  subject: string;
  receivedAt?: string;
  customerName?: string;
  maskedId?: string;
  amount: number;
  currency: string;
  reason?: string;
  transactionDate?: string;
  sourceAccount?: string;
  destinationAccount?: string;
  transactionNumber: string;
  supportPhone?: string;
  emailChecksum?: string;
  rawJson?: string;
}

interface DeunaStoredEmailReceipt {
  sender?: string;
  subject?: string;
  received_at?: string | null;
  receivedAt?: string | null;
  customer_name?: string | null;
  customerName?: string | null;
  masked_id?: string | null;
  maskedId?: string | null;
  amount?: number | string;
  currency?: string | null;
  reason?: string | null;
  transaction_date?: string | null;
  transactionDate?: string | null;
  source_account?: string | null;
  sourceAccount?: string | null;
  destination_account?: string | null;
  destinationAccount?: string | null;
  transaction_number?: string | null;
  transactionNumber?: string | null;
  support_phone?: string | null;
  supportPhone?: string | null;
}

type ReceiptParts = Partial<Pick<
  DeunaEmailReceipt,
  'sender' | 'subject' | 'receivedAt' | 'customerName' | 'maskedId' | 'amount' | 'currency' | 'reason' | 'transactionDate' | 'sourceAccount' | 'destinationAccount' | 'supportPhone'
>>;

function loadStringSet(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return new Set();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();

    return new Set(parsed.filter((value): value is string => typeof value === 'string' && value.length > 0));
  } catch {
    return new Set();
  }
}

function saveStringSet(storageKey: string, values: Set<string>): void {
  localStorage.setItem(storageKey, JSON.stringify([...values]));
}

function normalizeFingerprintValue(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';

  const raw = typeof value === 'number' ? value.toFixed(2) : value;
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildReceiptSignatures(data: ReceiptParts): string[] {
  const currency = data.currency || 'USD';
  const amount = typeof data.amount === 'number' ? data.amount.toFixed(2) : '';

  const variants = [
    [data.sender, amount, currency, data.reason, data.transactionDate, data.customerName, data.maskedId, data.sourceAccount, data.destinationAccount, data.supportPhone],
    [data.sender, amount, currency, data.reason, data.transactionDate, data.customerName],
    [data.sender, amount, currency, data.reason, data.transactionDate],
    [data.sender, amount, currency, data.reason],
  ];

  return [...new Set(variants.map((parts) => parts.map(normalizeFingerprintValue).filter(Boolean).join('|')).filter(Boolean))];
}

function getSentSignatures(): Set<string> {
  return loadStringSet(SENT_SIGNATURES_KEY);
}

function markSentFingerprints(data: ReceiptParts): void {
  const sent = getSentSignatures();
  for (const signature of buildReceiptSignatures(data)) {
    sent.add(signature);
  }
  saveStringSet(SENT_SIGNATURES_KEY, sent);
}

function isFingerprintLoaded(data: ReceiptParts): boolean {
  const sent = getSentSignatures();
  return buildReceiptSignatures(data).some((signature) => sent.has(signature));
}

function normalizeDeunaApiBase(value: string): string {
  const base = value.replace(/\/+$/, '');
  if (base.endsWith('/api/deuna-imports')) return base;
  if (base.endsWith('/api')) return `${base}/deuna-imports`;

  try {
    const url = new URL(base);
    if (!url.pathname || url.pathname === '/') return `${base}/api/deuna-imports`;
  } catch {}

  return base;
}

// Configurable API Base
function getApiBase(): string {
  try {
    const val = getStoredValue<string>('deuna_api_base', '');
    if (val) return normalizeDeunaApiBase(val);
  } catch {}

  try {
    const val = localStorage.getItem('deuna_api_base');
    if (val) return normalizeDeunaApiBase(val);
  } catch {}

  try {
    const val = getStoredValue<string>('api_base', '');
    if (val) return normalizeDeunaApiBase(val);
  } catch {}

  return 'http://localhost:3000/api/deuna-imports';
}

function getSentTxnIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SENT_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markSent(txnNumber: string): void {
  const sent = getSentTxnIds();
  sent.add(txnNumber);
  localStorage.setItem(SENT_KEY, JSON.stringify([...sent]));
}

function toReceiptParts(receipt: DeunaStoredEmailReceipt): (ReceiptParts & { transactionNumber?: string }) | null {
  const amount = typeof receipt.amount === 'string' ? Number(receipt.amount) : receipt.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;

  return {
    sender: receipt.sender || 'notificaciones@deunaapp.com',
    subject: receipt.subject || 'Recarga Deuna',
    receivedAt: receipt.receivedAt || receipt.received_at || undefined,
    customerName: receipt.customerName || receipt.customer_name || undefined,
    maskedId: receipt.maskedId || receipt.masked_id || undefined,
    amount,
    currency: receipt.currency || 'USD',
    reason: receipt.reason || 'Recarga',
    transactionDate: receipt.transactionDate || receipt.transaction_date || undefined,
    sourceAccount: receipt.sourceAccount || receipt.source_account || undefined,
    destinationAccount: receipt.destinationAccount || receipt.destination_account || undefined,
    transactionNumber: receipt.transactionNumber || receipt.transaction_number || undefined,
    supportPhone: receipt.supportPhone || receipt.support_phone || undefined,
  };
}

function parseStoredReceipts(payload: unknown): DeunaStoredEmailReceipt[] {
  if (!payload || typeof payload !== 'object') return [];

  const data = 'data' in payload ? (payload as { data?: unknown }).data : payload;
  if (Array.isArray(data)) return data as DeunaStoredEmailReceipt[];
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: DeunaStoredEmailReceipt[] }).items;
  }

  return [];
}

async function getStoredReceipts(): Promise<DeunaStoredEmailReceipt[]> {
  const url = `${getApiBase()}/emails?pageSize=2000`;
  const fn = typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : null;

  if (fn) {
    const payload = await new Promise<unknown>((resolve, reject) => {
      fn({
        method: 'GET',
        url,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            try {
              resolve(JSON.parse(res.responseText));
            } catch (error) {
              reject(error);
            }
          } else {
            reject(new Error(`HTTP ${res.status}: ${res.responseText}`));
          }
        },
        onerror: (err) => reject(err),
        ontimeout: () => reject(new Error('Timeout de red')),
        timeout: 10000,
      });
    });
    return parseStoredReceipts(payload);
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  return parseStoredReceipts(await response.json());
}

let sentReceiptsHydrated = false;

async function hydrateSentReceipts(): Promise<void> {
  if (sentReceiptsHydrated) return;
  sentReceiptsHydrated = true;

  try {
    const receipts = await getStoredReceipts();
    for (const receipt of receipts) {
      const parts = toReceiptParts(receipt);
      if (!parts) continue;

      markSentFingerprints(parts);
      if (parts.transactionNumber) markSent(parts.transactionNumber);
    }
    updateMailListBadges();
    updateReadingPaneBadge();
  } catch (error) {
    console.warn('[Deuna→SriCache] No se pudo cargar el historial de recargas:', error);
  }
}

async function postReceipt(data: DeunaEmailReceipt): Promise<{ success: boolean; duplicated?: boolean }> {
  const apiBase = getApiBase();
  const url = `${apiBase}/emails`;

  return new Promise((resolve, reject) => {
    // Fallback if GM_xmlhttpRequest is not available
    const fn = typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : null;

    if (fn) {
      fn({
        method: 'POST',
        url,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(data),
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            resolve({ success: true });
          } else if (res.status === 409) {
            resolve({ success: true, duplicated: true });
          } else {
            reject(new Error(`HTTP ${res.status}: ${res.responseText}`));
          }
        },
        onerror: (err) => reject(err),
        ontimeout: () => reject(new Error('Timeout de red')),
        timeout: 10000,
      });
    } else {
      // Standard fetch fallback
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
        .then((res) => {
          if (res.status >= 200 && res.status < 300) {
            resolve({ success: true });
          } else if (res.status === 409) {
            resolve({ success: true, duplicated: true });
          } else {
            res.text().then((text) => reject(new Error(`HTTP ${res.status}: ${text}`)));
          }
        })
        .catch(reject);
    }
  });
}

function getReadingPaneText(): { text: string; element: Element | null } {
  const selectors = [
    '#ConversationReadingPaneContainer [id^="UniqueMessageBody_"]',
    '#ReadingPaneContainerId [id^="UniqueMessageBody_"]',
    '#ReadingPaneContainerId',
    '#ConversationReadingPaneContainer',
    '[role="document"]',
    '[aria-label="Cuerpo del mensaje"]',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const text = el.textContent?.replace(/\s+/g, ' ').trim();
      if (text) return { text, element: el };
    }
  }

  return {
    text: document.body.textContent?.replace(/\s+/g, ' ').trim() || '',
    element: null,
  };
}

function parseAmount(amountStr: string): number | null {
  try {
    const clean = amountStr.replace(/[^0-9,.]/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

function isDeunaEmail(text: string): boolean {
  // Look for the specific header/content fields of a Deuna email
  const hasDeunaKeywords =
    /Recargaste/i.test(text) &&
    /Detalles de la transacci[oó]n/i.test(text) &&
    /Monto/i.test(text);
  const hasDeunaSender = text.includes('notificaciones@deunaapp.com');
  return hasDeunaKeywords || (hasDeunaSender && /Recargaste/i.test(text));
}

function parseDeunaReceiptFromText(
  text: string,
  overrides: Partial<Pick<DeunaEmailReceipt, 'sender' | 'subject' | 'receivedAt'>> = {},
  options: { requireTransactionNumber?: boolean } = {},
): DeunaEmailReceipt | null {
  if (!isDeunaEmail(text)) return null;

  const fieldSeparator = '\\s*: ?\\s*|\\s+';
  const txnMatch = text.match(new RegExp(`N[uú]mero de transacci[oó]n(?:${fieldSeparator})(\\d+)`, 'i'));
  const amountMatch = text.match(new RegExp(`Monto(?:${fieldSeparator})\\$?([\\d,.]+)\\s*(USD)?`, 'i'));
  const reasonMatch = text.match(new RegExp(`Motivo(?:${fieldSeparator})([A-Za-zÁÉÍÓÚáéíóúñÑ ]+?)\\s+Fecha`, 'i'));

  if (!amountMatch || !reasonMatch) return null;

  const amount = parseAmount(amountMatch[1]);
  if (amount === null) return null;

  const reason = reasonMatch[1].trim();
  if (reason.toLowerCase() !== 'recarga') return null;

  const dateMatch = text.match(new RegExp(`Fecha(?:${fieldSeparator})(\\d{1,2}\\s+[a-zA-ZáéíóúñÑ]+\\.?\\s+\\d{4}\\s*-\\s*\\d{2}[h:]\\d{2})`, 'i'));
  const sourceMatch = text.match(new RegExp(`Cuenta de origen(?:${fieldSeparator})(\\*+\\d+)`, 'i'));
  const destMatch = text.match(new RegExp(`Cuenta de destino(?:${fieldSeparator})(\\*+\\d+)`, 'i'));
  const maskedIdMatch = text.match(new RegExp(`C[ée]dula terminada en(?:${fieldSeparator})(\\*+\\d+)`, 'i'));

  let supportPhone: string | undefined;
  const phoneMatch = text.match(/09[\d\s-]{8,15}/);
  if (phoneMatch) {
    const digits = phoneMatch[0].replace(/\s+/g, '');
    if (digits.length === 10) {
      supportPhone = digits;
    }
  }

  let customerName: string | undefined;
  const nameMatch = text.match(/Cliente\s*: ?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ\s]+?)(?:\s+Ci|$)/i);
  if (nameMatch) {
    customerName = nameMatch[1].trim();
  } else {
    const altMatch = text.match(/([A-Za-zÁÉÍÓÚáéíóúñÑ\s]{3,})\s+C[ée]dula terminada/i);
    if (altMatch) {
      customerName = altMatch[1].trim();
    }
  }

  const subject = overrides.subject || 'Recarga Deuna';
  const receipt = {
    sender: overrides.sender || 'notificaciones@deunaapp.com',
    subject,
    receivedAt: overrides.receivedAt,
    amount,
    currency: amountMatch[2] || 'USD',
    reason,
    transactionDate: dateMatch ? dateMatch[1] : undefined,
    sourceAccount: sourceMatch ? sourceMatch[1] : undefined,
    destinationAccount: destMatch ? destMatch[1] : undefined,
    transactionNumber: txnMatch?.[1] ?? '',
    supportPhone,
    customerName,
    maskedId: maskedIdMatch ? maskedIdMatch[1] : undefined,
    rawJson: JSON.stringify({ extractedAt: new Date().toISOString() }),
  };

  if (options.requireTransactionNumber !== false && !receipt.transactionNumber) return null;

  return receipt;
}

function getOutlookMailItems(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[role="option"][aria-label]')) as HTMLElement[];
}

function getOutlookReadingPane(): HTMLElement | null {
  return (
    (document.querySelector('#ConversationReadingPaneContainer') as HTMLElement | null) ||
    (document.querySelector('#ReadingPaneContainerId') as HTMLElement | null) ||
    (document.querySelector('[role="document"]') as HTMLElement | null)
  );
}

function extractFromPage(): DeunaEmailReceipt | null {
  const { text } = getReadingPaneText();

  let subject = '';
  const subjectSelectors = [
    '#ConversationReadingPaneContainer [id$="_SUBJECT"] [title]',
    '#ConversationReadingPaneContainer [id$="_SUBJECT"]',
    '#ReadingPaneContainerId [id$="_SUBJECT"] [title]',
    '#ReadingPaneContainerId [id$="_SUBJECT"]',
  ];

  for (const selector of subjectSelectors) {
    const subjectEl = document.querySelector(selector);
    const candidate = subjectEl?.getAttribute('title')?.trim() || subjectEl?.textContent?.trim();
    if (candidate) {
      subject = candidate;
      break;
    }
  }

  if (!subject) {
    subject = document.title || '';
    if (subject.endsWith(' - Outlook')) {
      subject = subject.slice(0, -10);
    } else if (subject.endsWith(' - Mail - Outlook')) {
      subject = subject.slice(0, -17);
    }
  }

  const parsed = parseDeunaReceiptFromText(text, { subject: subject || 'Recarga Deuna' });
  if (!parsed?.transactionNumber) return null;

  return parsed;
}

function extractPreviewReceipt(option: Element): DeunaEmailReceipt | null {
  const text = option.getAttribute('aria-label')?.replace(/\s+/g, ' ').trim() || option.textContent?.replace(/\s+/g, ' ').trim() || '';

  const isDeuna = text.includes('notificaciones@deunaapp.com') && /Recargaste/i.test(text);
  if (!isDeuna) return null;

  const subjectMatch = text.match(/¡Listo!\s+Recargaste\s+\$?([\d,.]+)\s+en\s+tu\s+cuenta\s+Deuna/i);
  if (!subjectMatch) return null;

  const amount = parseAmount(subjectMatch[1]);
  if (amount === null) return null;

  const dateMatch = text.match(/\b(Lun|Mar|Mi[eé]|Jue|Vie|S[aá]b|Dom)\b\s+(\d{1,2}\/\d{1,2}\/\d{4})/i) || text.match(/\b(Lun|Mar|Mi[eé]|Jue|Vie|S[aá]b|Dom)\b\s+\d{1,2}:\d{2}/i);
  const receivedAt = dateMatch ? dateMatch[0] : undefined;

  const parsed = parseDeunaReceiptFromText(text, {
    sender: 'notificaciones@deunaapp.com',
    subject: subjectMatch[0],
    receivedAt,
  }, { requireTransactionNumber: false });

  if (parsed) return parsed;

  return {
    sender: 'notificaciones@deunaapp.com',
    subject: subjectMatch[0],
    receivedAt,
    amount,
    currency: 'USD',
    reason: 'Recarga',
    transactionNumber: '',
  };
}

function renderBadge(target: HTMLElement | null, show: boolean): void {
  if (!target) return;

  const existing = target.querySelector(':scope > .deuna-sent-badge') as HTMLElement | null;
  if (!show) {
    existing?.remove();
    return;
  }

  if (existing) {
    existing.textContent = SENT_BADGE_TEXT;
    return;
  }

  const badge = document.createElement('span');
  badge.className = 'deuna-sent-badge';
  badge.textContent = SENT_BADGE_TEXT;
  target.appendChild(badge);
}

function updateMailListBadges(): void {
  for (const option of getOutlookMailItems()) {
    const receipt = extractPreviewReceipt(option);
    if (!receipt) {
      renderBadge(option, false);
      continue;
    }

    const loaded = Boolean(receipt.transactionNumber && getSentTxnIds().has(receipt.transactionNumber));
    renderBadge(option, loaded);
  }
}

function updateReadingPaneBadge(): void {
  const pane = getOutlookReadingPane();
  if (!pane) return;

  const receipt = extractFromPage();
  renderBadge(pane, Boolean(receipt && (isFingerprintLoaded(receipt) || getSentTxnIds().has(receipt.transactionNumber))));
}

async function processCurrentEmail(): Promise<boolean> {
  const data = extractFromPage();
  if (!data) return false;

  const sent = getSentTxnIds();
  if (sent.has(data.transactionNumber)) {
    markSentFingerprints(data);
    return true; // Already processed
  }

  try {
    const res = await postReceipt(data);
    if (res.success) {
      markSent(data.transactionNumber);
      markSentFingerprints(data);
      console.log('[Deuna→SriCache] Sincronizada recarga:', data.transactionNumber, data.amount);
      return true;
    }
  } catch (err) {
    console.error('[Deuna→SriCache] Error al sincronizar:', err);
  }
  return false;
}

function addUI(): void {
  const existing = document.getElementById('deuna-sricache-btn');
  if (existing) return;

  const btn = document.createElement('button');
  btn.id = 'deuna-sricache-btn';
  btn.textContent = 'Enviar recarga a SriCache';

  btn.addEventListener('click', async () => {
    btn.textContent = 'Enviando...';
    btn.disabled = true;

    const data = extractFromPage();
    if (!data) {
      btn.textContent = 'No es correo Deuna';
      setTimeout(() => {
        btn.textContent = 'Enviar recarga a SriCache';
        btn.disabled = false;
      }, 2000);
      return;
    }

    const sent = getSentTxnIds();
    if (sent.has(data.transactionNumber)) {
      markSentFingerprints(data);
      btn.textContent = '✓ Ya enviado';
      setTimeout(() => {
        btn.textContent = 'Enviar recarga a SriCache';
        btn.disabled = false;
      }, 2000);
      return;
    }

    try {
      const res = await postReceipt(data);
      if (res.success) {
        markSent(data.transactionNumber);
        markSentFingerprints(data);
        btn.textContent = res.duplicated ? '✓ Ya existía' : '✓ Enviado';
      } else {
        btn.textContent = '❌ Error';
      }
    } catch (err) {
      console.error(err);
      btn.textContent = '❌ Error';
    }

    setTimeout(() => {
      btn.textContent = 'Enviar recarga a SriCache';
      btn.disabled = false;
    }, 2000);
  });

  document.body.appendChild(btn);
}

let lastUrl = location.href;
let mailListObserverStarted = false;
let mailListScrollStarted = false;
let badgeRefreshScheduled = false;

function scheduleBadgeRefresh(): void {
  if (badgeRefreshScheduled) return;
  badgeRefreshScheduled = true;

  const refresh = () => {
    badgeRefreshScheduled = false;
    updateMailListBadges();
    updateReadingPaneBadge();
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(refresh);
    return;
  }

  setTimeout(refresh, 0);
}

function observeOutlookMutations(): void {
  if (mailListObserverStarted || typeof MutationObserver === 'undefined') return;
  mailListObserverStarted = true;

  const observer = new MutationObserver(scheduleBadgeRefresh);
  observer.observe(document.body, { childList: true, subtree: true });
}

function observeOutlookScroll(): void {
  if (mailListScrollStarted) return;
  mailListScrollStarted = true;

  document.addEventListener('scroll', scheduleBadgeRefresh, { capture: true, passive: true });
}

function startPolling(): void {
  addUI();
  observeOutlookMutations();
  observeOutlookScroll();
  void hydrateSentReceipts();
  updateMailListBadges();
  updateReadingPaneBadge();

  setInterval(() => {
    // 1. Detect URL change in Outlook SPA and re-add button if needed
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      addUI();
    }

    // 2. Double check if button got removed from DOM due to SPA rendering
    if (!document.getElementById('deuna-sricache-btn')) {
      addUI();
    }

    updateMailListBadges();
    updateReadingPaneBadge();

    // 3. Auto scan for new Deuna emails and post them automatically
    const data = extractFromPage();
    if (data) {
      const sent = getSentTxnIds();
      if (!sent.has(data.transactionNumber)) {
        processCurrentEmail();
      }
    }
  }, POLL_INTERVAL);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startPolling);
} else {
  startPolling();
}
