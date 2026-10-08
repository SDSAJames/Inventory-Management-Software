/** Escape special chars for safe XML attribute/element content. */
export function xmlEscape(value = '') {
  return String(value).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c],
  );
}

/** CSS-friendly class from a status string. */
export function statusClass(status) {
  return String(status).toLowerCase().replaceAll(' ', '-');
}

/**
 * Convert a loan date value to a readable string.
 * Handles Excel serial numbers (>20000), ISO datetime strings, and empty values.
 */
export function readableLoanDate(value) {
  if (value === undefined || value === null || value === '') return '';
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 20000) {
    const date = new Date(Date.UTC(1899, 11, 30) + numeric * 86400000);
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
  return String(value).replace('T', ' ');
}

/** Current local datetime formatted for datetime-local inputs (YYYY-MM-DDTHH:mm). */
export function nowLocalIso() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

/** Current local datetime with seconds (YYYY-MM-DDTHH:mm:ss). */
export function nowLocalIsoWithSeconds() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 19);
}

/** Today's date as YYYY-MM-DD (local timezone). */
export function todayIso() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

/**
 * Normalizes any date representation (Excel serial date number, ISO string, M/D/YYYY)
 * to standard YYYY-MM-DD format for reliable lexicographical comparison.
 */
export function normalizeDateToIso(raw) {
  if (raw === undefined || raw === null || raw === '') return '';
  const str = String(raw).trim();
  if (!str || str === '1/0/1900' || str === '0' || str === '—') return '';

  // 1. Excel serial date number (e.g. 46202 or 46189.47)
  const numeric = Number(str);
  if (Number.isFinite(numeric) && numeric > 20000 && numeric < 100000) {
    const d = new Date(Date.UTC(1899, 11, 30) + numeric * 86400000);
    return d.toISOString().slice(0, 10);
  }

  // 2. ISO format YYYY-MM-DD...
  const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  // 3. US format M/D/YYYY or MM/DD/YYYY
  const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    const mm = usMatch[1].padStart(2, '0');
    const dd = usMatch[2].padStart(2, '0');
    const yyyy = usMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // 4. Fallback Date parsing
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  }

  return str.slice(0, 10);
}

/**
 * Determines whether a loan is overdue based on its due/end date compared against today.
 * If not returned and end/due date < today (YYYY-MM-DD), it is overdue.
 * Also marks as overdue if due date is today and a specified time has passed.
 */
export function isLoanOverdue(loan) {
  if (!loan) return false;
  const isReturned = Boolean(
    loan.returnDate || loan.returnedDate || loan.status === 'Returned' || loan.isArchived,
  );
  if (isReturned) return false;
  if (loan.status === 'Overdue') return true;

  const rawEnd = loan.endDate || loan.dueDate || '';
  const endIso = normalizeDateToIso(rawEnd);
  if (!endIso) return false;

  const today = todayIso();
  if (endIso < today) return true;

  // If the due date is today, check if an explicit timestamp has passed
  if (endIso === today) {
    const rawStr = String(rawEnd).replace('T', ' ');
    const timeMatch = rawStr.match(/\b(\d{2}:\d{2})(?::\d{2})?\b/);
    if (timeMatch) {
      const nowTime = nowLocalIso().slice(11, 16);
      if (timeMatch[1] < nowTime) return true;
    }
  }

  return false;
}

/**
 * Returns the effective lifecycle status for a loan:
 * 'Returned' | 'Overdue' | 'Loaned' | 'Scheduled'
 */
export function getLoanStatus(loan) {
  if (!loan) return 'Scheduled';
  const isReturned = Boolean(
    loan.returnDate || loan.returnedDate || loan.status === 'Returned' || loan.isArchived,
  );
  if (isReturned) return 'Returned';
  if (isLoanOverdue(loan)) return 'Overdue';
  if (loan.pickupDate) return 'Loaned';
  return 'Scheduled';
}

/** Today's date formatted for the topbar eyebrow label. */
export function todayLabel() {
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date()).toUpperCase();
}

/** Default system dashboard title. */
export function greetingTitle() {
  return 'Operations Dashboard';
}

/** Generate a new asset code based on the current year and asset count. */
export function nextAssetCode(assetCount) {
  return `AST-${new Date().getFullYear()}-${String(assetCount + 1).padStart(3, '0')}`;
}

/** Validate an IP octet (0–255 numeric string). */
export function validOctet(value) {
  if (!value) return true; // empty is valid (optional)
  return /^\d+$/.test(value) && Number(value) >= 0 && Number(value) <= 255;
}
