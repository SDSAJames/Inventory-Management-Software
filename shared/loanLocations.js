import { normalizeLocation } from './assetRules.js';
import { isLoanReturned } from './loanRules.js';
import { DEFAULT_LOCATION } from './referenceData.js';

export function isPendingPickup(record) {
  return !record.pickupDate && !record.pickup_date && record.status !== 'Active' && !isLoanReturned(record);
}

/** An unassigned schedule location stays blank; defaults apply only after handover. */
export function getLoanLocation(record) {
  return normalizeLocation(record.location, isPendingPickup(record) ? '' : DEFAULT_LOCATION);
}
