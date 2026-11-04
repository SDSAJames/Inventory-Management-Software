import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { isBusinessTravelerType, isLoanReturned } from '../shared/loanRules.js';
import { findLoanMatchIndex, loanIdentityKeys } from '../shared/loanIdentity.js';
import { groupLoans, filterLoanGroups, getLoanGroup } from '../src/lib/loanSelectors.js';
import { buildLoanEquipment, buildReturnedEquipment, equipmentQuantitiesToForm, getMissingReturnItems } from '../src/lib/loanEquipment.js';
import { parseAssetRows, assetsToRows } from '../src/lib/assetExcel.js';
import { parseDelimitedText, parseEquipmentsText, normalizeTextDate } from '../src/lib/txtImport.js';
import { buildCalendarDays, shiftCalendarMonth } from '../src/lib/calendarDates.js';
import { computeLoanStatus, formatLoanRow, exportLoanRow } from '../server/lib/loanRows.js';
import { getDuplicateLoanIds, removeDuplicateLoans } from '../server/lib/loanDuplicates.js';
import { equipmentExportValue, normalizeEquipmentStatus } from '../src/lib/equipmentSchema.js';
import { DEFAULT_LOCATION } from '../shared/referenceData.js';
import { normalizeDateToIso, readableLoanDate } from '../src/lib/utils.js';

test('return and traveler rules accept browser and SQLite records', () => {
  assert.equal(isBusinessTravelerType(' Business Traveler '), true);
  assert.equal(isBusinessTravelerType('Employee'), false);
  for (const record of [{ returnDate: '2026-11-02' }, { returned_date: '2026-11-02' }, { isArchived: true }, { is_archived: 1 }, { status: 'Returned' }]) {
    assert.equal(isLoanReturned(record), true);
  }
  assert.equal(isLoanReturned({ status: 'Scheduled', readyForPickup: true }), false);
});

test('loan tabs partition lifecycle records while partial returns remain independently visible', () => {
  const records = [
    { id: 'scheduled', knoxId: 'jane.doe', equipment: { RequestedPC: true } },
    { id: 'active', pickupDate: '2026-01-01', endDate: '2999-01-01' },
    { id: 'overdue', pickupDate: '2000-01-01', endDate: '2001-01-01' },
    { id: 'returned', returnDate: '2026-01-02', endDate: '2001-01-01' },
    { id: 'partial', isArchived: true, returnStatus: 'Partial' },
    { id: 'employee', assigneeType: 'Employee', endDate: '2001-01-01' },
  ];
  const groups = groupLoans(records);
  const ids = (key) => groups[key].map((record) => record.id);
  assert.deepEqual(ids('scheduled'), ['scheduled', 'employee']);
  assert.deepEqual(ids('loaned'), ['active']);
  assert.deepEqual(ids('overdue'), ['overdue']);
  assert.deepEqual(ids('returned'), ['returned', 'partial']);
  assert.deepEqual(ids('unreturned'), ['partial']);
  assert.equal(groups.all, records);
  const filtered = filterLoanGroups(groups, 'jane.doe', 'Knox ID');
  assert.deepEqual(filtered.all.map((loan) => loan.id), ['scheduled']);
  assert.deepEqual(filtered.scheduled, filtered.all);
  for (const unknown of ['constructor', '__proto__', 'toString', 'unknown']) {
    assert.equal(getLoanGroup(groups, unknown), records);
  }
});

test('import identity preserves dated loans and avoids ambiguous undated matches', () => {
  const first = { id: 'one', assetCode: 'SPE-1', knoxId: 'jane.doe', startDate: '2026-01-01' };
  const second = { ...first, id: 'two', startDate: '2026-02-01' };
  assert.equal(findLoanMatchIndex([first, second], { ...first, id: 'new-import-id' }), 0);
  assert.equal(findLoanMatchIndex([first, second], { ...first, id: '', startDate: '2026-03-01' }), -1);
  assert.equal(findLoanMatchIndex([first, second], { ...first, id: '', startDate: '' }), -1);
  assert.equal(findLoanMatchIndex([first], { ...first, id: '', startDate: '' }), 0);
  assert.deepEqual(loanIdentityKeys({ asset_code: 'SPE-1', knox_id: 'Jane.Doe', start_date: '2026-01-01' }), loanIdentityKeys({ ...first, assignee: '' }));
});

test('equipment mapping preserves zeros, monitor asset codes and request metadata', () => {
  const form = equipmentQuantitiesToForm({ Adapter: 0, Monitor: 'MON-123' }, { Cable: 1 });
  assert.equal(form.adapter, '0');
  assert.equal(form.cable, '1');
  assert.equal(form.monitor, 'MON-123');
  const equipment = { RequestedPC: true, ...buildLoanEquipment(form, 'PC-123') };
  assert.equal(equipment.Laptop, 'PC-123');
  assert.equal(equipment.RequestedPC, true);
  const returned = buildReturnedEquipment({ ...form, monitor: '', others: 'Headset' });
  assert.deepEqual(getMissingReturnItems(equipment, returned), ['Monitor']);
  assert.deepEqual(getMissingReturnItems({ RequestedPC: true, RequestedMonitor: true }, {}), []);
});

test('equipment parsers share aliases while preserving physical blank column positions', () => {
  const rows = [
    ['Asset Number', '', 'Serial Number', 'Asset Type', 'Status', 'Location'],
    ['PC-123', 'ignored cell', 'SERIAL-123', 'MES PC', 'Issued', 'Plant 1'],
  ];
  const excel = parseAssetRows(rows, []);
  assert.equal(excel.added[0].serial, 'SERIAL-123');
  assert.equal(excel.added[0].status, 'Assigned');
  assert.equal(excel.added[0].category, 'MES PC');
  const text = parseEquipmentsText(rows, []);
  assert.equal(text.assets[0].serial, 'SERIAL-123');
  assert.equal(text.assets[0].status, 'Assigned');
  const exported = assetsToRows(excel.added);
  assert.equal(parseAssetRows(exported, []).added[0].code, 'PC-123');
  assert.equal(parseDelimitedText('Asset Number\tNotes\r\nPC-123\t"Line 1\nLine 2"')[1][1], 'Line 1 Line 2');
  assert.equal(normalizeTextDate('1/0/1900'), '');
  assert.equal(normalizeDateToIso('46189.5'), '2026-06-16');
  assert.equal(readableLoanDate('46189.5'), '2026-06-16 12:00');
  assert.equal(readableLoanDate('100001'), '2173-10-15 00:00');
  for (const status of ['constructor', '__proto__', 'toString']) {
    assert.equal(equipmentExportValue({ status }, 'Status'), status);
    assert.equal(normalizeEquipmentStatus(status), 'Available');
  }
});

test('shared calendar grid retains leap days, adjacent months and year rollover', () => {
  const leap = buildCalendarDays(2024, 1);
  assert.equal(leap.length, 42);
  assert.equal(leap.filter((day) => day.isCurrentMonth).length, 29);
  assert.equal(leap[0].dateStr, '2024-01-28');
  assert.equal(leap.at(-1).dateStr, '2024-03-09');
  assert.deepEqual(shiftCalendarMonth(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftCalendarMonth(2026, 0, -1), { year: 2025, month: 11 });
});

test('server API and export keep their distinct status and default contracts', () => {
  const row = { id: 'loan', asset_code: 'PC-123', assignee: '', location: null, status: 'Scheduled', pickup_date: '2026-01-01', end_date: '2999-01-01', equipment_json: '{"RequestedMonitor":true}', created_at: '2026-01-01' };
  const api = formatLoanRow(row);
  const exported = exportLoanRow(row);
  assert.equal(api.status, 'Active');
  assert.equal(exported.status, 'Scheduled');
  assert.equal(api.location, DEFAULT_LOCATION);
  assert.equal(exported.location, null);
  assert.equal(api.equipment.RequestedMonitor, true);
  assert.equal('createdAt' in api, true);
  assert.equal('createdAt' in exported, false);
  const employee = { ...row, assignee_type: 'Employee', end_date: '2001-01-01' };
  assert.equal(computeLoanStatus(employee, { today: '2026-11-02' }), 'Active');
  assert.equal(computeLoanStatus(employee, { today: '2026-11-02', tracksDueDate: true }), 'Overdue');
});

test('database duplicate cleanup preserves different loans and participates in rollback', () => {
  const connection = new DatabaseSync(':memory:');
  try {
    connection.exec('CREATE TABLE loans (id TEXT PRIMARY KEY, asset_code TEXT, knox_id TEXT, start_date TEXT, equipment_json TEXT, created_at TEXT)');
    const insert = connection.prepare('INSERT INTO loans VALUES (?, ?, ?, ?, ?, ?)');
    insert.run('original', 'PC-123', 'jane.doe', '2026-01-01', '{"Adapter":1,"Cable":1}', '2026-01-01');
    insert.run('duplicate', 'PC-123', 'jane.doe', '2026-01-01', '{"Cable":1,"Adapter":1}', '2026-02-01');
    insert.run('different', 'PC-123', 'jane.doe', '2026-03-01', '{"Adapter":1,"Cable":1}', '2026-03-01');
    assert.deepEqual(getDuplicateLoanIds(connection), ['duplicate']);
    connection.exec('BEGIN');
    assert.equal(removeDuplicateLoans(connection), 1);
    assert.equal(connection.prepare('SELECT COUNT(*) AS count FROM loans').get().count, 2);
    connection.exec('ROLLBACK');
    assert.equal(connection.prepare('SELECT COUNT(*) AS count FROM loans').get().count, 3);
  } finally {
    connection.close();
  }
});
