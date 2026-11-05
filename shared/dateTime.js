/** Convert timestamps with a zone to local wall time; preserve unzoned spreadsheet dates. */
export function formatCalendarDateTime(value, { timeZone } = {}) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        ...(timeZone ? { timeZone } : {}), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(date).map(({ type, value: part }) => [type, part]));
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
    }
  }
  return text.replace(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/, '$1 $2');
}

export function dateTimeInputValue(value, options) {
  const formatted = formatCalendarDateTime(value, options);
  return /^\d{4}-\d{2}-\d{2}$/.test(formatted) ? `${formatted}T00:00` : formatted.replace(' ', 'T');
}
