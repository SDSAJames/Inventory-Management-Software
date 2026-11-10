import { readableLoanDate } from '../lib/utils';
export default function CalendarPickedUpSection({ records = [], onEdit }) {
  return <section className="day-schedule-modal">
    <div className="section-title-row incoming-header"><h4>Picked up ({records.length})</h4></div>
    {!records.length ? <p className="empty">No pickups recorded for this date.</p> : <div className="schedule-cards-grid">{records.map((loan) => <div className="schedule-card" key={loan.id}>
      <div className="card-top-row"><div><strong>{loan.assignee || loan.knoxId || 'Unnamed recipient'}</strong><div><code>{loan.knoxId}</code> · {loan.userType || loan.assigneeType}</div></div></div>
      <span className="status status-available">Picked up</span>
      <div className="card-detail-grid">
        <div><span className="detail-label">Pickup time</span><span className="detail-value">{readableLoanDate(loan.pickupDate)}</span></div>
        <div><span className="detail-label">PC asset #</span><strong className="detail-value">{loan.assetCode || loan.equipment?.Laptop || '—'}</strong></div>
        <div><span className="detail-label">Monitor</span><span className="detail-value">{loan.equipment?.Monitor || '—'}</span></div>
        <div><span className="detail-label">Location</span><span className="detail-value">{loan.location || '—'}</span></div>
      </div>
      {onEdit && <div className="card-action-row"><button type="button" className="text-button" onClick={() => onEdit(loan.id)}>View / edit</button></div>}
    </div>)}</div>}
  </section>;
}
