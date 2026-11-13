import { ensureAssetActivity } from './assetActivity.js';
/** Add optional equipment-register columns without replacing existing asset records. */
export function ensureAssetColumns(database) {
  const columns = new Set(database.prepare('PRAGMA table_info(assets)').all().map((column) => column.name));
  for (const column of ['purchase_date', 'warranty_expiration_date', 'issued_date', 'issued_name']) {
    if (!columns.has(column)) database.exec(`ALTER TABLE assets ADD COLUMN ${column} TEXT`);
  }
  ensureAssetActivity(database);
  // Issue metadata belongs to the holder it was imported for; avoid stale names after reassignment.
  database.exec(`CREATE TRIGGER IF NOT EXISTS assets_clear_issue_metadata AFTER UPDATE OF owner ON assets
    WHEN NEW.owner IS NOT OLD.owner BEGIN UPDATE assets SET issued_name = NULL, issued_date = NULL WHERE id = NEW.id; END`);
}

export const ensureAssetDateColumns = ensureAssetColumns;
