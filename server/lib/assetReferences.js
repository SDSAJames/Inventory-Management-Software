import { renameLoanAssetReferences } from '../../shared/assetReferences.js';

/** Participate in the caller's asset-update transaction. */
export function renameStoredAssetReferences(database, previousCode, nextCode) {
  for (const row of database.prepare('SELECT id, asset_code, equipment_json, returned_equipment_json FROM loans').all()) {
    const record = {
      assetCode: row.asset_code,
      equipment: row.equipment_json ? JSON.parse(row.equipment_json) : null,
      returnedEquipment: row.returned_equipment_json ? JSON.parse(row.returned_equipment_json) : null,
    };
    const renamed = renameLoanAssetReferences(record, previousCode, nextCode);
    if (renamed === record) continue;
    database.prepare('UPDATE loans SET asset_code = ?, equipment_json = ?, returned_equipment_json = ? WHERE id = ?').run(
      renamed.assetCode,
      renamed.equipment === record.equipment ? row.equipment_json : JSON.stringify(renamed.equipment),
      renamed.returnedEquipment === record.returnedEquipment ? row.returned_equipment_json : JSON.stringify(renamed.returnedEquipment),
      row.id,
    );
  }
  database.prepare('UPDATE ownership_history SET asset_code = ? WHERE LOWER(TRIM(asset_code)) = LOWER(?)').run(nextCode, previousCode.trim());
}
