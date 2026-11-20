import { randomUUID } from 'node:crypto';
import { splitReturnedEquipment } from '../../shared/returnedEquipment.js';
import { formatLoanRow } from './loanRows.js';
import { todayIso } from './dates.js';
import { tracksEndDate } from '../loanRules.js';

/** Persist a completed-return row and a separate outstanding row for a partial return. */
export function splitPartialReturn(database, source, issuedEquipment, receivedEquipment, returnDate, note = source.note || '') {
  const split = splitReturnedEquipment(issuedEquipment, receivedEquipment);
  if (!split.hasRemaining || !Object.keys(split.returned).length) return null;

  const columns = new Set(database.prepare('PRAGMA table_info(loans)').all().map((column) => column.name));
  const groupId = `return-${randomUUID()}`;
  const remainingId = `loan-${randomUUID()}`;
  const remainingStatus = tracksEndDate(source.assignee_type) && source.end_date && source.end_date < todayIso() ? 'Overdue' : 'Active';
  const completedNote = [note, `Partial return split. Remaining items continue on linked record ${remainingId}.`].filter(Boolean).join('\n');
  const remainingNote = [source.note, `Partial return recorded on linked returned record ${source.id}.`].filter(Boolean).join('\n');
  const remaining = {
    ...source,
    id: remainingId,
    ...(Object.hasOwn(source, 'latest_change') ? { latest_change: null, changed_at: null, changed_by: null } : {}),
    asset_code: split.remaining.Laptop || '',
    equipment_json: JSON.stringify(split.remaining),
    others: split.remaining.Others || '',
    return_date: '',
    returned_date: '',
    status: remainingStatus,
    returned_equipment_json: null,
    return_status: 'Partial',
    is_archived: 0,
    ready_for_pickup: 0,
    note: remainingNote,
    ...(columns.has('return_group_id') ? {
      return_group_id: groupId,
      return_parent_id: source.id,
      return_remaining_id: '',
    } : {}),
  };
  const remainingColumns = Object.keys(remaining);
  database.prepare(`INSERT INTO loans (${remainingColumns.join(',')}) VALUES (${remainingColumns.map(() => '?').join(',')})`).run(...remainingColumns.map((key) => remaining[key]));

  const returnedJson = JSON.stringify(split.returned);
  database.prepare(`UPDATE loans SET asset_code = ?, equipment_json = ?, returned_equipment_json = ?, return_status = 'Complete', return_date = ?, returned_date = ?, status = 'Returned', is_archived = 1, ready_for_pickup = 0, note = ?, others = ?${columns.has('return_group_id') ? ', return_group_id = ?, return_remaining_id = ?' : ''} WHERE id = ?`).run(
    split.returned.Laptop || '', returnedJson, returnedJson, returnDate, returnDate, completedNote, split.returned.Others || '',
    ...(columns.has('return_group_id') ? [groupId, remainingId] : []), source.id,
  );
  return formatLoanRow(database.prepare('SELECT * FROM loans WHERE id = ?').get(remainingId));
}
