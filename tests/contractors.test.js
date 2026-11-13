import test from 'node:test';
import assert from 'node:assert/strict';
import { borrowerType, isBusinessTravelerType, tracksEndDate } from '../shared/loanRules.js';
import { createLoanForm, buildLoanFormData, loanFormErrors } from '../src/lib/loanForms.js';
import { normalizeLoanEndDate, updateLoanFormField } from '../src/lib/loanEquipment.js';
import { groupLoans } from '../src/lib/loanSelectors.js';
import { enrichCustodyRecords } from '../src/lib/custodyRecords.js';
import { loansToRows } from '../src/lib/loanExcel.js';
import { parseLoansText } from '../src/lib/txtImport.js';
import { LOAN_HEADERS } from '../src/lib/constants.js';

test('contractor identity stays distinct while sharing due-date and overdue rules', () => {
  const loan = { id: 'contract', assigneeType: 'Contractor', knoxId: 'person', assetCode: 'PC-123', pickupDate: '2000-01-01', startDate: '2000-01-01', endDate: '2000-02-01', equipment: {} };
  assert.equal(tracksEndDate('Contractor'), true); assert.equal(isBusinessTravelerType('Contractor'), false);
  assert.equal(borrowerType(' contractor '), 'Contractor'); assert.equal(tracksEndDate('Employee'), false);
  assert.equal(normalizeLoanEndDate(loan).endDate, loan.endDate);
  assert.equal(createLoanForm(loan).endDate, loan.endDate);
  assert.equal(buildLoanFormData(createLoanForm(loan)).endDate, loan.endDate);
  assert.ok(loanFormErrors({ ...createLoanForm(loan), endDate: '1999-12-01' }).endDate);
  assert.equal(updateLoanFormField(createLoanForm(loan), 'assigneeType', 'Business traveler').endDate, loan.endDate);
  assert.equal(updateLoanFormField(createLoanForm(loan), 'assigneeType', 'Employee').endDate, '');
  assert.equal(groupLoans([loan]).overdue.length, 1);
  const enriched = enrichCustodyRecords([loan])[0];
  assert.equal(enriched.userTypeLabel, 'Contractor'); assert.equal(enriched.isOverdue, true);
  assert.equal(groupLoans([{ ...loan, returnDate: '2000-02-01' }]).returned.length, 1);
});

test('contractor borrower type and due date round-trip the existing loan spreadsheet', () => {
  const loan = { assigneeType: 'Contractor', assignee: 'Contract Person', knoxId: 'contract.person', assetCode: 'PC-123', startDate: '2026-11-01', pickupDate: '2026-11-02', endDate: '2026-12-01', equipment: {} };
  const rows = loansToRows([loan], []);
  assert.equal(rows[0][3], 'Contractor');
  const imported = parseLoansText([LOAN_HEADERS, ...rows]);
  assert.equal(imported.loans[0].assigneeType, 'Contractor');
  assert.equal(imported.loans[0].endDate, loan.endDate);
});
