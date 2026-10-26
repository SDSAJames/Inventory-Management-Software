import { Router } from 'express';
import { db, logAudit } from '../db/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';

export const directoryRouter = Router();

// Asset categories are shared reference data managed by administrators.
directoryRouter.get('/categories', (req, res) => {
  const categories = db.prepare(`
    SELECT c.id, c.name, COUNT(a.id) AS assetCount
    FROM asset_categories c LEFT JOIN assets a ON LOWER(a.category) = LOWER(c.name)
    GROUP BY c.id ORDER BY c.name COLLATE NOCASE ASC
  `).all();
  return res.json({ success: true, categories });
});

directoryRouter.post('/categories', authenticate, requireRole('ADMIN', 'OPERATOR'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ success: false, error: 'Category name is required.' });
  if (db.prepare('SELECT id FROM asset_categories WHERE LOWER(name) = LOWER(?)').get(name)) {
    return res.status(409).json({ success: false, error: 'That category already exists.' });
  }
  const id = `cat-${Date.now()}`;
  db.prepare('INSERT INTO asset_categories (id, name) VALUES (?, ?)').run(id, name);
  logAudit('CREATE_ASSET_CATEGORY', 'asset_categories', id, { name }, req.user);
  return res.status(201).json({ success: true, category: { id, name } });
});

directoryRouter.put('/categories/:id', authenticate, requireRole('ADMIN', 'OPERATOR'), (req, res) => {
  const category = db.prepare('SELECT id, name FROM asset_categories WHERE id = ?').get(req.params.id);
  if (!category) return res.status(404).json({ success: false, error: 'Category not found.' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ success: false, error: 'Category name is required.' });
  if (db.prepare('SELECT id FROM asset_categories WHERE LOWER(name) = LOWER(?) AND id <> ?').get(name, category.id)) {
    return res.status(409).json({ success: false, error: 'That category already exists.' });
  }
  const used = db.prepare('SELECT COUNT(*) AS count FROM assets WHERE LOWER(category) = LOWER(?)').get(category.name).count;
  if (used) return res.status(409).json({ success: false, error: `Cannot rename ${category.name}; it is assigned to ${used} asset${used === 1 ? '' : 's'}.` });
  db.prepare('UPDATE asset_categories SET name = ? WHERE id = ?').run(name, category.id);
  logAudit('RENAME_ASSET_CATEGORY', 'asset_categories', category.id, { from: category.name, to: name }, req.user);
  return res.json({ success: true, category: { id: category.id, name } });
});

directoryRouter.delete('/categories/:id', authenticate, requireRole('ADMIN', 'OPERATOR'), (req, res) => {
  const category = db.prepare('SELECT id, name FROM asset_categories WHERE id = ?').get(req.params.id);
  if (!category) return res.status(404).json({ success: false, error: 'Category not found.' });
  const used = db.prepare('SELECT COUNT(*) as count FROM assets WHERE LOWER(category) = LOWER(?)').get(category.name).count;
  if (used) return res.status(409).json({ success: false, error: `Cannot remove ${category.name}; ${used} asset${used === 1 ? ' uses' : 's use'} it.` });
  db.prepare('DELETE FROM asset_categories WHERE id = ?').run(category.id);
  logAudit('DELETE_ASSET_CATEGORY', 'asset_categories', category.id, { name: category.name }, req.user);
  return res.json({ success: true });
});

/* ── 1. Employees Directory ───────────────────────────── */

// GET /api/directory/employees
directoryRouter.get('/employees', (req, res) => {
  const employees = db.prepare('SELECT * FROM employees ORDER BY name ASC').all();

  // Aggregate asset count & active loan count for each employee
  const assetCountStmt = db.prepare('SELECT COUNT(*) as count FROM assets WHERE LOWER(owner) = LOWER(?)');
  const loanCountStmt = db.prepare(`
    SELECT COUNT(*) as count FROM loans
    WHERE LOWER(assignee) = LOWER(?) AND (return_date IS NULL OR return_date = '')
  `);

  const enriched = employees.map((emp) => ({
    id: emp.id,
    name: emp.name,
    department: emp.department || '',
    position: emp.position || 'Staff',
    knoxId: emp.knox_id || '',
    createdAt: emp.created_at,
    assetCount: assetCountStmt.get(emp.name).count,
    activeLoanCount: loanCountStmt.get(emp.name).count,
  }));

  return res.json({
    success: true,
    total: enriched.length,
    employees: enriched,
  });
});

// POST /api/directory/employees (Protected)
directoryRouter.post('/employees', authenticate, (req, res) => {
  const { name, department = '', position = 'Staff', knoxId = '' } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Employee name is required.' });
  }

  const trimmedName = name.trim();
  const existing = db.prepare('SELECT id FROM employees WHERE LOWER(name) = LOWER(?)').get(trimmedName);
  if (existing) {
    return res.status(409).json({ success: false, error: `Employee ${trimmedName} already exists.` });
  }

  const id = `emp-${Date.now()}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO employees (id, name, department, position, knox_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, trimmedName, department.trim(), position.trim(), knoxId.trim(), now);

  logAudit('CREATE_EMPLOYEE', 'employees', id, { name: trimmedName, department }, req.user);

  const newEmp = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  return res.status(201).json({
    success: true,
    message: 'Employee registered successfully.',
    employee: newEmp,
  });
});

// PUT /api/directory/employees/:id (Protected)
directoryRouter.put('/employees/:id', authenticate, (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) {
    return res.status(404).json({ success: false, error: 'Employee not found.' });
  }

  const {
    name = emp.name,
    department = emp.department,
    position = emp.position,
    knoxId = emp.knox_id,
  } = req.body || {};

  db.prepare(`
    UPDATE employees
    SET name = ?, department = ?, position = ?, knox_id = ?
    WHERE id = ?
  `).run(name.trim(), department.trim(), position.trim(), knoxId.trim(), emp.id);

  logAudit('UPDATE_EMPLOYEE', 'employees', emp.id, { name }, req.user);

  const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(emp.id);
  return res.json({
    success: true,
    message: 'Employee updated successfully.',
    employee: updated,
  });
});

// DELETE /api/directory/employees/:id (Protected)
directoryRouter.delete('/employees/:id', authenticate, (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) {
    return res.status(404).json({ success: false, error: 'Employee not found.' });
  }

  db.prepare('DELETE FROM employees WHERE id = ?').run(emp.id);
  logAudit('DELETE_EMPLOYEE', 'employees', emp.id, { name: emp.name }, req.user);

  return res.json({ success: true, message: `Employee ${emp.name} removed from directory.` });
});

/* ── 2. Departments Directory ─────────────────────────── */

// GET /api/directory/departments
directoryRouter.get('/departments', (req, res) => {
  const departments = db.prepare('SELECT * FROM departments ORDER BY name ASC').all();
  const assetCountStmt = db.prepare('SELECT COUNT(*) as count FROM assets WHERE LOWER(department) = LOWER(?)');

  const enriched = departments.map((d) => ({
    id: d.id,
    name: d.name,
    assetCount: assetCountStmt.get(d.name).count,
  }));

  return res.json({
    success: true,
    departments: enriched,
  });
});

// POST /api/directory/departments (Protected)
directoryRouter.post('/departments', authenticate, (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Department name is required.' });
  }

  const trimmed = name.trim();
  const existing = db.prepare('SELECT id FROM departments WHERE LOWER(name) = LOWER(?)').get(trimmed);
  if (existing) {
    return res.status(409).json({ success: false, error: `Department ${trimmed} already exists.` });
  }

  const id = `dept-${Date.now()}`;
  db.prepare('INSERT INTO departments (id, name) VALUES (?, ?)').run(id, trimmed);

  logAudit('CREATE_DEPARTMENT', 'departments', id, { name: trimmed }, req.user);

  return res.status(201).json({
    success: true,
    message: 'Department added successfully.',
    department: { id, name: trimmed },
  });
});

directoryRouter.put('/departments/:name', authenticate, requireRole('ADMIN', 'OPERATOR'), (req, res) => {
  const department = db.prepare('SELECT id, name FROM departments WHERE LOWER(name) = LOWER(?) OR id = ?').get(req.params.name, req.params.name);
  if (!department) return res.status(404).json({ success: false, error: 'Department not found.' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ success: false, error: 'Department name is required.' });
  if (db.prepare('SELECT id FROM departments WHERE LOWER(name) = LOWER(?) AND id <> ?').get(name, department.id)) {
    return res.status(409).json({ success: false, error: 'That department already exists.' });
  }
  const used = db.prepare('SELECT COUNT(*) AS count FROM assets WHERE LOWER(department) = LOWER(?)').get(department.name).count;
  if (used) return res.status(409).json({ success: false, error: `Cannot rename ${department.name}; it is assigned to ${used} asset${used === 1 ? '' : 's'}.` });
  db.prepare('UPDATE departments SET name = ? WHERE id = ?').run(name, department.id);
  logAudit('RENAME_DEPARTMENT', 'departments', department.id, { from: department.name, to: name }, req.user);
  return res.json({ success: true, department: { id: department.id, name } });
});

// DELETE /api/directory/departments/:name (Protected)
directoryRouter.delete('/departments/:name', authenticate, requireRole('ADMIN', 'OPERATOR'), (req, res) => {
  const dept = db.prepare('SELECT * FROM departments WHERE LOWER(name) = LOWER(?) OR id = ?').get(req.params.name, req.params.name);
  if (!dept) {
    return res.status(404).json({ success: false, error: 'Department not found.' });
  }

  const used = db.prepare('SELECT COUNT(*) AS count FROM assets WHERE LOWER(department) = LOWER(?)').get(dept.name).count;
  if (used) return res.status(409).json({ success: false, error: `Cannot remove ${dept.name}; it is assigned to ${used} asset${used === 1 ? '' : 's'}.` });

  db.prepare('DELETE FROM departments WHERE id = ?').run(dept.id);
  logAudit('DELETE_DEPARTMENT', 'departments', dept.id, { name: dept.name }, req.user);

  return res.json({ success: true, message: `Department ${dept.name} removed.` });
});

/* ── 3. Locations Directory ───────────────────────────── */

// GET /api/directory/locations
directoryRouter.get('/locations', (req, res) => {
  const locations = db.prepare('SELECT * FROM locations ORDER BY name ASC').all();
  const assetCountStmt = db.prepare('SELECT COUNT(*) as count FROM assets WHERE LOWER(location) = LOWER(?)');

  const enriched = locations.map((l) => ({
    id: l.id,
    name: l.name,
    assetCount: assetCountStmt.get(l.name).count,
  }));

  return res.json({
    success: true,
    locations: enriched,
  });
});

// POST /api/directory/locations (Protected)
directoryRouter.post('/locations', authenticate, (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Location name is required.' });
  }

  const trimmed = name.trim();
  const existing = db.prepare('SELECT id FROM locations WHERE LOWER(name) = LOWER(?)').get(trimmed);
  if (existing) {
    return res.status(409).json({ success: false, error: `Location ${trimmed} already exists.` });
  }

  const id = `loc-${Date.now()}`;
  db.prepare('INSERT INTO locations (id, name) VALUES (?, ?)').run(id, trimmed);

  logAudit('CREATE_LOCATION', 'locations', id, { name: trimmed }, req.user);

  return res.status(201).json({
    success: true,
    message: 'Location added successfully.',
    location: { id, name: trimmed },
  });
});

directoryRouter.put('/locations/:name', authenticate, requireRole('ADMIN', 'OPERATOR'), (req, res) => {
  const location = db.prepare('SELECT id, name FROM locations WHERE LOWER(name) = LOWER(?) OR id = ?').get(req.params.name, req.params.name);
  if (!location) return res.status(404).json({ success: false, error: 'Location not found.' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ success: false, error: 'Location name is required.' });
  if (db.prepare('SELECT id FROM locations WHERE LOWER(name) = LOWER(?) AND id <> ?').get(name, location.id)) {
    return res.status(409).json({ success: false, error: 'That location already exists.' });
  }
  const used = db.prepare('SELECT COUNT(*) AS count FROM assets WHERE LOWER(location) = LOWER(?)').get(location.name).count;
  if (used) return res.status(409).json({ success: false, error: `Cannot rename ${location.name}; it is assigned to ${used} asset${used === 1 ? '' : 's'}.` });
  db.prepare('UPDATE locations SET name = ? WHERE id = ?').run(name, location.id);
  logAudit('RENAME_LOCATION', 'locations', location.id, { from: location.name, to: name }, req.user);
  return res.json({ success: true, location: { id: location.id, name } });
});

// DELETE /api/directory/locations/:name (Protected)
directoryRouter.delete('/locations/:name', authenticate, requireRole('ADMIN', 'OPERATOR'), (req, res) => {
  const loc = db.prepare('SELECT * FROM locations WHERE LOWER(name) = LOWER(?) OR id = ?').get(req.params.name, req.params.name);
  if (!loc) {
    return res.status(404).json({ success: false, error: 'Location not found.' });
  }

  const used = db.prepare('SELECT COUNT(*) AS count FROM assets WHERE LOWER(location) = LOWER(?)').get(loc.name).count;
  if (used) return res.status(409).json({ success: false, error: `Cannot remove ${loc.name}; it is assigned to ${used} asset${used === 1 ? '' : 's'}.` });

  db.prepare('DELETE FROM locations WHERE id = ?').run(loc.id);
  logAudit('DELETE_LOCATION', 'locations', loc.id, { name: loc.name }, req.user);

  return res.json({ success: true, message: `Location ${loc.name} removed.` });
});

/* ── 4. Transfer Reasons ──────────────────────────────── */

// GET /api/directory/transfer-reasons
directoryRouter.get('/transfer-reasons', (req, res) => {
  const reasons = db.prepare('SELECT * FROM transfer_reasons ORDER BY created_at ASC').all();
  return res.json({
    success: true,
    reasons: reasons.map((r) => r.reason),
    details: reasons,
  });
});

// POST /api/directory/transfer-reasons (Protected)
directoryRouter.post('/transfer-reasons', authenticate, (req, res) => {
  const { reason } = req.body || {};
  if (!reason || !reason.trim()) {
    return res.status(400).json({ success: false, error: 'Reason text is required.' });
  }

  const trimmed = reason.trim();
  const existing = db.prepare('SELECT id FROM transfer_reasons WHERE LOWER(reason) = LOWER(?)').get(trimmed);
  if (existing) {
    return res.status(409).json({ success: false, error: 'Transfer reason already exists.' });
  }

  const id = `tr-${Date.now()}`;
  db.prepare('INSERT INTO transfer_reasons (id, reason, is_default, created_at) VALUES (?, ?, 0, ?)').run(
    id,
    trimmed,
    new Date().toISOString()
  );

  return res.status(201).json({
    success: true,
    message: 'Transfer reason added.',
    reason: trimmed,
  });
});

// DELETE /api/directory/transfer-reasons/:id (Protected)
directoryRouter.delete('/transfer-reasons/:id', authenticate, (req, res) => {
  const target = req.params.id;
  const reason = db.prepare('SELECT * FROM transfer_reasons WHERE id = ? OR LOWER(reason) = LOWER(?)').get(target, target);
  if (!reason) {
    return res.status(404).json({ success: false, error: 'Transfer reason not found.' });
  }

  db.prepare('DELETE FROM transfer_reasons WHERE id = ?').run(reason.id);
  return res.json({ success: true, message: `Transfer reason "${reason.reason}" removed.` });
});
