import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_LOCATION, REPAIR_LOCATION } from '../shared/referenceData.js';
import { normalizeLocation, getAssetLocation, getAssetStatusAfterReturn, getAssetStatusForLoanEdit } from '../shared/assetRules.js';
import { normalizeDatabaseLocations, remapDatabaseLocation } from '../src/lib/databaseLocations.js';
import { reconcileAssetWithLoans } from '../src/lib/assetIntegrity.js';
import { parseAssetRows } from '../src/lib/assetExcel.js';
import { parseEquipmentsText } from '../src/lib/txtImport.js';
import { ensureLocation, normalizeStoredLocations, deleteUnusedLocation, renameDirectoryLocation } from '../server/lib/assetLocations.js';
import { returnAssetToIt } from '../server/lib/assetLoans.js';

function locationDatabase() {
  const connection = new DatabaseSync(':memory:');
  connection.exec(`
    CREATE TABLE locations (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL);
    CREATE TABLE assets (id TEXT PRIMARY KEY, code TEXT, status TEXT, location TEXT, owner TEXT, department TEXT, updated TEXT);
    CREATE TABLE loans (id TEXT PRIMARY KEY, location TEXT);
    CREATE TABLE snapshots (id TEXT PRIMARY KEY, data_json TEXT);
    INSERT INTO locations VALUES ('legacy', 'Head Office'), ('canonical', 'IT Department'), ('repair', 'Service Center'), ('other', 'Plant 1');
    INSERT INTO assets VALUES ('available', 'PC-1', 'Available', 'Head Office', '', '', '2026-11-01');
    INSERT INTO assets VALUES ('repair', 'PC-2', 'Under repair', 'Plant 1', 'Jane', 'Operations', '2026-11-01');
    INSERT INTO loans VALUES ('old-loan', 'Head Office'), ('other-loan', 'Plant 1');
    INSERT INTO snapshots VALUES ('old', '{"location":"Head Office"}');
  `);
  return connection;
}

test('renaming an in-use location updates all asset and loan references while preserving its ID', () => {
  const connection = locationDatabase();
  try {
    connection.prepare('INSERT INTO locations VALUES (?, ?)').run('office', '1321');
    connection.prepare('INSERT INTO assets (id, code, status, location, owner) VALUES (?, ?, ?, ?, ?)').run('assigned-office', 'PC-1321', 'Assigned', ' 1321 ', 'Jane');
    connection.prepare('INSERT INTO loans VALUES (?, ?)').run('office-schedule', '1321');
    connection.prepare('INSERT INTO loans VALUES (?, ?)').run('office-history', ' 1321 ');
    const result = renameDirectoryLocation(connection, 'office', ' \t1321 (Stack Office) \n');
    assert.deepEqual(result.location, { id: 'office', name: '1321 (Stack Office)' });
    assert.equal(result.merged, false);
    assert.equal(result.updatedAssets, 1);
    assert.equal(result.updatedLoans, 2);
    assert.equal(connection.prepare('SELECT location FROM assets WHERE id = ?').get('assigned-office').location, '1321 (Stack Office)');
    assert.deepEqual(connection.prepare('SELECT location FROM loans WHERE id LIKE ?').all('office-%').map((row) => row.location), ['1321 (Stack Office)', '1321 (Stack Office)']);
    assert.equal(connection.prepare('SELECT status FROM assets WHERE id = ?').get('assigned-office').status, 'Assigned');
    assert.equal(connection.prepare('SELECT location FROM loans WHERE id = ?').get('other-loan').location, 'Plant 1');
  } finally { connection.close(); }
});

test('location names trim outer whitespace while retaining spaces between words', () => {
  const connection = locationDatabase();
  try {
    ensureLocation(connection, ' \tNorth  Office\n ');
    ensureLocation(connection, 'North  Office ');
    assert.equal(connection.prepare('SELECT COUNT(*) AS count FROM locations WHERE name = ?').get('North  Office').count, 1);
    connection.prepare('INSERT INTO locations VALUES (?, ?)').run('old-spaced', ' Stack Office ');
    normalizeStoredLocations(connection);
    assert.equal(connection.prepare('SELECT name FROM locations WHERE id = ?').get('old-spaced').name, 'Stack Office');
    const result = renameDirectoryLocation(connection, 'old-spaced', '  South  Office  ');
    assert.equal(result.location.name, 'South  Office');
  } finally { connection.close(); }
});

test('renaming to an existing location merges references and keeps the target ID', () => {
  const connection = locationDatabase();
  try {
    connection.prepare('INSERT INTO locations VALUES (?, ?)').run('old-office', '1321');
    connection.prepare('INSERT INTO locations VALUES (?, ?)').run('stack-office', '1321 (Stack Office)');
    connection.prepare('INSERT INTO assets (id, code, status, location) VALUES (?, ?, ?, ?)').run('old-pc', 'OFFICE-PC', 'Assigned', '1321');
    connection.prepare('INSERT INTO loans VALUES (?, ?)').run('old-record', '1321');
    connection.prepare('INSERT INTO loans VALUES (?, ?)').run('target-record', '1321 (Stack Office)');
    const result = renameDirectoryLocation(connection, '1321', ' 1321 (stack office) ');
    assert.equal(result.merged, true);
    assert.deepEqual(result.location, { id: 'stack-office', name: '1321 (Stack Office)' });
    assert.equal(connection.prepare('SELECT COUNT(*) AS count FROM locations WHERE id = ?').get('old-office').count, 0);
    assert.equal(connection.prepare('SELECT location FROM assets WHERE id = ?').get('old-pc').location, result.location.name);
    assert.equal(connection.prepare('SELECT location FROM loans WHERE id = ?').get('old-record').location, result.location.name);
    assert.equal(connection.prepare('SELECT location FROM loans WHERE id = ?').get('target-record').location, result.location.name);
    const cached = remapDatabaseLocation({ locations: ['1321', result.location.name], assets: [{ id: 'pc', location: ' 1321 ' }], loans: [{ id: 'person', location: '1321' }] }, result.previousName, result.location.name);
    assert.deepEqual(cached.locations, [result.location.name]);
    assert.equal(cached.assets[0].location, result.location.name);
    assert.equal(cached.loans[0].location, result.location.name);
    assert.equal(normalizeDatabaseLocations(cached).locations.length, 1);
  } finally { connection.close(); }
});

test('failed location rename or merge rolls back directory and linked data together', () => {
  const connection = locationDatabase();
  try {
    connection.exec("CREATE TRIGGER reject_loan_location BEFORE UPDATE OF location ON loans BEGIN SELECT RAISE(ABORT, 'location update failure'); END");
    assert.throws(() => renameDirectoryLocation(connection, 'Plant 1', 'IT Department'), /location update failure/);
    assert.equal(connection.prepare('SELECT name FROM locations WHERE id = ?').get('other').name, 'Plant 1');
    assert.equal(connection.prepare('SELECT location FROM assets WHERE id = ?').get('repair').location, 'Plant 1');
    assert.equal(connection.prepare('SELECT location FROM loans WHERE id = ?').get('other-loan').location, 'Plant 1');
    assert.throws(() => renameDirectoryLocation(connection, 'Missing', 'New name'), (error) => error.status === 404);
    assert.throws(() => renameDirectoryLocation(connection, 'Plant 1', ' '), (error) => error.status === 400);
  } finally { connection.close(); }
});

test('shared location rules normalize defaults and force the repair destination', () => {
  for (const location of ['Head Office', ' head OFFICE ', 'it department', '', null, undefined]) {
    assert.equal(normalizeLocation(location), DEFAULT_LOCATION);
  }
  assert.equal(normalizeLocation(' Service Center '), REPAIR_LOCATION);
  assert.equal(normalizeLocation(' Plant 1 '), 'Plant 1');
  assert.equal(normalizeLocation('', ''), '');
  assert.equal(getAssetLocation('Under repair', 'Plant 1'), REPAIR_LOCATION);
  assert.equal(getAssetLocation('Available', 'Plant 1'), 'Plant 1');
  assert.equal(getAssetLocation('Damaged', 'Head Office'), DEFAULT_LOCATION);
});

test('rental history does not recreate deleted directory values and new server entries are idempotent', () => {
  const cached = normalizeDatabaseLocations({
    locations: ['Plant 1'],
    assets: [],
    loans: [{ location: 'New Lab' }],
  });
  assert.deepEqual(cached.locations, ['Plant 1']);
  assert.equal(cached.loans[0].location, 'New Lab');

  const connection = locationDatabase();
  try {
    ensureLocation(connection, 'New Lab');
    ensureLocation(connection, 'new lab');
    assert.equal(connection.prepare('SELECT COUNT(*) AS count FROM locations WHERE LOWER(name) = LOWER(?)').get('New Lab').count, 1);
  } finally {
    connection.close();
  }
});

test('unused location deletion handles names, IDs, aliases and stale cache-only entries', () => {
  const connection = locationDatabase();
  try {
    const removed = deleteUnusedLocation(connection, ' plant 1 ');
    assert.deepEqual(removed.ids, ['other']);
    assert.equal(connection.prepare('SELECT COUNT(*) AS count FROM locations WHERE id = ?').get('other').count, 0);
    assert.equal(connection.prepare('SELECT location FROM loans WHERE id = ?').get('other-loan').location, 'Plant 1');
    const cached = normalizeDatabaseLocations({ locations: connection.prepare('SELECT name FROM locations').all().map((row) => row.name), assets: connection.prepare('SELECT * FROM assets').all(), loans: connection.prepare('SELECT * FROM loans').all() });
    assert.ok(!cached.locations.includes('Plant 1'));
    assert.deepEqual(deleteUnusedLocation(connection, 'Plant 1').ids, []);
    assert.deepEqual(deleteUnusedLocation(connection, 'Cache-only location').ids, []);
    connection.prepare('INSERT INTO locations VALUES (?, ?)').run('unused-id', ' Spaced location ');
    assert.deepEqual(deleteUnusedLocation(connection, 'unused-id').ids, ['unused-id']);
    connection.prepare('DELETE FROM assets').run();
    assert.deepEqual(deleteUnusedLocation(connection, 'it department').ids.sort(), ['canonical', 'legacy']);
  } finally { connection.close(); }
});

test('location deletion protects assigned assets even when the directory entry is missing', () => {
  const connection = locationDatabase();
  try {
    connection.prepare('INSERT INTO assets (id, code, status, location) VALUES (?, ?, ?, ?)').run('assigned', 'PC-3', 'Assigned', ' Missing location ');
    assert.throws(() => deleteUnusedLocation(connection, 'missing LOCATION'), (error) => error.status === 409 && /assigned to 1 asset/.test(error.message));
    assert.throws(() => deleteUnusedLocation(connection, 'IT Department'), (error) => error.status === 409);
    assert.equal(connection.prepare('SELECT COUNT(*) AS count FROM locations WHERE id IN (?, ?)').get('legacy', 'canonical').count, 2);
    assert.throws(() => deleteUnusedLocation(connection, 'service center'), (error) => error.status === 409);
  } finally { connection.close(); }
});

test('failed directory deletion rolls back all aliases', () => {
  const connection = locationDatabase();
  try {
    connection.prepare('DELETE FROM assets').run();
    connection.exec("CREATE TRIGGER reject_location_delete BEFORE DELETE ON locations WHEN OLD.id = 'canonical' BEGIN SELECT RAISE(ABORT, 'delete failure'); END");
    assert.throws(() => deleteUnusedLocation(connection, 'IT Department'), /delete failure/);
    assert.equal(connection.prepare('SELECT COUNT(*) AS count FROM locations WHERE id IN (?, ?)').get('legacy', 'canonical').count, 2);
  } finally { connection.close(); }
});

test('cache normalization merges renamed locations without changing rental locations to repair destinations', () => {
  const input = {
    locations: ['Head Office', 'IT Department', 'Service Center', 'Plant 1'],
    assets: [{ code: 'PC-1', status: 'Under repair', location: 'Head Office' }],
    loans: [{ assetCode: 'PC-1', location: 'Head Office' }],
  };
  const original = structuredClone(input);
  const result = normalizeDatabaseLocations(input);
  assert.deepEqual(result.locations, [DEFAULT_LOCATION, REPAIR_LOCATION, 'Plant 1']);
  assert.equal(result.assets[0].location, REPAIR_LOCATION);
  assert.equal(result.loans[0].location, DEFAULT_LOCATION);
  assert.deepEqual(input, original);
  assert.equal(normalizeDatabaseLocations(result), result);
  const active = { assetCode: 'PC-1', pickupDate: '2026-10-01', location: 'Plant 1', assignee: 'Jane' };
  const reconciled = reconcileAssetWithLoans(result.assets[0], [active]);
  assert.equal(reconciled.status, 'Under repair');
  assert.equal(reconciled.location, REPAIR_LOCATION);
});

test('asset reconciliation tracks monitor handovers with employee and traveler statuses', () => {
  const travelerMonitor = reconcileAssetWithLoans(
    { code: 'MON-1', status: 'Available', owner: 'IT department' },
    [{ assigneeType: 'Business traveler', assignee: 'Taylor', pickupDate: '2026-11-01', equipment: { Monitor: 'MON-1' } }],
  );
  const employeeMonitor = reconcileAssetWithLoans(
    { code: 'MON-2', status: 'Available', owner: 'IT department' },
    [{ assigneeType: 'Employee', assignee: 'Jordan', pickupDate: '2026-11-01', equipment: { Monitor: 'MON-2' } }],
  );
  assert.equal(travelerMonitor.status, 'On loan');
  assert.equal(travelerMonitor.owner, 'Taylor');
  assert.equal(employeeMonitor.status, 'Assigned');
  assert.equal(employeeMonitor.owner, 'Jordan');
});

test('both equipment import formats apply the same default and repair rules', () => {
  const rows = [
    ['Asset Number', 'Asset Type', 'Status', 'Location'],
    ['PC-1', 'Laptop', 'Available', 'Head Office'],
    ['PC-2', 'MES PC', 'Repair', 'Plant 1'],
    ['PC-3', 'Monitor', 'Available', ''],
  ];
  const xlsx = parseAssetRows(rows, []).added;
  const txt = parseEquipmentsText(rows, []).assets;
  for (const records of [xlsx, txt]) {
    assert.deepEqual(records.map((asset) => asset.location), [DEFAULT_LOCATION, REPAIR_LOCATION, DEFAULT_LOCATION]);
    assert.equal(records[1].status, 'Under repair');
  }
});

test('stored location migration merges directory entries, is idempotent and preserves snapshots', () => {
  const connection = locationDatabase();
  try {
    normalizeStoredLocations(connection);
    const rows = () => connection.prepare('SELECT * FROM locations ORDER BY id').all();
    const locations = rows();
    assert.equal(locations.some((location) => location.id === 'legacy'), false);
    assert.equal(locations.find((location) => location.id === 'canonical').name, DEFAULT_LOCATION);
    assert.equal(locations.find((location) => location.id === 'repair').name, REPAIR_LOCATION);
    assert.equal(connection.prepare("SELECT location FROM assets WHERE id = 'available'").get().location, DEFAULT_LOCATION);
    assert.equal(connection.prepare("SELECT location FROM assets WHERE id = 'repair'").get().location, REPAIR_LOCATION);
    assert.equal(connection.prepare("SELECT location FROM loans WHERE id = 'old-loan'").get().location, DEFAULT_LOCATION);
    assert.equal(connection.prepare("SELECT location FROM loans WHERE id = 'other-loan'").get().location, 'Plant 1');
    assert.equal(connection.prepare('SELECT data_json FROM snapshots').get().data_json, '{"location":"Head Office"}');
    normalizeStoredLocations(connection);
    assert.deepEqual(rows(), locations);
    connection.exec('BEGIN');
    connection.prepare("UPDATE assets SET location = 'Head Office' WHERE id = 'available'").run();
    normalizeStoredLocations(connection);
    connection.exec('ROLLBACK');
    assert.equal(connection.prepare("SELECT location FROM assets WHERE id = 'available'").get().location, DEFAULT_LOCATION);
  } finally {
    connection.close();
  }
});

test('failed location migration rolls back directory and record changes', () => {
  const connection = locationDatabase();
  try {
    const before = connection.prepare('SELECT * FROM locations ORDER BY id').all();
    connection.exec("CREATE TRIGGER reject_location_change BEFORE UPDATE ON assets BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    assert.throws(() => normalizeStoredLocations(connection), /test failure/);
    assert.deepEqual(connection.prepare('SELECT * FROM locations ORDER BY id').all(), before);
    assert.equal(connection.prepare("SELECT location FROM assets WHERE id = 'available'").get().location, 'Head Office');
  } finally {
    connection.close();
  }
});

test('loan returns and edits retain repair status while a new pickup can change it', () => {
  assert.equal(getAssetStatusAfterReturn('Under repair'), 'Under repair');
  assert.equal(getAssetStatusAfterReturn('On loan'), 'Available');
  const previous = { asset_code: 'PC-2', pickup_date: '2026-11-01' };
  const edit = { assetCode: 'pc-2', pickupDate: '2026-11-01', note: 'Updated notes' };
  assert.equal(getAssetStatusForLoanEdit('Under repair', previous, edit), 'Under repair');
  assert.equal(getAssetStatusForLoanEdit('Under repair', {}, edit), 'On loan');
  assert.equal(getAssetStatusForLoanEdit('Under repair', previous, { ...edit, assetCode: 'PC-3' }), 'On loan');
  assert.equal(getAssetStatusForLoanEdit('Under repair', previous, { ...edit, returnDate: '2026-11-04' }), 'Under repair');
  const connection = locationDatabase();
  try {
    connection.prepare("UPDATE assets SET location = 'Plant 1' WHERE code = 'PC-1'").run();
    returnAssetToIt(connection, 'PC-1', '2026-11-04');
    assert.equal(connection.prepare("SELECT location FROM assets WHERE code = 'PC-1'").get().location, DEFAULT_LOCATION);
    returnAssetToIt(connection, 'PC-2', '2026-11-04');
    const repaired = connection.prepare("SELECT * FROM assets WHERE code = 'PC-2'").get();
    assert.equal(repaired.status, 'Under repair');
    assert.equal(repaired.location, REPAIR_LOCATION);
    assert.equal(repaired.owner, 'IT department');
    assert.equal(repaired.department, '');
  } finally {
    connection.close();
  }
});
