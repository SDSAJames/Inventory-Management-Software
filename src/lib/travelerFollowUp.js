import { getLoanEndDate, isBusinessTraveler } from './loanEquipment.js';
import { isLoanReturned } from '../../shared/loanRules.js';
import { normalizeDateToIso, todayIso } from './utils.js';
import { groupLoans } from './loanSelectors.js';
export function travelerFollowUp(loans) {
  const { overdue, unreturned } = groupLoans(loans);
  const overdueIds = new Set(overdue.map((loan) => loan.id));
  const unreturnedIds = new Set(unreturned.map((loan) => loan.id));
  return loans.filter((loan) => overdueIds.has(loan.id) || unreturnedIds.has(loan.id)).map((loan) => ({ ...loan, followUpReason: [overdueIds.has(loan.id) && 'Overdue', unreturnedIds.has(loan.id) && 'Unreturned'].filter(Boolean).join(' / ') }));
}
export function knoxRecipientList(loans) {
  const ids = new Map();
  for (const loan of loans) {
    const id = String(loan.knoxId || '').trim();
    if (id) ids.set(id.toLowerCase(), id);
  }
  const sorted = [...ids.values()].sort((a, b) => a.localeCompare(b));
  return sorted.length ? sorted.join(';') + ';' : '';
}

/** Calendar-day arithmetic keeps the seven-day boundary stable across DST. */
export function travelerReminders(loans, today = todayIso()) {
  const day = (date) => Date.parse(normalizeDateToIso(date) + 'T00:00:00Z') / 86400000;
  return loans.filter((loan) => isBusinessTraveler(loan.assigneeType) && !isLoanReturned(loan) && (loan.pickupDate || loan.status === 'Active'))
    .map((loan) => ({ ...loan, daysLeft: day(getLoanEndDate(loan)) - day(today) }))
    .filter((loan) => loan.daysLeft >= 0 && loan.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map((loan) => ({ ...loan, followUpReason: loan.daysLeft === 0 ? 'Due today' : loan.daysLeft + (loan.daysLeft === 1 ? ' day left' : ' days left') }));
}
