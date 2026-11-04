import { getLoanStatus } from './utils.js';
import { getMissingReturnItems } from './loanEquipment.js';

export const LOAN_SEARCH_FIELDS = [
  'All fields',
  'Assignee / Name',
  'Knox ID',
  'Laptop / Asset #',
  'Location',
  'IP address',
  'Department',
  'Note / Purpose',
];

export function filterLoan(loan, term, field) {
  if (!term || !term.trim()) return true;
  const q = term.toLowerCase().trim();
  const terms = q.split(/\s+/);

  let searchable = '';
  switch (field) {
    case 'Assignee / Name':
      searchable = loan.assignee || '';
      break;
    case 'Knox ID':
      searchable = loan.knoxId || '';
      break;
    case 'Laptop / Asset #':
      searchable = `${loan.assetCode || ''} ${loan.equipment?.Laptop || ''}`;
      break;
    case 'Location':
      searchable = loan.location || '';
      break;
    case 'IP address':
      searchable = loan.ip || '';
      break;
    case 'Department':
      searchable = loan.department || '';
      break;
    case 'Note / Purpose':
      searchable = `${loan.note || ''} ${loan.purpose || ''}`;
      break;
    case 'All fields':
    default: {
      const laptop = loan.assetCode || loan.equipment?.Laptop || '';
      const accessories = loan.equipment
        ? Object.entries(loan.equipment)
            .map(([k, v]) => `${k} ${v}`)
            .join(' ')
        : '';
      const status = getLoanStatus(loan);
      const missingEquipment = getMissingReturnItems(loan.equipment || {}, loan.returnedEquipment || {}).join(' ');
      searchable = `${loan.assignee || ''} ${loan.knoxId || ''} ${laptop} ${loan.location || ''} ${loan.ip || ''} ${loan.department || ''} ${loan.note || ''} ${loan.purpose || ''} ${loan.others || ''} ${loan.assigneeType || ''} ${status} ${accessories} ${loan.returnStatus || ''} ${missingEquipment}`;
      break;
    }
  }

  const lower = searchable.toLowerCase();
  return terms.every((t) => lower.includes(t));
}

/** Keep tab grouping and counts on the same lifecycle rules. */
export function groupLoans(loans = []) {
  const groups = { scheduled: [], loaned: [], overdue: [], returned: [], unreturned: [], all: loans };
  const statusKeys = { Scheduled: 'scheduled', Loaned: 'loaned', Overdue: 'overdue', Returned: 'returned' };
  for (const loan of loans) {
    groups[statusKeys[getLoanStatus(loan)]].push(loan);
    if (loan.returnStatus === 'Partial') groups.unreturned.push(loan);
  }
  return groups;
}

export function filterLoanGroups(groups, term, field) {
  return Object.fromEntries(Object.entries(groups).map(([key, loans]) => [
    key, loans.filter((loan) => filterLoan(loan, term, field)),
  ]));
}

/** Unknown URL tabs use the complete list, including object prototype names. */
export function getLoanGroup(groups, category) {
  return Object.hasOwn(groups, category) ? groups[category] : groups.all;
}
