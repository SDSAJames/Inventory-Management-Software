import { readableLoanDate } from '../lib/utils';
import { getLoanEndDate } from '../lib/loanEquipment';
import KnoxIdClipboard from './KnoxIdClipboard';

export default function TravelerContactList({ records, title, description, emptyMessage, reasonLabel = 'Follow-up reason', onEdit }) {
  return <section className="panel">
    <div className="panel-heading"><h3>{title} ({records.length})</h3></div>
    <p>{description}</p>
    <KnoxIdClipboard records={records} label={`${title} Knox IDs`} />
    <div className="table-wrap"><table className="loan-table"><thead><tr><th>Knox ID</th><th>Assignee</th><th>PC asset #</th><th>Location</th><th>Due date</th><th>{reasonLabel}</th><th>Action</th></tr></thead>
      <tbody>{records.map((loan) => <tr key={loan.id}><td>{loan.knoxId || 'Missing Knox ID'}</td><td>{loan.assignee}</td><td>{loan.assetCode || '—'}</td><td>{loan.location}</td><td>{readableLoanDate(getLoanEndDate(loan)) || '—'}</td><td>{loan.followUpReason}</td><td><button type="button" className="text-button" onClick={() => onEdit(loan.id)}>View / edit</button></td></tr>)}
      {!records.length && <tr><td colSpan={7}>{emptyMessage}</td></tr>}</tbody></table></div>
  </section>;
}
