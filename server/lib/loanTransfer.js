import { trimDirectoryFields } from '../../shared/directoryFields.js';
import { randomUUID } from 'node:crypto';
import { splitLoanEquipment, equipmentForTransferredPickup } from '../../shared/loanTransfer.js';
import { borrowerType, tracksEndDate, custodyStatusForBorrower, isLoanReturned } from '../../shared/loanRules.js';
import { normalizeLocation } from '../../shared/assetRules.js';
import { formatCalendarDateTime } from '../../shared/dateTime.js';
import { ensureLocation } from './assetLocations.js';

export function transferLoan(database, id, { knoxId, assignee = '', assigneeType = 'Employee', location, selection = {}, scheduleId, startDate, endDate, transferDate, timeZone = 'UTC' }) {
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
  const targetType = borrowerType(schedule ? schedule.assignee_type : assigneeType);
  const targetLocation = normalizeLocation(String(location ?? '').trim() || schedule?.location || source.location || '', '');
  const targetStart = startDate ?? schedule?.start_date ?? localTimestamp.slice(0, 10);
  const targetEnd = tracksEndDate(targetType) ? endDate ?? schedule?.end_date ?? '' : '';
  const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (tracksEndDate(targetType) && (!validDate(targetStart) || !validDate(targetEnd))) throw new Error(targetType + ' transfers require valid start and end dates');
  if (tracksEndDate(targetType) && targetEnd < targetStart) throw new Error('End date cannot be earlier than start date');
  const targetEquipment = equipmentForTransferredPickup(JSON.parse(schedule?.equipment_json || '{}'), transferred);
  const transferredSummary = Object.entries(transferred)
    .map(([key, value]) => `${key === 'Dongle' ? 'USB Dongle' : key}: ${value}`)
    .join(', ');
  const recipientLabel = targetAssignee && targetAssignee !== targetKnox ? `${targetAssignee} (${targetKnox}, ${targetType})` : `${targetKnox} (${targetType})`;
  const sourceLabel = source.assignee && source.assignee !== source.knox_id ? `${source.assignee} (${source.knox_id})` : source.knox_id;
  const sourceTransferNote = `Transferred ${transferredSummary} to ${recipientLabel} on ${transferTime}`;
  const targetTransferNote = `Pickup by transfer: received ${transferredSummary} from ${sourceLabel} on ${transferTime}`;
  const transferGroupId = `transfer-${randomUUID()}`;
  const transferRecordId = complete ? source.id : `loan-${randomUUID()}`;
  const loanColumns = new Set(database.prepare('PRAGMA table_info(loans)').all().map((column) => column.name));
  const lineage = loanColumns.has('transfer_group_id') ? {
    transfer_group_id: transferGroupId,
    transfer_parent_id: complete ? source.id : transferRecordId,
    transfer_recipient_id: '',
  } : {};
  const target = {
    ...trimDirectoryFields(source),
    ...(trimDirectoryFields(schedule) || {}),
    ...(Object.hasOwn(source, 'latest_change') ? { latest_change: null, changed_at: null, changed_by: null } : {}),
    id: schedule?.id || `loan-${randomUUID()}`,
    ...lineage,
    asset_code: transferred.Laptop || '',
    knox_id: targetKnox,
    assignee: targetAssignee,
    assignee_type: targetType,
    ...(database.prepare('PRAGMA table_info(loans)').all().some((column) => column.name === 'location') ? { location: targetLocation } : {}),
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
    if (targetLocation && database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'locations'").get()) ensureLocation(database, targetLocation);
    const columns = Object.keys(target);
    if (schedule) {
      const updates = columns.filter((key) => key !== 'id');
      database.prepare(`UPDATE loans SET ${updates.map((key) => `${key} = ?`).join(',')} WHERE id = ?`).run(...updates.map((key) => target[key]), target.id);
    } else {
      database.prepare(`INSERT INTO loans (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map((key) => target[key]));
    }
    if (!complete) {
      const transferRecord = {
        ...source,
        id: transferRecordId,
        asset_code: transferred.Laptop || '',
        equipment_json: JSON.stringify(transferred),
        others: transferred.Others || '',
        note: [source.note, sourceTransferNote].filter(Boolean).join('\n'),
        status: 'Transferred',
        is_archived: 1,
        ...(loanColumns.has('transfer_group_id') ? {
          transfer_group_id: transferGroupId,
          transfer_parent_id: source.id,
          transfer_recipient_id: target.id,
        } : {}),
      };
      const splitColumns = Object.keys(transferRecord);
      database.prepare(`INSERT INTO loans (${splitColumns.join(',')}) VALUES (${splitColumns.map(() => '?').join(',')})`).run(...splitColumns.map((key) => transferRecord[key]));
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
    if (complete && loanColumns.has('transfer_group_id')) database.prepare('UPDATE loans SET transfer_group_id = ?, transfer_recipient_id = ? WHERE id = ?').run(transferGroupId, target.id, source.id);
    for (const key of ['Laptop', 'Monitor']) {
      if (!transferred[key]) continue;
      const asset = database.prepare('SELECT * FROM assets WHERE code = ? COLLATE NOCASE').get(transferred[key]);
      if (!asset) continue;
      database.prepare('UPDATE assets SET owner = ?, status = ?, location = ?, department = ?, updated = ? WHERE id = ?').run(
        target.assignee || targetKnox,
        custodyStatusForBorrower(targetType),
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

export function swapLoanEquipment(database, firstId, { secondId, firstSelection = {}, secondSelection = {}, swapDate = new Date().toISOString() }) {
  const first = database.prepare('SELECT * FROM loans WHERE id = ?').get(firstId);
  const second = database.prepare('SELECT * FROM loans WHERE id = ?').get(secondId);
  if (!first || !second || first.id === second.id) throw new Error('Choose two different custody records');
  if (!first.pickup_date || !second.pickup_date || isLoanReturned(first) || isLoanReturned(second)) throw new Error('Both users must have active, picked-up equipment');
  const equipmentFor = (loan) => ({ ...JSON.parse(loan.equipment_json || '{}'), Laptop: loan.asset_code || '', Others: loan.others || '' });
  const firstItems = equipmentFor(first), secondItems = equipmentFor(second);
  const firstSplit = splitLoanEquipment(firstItems, firstSelection);
  const secondSplit = splitLoanEquipment(secondItems, secondSelection);
  const combine = (remaining, received) => {
    const next = { ...remaining };
    for (const [key, value] of Object.entries(received)) {
      if (!DEVICE_KEYS.includes(key) && Number.isFinite(Number(value)) && Number.isFinite(Number(next[key] || 0))) {
        next[key] = String(Number(next[key] || 0) + Number(value));
      } else {
        if (next[key] && String(next[key]) !== '0') throw new Error(`Cannot swap ${key}: the recipient must select their current ${key} too`);
        next[key] = value;
      }
    }
    return next;
  };
  const firstNext = combine(firstSplit.remaining, secondSplit.transferred);
  const secondNext = combine(secondSplit.remaining, firstSplit.transferred);
  const groupId = `swap-${randomUUID()}`;
  const time = new Date(swapDate).toISOString();
  const label = (loan) => loan.assignee || loan.knox_id;
  database.exec('SAVEPOINT equipment_swap');
  try {
    for (const [loan, updated] of [[first, firstNext], [second, secondNext]]) {
      const note = `${loan.note || ''}${loan.note ? '\n' : ''}Equipment swap ${groupId} with ${label(loan.id === first.id ? second : first)} on ${time}`;
      database.prepare('UPDATE loans SET asset_code = ?, equipment_json = ?, others = ?, note = ? WHERE id = ?').run(updated.Laptop || '', JSON.stringify(updated), updated.Others || '', note, loan.id);
    }
    const owners = new Map([[first.id, second], [second.id, first]]);
    const swaps = [[first, firstSplit.transferred], [second, secondSplit.transferred]];
    for (const [fromLoan, items] of swaps) for (const key of ['Laptop', 'Monitor']) {
      const code = String(items[key] || '').trim();
      if (!code || code === '0') continue;
      const asset = database.prepare('SELECT * FROM assets WHERE code = ? COLLATE NOCASE').get(code);
      if (!asset) continue;
      const toLoan = owners.get(fromLoan.id);
      const owner = toLoan.assignee || toLoan.knox_id;
      const location = toLoan.department || toLoan.location || asset.location || '';
      database.prepare('UPDATE assets SET owner = ?, status = ?, location = ?, department = ?, updated = ? WHERE id = ?').run(owner, custodyStatusForBorrower(toLoan.assignee_type), location, toLoan.department || '', time.slice(0, 10), asset.id);
      database.prepare('INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), asset.code, asset.owner || label(fromLoan), owner, time, 'Equipment swap', `Swap ${groupId}: ${label(fromLoan)} to ${label(toLoan)}`, time);
    }
    database.exec('RELEASE SAVEPOINT equipment_swap');
    return { groupId, firstId: first.id, secondId: second.id };
  } catch (error) { database.exec('ROLLBACK TO SAVEPOINT equipment_swap'); database.exec('RELEASE SAVEPOINT equipment_swap'); throw error; }
}
