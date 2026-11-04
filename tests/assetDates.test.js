import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { ensureAssetDateColumns } from '../server/lib/assetDates.js';
import { getAssetDateError, normalizeAssetDate, formatAssetDate } from '../shared/assetDates.js';
import { parseAssetRows, assetsToRows } from '../src/lib/assetExcel.js';
import { parseEquipmentsText } from '../src/lib/txtImport.js';

test('asset date schema upgrade preserves existing purchase dates and is repeatable', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE assets (id TEXT, purchase_date TEXT); INSERT INTO assets VALUES ('pc', '2026-01-02')");
    ensureAssetDateColumns(db); ensureAssetDateColumns(db);
    assert.equal(db.prepare('SELECT * FROM assets').get().purchase_date, '2026-01-02');
    assert.equal(db.prepare('SELECT * FROM assets').get().warranty_expiration_date, null);
  } finally { db.close(); }
});

test('optional asset dates validate date values and warranty ordering', () => {
  assert.equal(getAssetDateError({}), '');
  assert.equal(getAssetDateError({ purchaseDate: '2026-01-02', warrantyExpirationDate: '2027-01-02' }), '');
  assert.match(getAssetDateError({ purchaseDate: '2026-02-30' }), /valid date/);
  assert.match(getAssetDateError({ purchaseDate: '2026-01-02', warrantyExpirationDate: '2026-01-01' }), /earlier/);
});

test('equipment spreadsheet and TXT paths retain warranty dates and legacy headers', () => {
  const rows = [['Asset Number', 'Purchase Date', 'Warranty Expiry Date'], ['PC-1', '2026-01-02', '2027-01-02']];
  const asset = parseAssetRows(rows, []).added[0];
  assert.equal(asset.purchaseDate, '2026-01-02');
  assert.equal(asset.warrantyExpirationDate, '2027-01-02');
  assert.equal(parseEquipmentsText(rows, []).assets[0].warrantyExpirationDate, '2027-01-02');
  const exported = assetsToRows([asset]);
  assert.ok(exported[0].includes('Warranty Expiration Date'));
  assert.equal(parseAssetRows(exported, []).added[0].warrantyExpirationDate, asset.warrantyExpirationDate);
  assert.equal(parseAssetRows([['Asset Number'], ['PC-1']], [asset]).duplicates[0].warrantyExpirationDate, asset.warrantyExpirationDate);
});

test('MM-DD-YYYY dates convert without timezone shifts and compare by calendar date', () => {
  assert.equal(normalizeAssetDate('10-07-2023'), '2023-10-07');
  assert.equal(formatAssetDate('2023-10-07'), '10-07-2023');
  assert.equal(normalizeAssetDate(''), '');
  assert.equal(getAssetDateError({ purchaseDate: '12-31-2023', warrantyExpirationDate: '01-01-2024' }), '');
  assert.match(getAssetDateError({ purchaseDate: '10-07-2023', warrantyExpirationDate: '10-06-2023' }), /earlier/);
  assert.match(getAssetDateError({ purchaseDate: '02-29-2023' }), /valid date/);
  assert.equal(getAssetDateError({ purchaseDate: '02-29-2024' }), '');
  const rows = [['Asset Number', 'Asset Type', 'Purchase Date', 'Warranty Expiration Date'], ['MON-DATE', 'Monitor', '10-07-2023', '10-07-2026']];
  for (const asset of [parseAssetRows(rows, []).added[0], parseEquipmentsText(rows, []).assets[0]]) {
    assert.equal(asset.purchaseDate.slice(0, 10), '2023-10-07');
    assert.equal(asset.warrantyExpirationDate, '2026-10-07');
  }
});

test('asset routes persist lifecycle dates through editing and exchange', async (t) => {
  const db = new DatabaseSync(':memory:');
  globalThis.__assetDateTestDb = db;
  const dbUrl = new URL('../server/db/database.js', import.meta.url).href;
  const hook = registerHooks({ load(url, context, next) {
    if (url === dbUrl) return { format: 'module', shortCircuit: true, source: 'export const db = globalThis.__assetDateTestDb; export const logAudit = () => {}; export const reconcileAllAssetsInDb = () => ({}); export const createSnapshot = () => "snapshot";' };
    if (url === new URL('../server/middleware/auth.js', import.meta.url).href) return { format: 'module', shortCircuit: true, source: 'export const authenticate = (req, res, next) => next();' };
    return next(url, context);
  } });
  try {
    const schema = readFileSync(new URL('../server/db/database.js', import.meta.url), 'utf8');
    for (const table of ['assets', 'ownership_history', 'employees', 'loans']) {
      const sql = schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\);`))[0];
      db.exec(sql);
    }
    db.exec('CREATE TABLE locations (id TEXT, name TEXT); CREATE TABLE departments (id TEXT, name TEXT); CREATE TABLE transfer_reasons (reason TEXT, created_at TEXT)');
    ensureAssetDateColumns(db);
    const { assetsRouter } = await import('../server/routes/assets.js');
    const { exchangeRouter } = await import('../server/routes/exchange.js');
    const invoke = (router, method, path, body, params = {}, expectedStatus) => {
      const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
      const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
      layer.route.stack.at(-1).handle({ body, params, query: {}, user: { username: 'date-test' } }, response);
      if (expectedStatus) assert.equal(response.statusCode, expectedStatus, JSON.stringify(response.body));
      else assert.ok(response.statusCode < 400, JSON.stringify(response.body));
      return response.body;
    };
    const input = { id: 'pc', code: 'PC-DATE', category: 'Laptop', purchaseDate: '2026-01-02', warrantyExpirationDate: '2027-01-02' };
    const created = invoke(assetsRouter, 'post', '/', input);
    assert.equal(created.asset.warrantyExpirationDate, input.warrantyExpirationDate);
    const updated = invoke(assetsRouter, 'put', '/:id', { warrantyExpirationDate: '2028-01-02' }, { id: 'pc' });
    assert.equal(updated.asset.purchaseDate, input.purchaseDate);
    assert.equal(updated.asset.warrantyExpirationDate, '2028-01-02');
    const exported = invoke(exchangeRouter, 'get', '/export', {});
    assert.equal(exported.db.assets[0].warrantyExpirationDate, '2028-01-02');
    invoke(exchangeRouter, 'post', '/import', { assets: [{ ...input, warrantyExpirationDate: '2029-01-02' }], loans: [], overwrite: true });
    assert.equal(db.prepare("SELECT warranty_expiration_date FROM assets WHERE id = 'pc'").get().warranty_expiration_date, '2029-01-02');
    db.exec('CREATE TABLE import_backups (id TEXT, snapshot_json TEXT, description TEXT, created_at TEXT)');
    db.prepare('INSERT INTO import_backups VALUES (?, ?, ?, ?)').run('restore', JSON.stringify(exported.db), 'Date test backup', '2026-11-04');
    invoke(exchangeRouter, 'post', '/revert', { snapshotId: 'restore' });
    const restored = db.prepare("SELECT * FROM assets WHERE id = 'pc'").get();
    assert.equal(restored.purchase_date, '2026-01-02');
    assert.equal(restored.warranty_expiration_date, '2028-01-02');
    for (const category of ['Monitor', 'Printer', 'Network', 'Custom asset type']) {
      const id = `date-${category}`;
      const result = invoke(assetsRouter, 'post', '/', { id, code: id, category, purchaseDate: '10-07-2023', warrantyExpirationDate: '10-07-2026' });
      assert.equal(result.asset.purchaseDate, '2023-10-07');
      assert.equal(result.asset.warrantyExpirationDate, '2026-10-07');
      assert.equal(db.prepare('SELECT warranty_expiration_date FROM assets WHERE id = ?').get(id).warranty_expiration_date, '2026-10-07');
    }
    await t.test('asset number edits persist and keep linked custody and history', () => {
      invoke(assetsRouter, 'post', '/', { id: 'rename', code: 'MES-6519', category: 'MES PC' });
      db.prepare('INSERT INTO loans (id, asset_code, assignee, equipment_json, returned_equipment_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('linked', 'MES-6519', 'Jane', '{"Laptop":"MES-6519","Monitor":"MON-1","Keyboard":1}', '{"Laptop":"MES-6519","Mouse":1}', '2026-11-04');
      db.prepare('INSERT INTO ownership_history (id, asset_code, date, created_at) VALUES (?, ?, ?, ?)').run('rename-history', 'MES-6519', '2026-11-04', '2026-11-04');
      const result = invoke(assetsRouter, 'put', '/:id', { code: ' MESM-6519 ' }, { id: 'rename' });
      assert.equal(result.asset.code, 'MESM-6519');
      assert.equal(db.prepare("SELECT code FROM assets WHERE id = 'rename'").get().code, 'MESM-6519');
      const linked = db.prepare("SELECT * FROM loans WHERE id = 'linked'").get();
      assert.equal(linked.asset_code, 'MESM-6519');
      assert.deepEqual(JSON.parse(linked.equipment_json), { Laptop: 'MESM-6519', Monitor: 'MON-1', Keyboard: 1 });
      assert.equal(JSON.parse(linked.returned_equipment_json).Laptop, 'MESM-6519');
      assert.equal(db.prepare("SELECT asset_code FROM ownership_history WHERE id = 'rename-history'").get().asset_code, 'MESM-6519');
      const reloaded = invoke(assetsRouter, 'get', '/:id', {}, { id: 'rename' }).asset;
      assert.equal(reloaded.code, 'MESM-6519');
      assert.equal(reloaded.ownershipHistory.length, 1);
      invoke(assetsRouter, 'put', '/:id', { code: 'pc-date' }, { id: 'rename' }, 409);
      invoke(assetsRouter, 'put', '/:id', { code: '  ' }, { id: 'rename' }, 400);
      assert.equal(db.prepare("SELECT code FROM assets WHERE id = 'rename'").get().code, 'MESM-6519');
      db.exec("CREATE TRIGGER reject_rename BEFORE UPDATE ON loans BEGIN SELECT RAISE(ABORT, 'reference failure'); END");
      invoke(assetsRouter, 'put', '/:id', { code: 'MESM-NEW' }, { id: 'rename' }, 500);
      assert.equal(db.prepare("SELECT code FROM assets WHERE id = 'rename'").get().code, 'MESM-6519');
      assert.equal(db.prepare("SELECT asset_code FROM loans WHERE id = 'linked'").get().asset_code, 'MESM-6519');
      db.exec('DROP TRIGGER reject_rename');
    });
    await t.test('clearing a holder records an IT return, checks in the device, and keeps missing accessories outstanding', () => {
      invoke(assetsRouter, 'post', '/', { id: 'holder-return', code: 'RETURN-PC', owner: 'Holder Return Test', department: 'Operations', location: 'Stack', status: 'Assigned' });
      db.prepare('INSERT INTO loans (id, asset_code, assignee, assignee_type, pickup_date, status, equipment_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('return-linked', 'RETURN-PC', 'Holder Return Test', 'Employee', '2026-11-01', 'Active', '{"Laptop":"RETURN-PC","Keyboard":1}', '2026-11-01');
      invoke(assetsRouter, 'put', '/:id', { notes: 'No holder edit' }, { id: 'holder-return' });
      assert.equal(db.prepare("SELECT owner FROM assets WHERE id = 'holder-return'").get().owner, 'Holder Return Test');
      const result = invoke(assetsRouter, 'put', '/:id', { owner: '  ' }, { id: 'holder-return' });
      assert.equal(result.asset.owner, 'IT department');
      assert.equal(result.asset.status, 'Available');
      assert.equal(result.asset.location, 'IT Department');
      assert.equal(result.asset.department, '');
      const history = result.asset.ownershipHistory.find((entry) => entry.reason === 'Returned to IT department');
      assert.equal(history.previousOwner, 'Holder Return Test');
      assert.equal(history.newOwner, 'IT department');
      assert.ok(history.date);
      assert.equal(result.loans[0].returnedEquipment.Laptop, 'RETURN-PC');
      assert.equal(result.loans[0].returnedEquipment.Keyboard, undefined);
      assert.equal(result.loans[0].returnStatus, 'Partial');
      assert.equal(result.loans[0].status, 'Returned');
      invoke(assetsRouter, 'put', '/:id', { owner: '' }, { id: 'holder-return' });
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ownership_history WHERE asset_code = 'RETURN-PC' AND reason = 'Returned to IT department'").get().count, 1);
    });
    await t.test('failed return history rolls back the holder and linked pickup', () => {
      invoke(assetsRouter, 'post', '/', { id: 'failed-return', code: 'ROLLBACK-PC', owner: 'Holder Return Test', status: 'Assigned', location: 'Stack' });
      db.prepare('INSERT INTO loans (id, asset_code, assignee, pickup_date, status, equipment_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('rollback-linked', 'ROLLBACK-PC', 'Holder Return Test', '2026-11-01', 'Active', '{"Laptop":"ROLLBACK-PC"}', '2026-11-01');
      db.exec("CREATE TRIGGER reject_return_history BEFORE INSERT ON ownership_history WHEN NEW.reason = 'Returned to IT department' BEGIN SELECT RAISE(ABORT, 'history failed'); END");
      invoke(assetsRouter, 'put', '/:id', { owner: '' }, { id: 'failed-return' }, 500);
      assert.equal(db.prepare("SELECT owner FROM assets WHERE id = 'failed-return'").get().owner, 'Holder Return Test');
      assert.equal(db.prepare("SELECT status FROM loans WHERE id = 'rollback-linked'").get().status, 'Active');
      assert.equal(db.prepare("SELECT returned_equipment_json FROM loans WHERE id = 'rollback-linked'").get().returned_equipment_json, null);
      db.exec('DROP TRIGGER reject_return_history');
    });
  } finally { hook.deregister(); db.close(); delete globalThis.__assetDateTestDb; }
});
