import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ensureAssetActivity } from '../server/lib/assetActivity.js';
import { assetMix, latestAssetChange } from '../src/lib/overviewAssets.js';

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
    assert.match(latestAssetChange(read()).time, /time not recorded/);
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
