import { DEFAULT_OWNER, DEFAULT_LOCATION, REPAIR_LOCATION } from "./referenceData.js";

import { isLoanReturned } from './loanRules.js';

/** Keep the renamed default consistent when reading older imports and backups. */
export function normalizeLocation(location, fallback = DEFAULT_LOCATION) {
  const value = String(location ?? '').trim() || fallback;
  const name = typeof value === 'string' ? value.trim() : value;
  if (typeof name !== 'string') return name;
  const key = name.toLowerCase();
  if (key === 'head office' || key === 'it department' || key === DEFAULT_LOCATION.toLowerCase()) return DEFAULT_LOCATION;
  return key === REPAIR_LOCATION.toLowerCase() ? REPAIR_LOCATION : name;
}

/** Repair equipment is held at the service center until its status changes. */
export function getAssetLocation(status, location, fallback = DEFAULT_LOCATION) {
  return status === 'Under repair' ? REPAIR_LOCATION : normalizeLocation(location, fallback);
}

/** Available equipment is held by IT, never an unnamed or employee holder. */
export function normalizeAvailableAsset(asset) {
  if (!asset) return asset;
  if (asset.status !== 'Available') {
    return String(asset.owner || '').trim().toLowerCase() === 'it department' && asset.owner !== DEFAULT_OWNER ? { ...asset, owner: DEFAULT_OWNER } : asset;
  }
  if (asset.owner === DEFAULT_OWNER && asset.department === '') return asset;
  return { ...asset, owner: DEFAULT_OWNER, department: '' };
}

/** Returning custody does not clear a device's repair or retirement state. */
export function getAssetStatusAfterReturn(status) {
  return ['Damaged', 'Under repair', 'Retired', 'Disposed'].includes(status) ? status : 'Available';
}

export function getAssetLocationAfterReturn(status) {
  return getAssetLocation(getAssetStatusAfterReturn(status), DEFAULT_LOCATION);
}

/** An explicitly cleared holder on an existing asset means return to IT custody. */
export function getHolderReturnChanges(previous, changes) {
  if (!previous || (!String(previous.owner || '').trim() && changes.status !== 'Available')) return null;
  if (!Object.hasOwn(changes, 'owner') && changes.status !== 'Available') return null;
  const nextOwner = String(changes.owner || '').trim().toLowerCase();
  const previousOwner = String(previous.owner || '').trim().toLowerCase();
  // Saving unchanged IT custody must allow an independent location edit.
  if (nextOwner === previousOwner && previous.status === 'Available' && changes.status === 'Available') return null;
  if (changes.status !== 'Available' && nextOwner && nextOwner !== 'it department') return null;
  const status = getAssetStatusAfterReturn(changes.status ?? previous.status);
  return { owner: DEFAULT_OWNER, department: '', status, location: getAssetLocationAfterReturn(status) };
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
