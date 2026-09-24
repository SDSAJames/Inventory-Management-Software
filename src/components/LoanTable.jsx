import { useState } from 'react';
import { readableLoanDate } from '../lib/utils';
import { statusClass } from '../lib/utils';

const HEADERS = [
  'No', 'Action', 'Assignee', 'Type', 'Knox ID', 'Rental location', 'IP',
  'Start date', 'Due date', 'Pickup', 'Return',
  'Laptop', 'Adapter', 'Cable', 'Dongle', 'Keyboard', 'Mouse', 'Monitor', 'Ethernet',
  'Others', 'Note',
];

export default function LoanTable({ loans, assets, editMode, onSaveLoan, onReturnLoan }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);

  const startEdit = (loan) => {
    setEditingId(loan.id);
    setDraft({
      ...loan,
      equipment: { ...(loan.equipment || {}) },
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = () => {
    if (draft) {
      onSaveLoan(draft);
    }
    setEditingId(null);
    setDraft(null);
  };

  const update = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const updateEq = (field, value) => {
    setDraft((prev) => ({
      ...prev,
      equipment: { ...prev.equipment, [field]: value },
    }));
  };

  if (!loans.length) {
    return <div className="empty">No loan records yet.</div>;
  }

  return (
    <div className="table-wrap">
      <table className="loan-table">
        <thead>
          <tr>
            {HEADERS.map((h, i) => (
              <th
                key={i}
                className={i === 0 ? 'col-no' : i === 1 ? 'col-action' : undefined}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loans.map((loan, index) => {
            const eq = loan.equipment || {};
            const asset = assets.find((a) => a.code === loan.assetCode);
            const isEditing = editingId === loan.id;

            if (isEditing && draft) {
              const deq = draft.equipment || {};
              return (
                <tr key={loan.id} className="editing-row">
                  <td className="col-no">{index + 1}</td>
                  <td className="col-action">
                    <div className="edit-actions">
                      <button className="text-button" onClick={saveEdit}>Save</button>
                      <button className="text-button" onClick={cancelEdit}>Cancel</button>
                    </div>
                  </td>
                  <td><input className="inline-input" value={draft.assignee || ''} onChange={(e) => update('assignee', e.target.value)} /></td>
                  <td>
                    <select className="inline-select" value={draft.assigneeType || 'Business traveler'} onChange={(e) => update('assigneeType', e.target.value)}>
                      <option>Business traveler</option>
                      <option>Employee</option>
                    </select>
                  </td>
                  <td><input className="inline-input" value={draft.knoxId || ''} onChange={(e) => update('knoxId', e.target.value)} /></td>
                  <td><input className="inline-input" value={draft.location || ''} onChange={(e) => update('location', e.target.value)} /></td>
                  <td><input className="inline-input" value={draft.ip || ''} onChange={(e) => update('ip', e.target.value)} /></td>
                  <td><input className="inline-input" type="date" value={(draft.startDate || draft.loanDate || '').slice(0, 10)} onChange={(e) => update('startDate', e.target.value)} /></td>
                  <td><input className="inline-input" type="date" value={(draft.endDate || draft.dueDate || '').slice(0, 10)} onChange={(e) => update('endDate', e.target.value)} /></td>
                  <td><input className="inline-input" type="datetime-local" value={draft.pickupDate || ''} onChange={(e) => update('pickupDate', e.target.value)} /></td>
                  <td><input className="inline-input" type="datetime-local" value={draft.returnDate || draft.returnedDate || ''} onChange={(e) => update('returnDate', e.target.value)} /></td>
                  <td><input className="inline-input" value={draft.assetCode || ''} onChange={(e) => update('assetCode', e.target.value)} /></td>
                  <td><input className="inline-input" value={deq.Adapter || ''} onChange={(e) => updateEq('Adapter', e.target.value)} /></td>
                  <td><input className="inline-input" value={deq.Cable || ''} onChange={(e) => updateEq('Cable', e.target.value)} /></td>
                  <td><input className="inline-input" value={deq.Dongle || ''} onChange={(e) => updateEq('Dongle', e.target.value)} /></td>
                  <td><input className="inline-input" value={deq.Keyboard || ''} onChange={(e) => updateEq('Keyboard', e.target.value)} /></td>
                  <td><input className="inline-input" value={deq.Mouse || ''} onChange={(e) => updateEq('Mouse', e.target.value)} /></td>
                  <td><input className="inline-input" value={deq.Monitor || ''} onChange={(e) => updateEq('Monitor', e.target.value)} /></td>
                  <td><input className="inline-input" value={deq['Ethernet cable'] || ''} onChange={(e) => updateEq('Ethernet cable', e.target.value)} /></td>
                  <td><input className="inline-input" value={draft.others || ''} onChange={(e) => update('others', e.target.value)} /></td>
                  <td><input className="inline-input" value={draft.note || draft.purpose || ''} onChange={(e) => update('note', e.target.value)} /></td>
                </tr>
              );
            }

            return (
              <tr key={loan.id}>
                <td className="col-no">{index + 1}</td>
                <td className="col-action">
                  <div className="edit-actions">
                    {editMode && (
                      <button className="text-button" onClick={() => startEdit(loan)} title="Edit inline">✎</button>
                    )}
                    {!editMode && (
                      <button className="text-button" onClick={() => startEdit(loan)}>Edit</button>
                    )}
                    {(loan.status === 'Active' || loan.status === 'Overdue') && (
                      <button className="text-button" onClick={() => onReturnLoan(loan.id)}>Return</button>
                    )}
                  </div>
                </td>
                <td>{loan.assignee || loan.borrower || ''}</td>
                <td>{loan.assigneeType || ''}</td>
                <td>{loan.knoxId || ''}</td>
                <td>{loan.location || asset?.location || ''}</td>
                <td>{loan.ip || ''}</td>
                <td>{readableLoanDate(loan.startDate || loan.loanDate)}</td>
                <td>{readableLoanDate(loan.endDate || loan.dueDate)}</td>
                <td>{readableLoanDate(loan.pickupDate)}</td>
                <td>{readableLoanDate(loan.returnDate || loan.returnedDate)}</td>
                <td>{loan.assetCode || ''}</td>
                <td>{eq.Adapter || ''}</td>
                <td>{eq.Cable || ''}</td>
                <td>{eq.Dongle || ''}</td>
                <td>{eq.Keyboard || ''}</td>
                <td>{eq.Mouse || ''}</td>
                <td>{eq.Monitor || ''}</td>
                <td>{eq['Ethernet cable'] || ''}</td>
                <td>{loan.others || ''}</td>
                <td>{loan.note || loan.purpose || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
