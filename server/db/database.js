import { DEFAULT_OWNER, DEFAULT_ASSET_STATUSES, DEFAULT_TRANSFER_REASONS } from "../../shared/referenceData.js";
import { getAssetLocationAfterReturn, getAssetLocation, normalizeLocation } from "../../shared/assetRules.js";
import { ensureAssetDateColumns } from '../lib/assetDates.js';
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { seed } from '../../src/data/seed.js';
import { getDuplicateLoanIds, removeDuplicateLoans } from '../lib/loanDuplicates.js';


import { assetLocationForWrite, normalizeStoredLocations } from '../lib/assetLocations.js';
import { isLoanReturned } from '../../shared/loanRules.js';

// Ensure data directory exists
const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Open / initialize SQLite database
export const db = new DatabaseSync(config.dbPath);

// Enable WAL mode and foreign keys for high concurrency & performance
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export { DEFAULT_TRANSFER_REASONS } from '../../shared/referenceData.js';

export function initDatabase() {
  // 1. Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      role TEXT NOT NULL DEFAULT 'OPERATOR',
      knox_id TEXT,
      title TEXT,
      created_at TEXT NOT NULL,
      last_login TEXT
    );
  `);

  try {
    db.exec('ALTER TABLE users ADD COLUMN title TEXT;');
  } catch {
    // column already exists
  }

  // 2. Assets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      model TEXT,
      serial TEXT,
      status TEXT NOT NULL DEFAULT 'Available',
      location TEXT,
      owner TEXT,
      department TEXT,
      purchase_date TEXT,
      condition TEXT,
      notes TEXT,
      updated TEXT,
      created_at TEXT NOT NULL
    );
  `);

  ensureAssetDateColumns(db);

  // 3. Loans table
  db.exec(`
    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      asset_code TEXT NOT NULL,
      assignee TEXT NOT NULL,
      department TEXT,
      knox_id TEXT,
      location TEXT,
      ip TEXT,
      start_date TEXT,
      pickup_date TEXT,
      end_date TEXT,
      return_date TEXT,
      returned_date TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      equipment_json TEXT,
      others TEXT,
      note TEXT,
      purpose TEXT,
      assignee_type TEXT DEFAULT 'Business traveler',
      ready_for_pickup INTEGER DEFAULT 0,
      returned_equipment_json TEXT,
      return_status TEXT,
      is_archived INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  // Ensure is_archived column exists if table was created previously without it
  try {
    const loanCols = db.prepare('PRAGMA table_info(loans)').all().map((c) => c.name);
    if (!loanCols.includes('is_archived')) {
      db.exec('ALTER TABLE loans ADD COLUMN is_archived INTEGER DEFAULT 0;');
    }
  } catch (e) {
    console.warn('Note checking loans schema:', e.message);
  }
  for (const [column, definition] of [
    ['ready_for_pickup', 'INTEGER DEFAULT 0'],
    ['returned_equipment_json', 'TEXT'],
    ['return_status', 'TEXT'],
  ]) {
    try { db.exec(`ALTER TABLE loans ADD COLUMN ${column} ${definition};`); } catch { /* Column already exists. */ }
  }

  // 4. Ownership history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ownership_history (
      id TEXT PRIMARY KEY,
      asset_code TEXT NOT NULL,
      previous_owner TEXT,
      new_owner TEXT,
      date TEXT NOT NULL,
      reason TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 5. Reference departments & locations
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS asset_categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS asset_statuses (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
  `);
  const insertStatus = db.prepare('INSERT OR IGNORE INTO asset_statuses (id, name) VALUES (?, ?)');
  DEFAULT_ASSET_STATUSES.forEach((name) => insertStatus.run(`status-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name));
  const existingCategories = db.prepare('SELECT COUNT(*) as count FROM asset_categories').get().count;
  if (!existingCategories) {
    const categories = db.prepare("SELECT DISTINCT category FROM assets WHERE category IS NOT NULL AND TRIM(category) <> ''").all();
    const insertCategory = db.prepare('INSERT OR IGNORE INTO asset_categories (id, name) VALUES (?, ?)');
    categories.forEach((row, index) => insertCategory.run(`cat-${index + 1}`, row.category));
  }

  // 6. Employees directory table
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      department TEXT,
      position TEXT,
      knox_id TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 7. Transfer reasons table
  db.exec(`
    CREATE TABLE IF NOT EXISTS transfer_reasons (
      id TEXT PRIMARY KEY,
      reason TEXT UNIQUE NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  // 8. Import backup snapshots table
  db.exec(`
    CREATE TABLE IF NOT EXISTS import_backups (
      id TEXT PRIMARY KEY,
      snapshot_json TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 9. Audit logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details_json TEXT,
      user_id TEXT,
      username TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 10. Performance indices
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_assets_code ON assets(code);
    CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
    CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
    CREATE INDEX IF NOT EXISTS idx_assets_location ON assets(location);
    CREATE INDEX IF NOT EXISTS idx_loans_asset_code ON loans(asset_code);
    CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
    CREATE INDEX IF NOT EXISTS idx_loans_assignee ON loans(assignee);
    CREATE INDEX IF NOT EXISTS idx_history_asset_code ON ownership_history(asset_code);
    CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
    CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);
  `);

  seedDefaultData();
  normalizeStoredLocations(db);
  removeExactDuplicateLoans();
  ensureAvailableAssetCustody(db);
}

function removeExactDuplicateLoans() {
  const invalidStartDates = db.prepare(`
    SELECT id FROM loans
    WHERE COALESCE(pickup_date, '') = ''
      AND COALESCE(start_date, '') <> ''
      AND COALESCE(NULLIF(return_date, ''), NULLIF(returned_date, '')) IS NOT NULL
      AND substr(start_date, 1, 10) > substr(COALESCE(NULLIF(return_date, ''), NULLIF(returned_date, '')), 1, 10)
  `).all();
  const duplicateIds = getDuplicateLoanIds(db);
  if (!invalidStartDates.length && !duplicateIds.length) return;

  createSnapshot(`Before loan cleanup: ${duplicateIds.length} duplicate records and ${invalidStartDates.length} invalid start dates`);
  db.exec('BEGIN TRANSACTION;');
  try {
    if (invalidStartDates.length) {
      const clearInvalidStartDate = db.prepare("UPDATE loans SET start_date = '' WHERE id = ?");
      for (const { id } of invalidStartDates) clearInvalidStartDate.run(id);
    }

    const removedCount = removeDuplicateLoans(db);
    db.exec('COMMIT;');
    console.info(`Loan cleanup removed ${removedCount} exact duplicate record${removedCount === 1 ? '' : 's'} and cleared ${invalidStartDates.length} impossible start date${invalidStartDates.length === 1 ? '' : 's'}.`);
  } catch (error) {
    db.exec('ROLLBACK;');
    console.warn('Could not remove exact duplicate loan records:', error.message);
  }
}

function seedDefaultData() {
  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, full_name, role, knox_id, title, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateUser = db.prepare(`
    UPDATE users
    SET password_hash = ?, full_name = ?, role = ?, knox_id = ?, title = ?
    WHERE id = ?
  `);

  const salt = bcrypt.genSaltSync(10);

  // 1. Initial admin account sourced from .env
  const adminCfg = config.initialAdmin;
  const existingAdmin = db.prepare(`
    SELECT id FROM users
    WHERE LOWER(knox_id) = LOWER(?) OR LOWER(username) = LOWER(?) OR LOWER(username) = 'admin'
  `).get(adminCfg.knoxId, adminCfg.knoxId);

  const adminHash = bcrypt.hashSync(adminCfg.password, salt);

  if (!existingAdmin) {
    insertUser.run(
      'usr-admin-01',
      adminCfg.knoxId.toLowerCase(),
      adminHash,
      adminCfg.fullName,
      'ADMIN',
      adminCfg.knoxId,
      'IT Administrator',
      new Date().toISOString()
    );
    console.log(`✓ Seeded admin account: ${adminCfg.fullName} (Knox ID: ${adminCfg.knoxId}) from .env`);
  } else {
    updateUser.run(
      adminHash,
      adminCfg.fullName,
      'ADMIN',
      adminCfg.knoxId,
      'IT Administrator',
      existingAdmin.id
    );
  }

  // 2. Multiple operator accounts sourced from .env OPERATOR_LIST
  if (Array.isArray(config.operators)) {
    for (const op of config.operators) {
      const existingOp = db.prepare(`
        SELECT id FROM users
        WHERE LOWER(username) = LOWER(?) OR LOWER(knox_id) = LOWER(?)
      `).get(op.username, op.knoxId);

      const opHash = bcrypt.hashSync(op.password, salt);

      if (!existingOp) {
        const opId = `usr-${op.knoxId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
        insertUser.run(
          opId,
          op.username,
          opHash,
          op.fullName,
          op.role || 'OPERATOR',
          op.knoxId,
          op.title || 'Operator',
          new Date().toISOString()
        );
        console.log(`✓ Seeded operator: ${op.fullName} (Knox ID: ${op.knoxId}, Title: ${op.title})`);
      } else {
        updateUser.run(
          opHash,
          op.fullName,
          op.role || 'OPERATOR',
          op.knoxId,
          op.title || 'Operator',
          existingOp.id
        );
      }
    }
  }

  // Seed initial assets if table is empty
  // Operational records are created only by explicit edits or imports.
  const knownCategories = new Set(db.prepare('SELECT name FROM asset_categories').all().map((row) => row.name.toLowerCase()));
  const categoryRows = db.prepare("SELECT DISTINCT category FROM assets WHERE category IS NOT NULL AND TRIM(category) <> ''").all();
  const addCategory = db.prepare('INSERT OR IGNORE INTO asset_categories (id, name) VALUES (?, ?)');
  categoryRows.forEach((row) => {
    if (!knownCategories.has(row.category.toLowerCase())) {
      addCategory.run(`cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, row.category);
      knownCategories.add(row.category.toLowerCase());
    }
  });

  // Seed reference departments
  const countDepts = db.prepare('SELECT COUNT(*) as count FROM departments').get();
  if (countDepts.count === 0 && seed.departments?.length) {
    const insertDept = db.prepare('INSERT INTO departments (id, name) VALUES (?, ?)');
    seed.departments.forEach((dept, idx) => {
      insertDept.run(`dept-${idx + 1}`, dept);
    });
  }

  // Seed reference locations
  const countLocs = db.prepare('SELECT COUNT(*) as count FROM locations').get();
  if (countLocs.count === 0 && seed.locations?.length) {
    const insertLoc = db.prepare('INSERT INTO locations (id, name) VALUES (?, ?)');
    seed.locations.forEach((loc, idx) => {
      insertLoc.run(`loc-${idx + 1}`, normalizeLocation(loc));
    });
  }

  // Seed transfer reasons
  const countReasons = db.prepare('SELECT COUNT(*) as count FROM transfer_reasons').get();
  if (countReasons.count === 0) {
    const insertReason = db.prepare(`
      INSERT INTO transfer_reasons (id, reason, is_default, created_at)
      VALUES (?, ?, 1, ?)
    `);
    const now = new Date().toISOString();
    DEFAULT_TRANSFER_REASONS.forEach((reason, idx) => {
      insertReason.run(`tr-${idx + 1}`, reason, now);
    });
  }
}

/**
 * Log an event to audit_logs
 */
export function logAudit(action, entityType, entityId, details = {}, user = null) {
  try {
    const id = `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO audit_logs (id, action, entity_type, entity_id, details_json, user_id, username, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      action,
      entityType,
      entityId ? String(entityId) : null,
      JSON.stringify(details),
      user?.id || null,
      user?.username || 'SYSTEM',
      now
    );
  } catch (err) {
    console.error('Failed to log audit event:', err);
  }
}

/**
 * States Version 1.0.0 state machine integrity reconciliation.
 * Reconciles every asset against all loans according to operational rules.
 */
export function reconcileAllAssetsInDb() {
  const assets = db.prepare('SELECT * FROM assets').all();
  const loans = db.prepare('SELECT * FROM loans').all();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  let reconciledCount = 0;
  const updates = [];

  const updateAssetStmt = db.prepare(`
    UPDATE assets
    SET status = ?, owner = ?, department = ?, location = ?, updated = ?
    WHERE id = ?
  `);

  for (const asset of assets) {
    if (String(asset.code).trim() === '1') continue;
    const assetLoans = loans.filter(
      (l) => String(l.asset_code || '').trim().toLowerCase() === String(asset.code || '').trim().toLowerCase()
    );

    // Active loan is one with pickup_date, no return_date or returned_date, and not archived
    const activeLoan = assetLoans.find((l) => {
      const isReturned = isLoanReturned(l);
      const hasPickedUp = Boolean(l.pickup_date || l.status === 'Active');
      const returnedEquipment = l.returned_equipment_json ? JSON.parse(l.returned_equipment_json) : null;
      return hasPickedUp && !isReturned && !isAssetReturnedOnRecord({ returnedEquipment }, asset.code);
    });

    let newStatus = asset.status;
    let newOwner = asset.owner || '';
    let newDept = asset.department || '';
    let newLoc = asset.location || '';

    if (asset.status === 'Under repair') {
      // A manually recorded repair takes precedence over an outstanding loan.
      newLoc = assetLocationForWrite(db, asset.status, asset.location);
    } else if (activeLoan) {
      newStatus = 'On loan';
      newOwner = activeLoan.assignee || asset.owner || '';
      newDept = activeLoan.department || asset.department || '';
      newLoc = asset.location || activeLoan.location || '';
    } else if (asset.status === 'On loan') {
      // Asset marked 'On loan' but has no active picked-up loan
      const hasOtherHolder = Boolean(asset.owner && asset.owner !== DEFAULT_OWNER && asset.owner !== 'None');
      newStatus = hasOtherHolder ? 'Assigned' : 'Available';
      newOwner = hasOtherHolder ? asset.owner : DEFAULT_OWNER;
      newDept = hasOtherHolder ? asset.department : '';
    } else {
      // Check if most recent loan was returned
      const returnedLoan = assetLoans.find((l) => Boolean(l.return_date || l.returned_date || l.status === 'Returned'));
      if (returnedLoan && (!asset.owner || asset.owner === 'None' || asset.owner === DEFAULT_OWNER)) {
        newLoc = asset.status === 'Available' ? asset.location || getAssetLocationAfterReturn(asset.status) : getAssetLocationAfterReturn(asset.status);
        newOwner = DEFAULT_OWNER;
        newDept = '';
        if (asset.status !== 'Damaged' && asset.status !== 'Under repair' && asset.status !== 'Retired') {
          newStatus = 'Available';
        }
      } else {
        // Enforce invariants:
        const hasHolder = Boolean(asset.owner && asset.owner !== DEFAULT_OWNER && asset.owner !== 'None');
        if (hasHolder && asset.status === 'Available') {
          newStatus = 'Assigned';
        } else if (!hasHolder && asset.status === 'Assigned') {
          newStatus = 'Available';
          newOwner = DEFAULT_OWNER;
          newDept = '';
        }
      }
    }

    newLoc = assetLocationForWrite(db, newStatus, newLoc, '');

    if (
      newStatus !== asset.status ||
      newOwner !== asset.owner ||
      newDept !== asset.department ||
      newLoc !== asset.location
    ) {
      updateAssetStmt.run(newStatus, newOwner, newDept, newLoc, today, asset.id);
      reconciledCount++;
      updates.push({
        code: asset.code,
        before: { status: asset.status, owner: asset.owner },
        after: { status: newStatus, owner: newOwner },
      });
    }
  }

  return { reconciledCount, updates };
}

/**
 * Creates a rollback snapshot in import_backups table
 */
export function createSnapshot(description = 'Pre-import state snapshot') {
  const assets = db.prepare('SELECT * FROM assets').all();
  const loans = db.prepare('SELECT * FROM loans').all();
  const employees = db.prepare('SELECT * FROM employees').all();
  const departments = db.prepare('SELECT * FROM departments').all();
  const locations = db.prepare('SELECT * FROM locations').all();

  const getHistory = db.prepare('SELECT * FROM ownership_history WHERE asset_code = ?');
  const enrichedAssets = assets.map((a) => ({
    ...a,
    ownershipHistory: getHistory.all(a.code),
  }));

  const snapshot = {
    timestamp: new Date().toISOString(),
    description,
    assets: enrichedAssets,
    loans,
    employees,
    departments,
    locations,
  };

  const id = `snap-${Date.now()}`;
  db.prepare(`
    INSERT INTO import_backups (id, snapshot_json, description, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, JSON.stringify(snapshot), description, new Date().toISOString());

  return id;
}
import { isAssetReturnedOnRecord } from '../../shared/assetReturns.js';
import { ensureAvailableAssetCustody } from '../lib/assetCustody.js';
