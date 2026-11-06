import { randomUUID } from 'node:crypto';
import { splitLoanEquipment, equipmentForTransferredPickup } from '../../shared/loanTransfer.js';
import { isBusinessTravelerType, isLoanReturned } from '../../shared/loanRules.js';
import { formatCalendarDateTime } from '../../shared/dateTime.js';

export function transferLoan(database, id, { knoxId, assignee = '', assigneeType = 'Employee', selection = {}, scheduleId, startDate, endDate, transferDate, timeZone = 'UTC' }) {
  const source = database.prepare('SELECT * FROM loans WHERE id = ?').get(id);
  if (!source || !source.pickup_date || isLoanReturned(source)) throw new Error('Only picked-up, outstanding equipment can be transferred');
  const schedule = scheduleId ? database.prepare('SELECT * FROM loans WHERE id = ?').get(scheduleId) : null;
  if (scheduleId && (!schedule || schedule.pickup_date || isLoanReturned(schedule))) throw new Error('Choose an outstanding schedule awaiting pickup');
  const targetKnox = String(schedule ? schedule.knox_id : knoxId || '').trim();
  if (!targetKnox || targetKnox.toLowerCase() === String(source.knox_id).toLowerCase()) throw new Error('Enter a different new owner Knox ID');
  const equipment = { ...JSON.parse(source.equipment_json || '{}'), Laptop: source.asset_code || '', Others: source.others || '' };
  const { remaining, transferred, complete } = splitLoanEquipment(equipment, selection);
  const recordedAt = new Date().toISOString();
  if (transferDate !== undefined && (typeof transferDate !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(transferDate) || Number.isNaN(Date.parse(transferDate)))) throw new Error('Enter a valid transfer date and time');
  const now = transferDate === undefined ? recordedAt : new Date(transferDate).toISOString();
  const localTimestamp = formatCalendarDateTime(now, { timeZone });
  const zoneLabel = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(new Date(now)).find((part) => part.type === 'timeZoneName').value;
  const transferTime = `${localTimestamp} ${zoneLabel}`;
  const targetAssignee = String(schedule ? schedule.assignee || '' : assignee).trim();
  const targetType = isBusinessTravelerType(schedule ? schedule.assignee_type : assigneeType) ? 'Business traveler' : 'Employee';
  const targetStart = startDate ?? schedule?.start_date ?? localTimestamp.slice(0, 10);
  const targetEnd = targetType === 'Business traveler' ? endDate ?? schedule?.end_date ?? '' : '';
  const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (targetType === 'Business traveler' && (!validDate(targetStart) || !validDate(targetEnd))) throw new Error('Business traveler transfers require valid start and end dates');
  if (targetType === 'Business traveler' && targetEnd < targetStart) throw new Error('End date cannot be earlier than start date');
  const targetEquipment = equipmentForTransferredPickup(JSON.parse(schedule?.equipment_json || '{}'), transferred);
  const transferredSummary = Object.entries(transferred)
    .map(([key, value]) => `${key === 'Dongle' ? 'USB Dongle' : key}: ${value}`)
    .join(', ');
  const recipientLabel = targetAssignee && targetAssignee !== targetKnox ? `${targetAssignee} (${targetKnox}, ${targetType})` : `${targetKnox} (${targetType})`;
  const sourceLabel = source.assignee && source.assignee !== source.knox_id ? `${source.assignee} (${source.knox_id})` : source.knox_id;
  const sourceTransferNote = `Transferred ${transferredSummary} to ${recipientLabel} on ${transferTime}`;
  const targetTransferNote = `Pickup by transfer: received ${transferredSummary} from ${sourceLabel} on ${transferTime}`;
  const target = {
    ...source,
    ...(schedule || {}),
    id: schedule?.id || `loan-${randomUUID()}`,
    asset_code: transferred.Laptop || '',
    knox_id: targetKnox,
    assignee: targetAssignee,
    assignee_type: targetType,
    end_date: targetEnd,
    pickup_date: now,
    start_date: targetStart,
    status: targetEnd && targetEnd < localTimestamp.slice(0, 10) ? 'Overdue' : 'Active',
    equipment_json: JSON.stringify(targetEquipment),
    others: transferred.Others || '',
    note: [schedule?.note, targetTransferNote].filter(Boolean).join('\n'),
    return_date: '',
    returned_date: '',
    returned_equipment_json: null,
    return_status: '',
    is_archived: 0,
    ready_for_pickup: 0,
    created_at: schedule?.created_at || recordedAt,
  };
  database.exec('SAVEPOINT loan_transfer');
  try {
    const columns = Object.keys(target);
    if (schedule) {
      const updates = columns.filter((key) => key !== 'id');
      database.prepare(`UPDATE loans SET ${updates.map((key) => `${key} = ?`).join(',')} WHERE id = ?`).run(...updates.map((key) => target[key]), target.id);
    } else {
      database.prepare(`INSERT INTO loans (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map((key) => target[key]));
    }
    database.prepare('UPDATE loans SET asset_code = ?, equipment_json = ?, others = ?, note = ?, status = ?, is_archived = ? WHERE id = ?').run(
      complete ? source.asset_code : remaining.Laptop || '',
      complete ? source.equipment_json || JSON.stringify(equipment) : JSON.stringify(remaining),
      complete ? source.others || '' : remaining.Others || '',
      [source.note, sourceTransferNote].filter(Boolean).join('\n'),
      complete ? 'Transferred' : source.status,
      complete ? 1 : 0,
      source.id,
    );
    for (const key of ['Laptop', 'Monitor']) {
      if (!transferred[key]) continue;
      const asset = database.prepare('SELECT * FROM assets WHERE code = ? COLLATE NOCASE').get(transferred[key]);
      if (!asset) continue;
      database.prepare('UPDATE assets SET owner = ?, status = ?, location = ?, department = ?, updated = ? WHERE id = ?').run(
        target.assignee || targetKnox,
        targetType === 'Business traveler' ? 'On loan' : 'Assigned',
        target.location || asset.location || '',
        target.department || '',
        now.slice(0, 10),
        asset.id,
      );
      database.prepare('INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), asset.code, asset.owner || source.assignee || source.knox_id, target.assignee || targetKnox, now, 'Loan equipment transfer', target.note, now);
    }
    database.exec('RELEASE SAVEPOINT loan_transfer');
    return target.id;
  } catch (error) { database.exec('ROLLBACK TO SAVEPOINT loan_transfer'); database.exec('RELEASE SAVEPOINT loan_transfer'); throw error; }
}
