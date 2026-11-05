import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ensureAvailableAssetCustody } from '../server/lib/assetCustody.js';
import { normalizeAvailableAsset, getHolderReturnChanges } from '../shared/assetRules.js';
import { getAssetEffectiveOwnershipHistory } from '../src/lib/assetIntegrity.js';

test('Available assets show IT custody and a history entry even for old blank holders', () => {
  const asset = { id: 'printer', code: 'AST-2024-002', status: 'Available', owner: '', location: 'IT Department', updated: '2024-08-17' };
  assert.equal(normalizeAvailableAsset(asset).owner, 'IT department');
  const history = getAssetEffectiveOwnershipHistory(asset);
  assert.equal(history.length, 1);
  assert.equal(history[0].newOwner, 'IT department');
  assert.equal(history[0].reason, 'IT custody recorded');
  assert.match(history[0].notes, /earlier return date was not recorded/);
  const assigned = { ...asset, status: 'Assigned', owner: 'Jane' };
  assert.equal(normalizeAvailableAsset(assigned), assigned);
  assert.equal(getHolderReturnChanges(assigned, { status: 'Available' }).owner, 'IT department');
});

test('the latest ownership event must represent current custody, not just an old matching owner', () => {
  const asset = { id: 'pc', code: 'PC-1', status: 'Available', owner: '', ownershipHistory: [
    { id: 'old-it', date: '2001-01-01', previousOwner: 'None', newOwner: 'IT department', reason: 'Initial custody' },
    { id: 'later-person', date: '2002-01-01', previousOwner: 'IT department', newOwner: 'Jane', reason: 'Assigned' },
  ] };
  const history = getAssetEffectiveOwnershipHistory(asset);
  assert.equal(history[0].newOwner, 'IT department');
  assert.equal(history[0].previousOwner, 'Jane');
  assert.equal(history.length, 3);
  const persisted = { ...asset, owner: 'IT department', ownershipHistory: history };
  assert.equal(getAssetEffectiveOwnershipHistory(persisted).length, 3);
});

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE assets (id TEXT PRIMARY KEY, code TEXT, status TEXT, owner TEXT, department TEXT);
    CREATE TABLE loans (id TEXT, asset_code TEXT, pickup_date TEXT, status TEXT, return_date TEXT, returned_date TEXT, is_archived INTEGER, equipment_json TEXT, returned_equipment_json TEXT);
    CREATE TABLE ownership_history (id TEXT PRIMARY KEY, asset_code TEXT, previous_owner TEXT, new_owner TEXT, date TEXT, reason TEXT, notes TEXT, created_at TEXT);
    INSERT INTO assets VALUES ('blank','PRINT-1','Available','','Operations'), ('stale','PC-1','Available','Jane','Finance'), ('active','PC-2','Available','',''), ('repair','PC-3','Under repair','Vendor','');
    INSERT INTO ownership_history VALUES ('earlier-it','PC-1','None','IT department','2001-01-01','Initial custody','','2001-01-01'), ('later-holder','PC-1','IT department','Jane','2002-01-01','Assigned','','2002-01-01');
    INSERT INTO loans VALUES ('active','PC-2','2026-11-01','Active','','',0,'{}',NULL);`);
  return db;
}

test('startup custody repair persists history once and preserves active and repair records', () => {
  const db = fixture();
  try {
    ensureAvailableAssetCustody(db, '2026-11-05T12:00:00Z');
    assert.equal(db.prepare("SELECT owner FROM assets WHERE id = 'blank'").get().owner, 'IT department');
    assert.equal(db.prepare("SELECT department FROM assets WHERE id = 'stale'").get().department, '');
    assert.equal(db.prepare("SELECT owner FROM assets WHERE id = 'repair'").get().owner, 'Vendor');
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ownership_history WHERE asset_code = 'PC-2'").get().count, 0);
    const latest = db.prepare("SELECT * FROM ownership_history WHERE asset_code = 'PC-1' ORDER BY date DESC LIMIT 1").get();
    assert.equal(latest.new_owner, 'IT department');
    assert.equal(latest.previous_owner, 'Jane');
    assert.equal(latest.date, '2026-11-05T12:00:00Z');
    assert.match(latest.notes, /Earlier return date was not recorded/);
    const count = db.prepare('SELECT COUNT(*) AS count FROM ownership_history').get().count;
    ensureAvailableAssetCustody(db, '2026-11-06T12:00:00Z');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM ownership_history').get().count, count);
  } finally { db.close(); }
});

test('a failed history backfill rolls back current-holder changes', () => {
  const db = fixture();
  try {
    db.exec("CREATE TRIGGER reject_custody_history BEFORE INSERT ON ownership_history BEGIN SELECT RAISE(ABORT, 'history failure'); END");
    assert.throws(() => ensureAvailableAssetCustody(db), /history failure/);
    assert.equal(db.prepare("SELECT owner FROM assets WHERE id = 'blank'").get().owner, '');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM ownership_history').get().count, 2);
  } finally { db.close(); }
});
