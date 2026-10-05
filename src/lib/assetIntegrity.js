/**
 * Core validation and synchronization between Assets, Loans, and Ownership History.
 * Ensures consistent statuses, holder information, and chronological tracking.
 */
import { todayIso } from './utils';

/**
 * Reconciles an asset against all loans in the database to derive its true latest
 * operational status and holder.
 *
 * Rules:
 * 1. If the asset has any Active/Picked-up loan that is NOT returned:
 *    - Status must be 'On loan'
 *    - Holder/Owner must be the loan's assignee
 *    - Location reflects loan's location if available
 * 2. If the asset has Scheduled loans (not picked up yet):
 *    - Status is NOT 'On loan' yet (e.g. 'Available' or 'Assigned'), unless marked otherwise
 * 3. If all loans for this asset are Returned (or no loans exist):
 *    - If asset was stuck in 'On loan', it is reconciled back to 'Available'
 *      (or retains assigned owner if non-loan ownership was set).
 *
 * @param {object} asset
 * @param {object[]} loans
 * @returns {object} reconciled asset
 */
export function reconcileAssetWithLoans(asset, loans = []) {
  if (!asset || !asset.code) return asset;

  const assetLoans = loans.filter(
    (l) => String(l.assetCode || '').trim().toLowerCase() === String(asset.code || '').trim().toLowerCase()
  );

  // Find active loans (picked up, not returned, not archived)
  const activeLoan = assetLoans.find((l) => {
    const isReturned = Boolean(l.returnDate || l.returnedDate || l.status === 'Returned' || l.isArchived);
    const hasPickedUp = Boolean(l.pickupDate || l.status === 'Active');
    return hasPickedUp && !isReturned;
  });

  if (activeLoan) {
    // Current reality: on loan to active loan assignee
    const needsUpdate =
      asset.status !== 'On loan' ||
      asset.owner !== (activeLoan.assignee || '') ||
      (activeLoan.location && asset.location !== activeLoan.location);

    if (needsUpdate) {
      return {
        ...asset,
        status: 'On loan',
        owner: activeLoan.assignee || asset.owner || '',
        location: activeLoan.location || asset.location,
        department: activeLoan.department || asset.department,
        updated: todayIso(),
      };
    }
    return asset;
  }

  // If no active loan, but asset status is currently 'On loan'
  if (asset.status === 'On loan') {
    return {
      ...asset,
      status: 'Available',
      owner: '',
      updated: todayIso(),
    };
  }

  return asset;
}

/**
 * Reconciles an entire list of assets against all loans.
 */
export function reconcileAllAssets(assets = [], loans = []) {
  return assets.map((a) => reconcileAssetWithLoans(a, loans));
}

/**
 * Retrieves all loan history for a specific asset code, sorted latest first.
 */
export function getAssetLoanHistory(assetCode, loans = []) {
  if (!assetCode) return [];
  const code = String(assetCode).trim().toLowerCase();
  return loans
    .filter((l) => String(l.assetCode || '').trim().toLowerCase() === code)
    .sort((a, b) => {
      const dateA = a.pickupDate || a.startDate || a.loanDate || '';
      const dateB = b.pickupDate || b.startDate || b.loanDate || '';
      return String(dateB).localeCompare(String(dateA));
    });
}

/**
 * Creates an ownership history entry.
 */
export function createOwnershipEntry({
  previousOwner = '',
  newOwner = '',
  date = todayIso(),
  reason = 'Reassigned',
  notes = '',
}) {
  return {
    id: crypto.randomUUID(),
    date: date || todayIso(),
    previousOwner: previousOwner || 'None',
    newOwner: newOwner || 'None',
    reason: reason || 'Reassigned',
    notes: notes || '',
  };
}
