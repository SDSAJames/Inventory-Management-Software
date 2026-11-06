/** Explicit entry formats convert to ISO calendar dates without timezone shifts. */
export function normalizeAssetDate(value, format = 'MM-DD-YYYY') {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[3]}-${format === 'DD-MM-YYYY' ? match[2] : match[1]}-${format === 'DD-MM-YYYY' ? match[1] : match[2]}` : text;
}

export function formatAssetDate(value, format = 'MM-DD-YYYY') {
  const text = normalizeAssetDate(value, format);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${format === 'DD-MM-YYYY' ? match[3] : match[2]}-${format === 'DD-MM-YYYY' ? match[2] : match[3]}-${match[1]}` : text;
}

export function normalizeAssetDates(asset, format = 'MM-DD-YYYY') {
  return { purchaseDate: normalizeAssetDate(asset.purchaseDate, format), warrantyExpirationDate: normalizeAssetDate(asset.warrantyExpirationDate, format) };
}

export function getAssetDateError(asset, format = 'MM-DD-YYYY') {
  const { purchaseDate, warrantyExpirationDate } = normalizeAssetDates(asset, format);
  for (const [label, value] of [['Purchase date', purchaseDate], ['Warranty expiration date', warrantyExpirationDate]]) {
    if (!value) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) return `${label} must be a valid date in ${format} format`;
  }
  return purchaseDate && warrantyExpirationDate && warrantyExpirationDate < purchaseDate ? 'Warranty expiration date cannot be earlier than purchase date' : '';
}
