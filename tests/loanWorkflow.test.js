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
  db.exec(`CREATE TABLE loans (id TEXT PRIMARY KEY, asset_code TEXT, knox_id TEXT, assignee TEXT, pickup_date TEXT, start_date TEXT, status TEXT, equipment_json TEXT, others TEXT, note TEXT, return_date TEXT, returned_date TEXT, returned_equipment_json TEXT, return_status TEXT, is_archived INTEGER, ready_for_pickup INTEGER, created_at TEXT);
    CREATE TABLE assets (id TEXT, code TEXT, owner TEXT, updated TEXT);
    CREATE TABLE ownership_history (id TEXT, asset_code TEXT, previous_owner TEXT, new_owner TEXT, date TEXT, reason TEXT, notes TEXT, created_at TEXT);
    INSERT INTO loans VALUES ('source','PC-1','old.owner','Old Owner','2026-11-01','2026-11-01','Active','{"Laptop":"PC-1","Dongle":"2"}','','original','','',NULL,'',0,0,'2026-11-01');
    INSERT INTO assets VALUES ('pc','PC-1','Old Owner','2026-11-01');`);
  return db;
}

test('loan transfer records new custody, preserves history, and supports rollback', () => {
  const db = fixture();
  try {
    const id = transferLoan(db, 'source', { knoxId: 'new.owner', assignee: 'New Owner', selection: { Laptop: 'PC-1' } });
    const target = db.prepare('SELECT * FROM loans WHERE id = ?').get(id);
    const source = db.prepare("SELECT * FROM loans WHERE id = 'source'").get();
    assert.equal(target.asset_code, 'PC-1');
    assert.equal(source.asset_code, '');
    assert.equal(JSON.parse(source.equipment_json).Dongle, '2');
    assert.equal(source.is_archived, 0);
    assert.equal(db.prepare('SELECT owner FROM assets').get().owner, 'New Owner');
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
});
