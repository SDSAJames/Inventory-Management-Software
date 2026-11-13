import { assetActivityFields } from '../lib/assetActivity.js';
import { saveAssetIssuedFields } from '../lib/assetIssuedFields.js';
import { DEFAULT_OWNER, DEFAULT_LOCATION } from "../../shared/referenceData.js";
import { getAssetDateError, normalizeAssetDate } from '../../shared/assetDates.js';
import { Router } from 'express';
import { db, logAudit, reconcileAllAssetsInDb } from '../db/database.js';
import { authenticate } from '../middleware/auth.js';

import { todayIso } from '../lib/dates.js';
import { formatAssetRow, formatOwnershipAuditRow } from '../lib/assetRows.js';

import { normalizeLocation, getHolderReturnChanges, normalizeAvailableAsset } from "../../shared/assetRules.js";
import { assetLocationForWrite } from '../lib/assetLocations.js';
import { renameStoredAssetReferences } from '../lib/assetReferences.js';

import { recordHolderReturn } from '../lib/assetReturns.js';
import { returnAssetToIt } from '../lib/assetLoans.js';
import { randomUUID } from 'node:crypto';

export const assetsRouter = Router();

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

  const assets = rows.filter((asset) => String(asset.code).trim() !== '1').map((asset) => formatAssetRow(asset, getHistory.all(asset.code)));

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
    history: history.map(formatOwnershipAuditRow),
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
    asset: formatAssetRow(asset, history),
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
    location = DEFAULT_LOCATION,
    owner = '',
    department = '',
    purchaseDate = '',
    warrantyExpirationDate = '',
    condition = 'Good',
    notes = '',
  } = req.body || {};

  const dateError = getAssetDateError({ purchaseDate, warrantyExpirationDate });
  if (dateError) return res.status(400).json({ success: false, error: dateError });
  const trimmedCode = (code || '').trim();
  const effectiveName = (name || trimmedCode || '').trim();

  if (!trimmedCode) {
    return res.status(400).json({ success: false, error: 'Asset number is required.' });
  }
  if (trimmedCode === '1') return res.status(400).json({ success: false, error: '1 is a PC quantity, not an asset number.' });

  const existing = db.prepare('SELECT id FROM assets WHERE LOWER(code) = LOWER(?)').get(trimmedCode);
  if (existing) {
    return res.status(409).json({ success: false, error: `Asset with number ${trimmedCode} already exists.` });
  }

  const id = req.body.id || `ast-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const now = new Date().toISOString();

  const initialCustody = normalizeAvailableAsset({ status, owner, department });
  const effectiveStatus = initialCustody.status;
  const effectiveOwner = initialCustody.owner;
  const effectiveDepartment = initialCustody.department;

  db.exec('BEGIN TRANSACTION;');
  try {
    const insert = db.prepare(`
      INSERT INTO assets (id, code, name, category, model, serial, status, location, owner, department, purchase_date, warranty_expiration_date, condition, notes, updated, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      id,
      trimmedCode,
      effectiveName,
      category,
      model,
      serial,
      effectiveStatus,
      assetLocationForWrite(db, effectiveStatus, location),
      effectiveOwner,
      effectiveDepartment,
      normalizeAssetDate(purchaseDate),
      normalizeAssetDate(warrantyExpirationDate),
      condition,
      notes,
      todayIso(),
      now
    );

    saveAssetIssuedFields(db, id, req.body);
    if (effectiveOwner) {
      db.prepare(`
        INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `hist-${randomUUID()}`,
        trimmedCode,
        'None',
        effectiveOwner,
        todayIso(),
        effectiveOwner === DEFAULT_OWNER ? 'IT custody recorded' : 'Initial assignment',
        notes || `Registered by ${req.user.username}`,
        now
      );

      // Also ensure employee exists if named owner
      if (effectiveOwner !== DEFAULT_OWNER) {
        const empExists = db.prepare('SELECT id FROM employees WHERE LOWER(name) = LOWER(?)').get(effectiveOwner.trim());
        if (!empExists) {
          db.prepare(`
            INSERT INTO employees (id, name, department, position, created_at)
            VALUES (?, ?, ?, 'Staff', ?)
          `).run(`emp-${randomUUID()}`, effectiveOwner.trim(), effectiveDepartment, now);
        }
      }
    }

    db.exec('COMMIT;');
    logAudit('CREATE_ASSET', 'assets', id, { code: trimmedCode, name }, req.user);

    const newAsset = db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
    return res.status(201).json({ success: true, message: 'Asset created successfully.', asset: { ...newAsset, issuedName: newAsset.issued_name || '', issuedDate: newAsset.issued_date || '', purchaseDate: newAsset.purchase_date || '', warrantyExpirationDate: newAsset.warranty_expiration_date || '' } });
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

  const code = String(req.body?.code ?? asset.code).trim();
  if (code === '1') return res.status(400).json({ success: false, error: '1 is a PC quantity, not an asset number.' });
  if (!code) return res.status(400).json({ success: false, error: 'Asset number is required.' });
  const duplicate = db.prepare('SELECT id FROM assets WHERE LOWER(code) = LOWER(?) AND id <> ?').get(code, asset.id);
  if (duplicate) return res.status(409).json({ success: false, error: `Asset with number ${code} already exists.` });

  const {
    name = asset.name,
    category = asset.category,
    model = asset.model,
    serial = asset.serial,
    status = asset.status,
    location = asset.location,
    owner = asset.owner,
    department = asset.department,
    purchaseDate = req.body?.purchaseDate ?? asset.purchase_date ?? '',
    warrantyExpirationDate = req.body?.warrantyExpirationDate ?? asset.warranty_expiration_date ?? '',
    condition = asset.condition,
    notes = asset.notes,
  } = req.body || {};

  const now = new Date().toISOString();
  const returnChanges = getHolderReturnChanges(asset, req.body || {});
  const custody = normalizeAvailableAsset({ status, owner, department, ...returnChanges });
  const effectiveOwner = custody.owner;
  const effectiveStatus = custody.status;
  const effectiveLocation = returnChanges?.location ?? location;
  const effectiveDepartment = custody.department;
  const effectiveOwnerChanged = effectiveOwner !== asset.owner;
  let affectedLoans = [];
  const dateError = getAssetDateError({ purchaseDate, warrantyExpirationDate });
  if (dateError) return res.status(400).json({ success: false, error: dateError });

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(`
      UPDATE assets
      SET code = ?, name = ?, category = ?, model = ?, serial = ?, status = ?, location = ?, owner = ?, department = ?, purchase_date = ?, warranty_expiration_date = ?, condition = ?, notes = ?, updated = ?
      WHERE id = ?
    `).run(
      code,
      name,
      category,
      model,
      serial,
      effectiveStatus,
      assetLocationForWrite(db, effectiveStatus, effectiveLocation),
      effectiveOwner,
      effectiveDepartment,
      normalizeAssetDate(purchaseDate),
      normalizeAssetDate(warrantyExpirationDate),
      condition,
      notes,
      todayIso(),
      asset.id
    );

    const issueFields = { ...req.body };
    if (effectiveOwnerChanged) {
      if (issueFields.issuedName === (asset.issued_name || '')) { delete issueFields.issuedName; delete issueFields.issued_name; }
      if (issueFields.issuedDate === (asset.issued_date || '')) { delete issueFields.issuedDate; delete issueFields.issued_date; }
    }
    saveAssetIssuedFields(db, asset.id, issueFields);
    if (code !== asset.code) renameStoredAssetReferences(db, asset.code, code);
    if (returnChanges) affectedLoans = recordHolderReturn(db, code, now);

    if (effectiveOwnerChanged) {
      db.prepare(`
        INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `hist-${randomUUID()}`,
        code,
        asset.owner || 'None',
        effectiveOwner || 'None',
        now,
        returnChanges ? 'Returned to IT Department' : effectiveOwner === DEFAULT_OWNER ? 'IT custody recorded' : effectiveOwner ? (asset.owner ? 'Transferred' : 'Assigned') : 'Unassigned',
        returnChanges ? `Returned to IT Department through asset details by ${req.user.username}` : `Asset modified by ${req.user.username}`,
        now
      );

      if (effectiveOwner && effectiveOwner !== DEFAULT_OWNER) {
        const empExists = db.prepare('SELECT id FROM employees WHERE LOWER(name) = LOWER(?)').get(effectiveOwner.trim());
        if (!empExists) {
          db.prepare(`
            INSERT INTO employees (id, name, department, position, created_at)
            VALUES (?, ?, ?, 'Staff', ?)
          `).run(`emp-${randomUUID()}`, effectiveOwner.trim(), effectiveDepartment || '', now);
        }
      }
    }

    db.exec('COMMIT;');
    logAudit('UPDATE_ASSET', 'assets', asset.id, { code, previousCode: asset.code, ownerChanged: effectiveOwnerChanged }, req.user);

    const updatedAsset = db.prepare('SELECT * FROM assets WHERE id = ?').get(asset.id);
    const history = db.prepare('SELECT * FROM ownership_history WHERE asset_code = ? ORDER BY date DESC, created_at DESC').all(code);
    return res.json({ success: true, message: 'Asset updated successfully.', asset: formatAssetRow(updatedAsset, history), loans: affectedLoans });
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
    newOwner: requestedOwner,
    department = '',
    location = asset.location || DEFAULT_LOCATION,
    reason = 'Direct transfer',
    notes = '',
    date = todayIso(),
  } = req.body || {};

  const newOwner = String(requestedOwner || '').trim();
  const returningToIt = !newOwner || newOwner.toLowerCase() === 'it department';
  const effectiveOwner = returningToIt ? DEFAULT_OWNER : newOwner;
  if (!date || !/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/.test(date) || Number.isNaN(Date.parse(date))) {
    return res.status(400).json({ success: false, error: 'Enter a valid transfer date and time.' });
  }

  const now = new Date().toISOString();
  const returnChanges = returningToIt ? getHolderReturnChanges(asset, { owner: '' }) || { owner: DEFAULT_OWNER, department: '', status: 'Available', location: DEFAULT_LOCATION } : null;
  const nextStatus = returnChanges?.status || 'Assigned';

  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Record ownership history
    db.prepare(`
      INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `hist-${randomUUID()}`,
      asset.code,
      asset.owner || 'None',
      effectiveOwner,
      date,
      returningToIt && reason === 'Direct transfer' ? 'Returned to IT Department' : reason,
      notes || `Transferred by ${req.user.username}`,
      now
    );

    // 2. Update asset owner & status
    db.prepare(`
      UPDATE assets
      SET owner = ?, department = ?, location = ?, status = ?, updated = ?
      WHERE id = ?
    `).run(
      effectiveOwner,
      returningToIt ? '' : department.trim(),
      returningToIt ? returnChanges.location : normalizeLocation(location),
      nextStatus,
      date,
      asset.id
    );

    // 3. Ensure employee in directory if named staff
    // End the previous device custody before assigning a new holder. Otherwise
    // reconciliation can restore the previous active loan's owner on reload.
    const returnedLoans = returningToIt || effectiveOwner !== asset.owner
      ? recordHolderReturn(db, asset.code, date) : [];
    if (!returningToIt) {
      const empExists = db.prepare('SELECT id FROM employees WHERE LOWER(name) = LOWER(?)').get(newOwner.trim());
      if (!empExists) {
        db.prepare(`
          INSERT INTO employees (id, name, department, position, created_at)
          VALUES (?, ?, ?, 'Staff', ?)
        `).run(`emp-${randomUUID()}`, effectiveOwner, department.trim(), now);
      }
    }

    db.exec('COMMIT;');
    logAudit('TRANSFER_ASSET', 'assets', asset.id, { code: asset.code, previous: asset.owner, next: newOwner }, req.user);

    const updatedAsset = db.prepare('SELECT * FROM assets WHERE id = ?').get(asset.id);
    return res.json({
      success: true,
      message: `Asset ${asset.code} transferred to ${effectiveOwner}.`,
      asset: formatAssetRow(updatedAsset, db.prepare('SELECT * FROM ownership_history WHERE asset_code = ? ORDER BY date DESC').all(asset.code)),
      loans: returnedLoans,
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
          assetLocationForWrite(db, status || asset.status, location || asset.location),
          category || null,
          department || null,
          condition || null,
          notes || null,
          todayIso(),
          asset.id
        );
        if (status === 'Available' || status === 'Under repair') {
          const returnedAt = new Date().toISOString();
          recordHolderReturn(db, asset.code, returnedAt);
          returnAssetToIt(db, asset.code, todayIso());
          if (String(asset.owner || '').trim().toLowerCase() !== 'it department') {
            db.prepare('INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
              `hist-${randomUUID()}`, asset.code, asset.owner || 'None', DEFAULT_OWNER, returnedAt,
              'Returned to IT Department', `${status} status selected in bulk update by ${req.user.username}`, returnedAt,
            );
          }
        }
        updatedCount++;
      }
    }

    db.exec('COMMIT;');
    logAudit('BATCH_UPDATE_ASSETS', 'assets', null, { count: updatedCount, ids, changes }, req.user);

    return res.json({
      success: true,
      message: `Successfully updated ${updatedCount} assets.`,
      count: updatedCount,
      assetActivity: ids.map((id) => db.prepare('SELECT * FROM assets WHERE id = ?').get(id)).filter(Boolean).map(assetActivityFields),
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
