import { randomUUID } from 'node:crypto';

/** Backfill known IT custody, recording the observation time rather than inventing a return date. */
export function ensureAvailableAssetCustody(database, observedAt = new Date().toISOString()) {
  database.exec('SAVEPOINT available_custody');
  try {
    const activeCodes = new Set();
    for (const loan of database.prepare("SELECT * FROM loans WHERE (COALESCE(pickup_date, '') <> '' OR status = 'Active') AND COALESCE(return_date, '') = '' AND COALESCE(returned_date, '') = '' AND COALESCE(is_archived, 0) = 0").all()) {
      let equipment = {}, returned = {};
      try { equipment = JSON.parse(loan.equipment_json || '{}'); returned = JSON.parse(loan.returned_equipment_json || '{}'); } catch { /* Preserve readable primary references in legacy records. */ }
      for (const [key, code] of [['Laptop', loan.asset_code || equipment?.Laptop], ['Monitor', equipment?.Monitor]]) {
        if (code && String(returned?.[key] || '').trim().toLowerCase() !== String(code).trim().toLowerCase()) activeCodes.add(String(code).trim().toLowerCase());
      }
    }
    for (const asset of database.prepare("SELECT * FROM assets WHERE status = 'Available'").all()) {
      if (activeCodes.has(asset.code.trim().toLowerCase())) continue;
      const latest = database.prepare('SELECT * FROM ownership_history WHERE asset_code = ? ORDER BY date DESC, created_at DESC LIMIT 1').get(asset.code);
      database.prepare("UPDATE assets SET owner = 'IT Department', department = '' WHERE id = ?").run(asset.id);
      if (String(latest?.new_owner || '').trim().toLowerCase() === 'it department') continue;
      const previous = latest?.new_owner || asset.owner || 'None';
      database.prepare('INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        `hist-it-${randomUUID()}`, asset.code, previous, 'IT Department', observedAt,
        latest ? 'Returned to IT Department' : 'IT custody recorded',
        'IT custody confirmed from Available status. Earlier return date was not recorded; this is the custody reconciliation time.', observedAt,
      );
    }
    database.exec('RELEASE SAVEPOINT available_custody');
  } catch (error) { database.exec('ROLLBACK TO SAVEPOINT available_custody'); database.exec('RELEASE SAVEPOINT available_custody'); throw error; }
}
