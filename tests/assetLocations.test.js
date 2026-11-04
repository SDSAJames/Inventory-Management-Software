import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_LOCATION, REPAIR_LOCATION } from '../shared/referenceData.js';
import { normalizeLocation, getAssetLocation, getAssetStatusAfterReturn, getAssetStatusForLoanEdit } from '../shared/assetRules.js';
import { normalizeDatabaseLocations } from '../src/lib/databaseLocations.js';
import { reconcileAssetWithLoans } from '../src/lib/assetIntegrity.js';
import { parseAssetRows } from '../src/lib/assetExcel.js';
import { parseEquipmentsText } from '../src/lib/txtImport.js';
import { normalizeStoredLocations } from '../server/lib/assetLocations.js';
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
