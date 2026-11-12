import { normalizeAssetDate } from '../../shared/assetDates.js';
export function saveAssetIssuedFields(database, id, asset) {
  const fields = [];
  const values = [];
  for (const [key, column] of [['issuedName', 'issued_name'], ['issuedDate', 'issued_date']]) {
    if (!Object.hasOwn(asset, key) && !Object.hasOwn(asset, column)) continue;
    fields.push(column + ' = ?');
    const value = asset[key] ?? asset[column] ?? '';
    values.push(key === 'issuedDate' ? normalizeAssetDate(value) : String(value).trim());
  }
  if (fields.length) database.prepare('UPDATE assets SET ' + fields.join(', ') + ' WHERE id = ?').run(...values, id);
}
