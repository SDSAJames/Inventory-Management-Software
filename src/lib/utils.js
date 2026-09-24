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

/** Current local datetime formatted for datetime-local inputs. */
export function nowLocalIso() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

/** Today's date as YYYY-MM-DD. */
export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Today's date formatted for the topbar eyebrow label. */
export function todayLabel() {
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date()).toUpperCase();
}

/** Time-aware greeting. */
export function greetingTitle() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning, James';
  if (hour < 17) return 'Good afternoon, James';
  return 'Good evening, James';
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
