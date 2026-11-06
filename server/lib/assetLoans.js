import { getAssetStatusAfterReturn, getAssetLocationAfterReturn } from '../../shared/assetRules.js';
import { assetLocationForWrite } from './assetLocations.js';

/** Restore IT custody while retaining maintenance state and its automatic location. */
export function returnAssetToIt(database, assetCode, updated, { clearDepartment = true } = {}) {
  const asset = database.prepare('SELECT * FROM assets WHERE code = ?').get(assetCode);
  if (!asset) return;
  const status = getAssetStatusAfterReturn(asset.status);
  database.prepare(`
    UPDATE assets SET status = ?, owner = 'IT Department', department = ?, location = ?, updated = ?
    WHERE id = ?
  `).run(
    status,
    clearDepartment ? '' : asset.department,
    assetLocationForWrite(database, status, getAssetLocationAfterReturn(status)),
    updated,
    asset.id,
  );
}
