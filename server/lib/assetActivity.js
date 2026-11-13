/** Persist the latest actual field change once, including writes from pickup/transfer/import. */
export function ensureAssetActivity(database) {
  const columns = new Set(database.prepare('PRAGMA table_info(assets)').all().map((column) => column.name));
  for (const column of ['latest_change', 'changed_at']) {
    if (!columns.has(column)) database.exec(`ALTER TABLE assets ADD COLUMN ${column} TEXT`);
  }
  const fields = ['code', 'category', 'model', 'serial', 'status', 'owner', 'department', 'location', 'purchase_date', 'warranty_expiration_date', 'condition', 'notes'].filter((field) => columns.has(field));
  if (!fields.length) return;
  const difference = fields.map((field) => `NEW.${field} IS NOT OLD.${field}`).join(' OR ');
  const changes = fields.map((field) => `SELECT '${field}' AS field, OLD.${field} AS previous, NEW.${field} AS next WHERE NEW.${field} IS NOT OLD.${field}`).join(' UNION ALL ');
  database.exec(`CREATE TRIGGER IF NOT EXISTS assets_latest_activity_insert AFTER INSERT ON assets
    WHEN NEW.latest_change IS NULL
    BEGIN UPDATE assets SET latest_change = '{"kind":"created","changes":[]}', changed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
    CREATE TRIGGER IF NOT EXISTS assets_latest_activity_update AFTER UPDATE OF ${fields.join(',')} ON assets
    WHEN ${difference}
    BEGIN UPDATE assets SET latest_change = (SELECT json_object('kind', 'updated', 'changes', json_group_array(json_object('field', field, 'previous', previous, 'next', next))) FROM (${changes})),
      changed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;`);
}

export function loanAssetActivity(database, loan) {
  const equipment = JSON.parse(loan.equipment_json || '{}');
  const codes = new Set([loan.asset_code, equipment.Monitor].filter((code) => code && code !== '1' && code !== '0'));
  return [...codes].map((code) => database.prepare('SELECT * FROM assets WHERE code = ? COLLATE NOCASE').get(code)).filter(Boolean)
    .map(assetActivityFields);
}

export function assetActivityFields(asset) {
  return { id: asset.id, latestChange: asset.latest_change || '', changedAt: asset.changed_at || '' };
}
