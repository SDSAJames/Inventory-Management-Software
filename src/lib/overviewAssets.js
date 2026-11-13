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

const labels = { code: 'Asset number', category: 'Category', model: 'Model', serial: 'Serial number', status: 'Status', owner: 'Current holder', department: 'Department', location: 'Location', purchase_date: 'Purchase date', warranty_expiration_date: 'Warranty expiration date', condition: 'Condition', notes: 'Notes' };
export function latestAssetChange(asset) {
  let activity = asset.latestChange || asset.latest_change;
  try { if (typeof activity === 'string') activity = JSON.parse(activity); } catch { activity = null; }
  const summary = activity?.kind === 'created' ? 'Asset registered' : activity?.changes?.map(({ field, previous, next }) =>
    `${labels[field] || field}: ${previous || '—'} → ${next || '—'}`).join('; ') || 'Earlier update; change details not recorded';
  const rawTime = asset.changedAt || asset.changed_at || asset.updated || '';
  const seconds = rawTime.match(/[T ]\d{2}:\d{2}:(\d{2})/);
  return { summary, time: formatCalendarDateTime(rawTime) + (seconds ? ':' + seconds[1] : '') + (/^\d{4}-\d{2}-\d{2}$/.test(rawTime) ? ' (time not recorded)' : '') };
}

export function applyAssetActivity(assets, activity = []) {
  const updates = new Map(activity.map((entry) => [entry.id, entry]));
  return assets.map((asset) => updates.has(asset.id) ? { ...asset, ...updates.get(asset.id) } : asset);
}
