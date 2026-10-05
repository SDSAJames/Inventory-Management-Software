import { useState } from 'react';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { todayIso } from '../lib/utils';

export default function ChangeOwnerModal({ asset, onClose, onDone }) {
  const { db, changeAssetOwner } = useDb();
  const toast = useToast();

  const [newOwner, setNewOwner] = useState('');
  const [department, setDepartment] = useState(asset?.department || '');
  const [reason, setReason] = useState('Reassigned');
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState('');

  if (!asset) return null;

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!newOwner.trim()) {
      toast('Please specify a new owner or select unassigned');
      return;
    }

    changeAssetOwner(asset.id, {
      newOwner: newOwner.trim(),
      department: department.trim(),
      reason,
      notes: notes.trim(),
      date,
    });

    toast(`Ownership for ${asset.code} transferred to ${newOwner.trim()}`);
    if (onDone) onDone();
    onClose();
  };

  const handleClearOwner = () => {
    changeAssetOwner(asset.id, {
      newOwner: '',
      department: '',
      reason: 'Unassigned / Returned to Pool',
      notes: notes.trim() || 'Cleared ownership',
      date,
    });
    toast(`Ownership cleared for ${asset.code}`);
    if (onDone) onDone();
    onClose();
  };

  return (
    <div className="change-owner-dialog">
      <h2>Change Asset Ownership</h2>
      <p className="modal-intro">
        Transfer ownership for <strong>{asset.name}</strong> (<code>{asset.code}</code>).
        All changes are permanently logged to this asset's history log.
      </p>

      <div className="timestamp-dialog-card">
        <dl>
          <dt>Asset:</dt>
          <dd><strong>{asset.name}</strong> <code>{asset.code}</code></dd>
          <dt>Current holder:</dt>
          <dd>{asset.owner || '— None (Unassigned)'}</dd>
          <dt>Current status:</dt>
          <dd>{asset.status}</dd>
          <dt>Location:</dt>
          <dd>{asset.location || '—'}</dd>
        </dl>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="newOwnerInput">New owner / holder <span style={{ color: '#be665a' }}>*</span></label>
            <input
              id="newOwnerInput"
              list="employeeList"
              placeholder="Select or enter holder name"
              value={newOwner}
              onChange={(e) => {
                setNewOwner(e.target.value);
                const emp = db.employees.find(
                  (em) => em.name.toLowerCase() === e.target.value.toLowerCase()
                );
                if (emp && emp.department) {
                  setDepartment(emp.department);
                }
              }}
              required
            />
            <datalist id="employeeList">
              {db.employees.map((e, idx) => (
                <option key={idx} value={e.name}>{e.department ? `(${e.department})` : ''}</option>
              ))}
            </datalist>
          </div>

          <div className="field">
            <label htmlFor="ownerDepartment">Department</label>
            <input
              id="ownerDepartment"
              placeholder="e.g. IT, Operations, Finance"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="transferReason">Transfer reason</label>
            <select
              id="transferReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="Reassigned">Reassigned to new staff</option>
              <option value="New Hire">New Hire onboarding</option>
              <option value="Department Transfer">Department Transfer</option>
              <option value="Temporary Handover">Temporary Handover</option>
              <option value="Permanent Allocation">Permanent Allocation</option>
              <option value="Returned to Pool">Returned to Pool</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="transferDate">Effective date</label>
            <input
              id="transferDate"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="field full">
            <label htmlFor="transferNotes">Transfer notes (optional)</label>
            <input
              id="transferNotes"
              placeholder="e.g. Relocated to 2nd floor, replaced old laptop"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="form-actions" style={{ justifyContent: 'space-between', marginTop: '22px' }}>
          {asset.owner ? (
            <button
              type="button"
              className="button danger-btn"
              style={{ background: '#be665a', borderColor: '#be665a', color: 'white' }}
              onClick={handleClearOwner}
            >
              Clear current holder
            </button>
          ) : <div />}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="button ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button">
              Confirm Ownership Change
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
