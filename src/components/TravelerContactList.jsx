import { knoxRecipientList } from '../lib/travelerFollowUp';
import { readableLoanDate } from '../lib/utils';
import { getLoanEndDate } from '../lib/loanEquipment';
import { useToast } from '../hooks/useToast';

export default function TravelerContactList({ records, title, description, emptyMessage, reasonLabel = 'Follow-up reason', onEdit }) {
  const toast = useToast();
  const recipients = knoxRecipientList(records);
  return <section className="panel">
    <div className="panel-heading"><h3>{title} ({records.length})</h3>
      <button type="button" className="button" disabled={!recipients} onClick={async () => {
        try { await navigator.clipboard.writeText(recipients); toast('Knox ID list copied'); }
        catch { toast('Clipboard unavailable. Select and copy the recipient list below.'); }
      }}>Copy Knox IDs</button></div>
    <p>{description}</p>
    <textarea aria-label={title + ' Knox IDs'} readOnly value={recipients} rows={2} style={{ width: '100%' }} />
    <div className="table-wrap"><table className="loan-table"><thead><tr><th>Knox ID</th><th>Assignee</th><th>PC asset #</th><th>Location</th><th>Due date</th><th>{reasonLabel}</th><th>Action</th></tr></thead>
      <tbody>{records.map((loan) => <tr key={loan.id}><td>{loan.knoxId || 'Missing Knox ID'}</td><td>{loan.assignee}</td><td>{loan.assetCode || '—'}</td><td>{loan.location}</td><td>{readableLoanDate(getLoanEndDate(loan)) || '—'}</td><td>{loan.followUpReason}</td><td><button type="button" className="text-button" onClick={() => onEdit(loan.id)}>View / edit</button></td></tr>)}
      {!records.length && <tr><td colSpan={7}>{emptyMessage}</td></tr>}</tbody></table></div>
  </section>;
}
