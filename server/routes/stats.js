import { Router } from 'express';
import { db } from '../db/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';

export const statsRouter = Router();

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/stats/dashboard (Public or Authenticated)
statsRouter.get('/dashboard', (req, res) => {
  const today = todayIso();

  // 1. Asset status metrics
  const totalAssets = db.prepare('SELECT COUNT(*) as count FROM assets').get().count;
  const statusRows = db.prepare('SELECT status, COUNT(*) as count FROM assets GROUP BY status').all();
  const statusCounts = {
    Available: 0,
    Assigned: 0,
    'On loan': 0,
    Damaged: 0,
    'Under repair': 0,
    Retired: 0,
  };
  statusRows.forEach((r) => {
    if (r.status in statusCounts) {
      statusCounts[r.status] = r.count;
    }
  });

  // 2. Loan metrics
  const loans = db.prepare('SELECT * FROM loans').all();
  let scheduledLoans = 0;
  let activeLoans = 0;
  let overdueLoans = 0;
  let returnedLoans = 0;

  loans.forEach((l) => {
    const isReturned = Boolean(l.return_date || l.returned_date || l.status === 'Returned' || l.is_archived);
    if (isReturned) {
      returnedLoans++;
      return;
    }
    const hasPickedUp = Boolean(l.pickup_date || l.status === 'Active');
    const isOverdue = Boolean(l.end_date && l.end_date < today);

    if (isOverdue) {
      overdueLoans++;
    } else if (hasPickedUp) {
      activeLoans++;
    } else {
      scheduledLoans++;
    }
  });

  // 3. Category distribution
  const categoryDistribution = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM assets
    GROUP BY category
    ORDER BY count DESC
  `).all();

  // 4. Location distribution
  const locationDistribution = db.prepare(`
    SELECT location, COUNT(*) as count
    FROM assets
    WHERE location IS NOT NULL AND location != ''
    GROUP BY location
    ORDER BY count DESC
  `).all();

  // 5. Department distribution
  const departmentDistribution = db.prepare(`
    SELECT department, COUNT(*) as count
    FROM assets
    WHERE department IS NOT NULL AND department != ''
    GROUP BY department
    ORDER BY count DESC
  `).all();

  // 6. Recent activity (latest 10 ownership transfer events)
  const recentHistory = db.prepare(`
    SELECT id, asset_code, previous_owner, new_owner, date, reason, notes, created_at
    FROM ownership_history
    ORDER BY date DESC, created_at DESC
    LIMIT 10
  `).all().map((h) => ({
    id: h.id,
    assetCode: h.asset_code,
    previousOwner: h.previous_owner,
    newOwner: h.new_owner,
    date: h.date,
    reason: h.reason,
    notes: h.notes,
    createdAt: h.created_at,
  }));

  // 7. Directory counts
  const totalEmployees = db.prepare('SELECT COUNT(*) as count FROM employees').get().count;
  const totalLocations = db.prepare('SELECT COUNT(*) as count FROM locations').get().count;
  const totalDepartments = db.prepare('SELECT COUNT(*) as count FROM departments').get().count;

  return res.json({
    success: true,
    metrics: {
      assets: {
        total: totalAssets,
        available: statusCounts.Available,
        assigned: statusCounts.Assigned,
        onLoan: statusCounts['On loan'],
        damaged: statusCounts.Damaged,
        underRepair: statusCounts['Under repair'],
        retired: statusCounts.Retired,
      },
      loans: {
        total: loans.length,
        scheduled: scheduledLoans,
        active: activeLoans,
        overdue: overdueLoans,
        returned: returnedLoans,
      },
      directory: {
        employees: totalEmployees,
        locations: totalLocations,
        departments: totalDepartments,
      },
      categories: categoryDistribution,
      locations: locationDistribution,
      departments: departmentDistribution,
      recentActivity: recentHistory,
    },
  });
});

// GET /api/stats/audit-logs (Protected: Admin only)
statsRouter.get('/audit-logs', authenticate, requireRole('ADMIN'), (req, res) => {
  const { limit = 50, page = 1 } = req.query || {};
  const limitNum = parseInt(limit, 10) || 50;
  const offset = ((parseInt(page, 10) || 1) - 1) * limitNum;

  const total = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get().count;
  const logs = db.prepare(`
    SELECT * FROM audit_logs
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(limitNum, offset).map((log) => ({
    ...log,
    details: log.details_json ? JSON.parse(log.details_json) : {},
  }));

  return res.json({
    success: true,
    total,
    page: parseInt(page, 10) || 1,
    limit: limitNum,
    logs,
  });
});
