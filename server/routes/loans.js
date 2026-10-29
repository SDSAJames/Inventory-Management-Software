import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { db, logAudit } from '../db/database.js';
import { authenticate } from '../middleware/auth.js';
import { tracksEndDate } from '../loanRules.js';

export const loansRouter = Router();

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function computeLoanStatus(loan) {
  const isReturned = Boolean(loan.return_date || loan.returned_date || loan.status === 'Returned' || loan.is_archived);
  if (isReturned) return 'Returned';

  const hasPickedUp = Boolean(loan.pickup_date || loan.status === 'Active');
  const today = todayIso();
  const isOverdue = Boolean(tracksEndDate(loan.assignee_type) && loan.end_date && loan.end_date < today);

  if (isOverdue) return 'Overdue';
  if (hasPickedUp) return 'Active';
  return 'Scheduled';
}

function formatLoanRow(l) {
  const dynamicStatus = computeLoanStatus(l);
  return {
    id: l.id,
    assetCode: l.asset_code,
    assignee: l.assignee,
    department: l.department || '',
    knoxId: l.knox_id || '',
    location: l.location || 'Head Office',
    ip: l.ip || '',
    startDate: l.start_date || '',
    pickupDate: l.pickup_date || '',
    endDate: tracksEndDate(l.assignee_type) ? (l.end_date || '') : '',
    returnDate: l.return_date || '',
    returnedDate: l.returned_date || '',
    status: dynamicStatus,
    equipment: l.equipment_json ? JSON.parse(l.equipment_json) : { Adapter: 1, Cable: 1 },
    returnedEquipment: l.returned_equipment_json ? JSON.parse(l.returned_equipment_json) : null,
    returnStatus: l.return_status || '',
    readyForPickup: Boolean(l.ready_for_pickup),
    others: l.others || '',
    note: l.note || '',
    purpose: l.purpose || '',
    assigneeType: l.assignee_type || 'Business traveler',
    isArchived: Boolean(l.is_archived || l.return_date || l.returned_date),
    createdAt: l.created_at,
  };
}

// GET /api/loans
loansRouter.get('/', (req, res) => {
  const { status, category, assigneeType, search } = req.query || {};

  let query = 'SELECT * FROM loans WHERE 1=1';
  const params = [];

  if (assigneeType) {
    query += ' AND assignee_type = ?';
    params.push(assigneeType);
  }

  if (search) {
    const s = `%${search.trim().toLowerCase()}%`;
    query += ` AND (
      LOWER(asset_code) LIKE ? OR
      LOWER(assignee) LIKE ? OR
      LOWER(knox_id) LIKE ? OR
      LOWER(location) LIKE ? OR
      LOWER(purpose) LIKE ?
    )`;
    params.push(s, s, s, s, s);
  }

  query += ' ORDER BY created_at DESC';

  const rows = db.prepare(query).all(...params);
  let loans = rows.map(formatLoanRow);

  // Filter by dynamic status or category if requested
  if (status && status !== 'ALL') {
    loans = loans.filter((l) => l.status.toLowerCase() === status.toLowerCase());
  }

  if (category && category !== 'all') {
    if (category === 'scheduled') {
      loans = loans.filter((l) => l.status === 'Scheduled');
    } else if (category === 'loaned') {
      loans = loans.filter((l) => l.status === 'Active');
    } else if (category === 'overdue') {
      loans = loans.filter((l) => l.status === 'Overdue');
    } else if (category === 'returned') {
      loans = loans.filter((l) => l.status === 'Returned');
    }
  }

  return res.json({
    success: true,
    total: loans.length,
    loans,
  });
});

// POST /api/loans/:id/ready — mark an upcoming scheduled loan as ready for pickup
loansRouter.post('/:id/ready', authenticate, (req, res) => {
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
  if (!loan) return res.status(404).json({ success: false, error: 'Loan not found.' });
  if (computeLoanStatus(loan) !== 'Scheduled') {
    return res.status(409).json({ success: false, error: 'Only scheduled loans can be marked ready for pickup.' });
  }
  const ready = Boolean(req.body?.ready);
  db.prepare('UPDATE loans SET ready_for_pickup = ? WHERE id = ?').run(ready ? 1 : 0, loan.id);
  logAudit(ready ? 'MARK_LOAN_READY' : 'UNMARK_LOAN_READY', 'loans', loan.id, { readyForPickup: ready }, req.user);
  const updated = db.prepare('SELECT * FROM loans WHERE id = ?').get(loan.id);
  return res.json({ success: true, loan: formatLoanRow(updated) });
});

// GET /api/loans/overdue (Dedicated overdue triage)
loansRouter.get('/overdue', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM loans
    WHERE (return_date IS NULL OR return_date = '')
      AND (returned_date IS NULL OR returned_date = '')
      AND end_date < ?
    ORDER BY end_date ASC
  `).all(todayIso());

  const today = new Date(todayIso());
  const overdueLoans = rows.map((l) => {
    const formatted = formatLoanRow(l);
    const dueDate = new Date(l.end_date);
    const diffTime = Math.max(0, today - dueDate);
    const daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return {
      ...formatted,
      daysOverdue,
    };
  });

  return res.json({
    success: true,
    total: overdueLoans.length,
    loans: overdueLoans,
  });
});

// GET /api/loans/calendar (Calendar aggregated schedule)
loansRouter.get('/calendar', (req, res) => {
  const { month, year } = req.query || {};
  const loans = db.prepare('SELECT * FROM loans ORDER BY start_date ASC').all().map(formatLoanRow);

  // Group events by date
  const eventsByDate = {};
  for (const l of loans) {
    if (l.pickupDate) {
      eventsByDate[l.pickupDate] = eventsByDate[l.pickupDate] || [];
      eventsByDate[l.pickupDate].push({ type: 'pickup', loan: l });
    } else if (l.startDate) {
      eventsByDate[l.startDate] = eventsByDate[l.startDate] || [];
      eventsByDate[l.startDate].push({ type: 'scheduled', loan: l });
    }

    if (l.returnDate) {
      eventsByDate[l.returnDate] = eventsByDate[l.returnDate] || [];
      eventsByDate[l.returnDate].push({ type: 'returned', loan: l });
    } else if (l.endDate) {
      eventsByDate[l.endDate] = eventsByDate[l.endDate] || [];
      eventsByDate[l.endDate].push({ type: 'due', loan: l });
    }
  }

  return res.json({
    success: true,
    eventsByDate,
  });
});

// GET /api/loans/:id
loansRouter.get('/:id', (req, res) => {
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
  if (!loan) {
    return res.status(404).json({ success: false, error: 'Loan record not found.' });
  }

  const asset = db.prepare('SELECT * FROM assets WHERE code = ?').get(loan.asset_code);

  return res.json({
    success: true,
    loan: {
      ...formatLoanRow(loan),
      assetDetails: asset || null,
    },
  });
});

// POST /api/loans (Protected)
loansRouter.post('/', authenticate, (req, res) => {
  const {
    assetCode,
    assignee,
    department = '',
    knoxId = '',
    location = 'Head Office',
    ip = '',
    startDate = todayIso(),
    pickupDate = '',
    endDate = '',
    equipment = { Adapter: 1, Cable: 1 },
    others = '',
    note = '',
    purpose = '',
    assigneeType = 'Business traveler',
  } = req.body || {};

  const effectiveAssetCode = (assetCode || equipment?.Laptop || '').trim();
  if (!effectiveAssetCode || !assignee) {
    return res.status(400).json({ success: false, error: 'Asset number / Laptop and assignee are required.' });
  }

  const mergedEquipment = {
    ...equipment,
    Laptop: effectiveAssetCode,
  };

  const effectiveEndDate = tracksEndDate(assigneeType) ? endDate : '';
  const id = req.body.id || `loan-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const now = new Date().toISOString();
  const initialStatus = pickupDate ? (effectiveEndDate && effectiveEndDate < todayIso() ? 'Overdue' : 'Active') : 'Scheduled';

  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Insert loan
    db.prepare(`
      INSERT INTO loans (id, asset_code, assignee, department, knox_id, location, ip, start_date, pickup_date, end_date, return_date, returned_date, status, equipment_json, others, note, purpose, assignee_type, is_archived, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      effectiveAssetCode,
      assignee.trim(),
      department.trim(),
      knoxId.trim(),
      location.trim(),
      ip.trim(),
      startDate,
      pickupDate,
      effectiveEndDate,
      '',
      '',
      initialStatus,
      JSON.stringify(mergedEquipment),
      others,
      note,
      purpose,
      assigneeType,
      0,
      now
    );

    // 2. Synchronize asset if pickupDate is set
    const asset = db.prepare('SELECT id, owner FROM assets WHERE code = ?').get(effectiveAssetCode);
    if (asset) {
      if (pickupDate) {
        db.prepare(`
          UPDATE assets
          SET status = 'On loan', owner = ?, location = ?, department = ?, updated = ?
          WHERE code = ?
        `).run(assignee.trim(), location.trim(), department.trim(), todayIso(), effectiveAssetCode);

        db.prepare(`
          INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `hist-${Date.now()}`,
          effectiveAssetCode,
          asset.owner || 'None',
          assignee.trim(),
          pickupDate,
          `Device Loan (${assigneeType})`,
          purpose || note || `Issued by ${req.user.username}`,
          now
        );
      }
    } else {
      // Auto-create stub asset if asset doesn't exist
      const stubId = `ast-${Date.now()}`;
      db.prepare(`
        INSERT INTO assets (id, code, name, category, status, location, owner, department, condition, updated, created_at)
        VALUES (?, ?, ?, 'Laptop', ?, ?, ?, ?, 'Good', ?, ?)
      `).run(
        stubId,
        effectiveAssetCode,
        effectiveAssetCode,
        pickupDate ? 'On loan' : 'Available',
        location.trim(),
        pickupDate ? assignee.trim() : 'IT department',
        department.trim(),
        todayIso(),
        now
      );
    }

    // 3. Ensure employee exists in employees directory
    const existingEmp = db.prepare('SELECT id FROM employees WHERE LOWER(name) = LOWER(?)').get(assignee.trim());
    if (!existingEmp) {
      db.prepare(`
        INSERT INTO employees (id, name, department, position, knox_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(`emp-${Date.now()}`, assignee.trim(), department.trim(), assigneeType, knoxId.trim(), now);
    }

    db.exec('COMMIT;');

    logAudit('CREATE_LOAN', 'loans', id, { assetCode, assignee, initialStatus }, req.user);

    const newLoan = db.prepare('SELECT * FROM loans WHERE id = ?').get(id);
    return res.status(201).json({
      success: true,
      message: 'Loan checkout created successfully.',
      loan: formatLoanRow(newLoan),
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Failed to create loan:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/loans/:id (Protected: Edit loan record)
loansRouter.put('/:id', authenticate, (req, res) => {
  const existing = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Loan record not found.' });
  }

  const {
    assetCode,
    assignee = existing.assignee,
    department = existing.department,
    knoxId = existing.knox_id,
    location = existing.location,
    ip = existing.ip,
    startDate = existing.start_date,
    pickupDate = existing.pickup_date,
    endDate = existing.end_date,
    returnDate = existing.return_date,
    equipment = existing.equipment_json ? JSON.parse(existing.equipment_json) : {},
    others = existing.others,
    note = existing.note,
    purpose = existing.purpose,
    assigneeType = existing.assignee_type,
  } = req.body || {};

  const effectiveAssetCode = (assetCode || equipment?.Laptop || existing.asset_code || '').trim();
  const effectiveEndDate = tracksEndDate(assigneeType) ? endDate : '';
  const mergedEquipment = {
    ...equipment,
    Laptop: effectiveAssetCode,
  };

  const hasReturn = Boolean(returnDate);
  const hasPickup = Boolean(pickupDate);
  const today = todayIso();

  let computedStatus = 'Scheduled';
  let isArchived = 0;

  if (hasReturn) {
    computedStatus = 'Returned';
    isArchived = 1;
  } else if (hasPickup) {
    computedStatus = effectiveEndDate && effectiveEndDate < today ? 'Overdue' : 'Active';
    isArchived = 0;
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(`
      UPDATE loans
      SET asset_code = ?, assignee = ?, department = ?, knox_id = ?, location = ?, ip = ?,
          start_date = ?, pickup_date = ?, end_date = ?, return_date = ?, returned_date = ?,
          status = ?, equipment_json = ?, others = ?, note = ?, purpose = ?, assignee_type = ?, is_archived = ?
      WHERE id = ?
    `).run(
      effectiveAssetCode,
      assignee.trim(),
      department.trim(),
      knoxId.trim(),
      location.trim(),
      ip.trim(),
      startDate,
      pickupDate,
      effectiveEndDate,
      returnDate,
      returnDate,
      computedStatus,
      JSON.stringify(mergedEquipment),
      others,
      note,
      purpose,
      assigneeType,
      isArchived,
      existing.id
    );

    // Sync Asset
    const currentCode = effectiveAssetCode || existing.asset_code;
    if (currentCode) {
      if (hasReturn) {
        db.prepare(`
          UPDATE assets
          SET status = 'Available', owner = 'IT department', department = '', updated = ?
          WHERE code = ?
        `).run(today, currentCode);
      } else if (hasPickup) {
        db.prepare(`
          UPDATE assets
          SET status = 'On loan', owner = ?, location = ?, department = ?, updated = ?
          WHERE code = ?
        `).run(assignee.trim(), location.trim(), department.trim(), today, currentCode);
      } else {
        db.prepare(`
          UPDATE assets
          SET status = 'Available', owner = 'IT department', department = '', updated = ?
          WHERE code = ?
        `).run(today, currentCode);
      }
    }

    db.exec('COMMIT;');
    logAudit('UPDATE_LOAN', 'loans', existing.id, { computedStatus, assignee }, req.user);

    const updatedLoan = db.prepare('SELECT * FROM loans WHERE id = ?').get(existing.id);
    return res.json({
      success: true,
      message: 'Loan record updated successfully.',
      loan: formatLoanRow(updatedLoan),
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/loans/:id/pickup (Protected: Handover workflow)
loansRouter.post('/:id/pickup', authenticate, (req, res) => {
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
  if (!loan) {
    return res.status(404).json({ success: false, error: 'Loan not found.' });
  }

  const {
    pickupDate = todayIso(),
    startDate,
    endDate,
    equipment,
    note,
    others,
    location,
  } = req.body || {};

  const now = new Date().toISOString();
  const effectiveEndDate = tracksEndDate(loan.assignee_type)
    ? (endDate !== undefined ? endDate : loan.end_date)
    : '';
  const effectiveStartDate = startDate !== undefined ? startDate : loan.start_date;
  const nextStatus = effectiveEndDate && effectiveEndDate < todayIso() ? 'Overdue' : 'Active';

  let nextEquipmentJson = loan.equipment_json;
  if (equipment) {
    const prevEq = loan.equipment_json ? JSON.parse(loan.equipment_json) : {};
    nextEquipmentJson = JSON.stringify({ ...prevEq, ...equipment });
  }

  const nextNote = note !== undefined ? note : loan.note;
  const nextOthers = others !== undefined ? others : loan.others;
  const nextLocation = location !== undefined ? location : (loan.location || 'Head Office');

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(`
      UPDATE loans
      SET pickup_date = ?, start_date = ?, end_date = ?, status = ?,
          equipment_json = ?, note = ?, others = ?, location = ?,
          return_date = '', returned_date = '', is_archived = 0,
          ready_for_pickup = 0, returned_equipment_json = NULL, return_status = NULL
      WHERE id = ?
    `).run(
      pickupDate,
      effectiveStartDate,
      effectiveEndDate,
      nextStatus,
      nextEquipmentJson,
      nextNote,
      nextOthers,
      nextLocation,
      loan.id
    );

    // Update asset to 'On loan' and owner to assignee
    const asset = db.prepare('SELECT id, owner FROM assets WHERE code = ?').get(loan.asset_code);
    if (asset) {
      db.prepare(`
        UPDATE assets
        SET status = 'On loan', owner = ?, location = ?, updated = ?
        WHERE code = ?
      `).run(loan.assignee, nextLocation, todayIso(), loan.asset_code);

      db.prepare(`
        INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `hist-${randomUUID()}`,
        loan.asset_code,
        asset.owner || 'None',
        loan.assignee,
        pickupDate,
        'Device Handover',
        `Device handed over to ${loan.assignee} by ${req.user.username}`,
        now
      );
    }

    db.exec('COMMIT;');
    logAudit('PICKUP_LOAN', 'loans', loan.id, { pickupDate, nextStatus }, req.user);

    const updated = db.prepare('SELECT * FROM loans WHERE id = ?').get(loan.id);
    return res.json({
      success: true,
      message: `Device ${loan.asset_code} picked up by ${loan.assignee}.`,
      loan: formatLoanRow(updated),
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/loans/:id/revert-pickup (Protected: Undo handover)
loansRouter.post('/:id/revert-pickup', authenticate, (req, res) => {
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
  if (!loan) {
    return res.status(404).json({ success: false, error: 'Loan not found.' });
  }

  const now = new Date().toISOString();

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(`
      UPDATE loans
      SET pickup_date = '', status = 'Scheduled', is_archived = 0, ready_for_pickup = 0
      WHERE id = ?
    `).run(loan.id);

    // Revert asset to Available if no other active loans exist
    const otherActive = db.prepare(`
      SELECT id FROM loans
      WHERE asset_code = ? AND id != ? AND pickup_date != '' AND (return_date IS NULL OR return_date = '')
    `).get(loan.asset_code, loan.id);

    if (!otherActive) {
      db.prepare(`
        UPDATE assets
        SET status = 'Available', owner = 'IT department', department = '', updated = ?
        WHERE code = ?
      `).run(todayIso(), loan.asset_code);
    }

    db.exec('COMMIT;');
    logAudit('REVERT_PICKUP', 'loans', loan.id, {}, req.user);

    const updated = db.prepare('SELECT * FROM loans WHERE id = ?').get(loan.id);
    return res.json({
      success: true,
      message: `Pickup for ${loan.asset_code} reverted to Scheduled.`,
      loan: formatLoanRow(updated),
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/loans/:id/return (Protected: Return to IT department workflow)
loansRouter.post('/:id/return', authenticate, (req, res) => {
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
  if (!loan) {
    return res.status(404).json({ success: false, error: 'Loan not found.' });
  }

  const {
    returnDate = todayIso(),
    equipment,
    returnedEquipment,
    returnStatus = '',
    note,
    others,
  } = req.body || {};

  const now = new Date().toISOString();

  let nextEquipmentJson = loan.equipment_json;
  if (equipment && !returnedEquipment) {
    const prevEq = loan.equipment_json ? JSON.parse(loan.equipment_json) : {};
    nextEquipmentJson = JSON.stringify({ ...prevEq, ...equipment });
  }
  const nextReturnedEquipmentJson = returnedEquipment ? JSON.stringify(returnedEquipment) : loan.returned_equipment_json;

  const nextNote = note !== undefined ? note : loan.note;
  const nextOthers = others !== undefined ? others : loan.others;

  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Mark loan as Returned and archived
    db.prepare(`
      UPDATE loans
      SET status = 'Returned', return_date = ?, returned_date = ?,
          equipment_json = ?, returned_equipment_json = ?, return_status = ?,
          ready_for_pickup = 0, note = ?, others = ?, is_archived = 1
      WHERE id = ?
    `).run(
      returnDate,
      returnDate,
      nextEquipmentJson,
      nextReturnedEquipmentJson,
      returnStatus,
      nextNote,
      nextOthers,
      loan.id
    );

    // 2. Return asset to IT department with status 'Available'
    const asset = db.prepare('SELECT id, owner, status FROM assets WHERE code = ?').get(loan.asset_code);
    if (asset) {
      const targetStatus = ['Damaged', 'Under repair', 'Retired'].includes(asset.status) ? asset.status : 'Available';

      db.prepare(`
        UPDATE assets
        SET status = ?, owner = 'IT department', department = '', updated = ?
        WHERE code = ?
      `).run(targetStatus, todayIso(), loan.asset_code);

      // 3. Append unbroken audit history
      db.prepare(`
        INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `hist-${randomUUID()}`,
        loan.asset_code,
        loan.assignee,
        'IT department',
        returnDate,
        'Returned to IT department',
        nextNote ? `Device returned: ${nextNote}` : `Device returned & checked back into IT custody by ${req.user.username}`,
        now
      );
    }

    db.exec('COMMIT;');
    logAudit('RETURN_LOAN', 'loans', loan.id, { returnDate, returnStatus, returnedEquipment: returnedEquipment || null }, req.user);

    const updated = db.prepare('SELECT * FROM loans WHERE id = ?').get(loan.id);
    return res.json({
      success: true,
      message: `Asset ${loan.asset_code} successfully returned to IT department.`,
      loan: formatLoanRow(updated),
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/loans/:id/unarchive (Protected: Undo return / restore loan)
loansRouter.post('/:id/unarchive', authenticate, (req, res) => {
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
  if (!loan) {
    return res.status(404).json({ success: false, error: 'Loan not found.' });
  }

  const nextStatus = loan.pickup_date
    ? (loan.end_date && loan.end_date < todayIso() ? 'Overdue' : 'Active')
    : 'Scheduled';

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(`
      UPDATE loans
      SET return_date = '', returned_date = '', status = ?, is_archived = 0,
          returned_equipment_json = NULL, return_status = NULL
      WHERE id = ?
    `).run(nextStatus, loan.id);

    if (loan.pickup_date) {
      db.prepare(`
        UPDATE assets
        SET status = 'On loan', owner = ?, updated = ?
        WHERE code = ?
      `).run(loan.assignee, todayIso(), loan.asset_code);
    }

    db.exec('COMMIT;');
    logAudit('UNARCHIVE_LOAN', 'loans', loan.id, {}, req.user);

    const updated = db.prepare('SELECT * FROM loans WHERE id = ?').get(loan.id);
    return res.json({
      success: true,
      message: `Loan for ${loan.asset_code} unarchived.`,
      loan: formatLoanRow(updated),
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/loans/batch-return (Protected: Bulk return)
loansRouter.post('/batch-return', authenticate, (req, res) => {
  const { ids = [], returnDate = todayIso() } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'Array of loan IDs is required.' });
  }

  const now = new Date().toISOString();
  db.exec('BEGIN TRANSACTION;');
  try {
    const updateLoanStmt = db.prepare(`
      UPDATE loans
      SET status = 'Returned', return_date = ?, returned_date = ?, is_archived = 1
      WHERE id = ?
    `);

    const updateAssetStmt = db.prepare(`
      UPDATE assets
      SET status = 'Available', owner = 'IT department', department = '', updated = ?
      WHERE code = ?
    `);

    const insertHistStmt = db.prepare(`
      INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
      VALUES (?, ?, ?, 'IT department', ?, 'Returned to IT department', ?, ?)
    `);

    let returnedCount = 0;
    for (const id of ids) {
      const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(id);
      if (loan) {
        updateLoanStmt.run(returnDate, returnDate, loan.id);
        updateAssetStmt.run(todayIso(), loan.asset_code);
        insertHistStmt.run(
          `hist-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          loan.asset_code,
          loan.assignee,
          returnDate,
          `Batch return completed by ${req.user.username}`,
          now
        );
        returnedCount++;
      }
    }

    db.exec('COMMIT;');
    logAudit('BATCH_RETURN_LOANS', 'loans', null, { returnedCount, ids }, req.user);

    return res.json({
      success: true,
      message: `Successfully returned ${returnedCount} loans to IT department.`,
      count: returnedCount,
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/loans/batch-delete (Protected: Bulk delete)
loansRouter.post('/batch-delete', authenticate, (req, res) => {
  const { ids = [] } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'Array of loan IDs is required.' });
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    const affectedAssetCodes = new Set();
    const deleteLoanStmt = db.prepare('DELETE FROM loans WHERE id = ?');

    for (const id of ids) {
      const loan = db.prepare('SELECT asset_code FROM loans WHERE id = ?').get(id);
      if (loan) {
        affectedAssetCodes.add(loan.asset_code);
        deleteLoanStmt.run(id);
      }
    }

    // Check affected assets and restore to Available if no other active loans exist
    const checkActive = db.prepare(`
      SELECT id FROM loans
      WHERE asset_code = ? AND pickup_date != '' AND (return_date IS NULL OR return_date = '')
    `);

    for (const code of affectedAssetCodes) {
      if (!checkActive.get(code)) {
        db.prepare(`
          UPDATE assets
          SET status = 'Available', owner = 'IT department', updated = ?
          WHERE code = ?
        `).run(todayIso(), code);
      }
    }

    db.exec('COMMIT;');
    logAudit('BATCH_DELETE_LOANS', 'loans', null, { count: ids.length }, req.user);

    return res.json({
      success: true,
      message: `Successfully deleted ${ids.length} loan records.`,
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/loans/:id (Protected: Delete single loan)
loansRouter.delete('/:id', authenticate, (req, res) => {
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
  if (!loan) {
    return res.status(404).json({ success: false, error: 'Loan not found.' });
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare('DELETE FROM loans WHERE id = ?').run(loan.id);

    // Reconcile asset if no remaining active loan
    const otherActive = db.prepare(`
      SELECT id FROM loans
      WHERE asset_code = ? AND pickup_date != '' AND (return_date IS NULL OR return_date = '')
    `).get(loan.asset_code);

    if (!otherActive) {
      db.prepare(`
        UPDATE assets
        SET status = 'Available', owner = 'IT department', updated = ?
        WHERE code = ?
      `).run(todayIso(), loan.asset_code);
    }

    db.exec('COMMIT;');
    logAudit('DELETE_LOAN', 'loans', loan.id, { assetCode: loan.asset_code }, req.user);

    return res.json({ success: true, message: 'Loan deleted successfully.' });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ success: false, error: err.message });
  }
});
