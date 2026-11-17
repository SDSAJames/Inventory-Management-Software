import { AsyncLocalStorage } from 'node:async_hooks';

const actors = new AsyncLocalStorage();
const registered = new WeakSet();
const maintenance = new AsyncLocalStorage();

export function withoutActivityTracking(callback) {
  return maintenance.run(true, callback);
}

export function withActivityActor(req, res, next) {
  const user = req.user;
  const actor = user ? { username: user.username || '', name: user.full_name || user.fullName || '', knoxId: user.knox_id || user.knoxId || '' } : null;
  return actors.run(actor, next);
}

function ensureRecordActivity(database, table, watchedFields) {
  if (!registered.has(database)) {
    database.function('inventory_track_activity', () => maintenance.getStore() ? 0 : 1);
    database.function('inventory_actor', () => { const actor = actors.getStore(); return actor ? JSON.stringify(actor) : null; });
    registered.add(database);
  }
  const columns = new Set(database.prepare('PRAGMA table_info(' + table + ')').all().map((column) => column.name));
  for (const column of ['latest_change', 'changed_at', 'changed_by']) {
    if (!columns.has(column)) database.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' TEXT');
  }
  const fields = watchedFields.filter((field) => columns.has(field));
  if (!fields.length) return;
  const difference = fields.map((field) => 'NEW.' + field + ' IS NOT OLD.' + field).join(' OR ');
  const changes = fields.map((field) => "SELECT '" + field + "' AS field, OLD." + field + ' AS previous, NEW.' + field + ' AS next WHERE NEW.' + field + ' IS NOT OLD.' + field).join(' UNION ALL ');
  // Recreate the earlier asset triggers so existing installations also capture the editor.
  database.exec('DROP TRIGGER IF EXISTS ' + table + '_latest_activity_insert; DROP TRIGGER IF EXISTS ' + table + '_latest_activity_update');
  database.exec(`CREATE TRIGGER ${table}_latest_activity_insert AFTER INSERT ON ${table}
    WHEN NEW.latest_change IS NULL AND inventory_track_activity()
    BEGIN UPDATE ${table} SET latest_change = '{"kind":"created","changes":[]}', changed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), changed_by = inventory_actor() WHERE rowid = NEW.rowid; END;
    CREATE TRIGGER ${table}_latest_activity_update AFTER UPDATE OF ${fields.join(',')} ON ${table}
    WHEN inventory_track_activity() AND (${difference})
    BEGIN UPDATE ${table} SET latest_change = (SELECT json_object('kind', 'updated', 'changes', json_group_array(json_object('field', field, 'previous', previous, 'next', next))) FROM (${changes})),
      changed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), changed_by = inventory_actor() WHERE rowid = NEW.rowid; END;`);
}

export function ensureAssetActivity(database) {
  ensureRecordActivity(database, 'assets', ['code', 'category', 'model', 'serial', 'status', 'owner', 'department', 'location', 'purchase_date', 'warranty_expiration_date', 'condition', 'notes']);
}

export function ensureLoanActivity(database) {
  ensureRecordActivity(database, 'loans', ['assignee_type', 'assignee', 'knox_id', 'department', 'location', 'ip', 'start_date', 'pickup_date', 'end_date', 'return_date', 'return_status', 'equipment_json', 'returned_equipment_json', 'others', 'note', 'purpose', 'ready_for_pickup']);
}

export function restoreRecordActivity(database, table, id, record) {
  if (!['assets', 'loans'].includes(table)) throw new Error('Unknown activity table');
  const activity = record.latest_change || record.latestChange || null;
  const actor = record.changed_by || record.changedBy || null;
  database.prepare('UPDATE ' + table + ' SET latest_change = ?, changed_at = ?, changed_by = ? WHERE id = ?').run(
    !activity ? null : typeof activity === 'string' ? activity : JSON.stringify(activity), record.changed_at || record.changedAt || null,
    actor && typeof actor !== 'string' ? JSON.stringify(actor) : actor, id);
}

export function loanAssetActivity(database, loan) {
  const equipment = JSON.parse(loan.equipment_json || '{}');
  const codes = new Set([loan.asset_code, equipment.Monitor].filter((code) => code && code !== '1' && code !== '0'));
  return [...codes].map((code) => database.prepare('SELECT * FROM assets WHERE code = ? COLLATE NOCASE').get(code)).filter(Boolean)
    .map(assetActivityFields);
}

export function assetActivityFields(asset) {
  return { id: asset.id, latestChange: asset.latest_change || '', changedAt: asset.changed_at || '', changedBy: asset.changed_by || '' };
}
