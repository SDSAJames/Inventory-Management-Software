/** MM-DD-YYYY entry and ISO storage share an explicit, timezone-free conversion. */
export function normalizeAssetDate(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[3]}-${match[1]}-${match[2]}` : text;
}

export function formatAssetDate(value) {
  const text = normalizeAssetDate(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}-${match[3]}-${match[1]}` : text;
}

export function normalizeAssetDates(asset) {
  return { purchaseDate: normalizeAssetDate(asset.purchaseDate), warrantyExpirationDate: normalizeAssetDate(asset.warrantyExpirationDate) };
}

export function getAssetDateError(asset) {
  const { purchaseDate, warrantyExpirationDate } = normalizeAssetDates(asset);
  for (const [label, value] of [['Purchase date', purchaseDate], ['Warranty expiration date', warrantyExpirationDate]]) {
    if (!value) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) return `${label} must be a valid date in MM-DD-YYYY format`;
  }
  return purchaseDate && warrantyExpirationDate && warrantyExpirationDate < purchaseDate ? 'Warranty expiration date cannot be earlier than purchase date' : '';
}
