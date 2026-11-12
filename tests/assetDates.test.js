import { reconcileAssetWithLoans } from '../src/lib/assetIntegrity.js';
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

test('day-first asset forms round-trip dates and reject invalid dates and warranty ordering', () => {
  const format = 'DD-MM-YYYY';
  for (const [input, iso] of [['07-10-2023', '2023-10-07'], ['31-12-2023', '2023-12-31'], ['29-02-2024', '2024-02-29'], ['', '']]) {
    assert.equal(normalizeAssetDate(input, format), iso);
    assert.equal(formatAssetDate(iso, format), input);
    assert.equal(formatAssetDate(input, format), input);
  }
  assert.equal(getAssetDateError({ purchaseDate: '31-12-2023', warrantyExpirationDate: '01-01-2024' }, format), '');
  assert.match(getAssetDateError({ purchaseDate: '29-02-2023' }, format), /valid date in DD-MM-YYYY/);
  assert.match(getAssetDateError({ purchaseDate: '31-04-2023' }, format), /valid date/);
  assert.match(getAssetDateError({ purchaseDate: '07-10-2023', warrantyExpirationDate: '06-10-2023' }, format), /earlier/);
  assert.equal(normalizeAssetDate('2023-10-07', format), '2023-10-07');
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
      assert.ok(reloaded.ownershipHistory.some((entry) => entry.id === 'rename-history'));
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
      assert.equal(result.asset.owner, 'IT Department');
      assert.equal(result.asset.status, 'Available');
      assert.equal(result.asset.location, 'IT Office');
      assert.equal(result.asset.department, '');
      const history = result.asset.ownershipHistory.find((entry) => entry.reason === 'Returned to IT Department');
      assert.equal(history.previousOwner, 'Holder Return Test');
      assert.equal(history.newOwner, 'IT Department');
      assert.ok(history.date);
      assert.equal(result.loans[0].returnedEquipment.Laptop, 'RETURN-PC');
      assert.equal(result.loans[0].returnedEquipment.Keyboard, undefined);
      assert.equal(result.loans[0].returnStatus, 'Partial');
      assert.equal(result.loans[0].status, 'Returned');
      invoke(assetsRouter, 'put', '/:id', { owner: '' }, { id: 'holder-return' });
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ownership_history WHERE asset_code = 'RETURN-PC' AND reason = 'Returned to IT Department'").get().count, 1);
    });
    await t.test('failed return history rolls back the holder and linked pickup', () => {
      invoke(assetsRouter, 'post', '/', { id: 'failed-return', code: 'ROLLBACK-PC', owner: 'Holder Return Test', status: 'Assigned', location: 'Stack' });
      db.prepare('INSERT INTO loans (id, asset_code, assignee, pickup_date, status, equipment_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('rollback-linked', 'ROLLBACK-PC', 'Holder Return Test', '2026-11-01', 'Active', '{"Laptop":"ROLLBACK-PC"}', '2026-11-01');
      db.exec("CREATE TRIGGER reject_return_history BEFORE INSERT ON ownership_history WHEN NEW.reason = 'Returned to IT Department' BEGIN SELECT RAISE(ABORT, 'history failed'); END");
      invoke(assetsRouter, 'put', '/:id', { owner: '' }, { id: 'failed-return' }, 500);
      assert.equal(db.prepare("SELECT owner FROM assets WHERE id = 'failed-return'").get().owner, 'Holder Return Test');
      assert.equal(db.prepare("SELECT status FROM loans WHERE id = 'rollback-linked'").get().status, 'Active');
      assert.equal(db.prepare("SELECT returned_equipment_json FROM loans WHERE id = 'rollback-linked'").get().returned_equipment_json, null);
      db.exec('DROP TRIGGER reject_return_history');
    });
    await t.test('Available status means an IT return for single and bulk asset updates', () => {
      for (const id of ['single-available', 'bulk-available']) {
        invoke(assetsRouter, 'post', '/', { id, code: id, owner: 'Holder Return Test', status: 'Assigned', location: 'Stack' });
      }
      invoke(assetsRouter, 'put', '/:id', { status: 'Available' }, { id: 'single-available' });
      invoke(assetsRouter, 'post', '/batch-update', { ids: ['bulk-available'], changes: { status: 'Available' } });
      for (const id of ['single-available', 'bulk-available']) {
        const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
        assert.equal(asset.owner, 'IT Department');
        assert.equal(asset.status, 'Available');
        assert.equal(asset.location, 'IT Office');
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ownership_history WHERE asset_code = ? AND reason = 'Returned to IT Department'").get(id).count, 1);
      }
    });
    await t.test('repair status returns single and bulk assets to IT and closes only their device custody', async () => {
      const { loansRouter } = await import('../server/routes/loans.js');
      for (const id of ['repair-single', 'repair-bulk']) {
        invoke(assetsRouter, 'post', '/', { id, code: id, category: 'Laptop' });
        invoke(loansRouter, 'post', '/', { id: id + '-loan', assetCode: id, knoxId: id, assignee: 'Repair Holder', pickupDate: '2026-11-01', equipment: { Laptop: id, Mouse: '1' } });
      }
      invoke(assetsRouter, 'put', '/:id', { status: 'Under repair', owner: 'Repair Holder', location: 'Stack' }, { id: 'repair-single' });
      invoke(assetsRouter, 'post', '/batch-update', { ids: ['repair-bulk'], changes: { status: 'Under repair' } });
      const exported = invoke(exchangeRouter, 'get', '/export', {}).db;
      for (const id of ['repair-single', 'repair-bulk']) {
        const asset = exported.assets.find((row) => row.id === id);
        const loan = exported.loans.find((row) => row.id === id + '-loan');
        assert.equal(asset.owner, 'IT Department');
        assert.equal(asset.status, 'Under repair');
        assert.equal(asset.location, 'service center');
        assert.equal(asset.department, '');
        assert.equal(loan.returnedEquipment.Laptop, id);
        assert.equal(loan.returnStatus, 'Partial');
        assert.equal(loan.returnedEquipment.Mouse, undefined);
        assert.equal(asset.ownershipHistory[0].newOwner, 'IT Department');
        assert.equal(reconcileAssetWithLoans(asset, exported.loans).owner, 'IT Department');
      }
    });
    await t.test('scheduled records cannot be returned through full edit, return, or mixed bulk return', async () => {
      const { loansRouter } = await import('../server/routes/loans.js');
      invoke(assetsRouter, 'post', '/', { id: 'phase-pc', code: 'PHASE-PC', status: 'Assigned', owner: 'Holder Return Test' });
      invoke(loansRouter, 'post', '/', { id: 'phase-schedule', assetCode: 'PHASE-PC', knoxId: 'phase.schedule', assigneeType: 'Employee', assignee: 'Holder Return Test' });
      invoke(loansRouter, 'post', '/', { id: 'phase-active', assetCode: 'PHASE-PC', knoxId: 'phase.active', assigneeType: 'Employee', assignee: 'Holder Return Test', pickupDate: '2026-11-05' });
      invoke(loansRouter, 'put', '/:id', { pickupDate: '2026-11-05', returnDate: '2026-11-05' }, { id: 'phase-schedule' }, 400);
      invoke(loansRouter, 'put', '/:id', { pickupDate: '', returnDate: '2026-11-05' }, { id: 'phase-active' }, 400);
      invoke(loansRouter, 'post', '/:id/return', { returnDate: '2026-11-05' }, { id: 'phase-schedule' }, 400);
      invoke(loansRouter, 'post', '/batch-return', { ids: ['phase-active', 'phase-schedule'], returnDate: '2026-11-05' }, {}, 400);
      assert.equal(db.prepare("SELECT status FROM loans WHERE id = 'phase-active'").get().status, 'Active');
      assert.equal(db.prepare("SELECT return_date FROM loans WHERE id = 'phase-schedule'").get().return_date || '', '');
      invoke(loansRouter, 'put', '/:id', { note: 'Still scheduled' }, { id: 'phase-schedule' });
      invoke(loansRouter, 'post', '/:id/return', { returnDate: '2026-11-05' }, { id: 'phase-active' });
      assert.equal(db.prepare("SELECT status FROM loans WHERE id = 'phase-active'").get().status, 'Returned');
    });
    await t.test('pickup retains custom department and exact device and accessory values', async () => {
      const { loansRouter } = await import('../server/routes/loans.js');
      invoke(assetsRouter, 'post', '/', { id: 'fields-pc', code: 'FIELDS-PC', category: 'Laptop' });
      invoke(assetsRouter, 'post', '/', { id: 'fields-monitor', code: 'FIELDS-MON', category: 'Monitor' });
      invoke(loansRouter, 'post', '/', { id: 'fields-schedule', knoxId: 'fields.user', assignee: 'Fields User', assigneeType: 'Employee' });
      const result = invoke(loansRouter, 'post', '/:id/pickup', {
        assetCode: 'FIELDS-PC', pickupDate: '2026-11-05', department: 'Custom team', location: 'Stack',
        equipment: { Laptop: 'FIELDS-PC', Monitor: 'FIELDS-MON', Adapter: '0', Cable: '2', Keyboard: '3' }, others: 'Headset',
      }, { id: 'fields-schedule' });
      assert.equal(result.loan.department, 'Custom team');
      assert.equal(result.loan.location, 'Stack');
      assert.equal(result.loan.equipment.Monitor, 'FIELDS-MON');
      assert.equal(result.loan.equipment.Adapter, '0');
      assert.equal(result.loan.equipment.Cable, '2');
      assert.equal(result.loan.others, 'Headset');
      for (const code of ['FIELDS-PC', 'FIELDS-MON']) {
        assert.equal(db.prepare('SELECT department FROM assets WHERE code = ?').get(code).department, 'Custom team');
      }
    });
    await t.test('create, edit, pickup and return store canonical counts even without the UI', async () => {
      const { loansRouter } = await import('../server/routes/loans.js');
      invoke(loansRouter, 'post', '/', { id: 'canonical-counts', knoxId: 'counts.user', equipment: { Cable: '001', Dongle: '00' } });
      const read = () => db.prepare("SELECT * FROM loans WHERE id = 'canonical-counts'").get();
      assert.equal(JSON.parse(read().equipment_json).Cable, '1');
      assert.equal(JSON.parse(read().equipment_json).Dongle, '0');
      invoke(loansRouter, 'put', '/:id', { equipment: { Cable: '002' } }, { id: 'canonical-counts' });
      assert.equal(JSON.parse(read().equipment_json).Cable, '2');
      invoke(loansRouter, 'post', '/:id/pickup', { pickupDate: '2026-11-12', equipment: { Cable: '003' } }, { id: 'canonical-counts' });
      assert.equal(JSON.parse(read().equipment_json).Cable, '3');
      invoke(loansRouter, 'post', '/:id/return', { returnDate: '2026-11-12', returnedEquipment: { Cable: '003', Others: '01 bags' } }, { id: 'canonical-counts' });
      assert.equal(JSON.parse(read().returned_equipment_json).Cable, '3');
      assert.equal(JSON.parse(read().returned_equipment_json).Others, '01 bags');
    });
    await t.test('requested monitor may remain unfulfilled at pickup without assigning a monitor', async () => {
      const { loansRouter } = await import('../server/routes/loans.js');
      invoke(loansRouter, 'post', '/', { id: 'unfulfilled-monitor', knoxId: 'monitor.request', assigneeType: 'Business traveler', equipment: { RequestedMonitor: true } });
      const result = invoke(loansRouter, 'post', '/:id/pickup', { pickupDate: '2026-11-10', equipment: { RequestedMonitor: true, Monitor: '' } }, { id: 'unfulfilled-monitor' });
      assert.equal(result.loan.pickupDate, '2026-11-10');
      assert.equal(result.loan.equipment.RequestedMonitor, true);
      assert.equal(result.loan.equipment.Monitor, '');
      assert.equal(result.loan.status, 'Active');
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM assets WHERE owner = 'monitor.request'").get().count, 0);
    });
    await t.test('blank transfer owner returns to IT using the selected fixed date and retains missing accessories', async () => {
      const { loansRouter } = await import('../server/routes/loans.js');
      invoke(assetsRouter, 'post', '/', { id: 'blank-transfer', code: 'BLANK-TRANSFER', category: 'Laptop' });
      invoke(loansRouter, 'post', '/', { id: 'blank-transfer-loan', assetCode: 'BLANK-TRANSFER', knoxId: 'return.user', assignee: 'Return User', pickupDate: '2026-11-01', equipment: { Laptop: 'BLANK-TRANSFER', Keyboard: '1' } });
      const timestamp = '2026-11-03 14:15:00';
      const result = invoke(assetsRouter, 'post', '/:id/transfer', { newOwner: '  ', date: timestamp, location: 'Offsite' }, { id: 'blank-transfer' });
      assert.equal(result.asset.owner, 'IT Department');
      assert.equal(result.asset.status, 'Available');
      assert.equal(result.asset.location, 'IT Office');
      const returned = result.asset.ownershipHistory.find((entry) => entry.date === timestamp);
      assert.equal(returned.newOwner, 'IT Department');
      assert.equal(result.loans[0].returnStatus, 'Partial');
      assert.equal(result.loans[0].returnedEquipment.Laptop, 'BLANK-TRANSFER');
      invoke(assetsRouter, 'post', '/:id/transfer', { newOwner: 'Other', date: 'now()' }, { id: 'blank-transfer' }, 400);
      assert.equal(db.prepare('SELECT owner FROM assets WHERE id = ?').get('blank-transfer').owner, 'IT Department');
    });
    await t.test('standalone ownership transfer survives reload and reconciliation without an asset edit', async () => {
      const { loansRouter } = await import('../server/routes/loans.js');
      invoke(assetsRouter, 'post', '/', { id: 'standalone-transfer', code: 'STANDALONE', category: 'Laptop' });
      invoke(loansRouter, 'post', '/', { id: 'standalone-loan', assetCode: 'STANDALONE', knoxId: 'old.holder', assignee: 'Old Holder', pickupDate: '2026-11-01', equipment: { Laptop: 'STANDALONE', Mouse: '1' } });
      const result = invoke(assetsRouter, 'post', '/:id/transfer', { newOwner: 'New Holder', department: 'IT', location: 'Stack', reason: 'Reassignment', date: '2026-11-10 10:15:00' }, { id: 'standalone-transfer' });
      assert.equal(result.asset.owner, 'New Holder');
      assert.equal(result.loans[0].returnedEquipment.Laptop, 'STANDALONE');
      assert.equal(result.loans[0].returnStatus, 'Partial');
      assert.equal(result.loans[0].returnedEquipment.Mouse, undefined);
      // Read the database again, as a browser reload does. No PUT /assets call.
      const exported = invoke(exchangeRouter, 'get', '/export', {}).db;
      const saved = exported.assets.find((asset) => asset.id === 'standalone-transfer');
      assert.equal(saved.owner, 'New Holder');
      assert.equal(saved.location, 'Stack');
      assert.equal(reconcileAssetWithLoans(saved, exported.loans).owner, 'New Holder');
      assert.equal(saved.ownershipHistory.find((entry) => entry.date === '2026-11-10 10:15:00').newOwner, 'New Holder');
    });
    await t.test('asset location edits persist for IT custody and assigned equipment', async () => {
      const { loansRouter } = await import('../server/routes/loans.js');
      invoke(assetsRouter, 'post', '/', { id: 'location-edit', code: 'LOCATION-EDIT', status: 'Available', owner: 'IT Department' });
      let result = invoke(assetsRouter, 'put', '/:id', { owner: 'IT Department', status: 'Available', location: 'Stack' }, { id: 'location-edit' });
      assert.equal(result.asset.location, 'Stack');
      invoke(loansRouter, 'post', '/', { id: 'location-edit-loan', assetCode: 'LOCATION-EDIT', assignee: 'Jane', knoxId: 'jane.id', assigneeType: 'Employee', pickupDate: '2026-11-01', location: 'Original location' });
      result = invoke(assetsRouter, 'put', '/:id', { owner: 'Jane', status: 'Assigned', location: 'New location' }, { id: 'location-edit' });
      assert.equal(result.asset.location, 'New location');
      assert.equal(db.prepare('SELECT location FROM assets WHERE id = ?').get('location-edit').location, 'New location');
    });
    await t.test('quantity-only PC imports and API records never register asset number 1', async () => {
      const { loansRouter } = await import('../server/routes/loans.js');
      const result = invoke(loansRouter, 'post', '/', { id: 'quantity-only', assetCode: '1', equipment: { Laptop: '1', Mouse: '2' }, knoxId: 'quantity.user', pickupDate: '2026-11-01' });
      assert.equal(result.loan.assetCode, '');
      assert.equal(result.loan.equipment.RequestedPC, true);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM assets WHERE code = '1'").get().count, 0);
      invoke(assetsRouter, 'post', '/', { code: '1' }, {}, 400);
      invoke(exchangeRouter, 'post', '/import', { assets: [{ code: '1' }], loans: [{ id: 'quantity-import', assetCode: '1', knoxId: 'import.user', equipment: { Laptop: '1' } }] });
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM assets WHERE code = '1'").get().count, 0);
      const exported = invoke(exchangeRouter, 'get', '/export', {});
      assert.equal(exported.db.loans.find((loan) => loan.id === 'quantity-import').assetCode, '');
    });
  } finally { hook.deregister(); db.close(); delete globalThis.__assetDateTestDb; }
});
