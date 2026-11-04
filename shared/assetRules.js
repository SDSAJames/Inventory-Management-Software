import { DEFAULT_LOCATION, REPAIR_LOCATION } from './referenceData.js';
import { isLoanReturned } from './loanRules.js';

/** Keep the renamed default consistent when reading older imports and backups. */
export function normalizeLocation(location, fallback = DEFAULT_LOCATION) {
  const value = String(location ?? '').trim() || fallback;
  const name = typeof value === 'string' ? value.trim() : value;
  if (typeof name !== 'string') return name;
  const key = name.toLowerCase();
  if (key === 'head office' || key === DEFAULT_LOCATION.toLowerCase()) return DEFAULT_LOCATION;
  return key === REPAIR_LOCATION.toLowerCase() ? REPAIR_LOCATION : name;
}

/** Repair equipment is held at the service center until its status changes. */
export function getAssetLocation(status, location, fallback = DEFAULT_LOCATION) {
  return status === 'Under repair' ? REPAIR_LOCATION : normalizeLocation(location, fallback);
}

/** Returning custody does not clear a device's repair or retirement state. */
export function getAssetStatusAfterReturn(status) {
  return ['Damaged', 'Under repair', 'Retired', 'Disposed'].includes(status) ? status : 'Available';
}

/** Editing an ongoing loan must not undo a repair recorded on the same device. */
export function getAssetStatusForLoanEdit(status, previousLoan = {}, nextLoan = {}) {
  const nextPickup = nextLoan.pickupDate ?? nextLoan.pickup_date;
  if (isLoanReturned(nextLoan) || !nextPickup) return getAssetStatusAfterReturn(status);

  const previousPickup = previousLoan.pickupDate ?? previousLoan.pickup_date;
  const assetCode = (loan) => String(loan.assetCode ?? loan.asset_code ?? loan.equipment?.Laptop ?? '').trim().toLowerCase();
  const previousCode = assetCode(previousLoan);
  if (status === 'Under repair' && previousPickup && !isLoanReturned(previousLoan)
      && previousCode && previousCode === assetCode(nextLoan)) {
    return status;
  }
  return 'On loan';
}
