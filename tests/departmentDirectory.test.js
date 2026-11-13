import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { ensureDepartmentDirectory, departmentReferences } from '../server/lib/departmentDirectory.js';
import { departmentDirectoryNames } from '../shared/departmentDirectory.js';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE departments (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL);
    CREATE TABLE assets (id TEXT PRIMARY KEY, department TEXT);
    CREATE TABLE loans (id TEXT PRIMARY KEY, department TEXT);
    CREATE TABLE employees (id TEXT PRIMARY KEY, department TEXT);`);
  return db;
}

test('department directory backfills history and tracks writes transactionally across all workflows', () => {
  const db = database();
  try {
    db.exec("INSERT INTO loans VALUES ('old', ' Legacy Team '); INSERT INTO assets VALUES ('pc', 'legacy team');");
    ensureDepartmentDirectory(db); ensureDepartmentDirectory(db);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM departments').get().count, 1);
    assert.equal(db.prepare("SELECT department FROM loans WHERE id = 'old'").get().department, ' Legacy Team ');
    for (const table of ['assets', 'loans', 'employees']) {
      db.prepare(`INSERT INTO ${table} VALUES (?, ?)`).run(table, ' New Team ');
      db.prepare(`UPDATE ${table} SET department = ? WHERE id = ?`).run('Updated Team', table);
    }
    assert.equal(departmentReferences(db, 'Updated Team'), 3);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM departments WHERE name = 'New Team'").get().count, 1);
    db.exec("BEGIN; INSERT INTO loans VALUES ('failed', 'Rolled back team'); ROLLBACK;");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM departments WHERE name = 'Rolled back team'").get().count, 0);
    db.exec("INSERT INTO loans VALUES ('blank', '   ');");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM departments WHERE TRIM(name) = ''").get().count, 0);
  } finally { db.close(); }
});

test('cached directory merges saved references immediately with trimmed, deduplicated names', () => {
  const cached = { departments: ['Engineering'], assets: [{ department: ' engineering ' }],
    loans: [{ department: ' New Team ' }, { department: 'new team' }, { department: '' }], employees: [{ department: 'Quality' }] };
  assert.deepEqual(departmentDirectoryNames(cached), ['Engineering', 'New Team', 'Quality']);
  assert.deepEqual(cached.departments, ['Engineering']);
});

test('directory API protects departments referenced only by assignment history', async () => {
  const db = database(); globalThis.__departmentDirectoryDb = db;
  const hook = registerHooks({ load(url, context, next) {
    if (url === new URL('../server/db/database.js', import.meta.url).href) return { format: 'module', shortCircuit: true,
      source: 'export const db = globalThis.__departmentDirectoryDb; export const logAudit = () => {};' };
    if (url === new URL('../server/middleware/auth.js', import.meta.url).href) return { format: 'module', shortCircuit: true,
      source: 'export const authenticate = (req,res,next) => next(); export const requireRole = () => authenticate;' };
    return next(url, context);
  } });
  try {
    ensureDepartmentDirectory(db);
    db.exec("INSERT INTO loans VALUES ('history', 'History Team');");
    const { directoryRouter } = await import('../server/routes/directory.js');
    for (const method of ['put', 'delete']) {
      const route = directoryRouter.stack.find((layer) => layer.route?.path === '/departments/:name' && layer.route.methods[method]);
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      route.route.stack.at(-1).handle({ params: { name: 'History Team' }, body: { name: 'Renamed' } }, res);
      assert.equal(res.statusCode, 409); assert.match(res.body.error, /assignment/);
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM departments WHERE name = 'History Team'").get().count, 1);
  } finally { hook.deregister(); db.close(); delete globalThis.__departmentDirectoryDb; }
});
