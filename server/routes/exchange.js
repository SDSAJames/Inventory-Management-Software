import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { db, logAudit, createSnapshot, reconcileAllAssetsInDb } from '../db/database.js';
import { authenticate } from '../middleware/auth.js';
import packageMetadata from '../../package.json' with { type: 'json' };

export const exchangeRouter = Router();

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/exchange/export (Export entire database as structured JSON)
exchangeRouter.get('/export', (req, res) => {
  const assets = db.prepare('SELECT * FROM assets ORDER BY code ASC').all();
  const getHistory = db.prepare('SELECT * FROM ownership_history WHERE asset_code = ? ORDER BY date DESC, created_at DESC');

  const enrichedAssets = assets.map((a) => ({
    ...a,
    ownershipHistory: getHistory.all(a.code).map((h) => ({
      previousOwner: h.previous_owner,
      newOwner: h.new_owner,
      date: h.date,
      reason: h.reason,
      notes: h.notes,
    })),
  }));

  const loans = db.prepare('SELECT * FROM loans ORDER BY created_at DESC').all().map((l) => ({
    id: l.id,
    assetCode: l.asset_code,
    assignee: l.assignee,
    department: l.department,
    knoxId: l.knox_id,
    location: l.location,
    ip: l.ip,
    startDate: l.start_date,
    pickupDate: l.pickup_date,
    endDate: l.end_date,
    returnDate: l.return_date,
    returnedDate: l.returned_date,
    status: l.status,
    equipment: l.equipment_json ? JSON.parse(l.equipment_json) : {},
    returnedEquipment: l.returned_equipment_json ? JSON.parse(l.returned_equipment_json) : null,
    returnStatus: l.return_status || '',
    readyForPickup: Boolean(l.ready_for_pickup),
    others: l.others,
    note: l.note,
    purpose: l.purpose,
    assigneeType: l.assignee_type,
    isArchived: Boolean(l.is_archived),
  }));

  const employees = db.prepare('SELECT id, name, department, position, knox_id FROM employees ORDER BY name ASC').all();
  const departments = db.prepare('SELECT name FROM departments ORDER BY name ASC').all().map((d) => d.name);
  const locations = db.prepare('SELECT name FROM locations ORDER BY name ASC').all().map((l) => l.name);
  const transferReasons = db.prepare('SELECT reason FROM transfer_reasons ORDER BY created_at ASC').all().map((r) => r.reason);

  return res.json({
    success: true,
    version: packageMetadata.version,
    exportedAt: new Date().toISOString(),
    db: {
      assets: enrichedAssets,
      loans,
      employees,
      departments,
      locations,
      transferReasons,
    },
  });
});

// GET /api/exchange/backup-status
exchangeRouter.get('/backup-status', (req, res) => {
  const latest = db.prepare('SELECT id, description, created_at FROM import_backups ORDER BY created_at DESC LIMIT 1').get();
  return res.json({
    success: true,
    hasBackup: Boolean(latest),
    latestBackup: latest || null,
  });
});

// POST /api/exchange/import (Protected: Import with automated rollback point)
exchangeRouter.post('/import', authenticate, (req, res) => {
  const { assets = [], loans = [], overwrite = false } = req.body || {};

  if (!Array.isArray(assets) && !Array.isArray(loans)) {
    return res.status(400).json({ success: false, error: 'Assets or loans array is required.' });
  }

  const now = new Date().toISOString();
  const snapshotId = createSnapshot(`Pre-import snapshot before importing ${assets.length} assets and ${loans.length} loans`);

  db.exec('BEGIN TRANSACTION;');
  try {
    let importedAssetsCount = 0;
    let updatedAssetsCount = 0;
    let importedLoansCount = 0;

    // 1. Process Assets
    if (assets.length > 0) {
      const getAssetStmt = db.prepare('SELECT * FROM assets WHERE LOWER(code) = LOWER(?)');
      const insertAssetStmt = db.prepare(`
        INSERT INTO assets (id, code, name, category, model, serial, status, location, owner, department, condition, notes, updated, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateAssetStmt = db.prepare(`
        UPDATE assets
        SET name = ?, category = ?, model = ?, serial = ?, status = ?, location = ?, owner = ?, department = ?, condition = ?, notes = ?, updated = ?
        WHERE id = ?
      `);
      const insertHistoryStmt = db.prepare(`
        INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const a of assets) {
        if (!a.code) continue;
        const codeTrimmed = String(a.code).trim();
        const existing = getAssetStmt.get(codeTrimmed);

        if (existing) {
          if (overwrite) {
            updateAssetStmt.run(
              a.name || existing.name,
              a.category || existing.category,
              a.model || existing.model,
              a.serial || existing.serial,
              a.status || existing.status,
              a.location || existing.location,
              a.owner !== undefined ? a.owner : existing.owner,
              a.department !== undefined ? a.department : existing.department,
              a.condition || existing.condition,
              a.notes || existing.notes,
              todayIso(),
              existing.id
            );

            if (a.owner && a.owner !== existing.owner) {
              insertHistoryStmt.run(
                `hist-${randomUUID()}`,
                codeTrimmed,
                existing.owner || 'None',
                a.owner,
                a.issuedDate || todayIso(),
                'Import Overwrite',
                'Updated via data exchange import',
                now
              );
            }
            updatedAssetsCount++;
          }
        } else {
          // Fresh insert
          const newId = a.id || `ast-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          insertAssetStmt.run(
            newId,
            codeTrimmed,
            a.name || codeTrimmed,
            a.category || 'Laptop',
            a.model || '',
            a.serial || '',
            a.status || (a.owner ? 'Assigned' : 'Available'),
            a.location || 'Head Office',
            a.owner || '',
            a.department || '',
            a.condition || 'Good',
            a.notes || '',
            a.updated || todayIso(),
            now
          );

          if (a.owner) {
            insertHistoryStmt.run(
              `hist-${randomUUID()}`,
              codeTrimmed,
              'None',
              a.owner,
              a.issuedDate || todayIso(),
              'Initial Import',
              'Registered via data exchange import',
              now
            );
          }
          importedAssetsCount++;
        }
      }
    }

    // 2. Process Loans
    if (loans.length > 0) {
      const insertLoanStmt = db.prepare(`
        INSERT INTO loans (id, asset_code, assignee, department, knox_id, location, ip, start_date, pickup_date, end_date, return_date, returned_date, status, equipment_json, returned_equipment_json, return_status, ready_for_pickup, others, note, purpose, assignee_type, is_archived, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          asset_code = excluded.asset_code,
          assignee = excluded.assignee,
          department = excluded.department,
          knox_id = excluded.knox_id,
          location = excluded.location,
          ip = excluded.ip,
          start_date = excluded.start_date,
          pickup_date = excluded.pickup_date,
          end_date = excluded.end_date,
          return_date = excluded.return_date,
          returned_date = excluded.returned_date,
          status = excluded.status,
          equipment_json = excluded.equipment_json,
          returned_equipment_json = excluded.returned_equipment_json,
          return_status = excluded.return_status,
          ready_for_pickup = excluded.ready_for_pickup,
          others = excluded.others,
          note = excluded.note,
          purpose = excluded.purpose,
          assignee_type = excluded.assignee_type,
          is_archived = excluded.is_archived
      `);

      for (const l of loans) {
        if (!l.assetCode) continue;
        const newLoanId = l.id || `loan-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        insertLoanStmt.run(
          newLoanId,
          String(l.assetCode).trim(),
          l.assignee || 'Borrower',
          l.department || '',
          l.knoxId || '',
          l.location || 'Head Office',
          l.ip || '',
          l.startDate || todayIso(),
          l.pickupDate || '',
          l.endDate || '',
          l.returnDate || '',
          l.returnedDate || '',
          l.status || 'Active',
          JSON.stringify(l.equipment || { Adapter: 1, Cable: 1 }),
          l.returnedEquipment ? JSON.stringify(l.returnedEquipment) : null,
          l.returnStatus || '',
          l.readyForPickup ? 1 : 0,
          l.others || '',
          l.note || '',
          l.purpose || '',
          l.assigneeType || 'Business traveler',
          l.returnDate || l.returnedDate ? 1 : 0,
          now
        );
        importedLoansCount++;
      }
    }

    db.exec('COMMIT;');

    // Run reconciliation after commit
    reconcileAllAssetsInDb();

    logAudit('IMPORT_DATA', 'exchange', snapshotId, {
      importedAssetsCount,
      updatedAssetsCount,
      importedLoansCount,
      overwrite,
    }, req.user);

    return res.json({
      success: true,
      message: 'Data import completed successfully.',
      summary: {
        snapshotId,
        importedAssets: importedAssetsCount,
        updatedAssets: updatedAssetsCount,
        importedLoans: importedLoansCount,
      },
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Import failed:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/exchange/revert (Protected: Rollback to previous snapshot)
exchangeRouter.post('/revert', authenticate, (req, res) => {
  const latestSnapshot = db.prepare('SELECT * FROM import_backups ORDER BY created_at DESC LIMIT 1').get();
  if (!latestSnapshot) {
    return res.status(404).json({ success: false, error: 'No backup snapshot available to revert.' });
  }

  let snapshot;
  try {
    snapshot = JSON.parse(latestSnapshot.snapshot_json);
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Snapshot data is corrupted.' });
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Clear existing working tables
    db.exec('DELETE FROM ownership_history;');
    db.exec('DELETE FROM assets;');
    db.exec('DELETE FROM loans;');
    db.exec('DELETE FROM employees;');
    db.exec('DELETE FROM departments;');
    db.exec('DELETE FROM locations;');

    // 2. Restore Assets & History
    const insertAsset = db.prepare(`
      INSERT INTO assets (id, code, name, category, model, serial, status, location, owner, department, condition, notes, updated, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertHistory = db.prepare(`
      INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    if (Array.isArray(snapshot.assets)) {
      for (const a of snapshot.assets) {
        insertAsset.run(
          a.id,
          a.code,
          a.name,
          a.category,
          a.model,
          a.serial,
          a.status,
          a.location,
          a.owner,
          a.department,
          a.condition,
          a.notes,
          a.updated,
          a.created_at
        );
        if (Array.isArray(a.ownershipHistory)) {
          for (const h of a.ownershipHistory) {
            insertHistory.run(
              h.id || `hist-${randomUUID()}`,
              a.code,
              h.previous_owner || h.previousOwner || 'None',
              h.new_owner || h.newOwner || 'None',
              h.date || todayIso(),
              h.reason || '',
              h.notes || '',
              h.created_at || new Date().toISOString()
            );
          }
        }
      }
    }

    // 3. Restore Loans
    if (Array.isArray(snapshot.loans)) {
      const insertLoan = db.prepare(`
        INSERT INTO loans (id, asset_code, assignee, department, knox_id, location, ip, start_date, pickup_date, end_date, return_date, returned_date, status, equipment_json, returned_equipment_json, return_status, ready_for_pickup, others, note, purpose, assignee_type, is_archived, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const l of snapshot.loans) {
        insertLoan.run(
          l.id,
          l.asset_code || l.assetCode,
          l.assignee,
          l.department,
          l.knox_id || l.knoxId,
          l.location,
          l.ip,
          l.start_date || l.startDate,
          l.pickup_date || l.pickupDate,
          l.end_date || l.endDate,
          l.return_date || l.returnDate,
          l.returned_date || l.returnedDate,
          l.status,
          l.equipment_json || JSON.stringify(l.equipment || {}),
          l.returned_equipment_json || (l.returnedEquipment ? JSON.stringify(l.returnedEquipment) : null),
          l.return_status || l.returnStatus || '',
          l.ready_for_pickup !== undefined ? l.ready_for_pickup : (l.readyForPickup ? 1 : 0),
          l.others,
          l.note,
          l.purpose,
          l.assignee_type || l.assigneeType,
          l.is_archived !== undefined ? l.is_archived : (l.isArchived ? 1 : 0),
          l.created_at || new Date().toISOString()
        );
      }
    }

    // 4. Restore Employees
    if (Array.isArray(snapshot.employees)) {
      const insertEmp = db.prepare(`
        INSERT INTO employees (id, name, department, position, knox_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const emp of snapshot.employees) {
        insertEmp.run(emp.id, emp.name, emp.department, emp.position, emp.knox_id, emp.created_at);
      }
    }

    // 5. Restore Departments & Locations
    if (Array.isArray(snapshot.departments)) {
      const insertDept = db.prepare('INSERT INTO departments (id, name) VALUES (?, ?)');
      snapshot.departments.forEach((d, idx) => {
        insertDept.run(d.id || `dept-${idx}`, d.name || d);
      });
    }
    if (Array.isArray(snapshot.locations)) {
      const insertLoc = db.prepare('INSERT INTO locations (id, name) VALUES (?, ?)');
      snapshot.locations.forEach((l, idx) => {
        insertLoc.run(l.id || `loc-${idx}`, l.name || l);
      });
    }

    // 6. Delete consumed snapshot
    db.prepare('DELETE FROM import_backups WHERE id = ?').run(latestSnapshot.id);

    db.exec('COMMIT;');
    logAudit('REVERT_IMPORT', 'exchange', latestSnapshot.id, { description: latestSnapshot.description }, req.user);

    return res.json({
      success: true,
      message: `Database successfully reverted to snapshot from ${latestSnapshot.created_at}.`,
      snapshotRestored: latestSnapshot.id,
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Revert failed:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
import packageMetadata from '../../package.json' with { type: 'json' };
