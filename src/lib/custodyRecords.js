import { isPendingPickup } from '../../shared/loanLocations.js';
import { isLoanReturned } from '../../shared/loanRules.js';
import { isBusinessTraveler, getLoanEndDate } from './loanEquipment.js';
import { isLoanOverdue, normalizeDateToIso, todayIso } from './utils.js';

/** One presentation model for the calendar and traveler roster views. */
export function enrichCustodyRecords(loans = [], assets = []) {
  const assetMap = new Map(assets.map((asset) => [String(asset.code || '').trim().toLowerCase(), asset]));
  return loans.map((loan) => {
    const asset = assetMap.get(String(loan.assetCode || '').trim().toLowerCase());
    const isReturned = isLoanReturned(loan), hasPickup = Boolean(loan.pickupDate || loan.status === 'Active');
    const dueDate = getLoanEndDate(loan);
    const isOverdue = hasPickup && !isReturned && isLoanOverdue(loan);
    const isTraveler = isBusinessTraveler(loan.assigneeType);
    const computedStatus = isReturned ? 'Returned' : isOverdue ? 'Overdue' : hasPickup ? 'In Field' : 'Scheduled';
    let remainingText = '';
    if (!isReturned && dueDate) {
      const days = Math.round((new Date(dueDate) - new Date(todayIso())) / (1000 * 60 * 60 * 24));
      remainingText = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`;
    }
    return {
      ...loan, assignee: loan.assignee || loan.borrower || 'Unknown Staff',
      userType: isTraveler ? 'Business traveler' : 'Employee', userTypeLabel: isTraveler ? 'Business Traveler' : 'SPE Employee', isTraveler,
      assetName: asset?.name || '', assetModel: asset?.model || '', location: isPendingPickup(loan) ? loan.location || '' : loan.location || asset?.location || 'Unspecified',
      outIso: normalizeDateToIso(loan.startDate || loan.pickupDate || loan.loanDate),
      inIso: normalizeDateToIso(isReturned ? loan.returnDate || loan.returnedDate || dueDate : dueDate),
      isReturned, hasPickup, isOverdue, computedStatus, tripStatus: computedStatus, remainingText,
      accessoryCount: Object.values(loan.equipment || {}).reduce((sum, value) => sum + (Number(value) || 0), 0),
    };
  });
}
