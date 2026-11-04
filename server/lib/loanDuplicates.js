import { deduplicateLoanRecords } from '../../shared/loanIdentity.js';

export function getDuplicateLoanIds(connection) {
  const loans = connection.prepare('SELECT * FROM loans ORDER BY created_at ASC, id ASC').all();
  const retainedIds = new Set(deduplicateLoanRecords(loans).map((loan) => loan.id));
  return loans.filter((loan) => !retainedIds.has(loan.id)).map((loan) => loan.id);
}

/** Caller owns its transaction and any pre-cleanup snapshot. */
export function removeDuplicateLoans(connection) {
  const duplicateIds = getDuplicateLoanIds(connection);
  if (duplicateIds.length) {
    const deleteLoan = connection.prepare('DELETE FROM loans WHERE id = ?');
    for (const id of duplicateIds) deleteLoan.run(id);
  }
  return duplicateIds.length;
}
