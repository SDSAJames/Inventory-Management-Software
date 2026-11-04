/** Rename exact device references without altering notes, serials, or other assets. */
export function renameLoanAssetReferences(loan, previousCode, nextCode) {
  const matches = (value) => typeof value === 'string' && value.trim().toLowerCase() === previousCode.trim().toLowerCase();
  let result = loan;
  for (const key of ['assetCode', 'asset_code']) {
    if (matches(loan[key])) result = { ...result, [key]: nextCode };
  }
  for (const field of ['equipment', 'returnedEquipment']) {
    const equipment = loan[field];
    if (!equipment || typeof equipment !== 'object') continue;
    for (const key of ['Laptop', 'Monitor']) {
      if (matches(equipment[key])) result = { ...result, [field]: { ...result[field], [key]: nextCode } };
    }
  }
  return result;
}
