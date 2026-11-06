import { DEFAULT_LOCATION } from '../../shared/referenceData.js';
import { getLoanEndDate } from '../lib/loanEquipment';
import { readableLoanDate } from '../lib/utils';

export default function LoanSummary({ loan, returning = false, location = loan.location }) {
  const items = [
    { label: 'Assignee', value: loan.assignee || 'Unknown', sub: `(${loan.assigneeType || 'Employee'})` },
    { label: 'Knox ID', value: loan.knoxId || '—', code: true },
    { label: 'Laptop / Asset #', value: loan.assetCode || '—', device: true },
    ...(returning ? [
      { label: 'Picked up on', value: readableLoanDate(loan.pickupDate) || '—' },
      { label: 'Scheduled Due', value: readableLoanDate(getLoanEndDate(loan)) || '—' },
    ] : [{ label: 'Location', value: location || DEFAULT_LOCATION }, ...(loan.ip ? [{ label: 'IP Address', value: loan.ip, code: true }] : [])]),
  ];
  return <div className="loan-pickup-summary-card">{items.map((item) => <div key={item.label} className="loan-summary-item">
    <span className="summary-label">{item.label}</span>
    {item.code ? <code className="summary-code">{item.value}</code> : <strong className={`summary-val${item.device ? ' summary-laptop-badge' : ''}`}>{item.value}</strong>}
    {item.sub && <span className="summary-sub">{item.sub}</span>}
  </div>)}</div>;
}
