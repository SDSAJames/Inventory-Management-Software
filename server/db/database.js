import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { seed } from '../../src/data/seed.js';

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

export const DEFAULT_TRANSFER_REASONS = [
  'Reassigned to new staff',
  'New Hire onboarding',
  'Department Transfer',
  'Temporary Handover',
  'Permanent Allocation',
  'Returned to IT department',
  'Repaired & Reassigned',
];

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
      created_at TEXT NOT NULL,
      last_login TEXT
    );
  `);

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
      condition TEXT,
      notes TEXT,
      updated TEXT,
      created_at TEXT NOT NULL
    );
  `);

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
}

function seedDefaultData() {
  // Check if admin user exists
  const checkUser = db.prepare('SELECT id FROM users WHERE username = ?');
  const existingAdmin = checkUser.get('admin');

  if (!existingAdmin) {
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync('admin123', salt);
    const insertUser = db.prepare(`
      INSERT INTO users (id, username, password_hash, full_name, role, knox_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run(
      'usr-admin-01',
      'admin',
      passwordHash,
      'IT Administrator',
      'ADMIN',
      'KNOX-IT-001',
      new Date().toISOString()
    );

    // Also create a standard operator user for testing
    const opHash = bcrypt.hashSync('operator123', salt);
    insertUser.run(
      'usr-op-01',
      'operator',
      opHash,
      'Field IT Operator',
      'OPERATOR',
      'KNOX-IT-002',
      new Date().toISOString()
    );

    console.log('✓ Seeded default users: admin (password: admin123) and operator (password: operator123)');
  }

  // Seed initial assets if table is empty
  const countAssets = db.prepare('SELECT COUNT(*) as count FROM assets').get();
  if (countAssets.count === 0 && seed.assets?.length) {
    const insertAsset = db.prepare(`
      INSERT INTO assets (id, code, name, category, model, serial, status, location, owner, department, condition, notes, updated, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertHistory = db.prepare(`
      INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const a of seed.assets) {
      const now = new Date().toISOString();
      insertAsset.run(
        a.id,
        a.code,
        a.name,
        a.category || 'Laptop',
        a.model || '',
        a.serial || '',
        a.status || 'Available',
        a.location || 'Head Office',
        a.owner || '',
        a.department || '',
        a.condition || 'Good',
        a.notes || '',
        a.updated || now.slice(0, 10),
        now
      );

      if (a.owner) {
        insertHistory.run(
          `hist-${a.id}-init`,
          a.code,
          'None',
          a.owner,
          a.updated || now.slice(0, 10),
          a.owner === 'IT department' ? 'Returned to IT department' : 'Initial assignment',
          `Initial asset custody assignment (${a.department || 'General'})`,
          now
        );
      }
    }
    console.log(`✓ Seeded ${seed.assets.length} baseline inventory assets into SQLite`);
  }

  // Seed initial loans if table is empty
  const countLoans = db.prepare('SELECT COUNT(*) as count FROM loans').get();
  if (countLoans.count === 0 && seed.loans?.length) {
    const insertLoan = db.prepare(`
      INSERT INTO loans (id, asset_code, assignee, department, knox_id, location, ip, start_date, pickup_date, end_date, return_date, returned_date, status, equipment_json, others, note, purpose, assignee_type, is_archived, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const l of seed.loans) {
      const now = new Date().toISOString();
      insertLoan.run(
        l.id,
        l.assetCode,
        l.assignee,
        l.department || '',
        l.knoxId || '',
        l.location || 'Head Office',
        l.ip || '',
        l.loanDate || l.startDate || now.slice(0, 10),
        l.pickupDate || l.loanDate || now.slice(0, 10),
        l.dueDate || l.endDate || '',
        l.returnDate || '',
        l.returnedDate || '',
        l.status || 'Active',
        JSON.stringify({ Adapter: 1, Cable: 1 }),
        '',
        l.purpose || l.note || '',
        l.purpose || '',
        'Business traveler',
        l.returnDate || l.returnedDate ? 1 : 0,
        now
      );
    }
    console.log(`✓ Seeded ${seed.loans.length} baseline loans into SQLite`);
  }

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
      insertLoc.run(`loc-${idx + 1}`, loc);
    });
  }

  // Seed employees directory
  const countEmployees = db.prepare('SELECT COUNT(*) as count FROM employees').get();
  if (countEmployees.count === 0 && seed.employees?.length) {
    const insertEmp = db.prepare(`
      INSERT INTO employees (id, name, department, position, knox_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    seed.employees.forEach((emp, idx) => {
      insertEmp.run(
        `emp-${idx + 1}`,
        emp.name,
        emp.department || '',
        emp.position || 'Staff',
        `KNOX-${String(idx + 1).padStart(3, '0')}`,
        new Date().toISOString()
      );
    });
    console.log(`✓ Seeded ${seed.employees.length} employees into SQLite`);
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
    const assetLoans = loans.filter(
      (l) => String(l.asset_code || '').trim().toLowerCase() === String(asset.code || '').trim().toLowerCase()
    );

    // Active loan is one with pickup_date, no return_date or returned_date, and not archived
    const activeLoan = assetLoans.find((l) => {
      const isReturned = Boolean(l.return_date || l.returned_date || l.status === 'Returned' || l.is_archived);
      const hasPickedUp = Boolean(l.pickup_date || l.status === 'Active');
      return hasPickedUp && !isReturned;
    });

    let newStatus = asset.status;
    let newOwner = asset.owner || '';
    let newDept = asset.department || '';
    let newLoc = asset.location || '';

    if (activeLoan) {
      newStatus = 'On loan';
      newOwner = activeLoan.assignee || asset.owner || '';
      newDept = activeLoan.department || asset.department || '';
      newLoc = activeLoan.location || asset.location || '';
    } else if (asset.status === 'On loan') {
      // Asset marked 'On loan' but has no active picked-up loan
      const hasOtherHolder = Boolean(asset.owner && asset.owner !== 'IT department' && asset.owner !== 'None');
      newStatus = hasOtherHolder ? 'Assigned' : 'Available';
      newOwner = hasOtherHolder ? asset.owner : 'IT department';
      newDept = hasOtherHolder ? asset.department : '';
    } else {
      // Check if most recent loan was returned
      const returnedLoan = assetLoans.find((l) => Boolean(l.return_date || l.returned_date || l.status === 'Returned'));
      if (returnedLoan && (!asset.owner || asset.owner === 'None' || asset.owner === 'IT department')) {
        newOwner = 'IT department';
        newDept = '';
        if (asset.status !== 'Damaged' && asset.status !== 'Under repair' && asset.status !== 'Retired') {
          newStatus = 'Available';
        }
      } else {
        // Enforce invariants:
        const hasHolder = Boolean(asset.owner && asset.owner !== 'IT department' && asset.owner !== 'None');
        if (hasHolder && asset.status === 'Available') {
          newStatus = 'Assigned';
        } else if (!hasHolder && asset.status === 'Assigned') {
          newStatus = 'Available';
          newOwner = 'IT department';
          newDept = '';
        }
      }
    }

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
