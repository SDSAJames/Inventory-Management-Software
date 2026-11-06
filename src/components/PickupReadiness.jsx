import { isLoanReturned } from '../../shared/loanRules.js';

export default function PickupReadiness({ loan, onToggleReady }) {
  if (loan.pickupDate || loan.pickup_date || loan.status === 'Active' || isLoanReturned(loan)) {
    return <span className="text-muted-badge" title="Readiness applies to equipment awaiting pickup">—</span>;
  }
  return <button type="button" role="switch" aria-checked={Boolean(loan.readyForPickup)} aria-label="Pickup readiness" disabled={!onToggleReady}
    className={`pickup-readiness-toggle ${loan.readyForPickup ? 'is-ready' : ''}`}
    onClick={(event) => { event.stopPropagation(); onToggleReady?.(loan); }}>
    <span className="pickup-readiness-track" aria-hidden="true"><span /></span>
    {loan.readyForPickup ? 'Ready' : 'Not ready'}
  </button>;
}
