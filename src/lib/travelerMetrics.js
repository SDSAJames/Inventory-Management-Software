import { isBusinessTravelerType, isLoanReturned } from '../../shared/loanRules.js';

/** Count people with outstanding custody, rather than historical loan records. */
export function currentTravelerCount(records = []) {
  const people = new Set();
  for (const record of records) {
    if (!isBusinessTravelerType(record.assigneeType ?? record.assignee_type ?? record.userType)) continue;
    if (record.status === 'Transferred') continue;
    const partial = String(record.returnStatus ?? record.return_status ?? '').toLowerCase() === 'partial';
    if (!partial && (record.isReturned || isLoanReturned(record))) continue;
    const hasPickup = partial || record.pickupDate || record.pickup_date || record.hasPickup ||
      ['Active', 'Overdue'].includes(record.status) || ['In Field', 'Overdue'].includes(record.tripStatus);
    if (!hasPickup) continue;

    const knoxId = String(record.knoxId ?? record.knox_id ?? '').trim().toLowerCase();
    if (knoxId) {
      people.add(`knox:${knoxId}`);
      continue;
    }
    const name = String(record.assignee || record.borrower || record.name || '').trim().toLowerCase();
    if (name && !['unknown staff', 'unknown', 'unnamed recipient', 'none', '—', '-'].includes(name)) people.add(`name:${name}`);
  }
  return people.size;
}
