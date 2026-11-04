/** Fields shared by embedded ownership history and exchange exports. */
export function exportOwnershipRow(row) {
  return {
    previousOwner: row.previous_owner,
    newOwner: row.new_owner,
    date: row.date,
    reason: row.reason,
    notes: row.notes,
  };
}

export function formatOwnershipRow(row) {
  return { id: row.id, ...exportOwnershipRow(row) };
}

export function formatOwnershipAuditRow(row) {
  return {
    ...formatOwnershipRow(row),
    assetCode: row.asset_code,
    createdAt: row.created_at,
  };
}

export function formatAssetRow(asset, history, formatHistory = formatOwnershipRow) {
  return {
    ...asset,
    purchaseDate: asset.purchase_date || '',
    warrantyExpirationDate: asset.warranty_expiration_date || '',
    ownershipHistory: history.map(formatHistory),
  };
}
