import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ensureAssetActivity, ensureLoanActivity, withActivityActor, withoutActivityTracking, restoreRecordActivity } from '../server/lib/assetActivity.js';
import { assetMix, latestAssetChange, assetLocationMix, recordedActivityTime, assetsWithCustodyActivity } from '../src/lib/overviewAssets.js';

test('Asset mix combines laptop variants without changing stored categories or MES types', () => {
  const assets = ['Laptop', 'Laptop(others)', 'Laptop(vendor A)', 'laptop (Vendor B)', 'MES PC', 'Monitor'].map((category) => ({ category }));
  assert.deepEqual(assetMix(assets).find((row) => row.label === 'Laptop'), { label: 'Laptop', count: 4 });
  assert.equal(assetMix(assets).reduce((sum, row) => sum + row.count, 0), assets.length);
  assert.equal(assets[1].category, 'Laptop(others)');
});

test('latest asset activity records exact changes and stable timestamps transactionally', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE assets (id TEXT PRIMARY KEY, code TEXT, owner TEXT, status TEXT, location TEXT, updated TEXT); INSERT INTO assets VALUES ('old','PC-OLD','A','Assigned','Stack','2026-01-01')");
    ensureAssetActivity(db); ensureAssetActivity(db);
    const read = (id = 'old') => db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
    assert.match(latestAssetChange(read()).summary, /not recorded/);
    assert.equal(latestAssetChange(read()).time, '');
    db.exec("UPDATE assets SET owner = 'B', status = 'On loan' WHERE id = 'old'");
    const saved = read();
    assert.match(latestAssetChange(saved).summary, /Current holder: A → B/);
    assert.match(latestAssetChange(saved).summary, /Status: Assigned → On loan/);
    assert.match(saved.changed_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    db.exec("UPDATE assets SET owner = 'B', updated = '2026-11-13' WHERE id = 'old'");
    assert.equal(read().changed_at, saved.changed_at);
    assert.equal(read().latest_change, saved.latest_change);
    db.exec("BEGIN; UPDATE assets SET status = 'Damaged' WHERE id = 'old'; ROLLBACK;");
    assert.equal(read().latest_change, saved.latest_change);
    db.exec("INSERT INTO assets (id, code) VALUES ('new', 'PC-NEW')");
    assert.equal(latestAssetChange(read('new')).summary, 'Asset registered');
    // Raw undo/snapshot inserts retain the saved timestamp and details.
    db.exec("DELETE FROM assets WHERE id = 'old'");
    const keys = Object.keys(saved);
    db.prepare(`INSERT INTO assets (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(saved));
    assert.equal(read().latest_change, saved.latest_change); assert.equal(read().changed_at, saved.changed_at);
  } finally { db.close(); }
});


test('activity records isolated authenticated editors and does not stamp later no-op writes', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE assets (id TEXT PRIMARY KEY, owner TEXT); CREATE TABLE loans (id TEXT PRIMARY KEY, assignee_type TEXT);");
    ensureAssetActivity(db); ensureLoanActivity(db);
    await Promise.all(['alice', 'bob'].map((username) => withActivityActor({ user: { username, full_name: username + ' Name' } }, null, async () => {
      await Promise.resolve(); db.prepare('INSERT INTO assets (id, owner) VALUES (?, ?)').run(username, username);
    })));
    for (const username of ['alice', 'bob']) assert.equal(JSON.parse(db.prepare('SELECT changed_by FROM assets WHERE id = ?').get(username).changed_by).username, username);
    withActivityActor({ user: { username: 'alice' } }, null, () => db.exec("INSERT INTO loans (id, assignee_type) VALUES ('loan', 'Business traveler')"));
    withActivityActor({ user: { username: 'bob' } }, null, () => db.exec("UPDATE loans SET assignee_type = 'Contractor' WHERE id = 'loan'"));
    const saved = db.prepare('SELECT * FROM loans').get();
    db.exec("UPDATE loans SET assignee_type = 'Contractor' WHERE id = 'loan'");
    assert.equal(db.prepare('SELECT changed_by FROM loans').get().changed_by, saved.changed_by);
    assert.equal(JSON.parse(saved.changed_by).username, 'bob');
    assert.equal(latestAssetChange({}).changedBy, 'Not recorded');
    assert.deepEqual(JSON.parse(saved.latest_change).changes, [{ field: 'assignee_type', previous: 'Business traveler', next: 'Contractor' }]);
  } finally { db.close(); }
});


test('unknown update times stay undated and maintenance writes do not become recent activity', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE assets (id TEXT PRIMARY KEY, owner TEXT, status TEXT, updated TEXT); INSERT INTO assets VALUES ('old', 'Employee', 'On loan', '')");
    ensureAssetActivity(db);
    withoutActivityTracking(() => db.exec("UPDATE assets SET status = 'Assigned' WHERE id = 'old'"));
    let saved = db.prepare('SELECT * FROM assets').get();
    assert.equal(saved.changed_at, null); assert.equal(saved.latest_change, null);
    assert.equal(recordedActivityTime(saved), ''); assert.equal(latestAssetChange(saved).time, '');
    assert.equal(recordedActivityTime({ updated: '2026-11-16' }), '');
    db.exec("INSERT INTO assets (id, owner, status) VALUES ('restore', 'Employee', 'Assigned')");
    restoreRecordActivity(db, 'assets', 'restore', { updated: '' });
    saved = db.prepare("SELECT * FROM assets WHERE id = 'restore'").get();
    assert.equal(saved.changed_at, null); assert.equal(saved.latest_change, null);
    const legacy = { id: 'legacy', code: 'PC-1', status: 'Assigned', changedAt: '2026-11-16T10:00:00Z', latestChange: JSON.stringify({ kind: 'updated', changes: [{ field: 'status', previous: 'Assigned', next: 'On loan' }] }) };
    const viewed = assetsWithCustodyActivity([legacy], [{ assetCode: 'PC-1', assigneeType: 'Employee', pickupDate: '2026-01-01' }])[0];
    assert.equal(recordedActivityTime(viewed), ''); assert.doesNotMatch(latestAssetChange(viewed).summary, /On loan/);
  } finally { db.close(); }
});

test('asset locations group normalized current locations and retain empty-location assets', () => {
  const items = assetLocationMix([{ location: ' Stack ' }, { location: 'stack' }, { location: 'Head Office' }, { location: '' }, { status: 'Under repair', location: 'Stack' }]);
  assert.equal(items.reduce((total, item) => total + item.count, 0), 5);
  assert.deepEqual(items.find((item) => item.label === 'Stack'), { label: 'Stack', count: 2 });
  assert.equal(items.find((item) => item.label === 'service center').count, 1);
  assert.ok(items.some((item) => item.label === 'IT Office')); assert.ok(items.some((item) => item.label === 'Unspecified'));
});
