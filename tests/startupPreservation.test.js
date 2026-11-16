import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('restarts preserve edited end dates and never seed operational records into empty tables', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'inventory-startup-'));
  const databasePath = path.join(folder, 'inventory.db');
  const moduleUrl = new URL('../server/db/database.js', import.meta.url).href;
  const run = (body) => execFileSync(process.execPath, ['--input-type=module', '-e',
    'import assert from "node:assert/strict"; import {db, initDatabase, reconcileAllAssetsInDb} from ' + JSON.stringify(moduleUrl) + '; initDatabase(); ' + body + '; db.close();'], {
      env: { ...process.env, DB_PATH: databasePath }, stdio: 'pipe',
    });
  try {
    run('assert.equal(db.prepare("SELECT COUNT(*) AS n FROM assets").get().n, 0); assert.equal(db.prepare("SELECT COUNT(*) AS n FROM loans").get().n, 0); assert.equal(db.prepare("SELECT COUNT(*) AS n FROM employees").get().n, 0); db.prepare("INSERT INTO loans (id, asset_code, assignee, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run("manual", "PC-1", "Traveler", "2030-12-24", "Scheduled", "2026-11-10")');
    run('assert.equal(db.prepare("SELECT end_date FROM loans WHERE id = ?").get("manual").end_date, "2030-12-24"); db.prepare("UPDATE loans SET end_date = ? WHERE id = ?").run("2031-02-03", "manual")');
    run('assert.equal(db.prepare("SELECT end_date FROM loans WHERE id = ?").get("manual").end_date, "2031-02-03"); db.exec("DELETE FROM loans")');
    run('assert.equal(db.prepare("SELECT COUNT(*) AS n FROM loans").get().n, 0); assert.equal(db.prepare("SELECT COUNT(*) AS n FROM assets").get().n, 0)');
    const activityUrl = new URL('../server/lib/assetActivity.js', import.meta.url).href;
    run('const {withoutActivityTracking} = await import(' + JSON.stringify(activityUrl) + '); withoutActivityTracking(() => { db.prepare("INSERT INTO assets (id, code, name, category, owner, status, location, updated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-employee", "PC-EMP", "Employee PC", "Laptop", "Employee", "On loan", "Stack", "", ""); db.prepare("INSERT INTO loans (id, asset_code, assignee, assignee_type, pickup_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run("employee", "PC-EMP", "Employee", "Employee", "2026-01-01", "Active", ""); }); reconcileAllAssetsInDb(); const saved = db.prepare("SELECT * FROM assets WHERE code = ?").get("PC-EMP"); assert.equal(saved.status, "Assigned"); assert.equal(saved.updated, ""); assert.equal(saved.changed_at, null); assert.equal(saved.latest_change, null)');
    run('reconcileAllAssetsInDb(); const saved = db.prepare("SELECT * FROM assets WHERE code = ?").get("PC-EMP"); assert.equal(saved.status, "Assigned"); assert.equal(saved.updated, ""); assert.equal(saved.changed_at, null); assert.equal(saved.latest_change, null)');
    run('db.prepare("INSERT INTO assets (id, code, name, category, owner, status, location, updated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("storage", "PC-STORAGE", "Stored PC", "Laptop", "IT Department", "Damaged", "IT Storage room", "2026-11-16", "2026-01-01"); db.prepare("INSERT INTO loans (id, asset_code, assignee, return_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run("storage-history", "PC-STORAGE", "Former holder", "2026-01-02", "Returned", "2026-01-01"); reconcileAllAssetsInDb(); assert.equal(db.prepare("SELECT location FROM assets WHERE id = ?").get("storage").location, "IT Storage room")');
    run('reconcileAllAssetsInDb(); assert.equal(db.prepare("SELECT location FROM assets WHERE id = ?").get("storage").location, "IT Storage room")');
  } finally {
    assert.equal(path.dirname(folder), path.resolve(tmpdir()));
    assert.ok(path.basename(folder).startsWith('inventory-startup-'));
    rmSync(folder, { recursive: true, force: true });
  }
});
