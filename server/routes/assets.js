import { Router } from 'express';
import { db, logAudit, reconcileAllAssetsInDb } from '../db/database.js';
import { authenticate } from '../middleware/auth.js';

export const assetsRouter = Router();

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/assets
assetsRouter.get('/', (req, res) => {
  const { category, status, location, department, search } = req.query || {};

  let query = 'SELECT * FROM assets WHERE 1=1';
  const params = [];

  if (category && category !== 'ALL') {
    query += ' AND category = ?';
    params.push(category);
  }

  if (status && status !== 'ALL') {
    query += ' AND status = ?';
    params.push(status);
  }

  if (location && location !== 'ALL') {
    query += ' AND location = ?';
    params.push(location);
  }

  if (department && department !== 'ALL') {
    query += ' AND department = ?';
    params.push(department);
  }

  if (search) {
    const s = `%${search.trim().toLowerCase()}%`;
    query += ` AND (
      LOWER(code) LIKE ? OR
      LOWER(name) LIKE ? OR
      LOWER(serial) LIKE ? OR
      LOWER(owner) LIKE ? OR
      LOWER(location) LIKE ? OR
      LOWER(model) LIKE ?
    )`;
    params.push(s, s, s, s, s, s);
  }

  query += ' ORDER BY updated DESC, created_at DESC';

  const rows = db.prepare(query).all(...params);

  // Attach ownership history
  const getHistory = db.prepare('SELECT * FROM ownership_history WHERE asset_code = ? ORDER BY date DESC, created_at DESC');

  const assets = rows.map((a) => ({
    ...a,
    ownershipHistory: getHistory.all(a.code).map((h) => ({
      id: h.id,
      previousOwner: h.previous_owner,
      newOwner: h.new_owner,
      date: h.date,
      reason: h.reason,
      notes: h.notes,
    })),
  }));

  return res.json({
    success: true,
    total: assets.length,
    assets,
  });
});

// GET /api/assets/history/all (Global ownership audit trail)
assetsRouter.get('/history/all', (req, res) => {
  const { search, assetCode, reason, limit = 100 } = req.query || {};

  let query = 'SELECT * FROM ownership_history WHERE 1=1';
  const params = [];

  if (assetCode) {
    query += ' AND asset_code = ?';
    params.push(assetCode);
  }

  if (reason) {
    query += ' AND reason = ?';
    params.push(reason);
  }

  if (search) {
    const s = `%${search.trim().toLowerCase()}%`;
    query += ` AND (
      LOWER(asset_code) LIKE ? OR
      LOWER(previous_owner) LIKE ? OR
      LOWER(new_owner) LIKE ? OR
      LOWER(reason) LIKE ? OR
      LOWER(notes) LIKE ?
    )`;
    params.push(s, s, s, s, s);
  }

  query += ' ORDER BY date DESC, created_at DESC LIMIT ?';
  params.push(parseInt(limit, 10) || 100);

  const history = db.prepare(query).all(...params);

  return res.json({
    success: true,
    total: history.length,
    history: history.map((h) => ({
      id: h.id,
      assetCode: h.asset_code,
      previousOwner: h.previous_owner,
      newOwner: h.new_owner,
      date: h.date,
      reason: h.reason,
      notes: h.notes,
      createdAt: h.created_at,
    })),
  });
});

// GET /api/assets/categories (Category aggregations)
assetsRouter.get('/categories', (req, res) => {
  const rows = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM assets
    GROUP BY category
    ORDER BY count DESC
  `).all();

  return res.json({
    success: true,
    categories: rows,
  });
});

// GET /api/assets/:id
assetsRouter.get('/:id', (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ? OR code = ?').get(req.params.id, req.params.id);
  if (!asset) {
    return res.status(404).json({ success: false, error: 'Asset not found.' });
  }

  const history = db.prepare('SELECT * FROM ownership_history WHERE asset_code = ? ORDER BY date DESC, created_at DESC').all(asset.code);

  return res.json({
    success: true,
    asset: {
      ...asset,
      ownershipHistory: history.map((h) => ({
        id: h.id,
        previousOwner: h.previous_owner,
        newOwner: h.new_owner,
        date: h.date,
        reason: h.reason,
        notes: h.notes,
      })),
    },
  });
});

// POST /api/assets (Protected)
assetsRouter.post('/', authenticate, (req, res) => {
  const {
    code,
    name,
    category = 'Laptop',
    model = '',
    serial = '',
    status = 'Available',
    location = 'Head Office',
    owner = '',
    department = '',
    condition = 'Good',
    notes = '',
  } = req.body || {};

  if (!code || !name) {
    return res.status(400).json({ success: false, error: 'Asset code and name are required.' });
  }

  const trimmedCode = code.trim();
  const existing = db.prepare('SELECT id FROM assets WHERE LOWER(code) = LOWER(?)').get(trimmedCode);
  if (existing) {
    return res.status(409).json({ success: false, error: `Asset with code ${trimmedCode} already exists.` });
  }

  const id = req.body.id || `ast-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const now = new Date().toISOString();

  // If owner is provided and not IT department, enforce status 'Assigned'
  let effectiveStatus = status;
  if (owner && owner !== 'IT department' && status === 'Available') {
    effectiveStatus = 'Assigned';
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    const insert = db.prepare(`
      INSERT INTO assets (id, code, name, category, model, serial, status, location, owner, department, condition, notes, updated, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      id,
      trimmedCode,
      name.trim(),
      category,
      model,
      serial,
      effectiveStatus,
      location,
      owner,
      department,
      condition,
      notes,
      todayIso(),
      now
    );

    if (owner) {
      db.prepare(`
        INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `hist-${Date.now()}`,
        trimmedCode,
        'None',
        owner,
        todayIso(),
        owner === 'IT department' ? 'Returned to IT department' : 'Initial assignment',
        notes || `Registered by ${req.user.username}`,
        now
      );

      // Also ensure employee exists if named owner
      if (owner !== 'IT department') {
        const empExists = db.prepare('SELECT id FROM employees WHERE LOWER(name) = LOWER(?)').get(owner.trim());
        if (!empExists) {
          db.prepare(`
            INSERT INTO employees (id, name, department, position, created_at)
            VALUES (?, ?, ?, 'Staff', ?)
          `).run(`emp-${Date.now()}`, owner.trim(), department, now);
        }
      }
    }

    db.exec('COMMIT;');
    logAudit('CREATE_ASSET', 'assets', id, { code: trimmedCode, name }, req.user);

    const newAsset = db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
    return res.status(201).json({ success: true, message: 'Asset created successfully.', asset: newAsset });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/assets/:id (Protected)
assetsRouter.put('/:id', authenticate, (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) {
    return res.status(404).json({ success: false, error: 'Asset not found.' });
  }

  const {
    name = asset.name,
    category = asset.category,
    model = asset.model,
    serial = asset.serial,
    status = asset.status,
    location = asset.location,
    owner = asset.owner,
    department = asset.department,
    condition = asset.condition,
    notes = asset.notes,
  } = req.body || {};

  const now = new Date().toISOString();
  const ownerChanged = owner !== undefined && owner !== asset.owner;

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(`
      UPDATE assets
      SET name = ?, category = ?, model = ?, serial = ?, status = ?, location = ?, owner = ?, department = ?, condition = ?, notes = ?, updated = ?
      WHERE id = ?
    `).run(
      name,
      category,
      model,
      serial,
      status,
      location,
      owner,
      department,
      condition,
      notes,
      todayIso(),
      asset.id
    );

    if (ownerChanged) {
      db.prepare(`
        INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `hist-${Date.now()}`,
        asset.code,
        asset.owner || 'None',
        owner || 'None',
        todayIso(),
        owner ? (asset.owner ? 'Transferred' : 'Assigned') : 'Unassigned',
        `Asset modified by ${req.user.username}`,
        now
      );

      if (owner && owner !== 'IT department') {
        const empExists = db.prepare('SELECT id FROM employees WHERE LOWER(name) = LOWER(?)').get(owner.trim());
        if (!empExists) {
          db.prepare(`
            INSERT INTO employees (id, name, department, position, created_at)
            VALUES (?, ?, ?, 'Staff', ?)
          `).run(`emp-${Date.now()}`, owner.trim(), department || '', now);
        }
      }
    }

    db.exec('COMMIT;');
    logAudit('UPDATE_ASSET', 'assets', asset.id, { code: asset.code, ownerChanged }, req.user);

    const updatedAsset = db.prepare('SELECT * FROM assets WHERE id = ?').get(asset.id);
    return res.json({ success: true, message: 'Asset updated successfully.', asset: updatedAsset });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/assets/:id/transfer (Protected: Explicit Transfer Modal Handshake)
assetsRouter.post('/:id/transfer', authenticate, (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) {
    return res.status(404).json({ success: false, error: 'Asset not found.' });
  }

  const {
    newOwner,
    department = '',
    location = asset.location || 'Head Office',
    reason = 'Direct transfer',
    notes = '',
    date = todayIso(),
  } = req.body || {};

  if (!newOwner) {
    return res.status(400).json({ success: false, error: 'New owner is required for transfer.' });
  }

  const now = new Date().toISOString();
  const nextStatus = newOwner === 'IT department' ? 'Available' : 'Assigned';

  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Record ownership history
    db.prepare(`
      INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `hist-${Date.now()}`,
      asset.code,
      asset.owner || 'None',
      newOwner.trim(),
      date,
      reason,
      notes || `Transferred by ${req.user.username}`,
      now
    );

    // 2. Update asset owner & status
    db.prepare(`
      UPDATE assets
      SET owner = ?, department = ?, location = ?, status = ?, updated = ?
      WHERE id = ?
    `).run(
      newOwner.trim(),
      newOwner === 'IT department' ? '' : department.trim(),
      location.trim(),
      nextStatus,
      date,
      asset.id
    );

    // 3. Ensure employee in directory if named staff
    if (newOwner !== 'IT department') {
      const empExists = db.prepare('SELECT id FROM employees WHERE LOWER(name) = LOWER(?)').get(newOwner.trim());
      if (!empExists) {
        db.prepare(`
          INSERT INTO employees (id, name, department, position, created_at)
          VALUES (?, ?, ?, 'Staff', ?)
        `).run(`emp-${Date.now()}`, newOwner.trim(), department.trim(), now);
      }
    }

    db.exec('COMMIT;');
    logAudit('TRANSFER_ASSET', 'assets', asset.id, { code: asset.code, previous: asset.owner, next: newOwner }, req.user);

    const updatedAsset = db.prepare('SELECT * FROM assets WHERE id = ?').get(asset.id);
    return res.json({
      success: true,
      message: `Asset ${asset.code} transferred to ${newOwner}.`,
      asset: updatedAsset,
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/assets/batch-update (Protected: Batch operations)
assetsRouter.post('/batch-update', authenticate, (req, res) => {
  const { ids = [], changes = {} } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'Array of asset IDs is required.' });
  }

  const { status, location, category, department, condition, notes } = changes;

  db.exec('BEGIN TRANSACTION;');
  try {
    let updatedCount = 0;
    for (const id of ids) {
      const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
      if (asset) {
        db.prepare(`
          UPDATE assets
          SET status = COALESCE(?, status),
              location = COALESCE(?, location),
              category = COALESCE(?, category),
              department = COALESCE(?, department),
              condition = COALESCE(?, condition),
              notes = COALESCE(?, notes),
              updated = ?
          WHERE id = ?
        `).run(
          status || null,
          location || null,
          category || null,
          department || null,
          condition || null,
          notes || null,
          todayIso(),
          asset.id
        );
        updatedCount++;
      }
    }

    db.exec('COMMIT;');
    logAudit('BATCH_UPDATE_ASSETS', 'assets', null, { count: updatedCount, ids, changes }, req.user);

    return res.json({
      success: true,
      message: `Successfully updated ${updatedCount} assets.`,
      count: updatedCount,
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/assets/batch-delete (Protected: Batch delete)
assetsRouter.post('/batch-delete', authenticate, (req, res) => {
  const { ids = [] } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'Array of asset IDs is required.' });
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    for (const id of ids) {
      const asset = db.prepare('SELECT code FROM assets WHERE id = ?').get(id);
      if (asset) {
        db.prepare('DELETE FROM ownership_history WHERE asset_code = ?').run(asset.code);
        db.prepare('DELETE FROM assets WHERE id = ?').run(id);
      }
    }

    db.exec('COMMIT;');
    logAudit('BATCH_DELETE_ASSETS', 'assets', null, { count: ids.length }, req.user);

    return res.json({
      success: true,
      message: `Successfully deleted ${ids.length} assets.`,
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/assets/:id (Protected)
assetsRouter.delete('/:id', authenticate, (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) {
    return res.status(404).json({ success: false, error: 'Asset not found.' });
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare('DELETE FROM ownership_history WHERE asset_code = ?').run(asset.code);
    db.prepare('DELETE FROM assets WHERE id = ?').run(asset.id);
    db.exec('COMMIT;');

    logAudit('DELETE_ASSET', 'assets', asset.id, { code: asset.code }, req.user);
    return res.json({ success: true, message: `Asset ${asset.code} deleted successfully.` });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/assets/reconcile (Protected: Passive/active state machine verification)
assetsRouter.post('/reconcile', authenticate, (req, res) => {
  try {
    const result = reconcileAllAssetsInDb();
    logAudit('RECONCILE_ASSETS', 'system', null, { reconciledCount: result.reconciledCount }, req.user);
    return res.json({
      success: true,
      message: `Integrity check complete. Reconciled ${result.reconciledCount} asset records.`,
      result,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
