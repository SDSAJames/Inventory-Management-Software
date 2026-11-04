/** Add optional lifecycle dates without replacing existing asset records. */
export function ensureAssetDateColumns(database) {
  const columns = new Set(database.prepare('PRAGMA table_info(assets)').all().map((column) => column.name));
  for (const column of ['purchase_date', 'warranty_expiration_date']) {
    if (!columns.has(column)) database.exec(`ALTER TABLE assets ADD COLUMN ${column} TEXT`);
  }
}
