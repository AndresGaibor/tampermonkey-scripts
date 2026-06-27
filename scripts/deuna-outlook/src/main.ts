import { getStoredValue } from '@shared/storage';
import './style.css';

const SENT_KEY = 'deuna_sent_txns';
const POLL_INTERVAL = 5000;

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

// Configurable API Base
function getApiBase(): string {
  try {
    const val = getStoredValue<string>('api_base', '');
    if (val) return val.replace(/\/+$/, '');
  } catch {}

  try {
    const val = localStorage.getItem('deuna_api_base');
    if (val) return val.replace(/\/+$/, '');
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
  // Selectors in priority order to target only the active reading pane / selected email
  const selectors = [
    '#selected-email',
    'div[role="document"]',
    '[aria-label="Cuerpo del mensaje"]',
    '#ReadingPaneContainerId',
    '#ItemHeader',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const text = el.textContent?.replace(/\s+/g, ' ').trim();
      if (text) return { text, element: el };
    }
  }

  // Fallback to body
  return {
    text: document.body.textContent?.replace(/\s+/g, ' ').trim() || '',
    element: null,
  };
}

function parseAmount(amountStr: string): number | null {
  try {
    const clean = amountStr.replace(/[^0-9,.]/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? null : parsed;
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

function extractFromPage(): DeunaEmailReceipt | null {
  const { text } = getReadingPaneText();

  if (!isDeunaEmail(text)) return null;

  // Extract transaction number
  const txnMatch = text.match(/N[uú]mero de transacci[oó]n\s*:?\s*(\d+)/i);
  if (!txnMatch) return null;
  const transactionNumber = txnMatch[1];

  // Extract amount
  const amountMatch = text.match(/Monto\s*:?\s*\$?([\d,.]+)\s*(USD)?/i);
  if (!amountMatch) return null;
  const amount = parseAmount(amountMatch[1]);
  if (amount === null) return null;

  // Extract reason
  const reasonMatch = text.match(/Motivo\s*:?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ ]+?)\s+Fecha/i);
  const reason = reasonMatch ? reasonMatch[1].trim() : 'Recarga';

  // Only process "Recarga" motive
  if (reason.toLowerCase() !== 'recarga') return null;

  // Extract optional fields
  const dateMatch = text.match(/Fecha\s*:?\s*(\d{1,2}\s+[a-zA-ZáéíóúñÑ]+\.?\s+\d{4}\s*-\s*\d{2}[h:]\d{2})/i);
  const sourceMatch = text.match(/Cuenta de origen\s*:?\s*(\*+\d+)/i);
  const destMatch = text.match(/Cuenta de destino\s*:?\s*(\*+\d+)/i);
  const maskedIdMatch = text.match(/C[ée]dula terminada en\s*:?\s*(\*+\d+)/i);

  let supportPhone: string | undefined;
  const phoneMatch = text.match(/09[\d\s-]{8,15}/);
  if (phoneMatch) {
    const digits = phoneMatch[0].replace(/\s+/g, '');
    if (digits.length === 10) {
      supportPhone = digits;
    }
  }

  let customerName: string | undefined;
  const nameMatch = text.match(/Cliente\s*:?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ\s]+?)(?:\s+Ci|$)/i);
  if (nameMatch) {
    customerName = nameMatch[1].trim();
  } else {
    // In many emails the customer name is preceding "Cédula terminada en"
    const altMatch = text.match(/([A-Za-zÁÉÍÓÚáéíóúñÑ\s]{3,})\s+C[ée]dula terminada/i);
    if (altMatch) {
      customerName = altMatch[1].trim();
    }
  }

  // Extract subject
  let subject = '';
  const subjectEl = document.querySelector(
    'div[role="main"] h1, div[role="heading"] h1, [data-testid="conversations-subject"], #selected-email .subject'
  );
  if (subjectEl?.textContent) {
    subject = subjectEl.textContent.trim();
  } else {
    subject = document.title || '';
    if (subject.endsWith(' - Outlook')) {
      subject = subject.slice(0, -10);
    } else if (subject.endsWith(' - Mail - Outlook')) {
      subject = subject.slice(0, -17);
    }
  }

  return {
    sender: 'notificaciones@deunaapp.com',
    subject: subject || 'Recarga Deuna',
    amount,
    currency: 'USD',
    transactionNumber,
    reason,
    transactionDate: dateMatch ? dateMatch[1] : undefined,
    sourceAccount: sourceMatch ? sourceMatch[1] : undefined,
    destinationAccount: destMatch ? destMatch[1] : undefined,
    customerName,
    maskedId: maskedIdMatch ? maskedIdMatch[1] : undefined,
    supportPhone,
    rawJson: JSON.stringify({ extractedAt: new Date().toISOString() }),
  };
}

async function processCurrentEmail(): Promise<boolean> {
  const data = extractFromPage();
  if (!data) return false;

  const sent = getSentTxnIds();
  if (sent.has(data.transactionNumber)) {
    return true; // Already processed
  }

  try {
    const res = await postReceipt(data);
    if (res.success) {
      markSent(data.transactionNumber);
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

function startPolling(): void {
  addUI();

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
