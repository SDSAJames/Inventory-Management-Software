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
