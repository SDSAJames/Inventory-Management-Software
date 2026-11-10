import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { splitLoanEquipment } from '../shared/loanTransfer.js';
import { transferLoan } from '../server/lib/loanTransfer.js';
import { groupLoans } from '../src/lib/loanSelectors.js';

test('employee pickups remain scheduled without a handover even after planned dates', () => {
  const loan = { assigneeType: 'Employee', endDate: '2001-01-01', equipment: { RequestedPC: true } };
  assert.deepEqual(groupLoans([loan]).scheduled, [loan]);
});

test('partial transfers conserve quantities and validate selected devices', () => {
  const equipment = { Laptop: 'PC-1', Dongle: '3', Mouse: '1', RequestedPC: true };
  const split = splitLoanEquipment(equipment, { Dongle: '2' });
  assert.equal(split.remaining.Dongle, '1');
  assert.equal(split.transferred.Dongle, '2');
  assert.equal(split.remaining.Laptop, 'PC-1');
  assert.equal(split.complete, false);
  assert.throws(() => splitLoanEquipment(equipment, { Dongle: '4' }), /quantity/);
  assert.throws(() => splitLoanEquipment(equipment, { Laptop: 'PC-2' }), /recorded/);
  assert.throws(() => splitLoanEquipment(equipment, {}), /at least one/);
  assert.deepEqual(equipment, { Laptop: 'PC-1', Dongle: '3', Mouse: '1', RequestedPC: true });
});

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE loans (id TEXT PRIMARY KEY, asset_code TEXT, knox_id TEXT, assignee TEXT, assignee_type TEXT, pickup_date TEXT, start_date TEXT, end_date TEXT, status TEXT, equipment_json TEXT, others TEXT, note TEXT, return_date TEXT, returned_date TEXT, returned_equipment_json TEXT, return_status TEXT, is_archived INTEGER, ready_for_pickup INTEGER, created_at TEXT);
    CREATE TABLE assets (id TEXT, code TEXT, owner TEXT, status TEXT, updated TEXT);
    CREATE TABLE ownership_history (id TEXT, asset_code TEXT, previous_owner TEXT, new_owner TEXT, date TEXT, reason TEXT, notes TEXT, created_at TEXT);
    INSERT INTO loans VALUES ('source','PC-1','old.owner','Old Owner','Business traveler','2026-11-01','2026-11-01','2026-11-30','Active','{"Laptop":"PC-1","Dongle":"2"}','','original','','',NULL,'',0,0,'2026-11-01');
    INSERT INTO assets VALUES ('pc','PC-1','Old Owner','On loan','2026-11-01');
    ALTER TABLE assets ADD COLUMN location TEXT;
    ALTER TABLE assets ADD COLUMN department TEXT;`);
  return db;
}

test('equipment transfers use the selected date for pickup and ownership history', () => {
  const db = fixture();
  try {
    const transferDate = '2026-11-03T18:25:00.000Z';
    assert.throws(() => transferLoan(db, 'source', { knoxId: 'new.owner', selection: { Laptop: 'PC-1' }, transferDate: 'now()' }), /valid transfer date/);
    const id = transferLoan(db, 'source', { knoxId: 'new.owner', selection: { Laptop: 'PC-1' }, transferDate, timeZone: 'America/Indiana/Indianapolis' });
    assert.equal(db.prepare('SELECT pickup_date FROM loans WHERE id = ?').get(id).pickup_date, transferDate);
    assert.equal(db.prepare('SELECT date FROM ownership_history').get().date, transferDate);
    assert.match(db.prepare('SELECT note FROM loans WHERE id = ?').get(id).note, /2026-11-03 13:25 EST/);
  } finally { db.close(); }
});

test('loan transfer records new custody, preserves history, and supports rollback', () => {
  const db = fixture();
  try {
    const id = transferLoan(db, 'source', { knoxId: 'new.owner', assignee: 'New Owner', selection: { Laptop: 'PC-1' }, timeZone: 'America/Indiana/Indianapolis' });
    const target = db.prepare('SELECT * FROM loans WHERE id = ?').get(id);
    const source = db.prepare("SELECT * FROM loans WHERE id = 'source'").get();
    assert.equal(target.asset_code, 'PC-1');
    assert.equal(target.assignee_type, 'Employee');
    assert.equal(target.end_date, '');
    assert.equal(source.asset_code, '');
    assert.equal(JSON.parse(source.equipment_json).Dongle, '2');
    assert.equal(source.is_archived, 0);
    assert.match(source.note, /Laptop: PC-1 to New Owner \(new\.owner, Employee\)/);
    assert.doesNotMatch(source.note, /\{"Laptop"/);
    assert.match(source.note, /on \d{4}-\d{2}-\d{2} \d{2}:\d{2} (?:EST|EDT)/);
    assert.doesNotMatch(target.note, /from loan |\d{2}:\d{2}:\d{2}\.\d+Z/);
    assert.match(target.pickup_date, /^\d{4}-\d{2}-\d{2}T.*Z$/);
    assert.equal(db.prepare('SELECT owner FROM assets').get().owner, 'New Owner');
    assert.equal(db.prepare('SELECT status FROM assets').get().status, 'Assigned');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM ownership_history').get().count, 1);
    const final = transferLoan(db, 'source', { knoxId: 'third.owner', selection: { Dongle: '2' } });
    assert.ok(final);
    assert.equal(db.prepare("SELECT status FROM loans WHERE id = 'source'").get().status, 'Transferred');
    assert.throws(() => transferLoan(db, 'source', { knoxId: 'fourth.owner', selection: { Dongle: '2' } }), /outstanding/);
  } finally { db.close(); }
  const failing = fixture();
  try {
    failing.exec("CREATE TRIGGER reject_history BEFORE INSERT ON ownership_history BEGIN SELECT RAISE(ABORT, 'history failure'); END");
    assert.throws(() => transferLoan(failing, 'source', { knoxId: 'new.owner', selection: { Laptop: 'PC-1' } }), /history failure/);
    assert.equal(failing.prepare('SELECT COUNT(*) AS count FROM loans').get().count, 1);
    assert.equal(failing.prepare('SELECT owner FROM assets').get().owner, 'Old Owner');
    assert.equal(failing.prepare('SELECT asset_code FROM loans').get().asset_code, 'PC-1');
  } finally { failing.close(); }

  const complete = fixture();
  try {
    transferLoan(complete, 'source', {
      knoxId: 'traveler.1',
      assignee: 'Traveler One',
      assigneeType: 'Business traveler',
      startDate: '2026-11-04',
      endDate: '2026-11-30',
      selection: { Laptop: 'PC-1', Dongle: '2' },
    });
    const source = complete.prepare("SELECT * FROM loans WHERE id = 'source'").get();
    const target = complete.prepare("SELECT * FROM loans WHERE id != 'source'").get();
    assert.equal(source.status, 'Transferred');
    assert.equal(source.asset_code, 'PC-1');
    assert.equal(JSON.parse(source.equipment_json).Laptop, 'PC-1');
    assert.equal(target.assignee_type, 'Business traveler');
    assert.equal(target.end_date, '2026-11-30');
    assert.equal(complete.prepare('SELECT status FROM assets').get().status, 'On loan');
  } finally { complete.close(); }
});

function addSchedule(db) {
  const original = db.prepare("SELECT * FROM loans WHERE id = 'source'").get();
  const schedule = { ...original, id: 'schedule', knox_id: 'scheduled.traveler', assignee: 'Scheduled Traveler', status: 'Scheduled', pickup_date: '', asset_code: '', equipment_json: '{"RequestedPC":true,"Dongle":"9"}', start_date: '2026-11-04', end_date: '2026-11-30', note: 'Original schedule notes', ready_for_pickup: 1 };
  const keys = Object.keys(schedule);
  db.prepare(`INSERT INTO loans (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((key) => schedule[key]));
}

test('traveler transfers require reviewed start and end dates before changing custody', () => {
  const db = fixture();
  try {
    const payload = { knoxId: 'traveler', assigneeType: 'Business traveler', selection: { Laptop: 'PC-1' } };
    assert.throws(() => transferLoan(db, 'source', payload), /start and end dates/);
    assert.throws(() => transferLoan(db, 'source', { ...payload, startDate: '2026-11-10', endDate: '2026-11-09' }), /earlier/);
    assert.throws(() => transferLoan(db, 'source', { ...payload, startDate: '2026-02-30', endDate: '2026-11-30' }), /valid/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM loans').get().count, 1);
    assert.equal(db.prepare('SELECT owner FROM assets').get().owner, 'Old Owner');
  } finally { db.close(); }
});

test('transfer fulfills the selected schedule once with actual equipment and pickup provenance', () => {
  const db = fixture();
  try {
    addSchedule(db);
    db.prepare("UPDATE loans SET asset_code = ?, equipment_json = ? WHERE id = 'schedule'").run('PLANNED-PC', JSON.stringify({ Laptop: 'PLANNED-PC', Monitor: 'PLANNED-MON', RequestedPC: true, Adapter: '5' }));
    const id = transferLoan(db, 'source', { scheduleId: 'schedule', selection: { Laptop: 'PC-1', Dongle: '1' }, startDate: '2026-11-05', endDate: '2026-11-25' });
    assert.equal(id, 'schedule');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM loans').get().count, 2);
    const schedule = db.prepare("SELECT * FROM loans WHERE id = 'schedule'").get();
    assert.ok(schedule.pickup_date);
    assert.notEqual(schedule.status, 'Scheduled');
    assert.equal(schedule.ready_for_pickup, 0);
    assert.equal(schedule.knox_id, 'scheduled.traveler');
    assert.equal(schedule.assignee_type, 'Business traveler');
    assert.equal(schedule.start_date, '2026-11-05');
    assert.equal(schedule.end_date, '2026-11-25');
    assert.match(schedule.note, /Original schedule notes/);
    const equipment = JSON.parse(schedule.equipment_json);
    assert.equal(equipment.PickupMethod, 'Transfer');
    assert.equal(equipment.RequestedPC, true);
    assert.equal(equipment.Dongle, '1');
    assert.equal(equipment.Laptop, 'PC-1');
    assert.equal(equipment.Monitor, undefined);
    assert.equal(equipment.Adapter, undefined);
    assert.equal(schedule.asset_code, 'PC-1');
    assert.equal(db.prepare('SELECT owner FROM assets').get().owner, 'Scheduled Traveler');
    assert.throws(() => transferLoan(db, 'source', { scheduleId: 'schedule', selection: { Dongle: '1' } }), /awaiting pickup/);
  } finally { db.close(); }
});

test('failed scheduled transfer rolls back both the schedule and source custody', () => {
  const db = fixture();
  try {
    addSchedule(db);
    db.exec("CREATE TRIGGER fail_schedule_history BEFORE INSERT ON ownership_history BEGIN SELECT RAISE(ABORT, 'transfer failure'); END");
    assert.throws(() => transferLoan(db, 'source', { scheduleId: 'schedule', selection: { Laptop: 'PC-1' } }), /transfer failure/);
    assert.equal(db.prepare("SELECT pickup_date FROM loans WHERE id = 'schedule'").get().pickup_date, '');
    assert.equal(db.prepare("SELECT asset_code FROM loans WHERE id = 'source'").get().asset_code, 'PC-1');
    assert.equal(db.prepare('SELECT owner FROM assets').get().owner, 'Old Owner');
  } finally { db.close(); }
});
