import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ensureSavedChangeUndo, captureWorkingData, rememberSavedChange, latestSavedChange, undoSavedChange, trackSavedChanges } from '../server/lib/savedChangeUndo.js';
const user = { username: 'operator', role: 'OPERATOR' };
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec("PRAGMA foreign_keys = ON; CREATE TABLE assets (id TEXT PRIMARY KEY, owner TEXT); CREATE TABLE loans (id TEXT PRIMARY KEY, asset_id TEXT REFERENCES assets(id), end_date TEXT); CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO assets VALUES ('pc', 'Original'); INSERT INTO loans VALUES ('loan', 'pc', '2026-12-01'); INSERT INTO users VALUES ('security-user')");
  ensureSavedChangeUndo(db);
  return db;
}
test('undo restores the latest linked changes exactly, consumes its checkpoint and retains security records', () => {
  const db = fixture();
  try {
    const before = captureWorkingData(db);
    db.exec("UPDATE assets SET owner = 'Receiver'; UPDATE loans SET end_date = '2027-02-03'; INSERT INTO assets VALUES ('new', 'Receiver')");
    rememberSavedChange(db, before, 'Transfer equipment', user);
    const latest = latestSavedChange(db, user);
    assert.equal(latest.available, true);
    ensureSavedChangeUndo(db);
    assert.equal(latestSavedChange(db, user).id, latest.id);
    undoSavedChange(db, latest.id, user);
    assert.deepEqual(captureWorkingData(db), before);
    assert.equal(latestSavedChange(db, user).available, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  } finally { db.close(); }
});
test('undo rejects another operator, outdated review IDs and changed database state without modifying data', () => {
  const db = fixture();
  try {
    const before = captureWorkingData(db);
    db.exec("UPDATE assets SET owner = 'First'");
    rememberSavedChange(db, before, 'First edit', user);
    const first = latestSavedChange(db, user);
    assert.equal(latestSavedChange(db, { username: 'other', role: 'OPERATOR' }).available, false);
    assert.equal(latestSavedChange(db, { username: 'admin', role: 'ADMIN' }).available, true);
    assert.throws(() => undoSavedChange(db, first.id, { username: 'other', role: 'OPERATOR' }), /another user/);
    const secondBefore = captureWorkingData(db);
    db.exec("UPDATE assets SET owner = 'Second'");
    rememberSavedChange(db, secondBefore, 'Second edit', user);
    assert.throws(() => undoSavedChange(db, first.id, user), /Review it again/);
    const latest = latestSavedChange(db, user);
    db.exec("UPDATE loans SET end_date = '2030-01-01'");
    assert.equal(latestSavedChange(db, user).available, false);
    assert.throws(() => undoSavedChange(db, latest.id, user), /Database state has changed/);
    assert.equal(db.prepare('SELECT owner FROM assets').get().owner, 'Second');
  } finally { db.close(); }
});
test('shared middleware records successful writes only; failed writes, reads and no-ops retain the prior checkpoint', () => {
  const db = fixture();
  try {
    const middleware = trackSavedChanges(db);
    const send = (method, status, body, action = () => {}) => {
      const response = { statusCode: status, json(value) { return value; } };
      middleware({ method, originalUrl: '/api/assets/pc', user }, response, () => { action(); response.json(body); });
    };
    send('PUT', 200, { success: true }, () => db.exec("UPDATE assets SET owner = 'Edited'"));
    const id = latestSavedChange(db, user).id;
    send('PUT', 400, { success: false });
    send('GET', 200, { success: true });
    send('PUT', 200, { success: true });
    assert.equal(latestSavedChange(db, user).id, id);
    undoSavedChange(db, id, user);
    assert.equal(db.prepare('SELECT owner FROM assets').get().owner, 'Original');
  } finally { db.close(); }
});
test('a failed undo rolls back both working data and checkpoint consumption', () => {
  const db = fixture();
  try {
    const before = captureWorkingData(db);
    db.exec("UPDATE assets SET owner = 'Edited'");
    rememberSavedChange(db, before, 'Edit', user);
    const latest = latestSavedChange(db, user);
    db.exec("CREATE TRIGGER reject_undo BEFORE INSERT ON assets BEGIN SELECT RAISE(ABORT, 'undo failed'); END");
    assert.throws(() => undoSavedChange(db, latest.id, user), /undo failed/);
    assert.equal(db.prepare('SELECT owner FROM assets').get().owner, 'Edited');
    assert.equal(latestSavedChange(db, user).id, latest.id);
    assert.equal(latestSavedChange(db, user).available, true);
  } finally { db.close(); }
});
