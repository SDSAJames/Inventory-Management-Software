import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { db, logAudit } from '../db/database.js';
import { authenticate } from '../middleware/auth.js';
import { tracksEndDate } from '../loanRules.js';

import { todayIso } from '../lib/dates.js';
import { computeLoanStatus, formatLoanRow } from '../lib/loanRows.js';
import { DEFAULT_LOCATION } from '../../shared/referenceData.js';
import { getAssetStatusForLoanEdit, normalizeLocation } from '../../shared/assetRules.js';
import { returnAssetToIt } from '../lib/assetLoans.js';
import { assetLocationForWrite, ensureLocation } from '../lib/assetLocations.js';
import { transferLoan } from '../lib/loanTransfer.js';

export const loansRouter = Router();
loansRouter.post('/:id/transfer', authenticate, (req, res) => {
  try {
    const targetId = transferLoan(db, req.params.id, req.body || {});
    logAudit('TRANSFER_LOAN', 'loans', req.params.id, { targetId }, req.user);
    return res.json({ success: true, targetId });
  } catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});

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
    location = DEFAULT_LOCATION,
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

  const effectiveAssetCode = String(assetCode || equipment?.Laptop || '').trim();
  const effectiveAssignee = String(assignee || '').trim();
  const effectiveKnoxId = String(knoxId || '').trim();
  if (!effectiveKnoxId) {
    return res.status(400).json({ success: false, error: 'Knox ID is required.' });
  }

  const mergedEquipment = {
    ...equipment,
    ...(effectiveAssetCode ? { Laptop: effectiveAssetCode } : {}),
  };

  const effectiveEndDate = tracksEndDate(assigneeType) ? endDate : '';
  const effectiveLocation = normalizeLocation(location);
  const id = req.body.id || `loan-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const now = new Date().toISOString();
  const initialStatus = pickupDate ? (effectiveEndDate && effectiveEndDate < todayIso() ? 'Overdue' : 'Active') : 'Scheduled';
  const assetStatus = tracksEndDate(assigneeType) ? 'On loan' : 'Assigned';

  db.exec('BEGIN TRANSACTION;');
  try {
    ensureLocation(db, effectiveLocation);

    // 1. Insert loan
    db.prepare(`
      INSERT INTO loans (id, asset_code, assignee, department, knox_id, location, ip, start_date, pickup_date, end_date, return_date, returned_date, status, equipment_json, others, note, purpose, assignee_type, is_archived, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      effectiveAssetCode,
      effectiveAssignee,
      department.trim(),
      effectiveKnoxId,
      effectiveLocation,
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
    const asset = effectiveAssetCode
      ? db.prepare('SELECT id, owner FROM assets WHERE code = ?').get(effectiveAssetCode)
      : null;
    if (asset) {
      if (pickupDate) {
        db.prepare(`
          UPDATE assets
          SET status = ?, owner = ?, location = ?, department = ?, updated = ?
          WHERE code = ?
        `).run(assetStatus, effectiveAssignee, normalizeLocation(location), department.trim(), todayIso(), effectiveAssetCode);

        db.prepare(`
          INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `hist-${Date.now()}`,
          effectiveAssetCode,
          asset.owner || 'None',
          effectiveAssignee,
          pickupDate,
          `Device Loan (${assigneeType})`,
          purpose || note || `Issued by ${req.user.username}`,
          now
        );
      }
    } else if (effectiveAssetCode && pickupDate) {
      // Auto-create stub asset if asset doesn't exist
      const stubId = `ast-${Date.now()}`;
      db.prepare(`
        INSERT INTO assets (id, code, name, category, status, location, owner, department, condition, updated, created_at)
        VALUES (?, ?, ?, 'Laptop', ?, ?, ?, ?, 'Good', ?, ?)
      `).run(
        stubId,
        effectiveAssetCode,
        effectiveAssetCode,
        pickupDate ? assetStatus : 'Available',
        normalizeLocation(location),
        pickupDate ? effectiveAssignee : 'IT department',
        department.trim(),
        todayIso(),
        now
      );

      if (pickupDate) {
        db.prepare(`
          INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `hist-${randomUUID()}`,
          effectiveAssetCode,
          'None',
          effectiveAssignee,
          pickupDate,
          'Device Handover',
          `Device handed over to ${effectiveAssignee} by ${req.user.username}`,
          now
        );
      }
    }

    const monitorCode = String(mergedEquipment.Monitor || '').trim();
    if (pickupDate && monitorCode && monitorCode !== '0' && monitorCode !== effectiveAssetCode) {
      const monitor = db.prepare('SELECT id, owner FROM assets WHERE code = ?').get(monitorCode);
      if (monitor) {
        db.prepare(`
          UPDATE assets
          SET status = ?, owner = ?, location = ?, department = ?, updated = ?
          WHERE code = ?
        `).run(assetStatus, effectiveAssignee, normalizeLocation(location), department.trim(), todayIso(), monitorCode);

        db.prepare(`
          INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `hist-${randomUUID()}`,
          monitorCode,
          monitor.owner || 'None',
          effectiveAssignee,
          pickupDate,
          'Device Handover',
          `Monitor handed over to ${effectiveAssignee} by ${req.user.username}`,
          now
        );
      }
    }

    // 3. Ensure employee exists in employees directory
    const existingEmp = effectiveAssignee
      ? db.prepare('SELECT id FROM employees WHERE LOWER(name) = LOWER(?)').get(effectiveAssignee)
      : null;
    if (effectiveAssignee && !existingEmp) {
      db.prepare(`
        INSERT INTO employees (id, name, department, position, knox_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(`emp-${Date.now()}`, effectiveAssignee, department.trim(), assigneeType, effectiveKnoxId, now);
    }

    db.exec('COMMIT;');

    logAudit('CREATE_LOAN', 'loans', id, { assetCode: effectiveAssetCode, assignee: effectiveAssignee, initialStatus }, req.user);

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
  const effectiveLocation = normalizeLocation(location);
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
    ensureLocation(db, effectiveLocation);

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
      effectiveLocation,
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
        returnAssetToIt(db, currentCode, today);
      } else if (hasPickup) {
        const asset = db.prepare('SELECT status FROM assets WHERE code = ?').get(currentCode);
        const targetStatus = getAssetStatusForLoanEdit(asset?.status, existing, {
          assetCode: currentCode, pickupDate, returnDate, status: computedStatus, isArchived: Boolean(isArchived),
        });
        db.prepare(`
          UPDATE assets
          SET status = ?, owner = ?, location = ?, department = ?, updated = ?
          WHERE code = ?
        `).run(targetStatus, assignee.trim(), assetLocationForWrite(db, targetStatus, effectiveLocation), department.trim(), today, currentCode);
      } else if (existing.pickup_date || existing.return_date || existing.returned_date) {
        returnAssetToIt(db, currentCode, today);
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

  const effectiveAssetCode = String(req.body?.assetCode ?? equipment?.Laptop ?? loan.asset_code ?? '').trim();
  if (equipment?.RequestedPC && !effectiveAssetCode) return res.status(400).json({ success: false, error: 'Select the PC being picked up' });
  if (equipment?.RequestedMonitor && (!equipment.Monitor || equipment.Monitor === '0')) return res.status(400).json({ success: false, error: 'Select the monitor being picked up' });
  if (effectiveAssetCode && !db.prepare('SELECT id FROM assets WHERE code = ?').get(effectiveAssetCode)) return res.status(400).json({ success: false, error: 'Select a registered PC asset' });
  const now = new Date().toISOString();
  const effectiveEndDate = tracksEndDate(loan.assignee_type)
    ? (endDate !== undefined ? endDate : loan.end_date)
    : '';
  const effectiveStartDate = startDate !== undefined ? startDate : loan.start_date;
  const nextStatus = effectiveEndDate && effectiveEndDate < todayIso() ? 'Overdue' : 'Active';

  let nextEquipmentJson = loan.equipment_json;
  if (equipment) {
    const prevEq = loan.equipment_json ? JSON.parse(loan.equipment_json) : {};
    nextEquipmentJson = JSON.stringify({ ...prevEq, ...equipment, Laptop: effectiveAssetCode });
  }

  const nextNote = note !== undefined ? note : loan.note;
  const nextOthers = others !== undefined ? others : loan.others;
  const nextLocation = normalizeLocation(location !== undefined ? location : loan.location);

  db.exec('BEGIN TRANSACTION;');
  try {
    ensureLocation(db, nextLocation);

    db.prepare(`
      UPDATE loans
      SET asset_code = ?, pickup_date = ?, start_date = ?, end_date = ?, status = ?,
          equipment_json = ?, note = ?, others = ?, location = ?,
          return_date = '', returned_date = '', is_archived = 0,
          ready_for_pickup = 0, returned_equipment_json = NULL, return_status = NULL
      WHERE id = ?
    `).run(
      effectiveAssetCode,
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

    // Update every registered device in the handover and record custody history.
    const handoverAssetCodes = new Set(
      [effectiveAssetCode, equipment?.Monitor]
        .map((code) => String(code || '').trim())
        .filter((code) => code && code !== '0'),
    );
    const assetStatus = tracksEndDate(loan.assignee_type) ? 'On loan' : 'Assigned';
    for (const assetCode of handoverAssetCodes) {
      const asset = db.prepare('SELECT id, owner FROM assets WHERE code = ?').get(assetCode);
      if (!asset) continue;
      db.prepare(`
        UPDATE assets
        SET status = ?, owner = ?, location = ?, updated = ?
        WHERE code = ?
      `).run(assetStatus, loan.assignee, nextLocation, todayIso(), assetCode);

      db.prepare(`
        INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `hist-${randomUUID()}`,
        assetCode,
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
      returnAssetToIt(db, loan.asset_code, todayIso());
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
    returnedAssetCode,
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

    // 2. Return the devices actually checked in, not necessarily the original laptop.
    const hasLaptopReturnDetail = Boolean(returnedEquipment && Object.hasOwn(returnedEquipment, 'Laptop'));
    const actualLaptopCode = String(
      hasLaptopReturnDetail ? returnedEquipment.Laptop || '' : returnedAssetCode || loan.asset_code || '',
    ).trim();
    const returnedAssetCodes = new Set(
      [actualLaptopCode, returnedEquipment?.Monitor]
        .map((code) => String(code || '').trim())
        .filter((code) => code && code !== '0'),
    );
    for (const assetCode of returnedAssetCodes) {
      const asset = db.prepare('SELECT id, owner, status, location FROM assets WHERE code = ?').get(assetCode);
      if (!asset) continue;
      returnAssetToIt(db, assetCode, todayIso());

      db.prepare(`
        INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `hist-${randomUUID()}`,
        assetCode,
        asset.owner || loan.assignee,
        'IT department',
        returnDate,
        'Device Returned',
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

    const insertHistStmt = db.prepare(`
      INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at)
      VALUES (?, ?, ?, 'IT department', ?, 'Returned to IT department', ?, ?)
    `);

    let returnedCount = 0;
    for (const id of ids) {
      const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(id);
      if (loan) {
        updateLoanStmt.run(returnDate, returnDate, loan.id);
        returnAssetToIt(db, loan.asset_code, todayIso());
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
        returnAssetToIt(db, code, todayIso(), { clearDepartment: false });
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
      returnAssetToIt(db, loan.asset_code, todayIso(), { clearDepartment: false });
    }

    db.exec('COMMIT;');
    logAudit('DELETE_LOAN', 'loans', loan.id, { assetCode: loan.asset_code }, req.user);

    return res.json({ success: true, message: 'Loan deleted successfully.' });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ success: false, error: err.message });
  }
});
