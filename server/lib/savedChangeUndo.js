import { createHash, randomUUID } from 'node:crypto';

const TABLES = ['departments', 'locations', 'asset_categories', 'asset_statuses', 'employees', 'assets', 'loans', 'ownership_history', 'transfer_reasons'];
export function ensureSavedChangeUndo(database) {
  database.exec('CREATE TABLE IF NOT EXISTS saved_change_undo (slot INTEGER PRIMARY KEY CHECK (slot = 1), id TEXT NOT NULL, before_json TEXT NOT NULL, after_hash TEXT NOT NULL, description TEXT NOT NULL, username TEXT NOT NULL, created_at TEXT NOT NULL)');
}
export function captureWorkingData(database) {
  const present = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  return Object.fromEntries(TABLES.filter((table) => present.has(table)).map((table) => [table, database.prepare('SELECT * FROM "' + table + '" ORDER BY rowid').all()]));
}
const fingerprint = (snapshot) => createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
export function rememberSavedChange(database, before, description, user) {
  const after = captureWorkingData(database);
  if (fingerprint(before) === fingerprint(after)) return;
  database.prepare('INSERT OR REPLACE INTO saved_change_undo (slot, id, before_json, after_hash, description, username, created_at) VALUES (1, ?, ?, ?, ?, ?, ?)').run(
    randomUUID(), JSON.stringify(before), fingerprint(after), description, user.username || '', new Date().toISOString());
}
export function latestSavedChange(database, user) {
  const row = database.prepare('SELECT * FROM saved_change_undo WHERE slot = 1').get();
  if (!row) return { available: false, reason: 'No saved change is available to undo yet.' };
  const allowed = user.role === 'ADMIN' || user.username === row.username;
  const unchanged = fingerprint(captureWorkingData(database)) === row.after_hash;
  return { id: row.id, description: row.description, username: row.username, createdAt: row.created_at,
    available: allowed && unchanged, reason: !allowed ? 'The latest change was saved by another user.' : !unchanged ? 'Database state has changed since this checkpoint.' : '' };
}
export function undoSavedChange(database, expectedId, user) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const latest = latestSavedChange(database, user);
    if (!latest.available || !expectedId || expectedId !== latest.id) throw new Error(latest.reason || 'The latest saved change has changed. Review it again.');
    const checkpoint = database.prepare('SELECT before_json FROM saved_change_undo WHERE slot = 1').get();
    const snapshot = JSON.parse(checkpoint.before_json);
    database.exec('PRAGMA defer_foreign_keys = ON');
    for (const table of [...TABLES].reverse()) if (Object.hasOwn(snapshot, table)) database.exec('DELETE FROM "' + table + '"');
    for (const table of TABLES) {
      for (const row of snapshot[table] || []) {
        const columns = Object.keys(row);
        database.prepare('INSERT INTO "' + table + '" (' + columns.map((column) => '"' + column + '"').join(',') + ') VALUES (' + columns.map(() => '?').join(',') + ')').run(...columns.map((column) => row[column]));
      }
    }
    database.prepare('DELETE FROM saved_change_undo WHERE slot = 1').run();
    database.exec('COMMIT');
    return latest;
  } catch (error) { database.exec('ROLLBACK'); throw error; }
}

/** All working-data write routes share this successful-response checkpoint boundary. */
export function trackSavedChanges(database) {
  return (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const before = captureWorkingData(database);
    const send = res.json;
    res.json = function(body) {
      res.json = send;
      if (res.statusCode >= 200 && res.statusCode < 300 && body?.success !== false) {
        const url = (req.originalUrl || '').split('?')[0];
        const area = url.split('/')[2];
        const actions = { transfer: 'Transfer equipment', pickup: 'Confirm pickup', return: 'Return equipment', ready: 'Change pickup readiness', import: 'Import data', revert: 'Restore database', 'batch-update': 'Bulk update', 'batch-delete': 'Bulk delete', 'batch-return': 'Bulk return' };
        const operation = actions[url.split('/').at(-1)] || (req.method === 'DELETE' ? 'Delete' : req.method === 'PUT' || req.method === 'PATCH' ? 'Update' : 'Save');
        const record = body?.asset || body?.loan || (before[area] || []).find((row) => row.id === req.params?.id);
        const label = record?.code || record?.knox_id || record?.knoxId || record?.name || record?.assignee || '';
        try { rememberSavedChange(database, before, operation + ' · ' + area + (label ? ' · ' + label : ''), req.user); }
        catch (error) { console.error('Saved change could not be made undoable:', error.message); }
      }
      return send.call(this, body);
    };
    next();
  };
}
