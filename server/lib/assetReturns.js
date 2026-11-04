import { recordAssetReturn } from '../../shared/assetReturns.js';
import { formatLoanRow } from './loanRows.js';

export function recordHolderReturn(database, assetCode, timestamp) {
  const updated = [];
  for (const row of database.prepare("SELECT * FROM loans WHERE (COALESCE(pickup_date, '') <> '' OR status = 'Active') AND COALESCE(return_date, '') = '' AND COALESCE(returned_date, '') = '' AND COALESCE(is_archived, 0) = 0").all()) {
    const record = formatLoanRow(row);
    const next = recordAssetReturn(record, assetCode, timestamp);
    if (next === record) continue;
    database.prepare('UPDATE loans SET returned_equipment_json = ?, return_status = ?, return_date = ?, returned_date = ?, status = ?, is_archived = ?, ready_for_pickup = ? WHERE id = ?').run(
      JSON.stringify(next.returnedEquipment), next.returnStatus, next.returnDate || '', next.returnedDate || '', next.status, next.isArchived ? 1 : 0, next.readyForPickup ? 1 : 0, row.id,
    );
    updated.push(formatLoanRow(database.prepare('SELECT * FROM loans WHERE id = ?').get(row.id)));
  }
  return updated;
}
