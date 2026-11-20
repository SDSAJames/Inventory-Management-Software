export async function copyTextToClipboard(text) {
  if (!text) return false;

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* Try the document copy fallback below. */ }

  if (typeof document === 'undefined' || !document.body || typeof document.execCommand !== 'function') return false;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.setAttribute('aria-hidden', 'true');
  field.tabIndex = -1;
  field.style.position = 'fixed';
  field.style.top = '0';
  field.style.left = '-9999px';
  field.style.opacity = '0';
  document.body.appendChild(field);
  try {
    field.focus();
    field.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
