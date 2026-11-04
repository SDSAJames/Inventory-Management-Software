/** Business travelers have due dates; internal employees do not. */
export function isBusinessTravelerType(assigneeType) {
  return String(assigneeType || 'Business traveler').trim().toLowerCase() === 'business traveler';
}

/** Accept API/cache records and SQLite rows without duplicating return checks. */
export function isLoanReturned(loan) {
  return Boolean(loan && (
    loan.returnDate || loan.returnedDate || loan.return_date || loan.returned_date ||
    loan.status === 'Returned' || loan.isArchived || loan.is_archived
  ));
}
