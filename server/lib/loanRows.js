import { tracksEndDate } from '../loanRules.js';
import { todayIso } from './dates.js';
import { isLoanReturned } from '../../shared/loanRules.js';
import { DEFAULT_LOCATION } from '../../shared/referenceData.js';
import { normalizePcRecord } from '../../shared/pcReferences.js';

export function computeLoanStatus(loan, { today = todayIso(), tracksDueDate = tracksEndDate(loan.assignee_type) } = {}) {
  if (isLoanReturned(loan)) return 'Returned';
  if (!loan.pickup_date && loan.status !== 'Active') return 'Scheduled';
  if (tracksDueDate && loan.end_date && loan.end_date < today) return 'Overdue';
  if (loan.pickup_date || loan.status === 'Active') return 'Active';
  return 'Scheduled';
}

function serializeLoanRow(loan, forExport) {
  const text = (value, fallback = '') => forExport ? value : (value || fallback);
  return normalizePcRecord({
    id: loan.id,
    assetCode: loan.asset_code,
    assignee: loan.assignee,
    department: text(loan.department),
    knoxId: text(loan.knox_id),
    location: text(loan.location, DEFAULT_LOCATION),
    ip: text(loan.ip),
    startDate: text(loan.start_date),
    pickupDate: text(loan.pickup_date),
    endDate: tracksEndDate(loan.assignee_type) ? text(loan.end_date) : '',
    returnDate: text(loan.return_date),
    returnedDate: text(loan.returned_date),
    status: forExport ? loan.status : computeLoanStatus(loan),
    equipment: loan.equipment_json ? JSON.parse(loan.equipment_json) : (forExport ? {} : { Adapter: 1, Cable: 1 }),
    returnedEquipment: loan.returned_equipment_json ? JSON.parse(loan.returned_equipment_json) : null,
    returnStatus: loan.return_status || '',
    readyForPickup: Boolean(loan.ready_for_pickup),
    others: text(loan.others),
    note: text(loan.note),
    purpose: text(loan.purpose),
    assigneeType: text(loan.assignee_type, 'Business traveler'),
    isArchived: Boolean(forExport ? loan.is_archived : (loan.is_archived || loan.return_date || loan.returned_date)),
    ...(!forExport ? { createdAt: loan.created_at } : {}),
  });
}

/** Public loans API derives lifecycle status and supplies its established defaults. */
export function formatLoanRow(loan) {
  return serializeLoanRow(loan, false);
}

/** Exchange export preserves stored status, nulls, and the existing export shape. */
export function exportLoanRow(loan) {
  return serializeLoanRow(loan, true);
}
