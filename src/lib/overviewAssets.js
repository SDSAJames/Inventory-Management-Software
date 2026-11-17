import { getAssetLocation } from '../../shared/assetRules.js';
import { isLoanReturned } from '../../shared/loanRules.js';
import { formatCalendarDateTime } from '../../shared/dateTime.js';

export function assetMix(assets = []) {
  const counts = new Map();
  for (const asset of assets) {
    const category = String(asset.category || 'Uncategorized').trim();
    const label = /^laptop(?:\s*\([^)]*\))?$/i.test(category) ? 'Laptop' : category;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

const labels = { assignee_type: 'Borrower type', assignee: 'Assignee', knox_id: 'Knox ID', start_date: 'Start date', pickup_date: 'Pickup date', end_date: 'Due date', return_date: 'Return date', return_status: 'Return status', equipment_json: 'Equipment', returned_equipment_json: 'Returned equipment', others: 'Other equipment', note: 'Note', purpose: 'Purpose', ready_for_pickup: 'Pickup readiness', ip: 'IP address', code: 'Asset number', category: 'Category', model: 'Model', serial: 'Serial number', status: 'Status', owner: 'Current holder', department: 'Department', location: 'Location', purchase_date: 'Purchase date', warranty_expiration_date: 'Warranty expiration date', condition: 'Condition', notes: 'Notes' };
export function latestAssetChange(asset) {
  let activity = asset.activitySuppressed ? null : asset.latestChange || asset.latest_change;
  try { if (typeof activity === 'string') activity = JSON.parse(activity); } catch { activity = null; }
  const summary = activity?.kind === 'created' ? (asset.activitySource ? 'Record created' : 'Asset registered') : activity?.changes?.map(({ field, previous, next }) =>
    `${labels[field] || field}: ${previous || '—'} → ${next || '—'}`).join('; ') || 'Earlier update; change details not recorded';
  const rawTime = recordedActivityTime(asset);
  const seconds = rawTime.match(/[T ]\d{2}:\d{2}:(\d{2})/);
  let actor = asset.changedBy || asset.changed_by;
  try { if (typeof actor === 'string') actor = JSON.parse(actor); } catch { actor = { username: actor }; }
  const identity = actor?.knoxId || actor?.username || '';
  const name = actor?.name || identity;
  const changedBy = name ? name + (identity && name !== identity ? ' (' + identity + ')' : '') : 'Not recorded';
  return { summary: asset.activitySource ? asset.activitySource + ': ' + summary : summary, changedBy, time: formatCalendarDateTime(rawTime) + (seconds ? ':' + seconds[1] : '') };
}

export function applyAssetActivity(assets, activity = []) {
  const updates = new Map(activity.map((entry) => [entry.id, entry]));
  return assets.map((asset) => updates.has(asset.id) ? { ...asset, ...updates.get(asset.id) } : asset);
}


/** Link the newest assignment activity to each real PC/monitor without changing asset custody. */
export function assetsWithCustodyActivity(assets = [], loans = []) {
  const byCode = new Map();
  const activeEmployeeCodes = new Set();
  for (const loan of loans) {
    if (String(loan.assigneeType || '').toLowerCase() === 'employee' && loan.pickupDate && !isLoanReturned(loan)) {
      for (const code of [loan.assetCode, loan.equipment?.Laptop, loan.equipment?.Monitor]) if (code) activeEmployeeCodes.add(String(code).trim().toLowerCase());
    }
    const activity = loan.latestChange || loan.latest_change;
    const time = recordedActivityTime(loan);
    if (!activity || !time) continue;
    for (const code of new Set([loan.assetCode || loan.asset_code, loan.equipment?.Laptop, loan.equipment?.Monitor])) {
      const key = String(code || '').trim().toLowerCase();
      if (!key || key === '0' || key === '1') continue;
      const previous = byCode.get(key);
      if (!previous || Date.parse(time) >= Date.parse(recordedActivityTime(previous))) byCode.set(key, loan);
    }
  }
  return assets.map((asset) => {
    const activeEmployee = activeEmployeeCodes.has(String(asset.code || '').trim().toLowerCase());
    if (activeEmployee && asset.status === 'Assigned' && !(asset.changedBy || asset.changed_by)) {
      // Earlier reconciliation versions recorded an incorrect employee-to-loan status change.
      let activity;
      try { const raw = asset.latestChange || asset.latest_change; activity = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { activity = null; }
      const changes = activity?.changes?.filter((change) => !(change.field === 'status' && change.next === 'On loan'));
      if (changes && changes.length !== activity.changes.length) asset = { ...asset, latestChange: JSON.stringify({ ...activity, changes }), activitySuppressed: changes.length === 0 };
    }
    const loan = byCode.get(String(asset.code || '').trim().toLowerCase());
    if (!loan || (recordedActivityTime(asset) && Date.parse(recordedActivityTime(loan)) < Date.parse(recordedActivityTime(asset)))) return asset;
    return { ...asset, latestChange: loan.latestChange || loan.latest_change, changedAt: loan.changedAt || loan.changed_at,
      changedBy: loan.changedBy || loan.changed_by || '', activitySuppressed: false, activitySource: 'Assignment / loan' + (loan.knoxId ? ' (' + loan.knoxId + ')' : '') };
  });
}


/** Date-only or absent legacy values are unknown, never replaced with the current date. */
export function recordedActivityTime(record = {}) {
  if (record.activitySuppressed) return '';
  for (const value of [record.changedAt, record.changed_at, record.updated]) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && Number.isFinite(Date.parse(value))) return value;
  }
  return '';
}

export function assetLocationMix(assets = []) {
  const groups = new Map();
  for (const asset of assets) {
    const label = getAssetLocation(asset.status, asset.location, '') || 'Unspecified';
    const key = label.toLowerCase();
    if (!groups.has(key)) groups.set(key, { label, count: 0 });
    groups.get(key).count += 1;
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'en', { numeric: true, sensitivity: 'base' }));
}
