/**
 * Core validation and synchronization between Assets, Loans, and Ownership History.
 * Ensures consistent statuses, holder information, and chronological tracking.
 */
import { todayIso, readableLoanDate } from './utils.js';

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
/**
 * Helper to identify IT department or pool variants
 */
export function isItDepartment(name) {
  if (!name) return false;
  const s = String(name).trim().toLowerCase();
  return (
    s === 'it department' ||
    s === 'it dept' ||
    s === 'it' ||
    s === 'returned to pool / available' ||
    s === 'pool / available' ||
    s === 'returned to pool' ||
    s === 'pool'
  );
}

/**
 * Normalizes holder name: legacy pool/return texts become 'IT department'
 */
export function normalizeHolder(name) {
  if (!name) return '';
  if (isItDepartment(name)) return 'IT department';
  return String(name).trim();
}

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
 * 3. If all loans for this asset are Returned (or loan is returned):
 *    - Holder name will be 'IT department'
 *    - Status is reconciled to 'Available' (unless marked damaged/under repair)
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
    const hasOtherHolder = Boolean(asset.owner && String(asset.owner).trim() !== '' && !isItDepartment(asset.owner));
    return {
      ...asset,
      status: hasOtherHolder ? 'Assigned' : 'Available',
      owner: hasOtherHolder ? asset.owner : 'IT department',
      department: hasOtherHolder ? asset.department : '',
      updated: todayIso(),
    };
  }

  // Check if asset's most recent loan was returned
  const returnedLoan = assetLoans.find((l) => Boolean(l.returnDate || l.returnedDate || l.status === 'Returned'));
  if (returnedLoan) {
    // If asset has no holder, or holder was pool/legacy text, normalize to IT department
    if (!asset.owner || isItDepartment(asset.owner)) {
      return {
        ...asset,
        owner: 'IT department',
        department: '',
        status: asset.status === 'Damaged' || asset.status === 'Under repair' || asset.status === 'Disposed' ? asset.status : 'Available',
        updated: asset.updated || todayIso(),
      };
    }
  }

  // VALIDATION RULE: If there is an employee holder (other than IT department), it must be 'Assigned', NOT 'Available'!
  const hasHolder = Boolean(asset.owner && String(asset.owner).trim() !== '' && !isItDepartment(asset.owner));
  if (hasHolder && asset.status === 'Available') {
    return {
      ...asset,
      status: 'Assigned',
      updated: asset.updated || todayIso(),
    };
  }

  // If status is 'Assigned' but has no employee holder, reconcile to 'Available'
  if (!hasHolder && asset.status === 'Assigned') {
    return {
      ...asset,
      status: 'Available',
      owner: isItDepartment(asset.owner) ? 'IT department' : '',
      department: isItDepartment(asset.owner) ? '' : asset.department,
      updated: asset.updated || todayIso(),
    };
  }

  return asset;
}

/**
 * Validates and enforces consistency between asset holder and status:
 * - If holder is IT department: status is Available (ready for deployment) or damage state.
 * - If there is an employee holder, status cannot be 'Available'; it must be 'Assigned'.
 * - If status is 'Available' without holder, holder remains empty or IT department.
 */
export function validateAssetStatus(asset) {
  if (!asset) return asset;
  const isItDept = isItDepartment(asset.owner);
  const hasHolder = Boolean(asset.owner && String(asset.owner).trim() !== '' && !isItDept);

  if (isItDept) {
    return {
      ...asset,
      owner: 'IT department',
      department: '',
      status: asset.status === 'Assigned' ? 'Available' : asset.status,
    };
  }

  if (hasHolder && asset.status === 'Available') {
    return {
      ...asset,
      status: 'Assigned',
    };
  }
  if (!hasHolder && asset.status === 'Assigned') {
    return {
      ...asset,
      status: 'Available',
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
  date = '',
  reason = 'Reassigned',
  notes = '',
  location = '',
  department = '',
}) {
  return {
    id: crypto.randomUUID(),
    date: date || new Date().toISOString().slice(0, 19).replace('T', ' '),
    previousOwner: normalizeHolder(previousOwner) || 'None',
    newOwner: normalizeHolder(newOwner) || 'None',
    location: location || '',
    department: department || '',
    reason: reason || 'Reassigned',
    notes: notes || '',
  };
}

/**
 * Returns the effective ownership history for an asset, including
 * permanent transfers, initial assignments, and all loan checkouts and returns.
 */
export function getAssetEffectiveOwnershipHistory(asset, loans = []) {
  if (!asset) return [];

  const entries = [];
  const seen = new Set();

  const addEntry = (item) => {
    if (!item) return;
    const key = `${item.date || ''}|${item.newOwner || ''}|${item.reason || ''}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(item);
  };

  // 1. Explicit ownership transfers recorded on the asset
  const explicit = asset.ownershipHistory || [];
  explicit.forEach((entry) => {
    addEntry({
      ...entry,
      previousOwner: normalizeHolder(entry.previousOwner) || entry.previousOwner || 'None',
      newOwner: normalizeHolder(entry.newOwner) || entry.newOwner || 'None',
      isLoan: false,
    });
  });

  // 2. Loan history records for this asset code
  if (asset.code && Array.isArray(loans)) {
    const code = String(asset.code).trim().toLowerCase();
    const assetLoans = loans.filter((l) => String(l.assetCode || '').trim().toLowerCase() === code);

    assetLoans.forEach((l) => {
      // Loan checkout / pickup event
      const startDate = readableLoanDate(l.pickupDate || l.startDate || l.loanDate);
      if (startDate) {
        addEntry({
          id: `loan-out-${l.id}`,
          date: startDate,
          previousOwner: normalizeHolder(l.previousOwner) || 'IT department',
          newOwner: l.assignee || l.borrower || 'Borrower',
          department: l.department || '',
          location: l.location || asset.location || '',
          reason: l.purpose ? `Loan: ${l.purpose}` : 'Loan Handover',
          notes: [
            l.knoxId ? `Knox: ${l.knoxId}` : '',
            l.dueDate ? `Due: ${readableLoanDate(l.dueDate)}` : '',
            l.status ? `Status: ${l.status}` : '',
          ].filter(Boolean).join(' • '),
          isLoan: true,
          loanStatus: l.status || (l.returnDate ? 'Returned' : 'Active'),
        });
      }

      // Loan return event: when returned, holder name will be 'IT department'
      const returnDate = readableLoanDate(l.returnDate || l.returnedDate);
      if (returnDate || l.status === 'Returned') {
        const retDate = returnDate || startDate || todayIso();
        addEntry({
          id: `loan-in-${l.id}`,
          date: retDate,
          previousOwner: l.assignee || l.borrower || 'Borrower',
          newOwner: 'IT department',
          department: 'IT',
          location: l.location || asset.location || 'IT Store',
          reason: 'Loan Returned',
          notes: `Returned to IT department (was borrowed by ${l.assignee || l.borrower || 'borrower'})`,
          isLoan: true,
          loanStatus: 'Returned',
        });
      }
    });
  }

  // 3. Ensure the current holder is represented in the timeline
  if (asset.owner && asset.owner.trim() !== '') {
    const normCurrentOwner = normalizeHolder(asset.owner);
    const hasCurrentOwnerEntry = entries.some(
      (e) => normalizeHolder(e.newOwner).toLowerCase() === normCurrentOwner.toLowerCase()
    );

    if (!hasCurrentOwnerEntry) {
      addEntry({
        id: `current-owner-${asset.id || asset.code}`,
        date: asset.issuedDate || asset.updated || todayIso(),
        previousOwner: 'IT department',
        newOwner: normCurrentOwner,
        location: asset.location || '',
        department: asset.department || '',
        reason: 'Assigned',
        notes: asset.notes || '',
        isLoan: false,
      });
    }
  }

  // 4. Sort ascending (oldest first) to chain and repair continuity
  const sortedAsc = entries.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  for (let i = 0; i < sortedAsc.length; i++) {
    const current = sortedAsc[i];
    current.previousOwner = normalizeHolder(current.previousOwner);
    current.newOwner = normalizeHolder(current.newOwner);

    if (i === 0) {
      // The very first event in the life of this asset
      if (!current.previousOwner || current.previousOwner === 'Unassigned') {
        current.previousOwner = current.isLoan ? 'IT department' : 'None';
      }
    } else {
      const priorEvent = sortedAsc[i - 1];
      const priorHolder = priorEvent.newOwner || 'IT department';

      // If previous holder is 'None', empty, or unassigned, but someone (e.g. IT department)
      // held the laptop immediately before, chain it!
      if (!current.previousOwner || current.previousOwner === 'None' || current.previousOwner === 'Unassigned') {
        current.previousOwner = priorHolder;
      }

      // If reason was 'Initial assignment' but this event occurred after earlier loans/assignments:
      if (current.reason === 'Initial assignment') {
        current.reason = 'Assigned';
      }
    }
  }

  // 5. Sort chronologically descending (latest first) for display
  return sortedAsc.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

