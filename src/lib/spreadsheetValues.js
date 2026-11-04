/** Values and headers shared by the TXT and XLSX import paths. */
export function cleanSpreadsheetCell(value) {
  return String(value ?? '').replace(/_x000D_/gi, '').trim();
}

export function normalizeSpreadsheetHeader(value) {
  return cleanSpreadsheetCell(value).toLowerCase().replace(/_?x000d_?/g, '').replace(/[^a-z0-9]/g, '');
}

export function createHeaderLookup(headers) {
  const normalized = headers.map(normalizeSpreadsheetHeader);
  return (aliases) => {
    const accepted = new Set(aliases.map(normalizeSpreadsheetHeader));
    return normalized.findIndex((header) => accepted.has(header));
  };
}

/** Return null when the cell is outside the caller's supported serial range. */
export function excelSerialDate(value, { maximum = 100000, round = false } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 20000 || numeric >= maximum) return null;
  return new Date(Date.UTC(1899, 11, 30) + (round ? Math.round(numeric) : numeric) * 86400000);
}
