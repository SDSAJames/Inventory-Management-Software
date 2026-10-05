import { useState } from 'react';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { nowLocalIsoWithSeconds } from '../lib/utils';

export default function ChangeOwnerModal({ asset, onClose, onDone }) {
  const { db, changeAssetOwner, transferReasons, addTransferReason, removeTransferReason } = useDb();
  const toast = useToast();

  const [newOwner, setNewOwner] = useState('');
  const [department, setDepartment] = useState(asset?.department || '');
  const [reason, setReason] = useState(transferReasons[0] || 'Reassigned to new staff');
  const [customReasonInput, setCustomReasonInput] = useState('');
  const [showManageReasons, setShowManageReasons] = useState(false);
  const [newCustomReason, setNewCustomReason] = useState('');

  // Datetime-local supporting full seconds: YYYY-MM-DDTHH:mm:ss
  const [timestamp, setTimestamp] = useState(() => nowLocalIsoWithSeconds());
  const [notes, setNotes] = useState('');

  if (!asset) return null;

  const handleStampCurrentTime = () => {
    setTimestamp(nowLocalIsoWithSeconds());
    toast('Effective timestamp set to current time with seconds');
  };

  const handleAddReason = (e) => {
    e.preventDefault();
    if (!newCustomReason.trim()) return;
    addTransferReason(newCustomReason.trim());
    setReason(newCustomReason.trim());
    setNewCustomReason('');
    toast('Transfer reason added to options');
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!newOwner.trim()) {
      toast('Please specify a new owner or select unassigned');
      return;
    }

    const effectiveReason = reason === '__custom__'
      ? (customReasonInput.trim() || 'Other')
      : reason;

    // If user typed a custom reason, also save to manage list if not present
    if (reason === '__custom__' && customReasonInput.trim()) {
      addTransferReason(customReasonInput.trim());
    }

    changeAssetOwner(asset.id, {
      newOwner: newOwner.trim(),
      department: department.trim(),
      reason: effectiveReason,
      notes: notes.trim(),
      date: timestamp.replace('T', ' '),
    });

    toast(`Ownership for ${asset.code} transferred to ${newOwner.trim()}`);
    if (onDone) onDone();
    onClose();
  };

  const handleClearOwner = () => {
    changeAssetOwner(asset.id, {
      newOwner: '',
      department: '',
      reason: 'Returned to Pool / Unassigned',
      notes: notes.trim() || 'Cleared ownership',
      date: timestamp.replace('T', ' '),
    });
    toast(`Ownership cleared for ${asset.code}`);
    if (onDone) onDone();
    onClose();
  };

  return (
    <div className="change-owner-dialog">
      <div className="asset-detail-header" style={{ marginBottom: '10px' }}>
        <h2 style={{ margin: 0 }}>Change Asset Ownership</h2>
      </div>

      <p className="modal-intro" style={{ marginBottom: '16px' }}>
        Transfer ownership for <strong>{asset.name}</strong> (<code>{asset.code}</code>).
        All changes are permanently logged to this asset's history log with minute &amp; second timestamps.
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
          {/* New Owner */}
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

          {/* Department */}
          <div className="field">
            <label htmlFor="ownerDepartment">Department</label>
            <input
              id="ownerDepartment"
              placeholder="e.g. IT, Operations, Finance"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>

          {/* Transfer Reason with Manage & Manual Typing */}
          <div className="field full">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
              <label htmlFor="transferReason">Transfer reason</label>
              <button
                type="button"
                className="text-button"
                style={{ fontSize: '11px', textDecoration: 'underline' }}
                onClick={() => setShowManageReasons(!showManageReasons)}
              >
                {showManageReasons ? 'Hide reason manager' : '⚙ Manage reason options'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                id="transferReason"
                style={{ flex: 1 }}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {transferReasons.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
                <option value="__custom__">✎ Other (type manually below)...</option>
              </select>
            </div>

            {/* Manual reason typing if selected or user wants custom input */}
            {reason === '__custom__' && (
              <div style={{ marginTop: '8px' }}>
                <input
                  placeholder="Type custom transfer reason..."
                  value={customReasonInput}
                  onChange={(e) => setCustomReasonInput(e.target.value)}
                  required
                />
              </div>
            )}

            {/* Manage Reason Options panel */}
            {showManageReasons && (
              <div className="manage-reasons-box" style={{ marginTop: '10px', padding: '12px', background: '#f7faf8', border: '1px solid var(--line)', borderRadius: '6px' }}>
                <strong style={{ fontSize: '11px', color: 'var(--green-dark)', display: 'block', marginBottom: '6px' }}>
                  Manage Pre-configured Reasons
                </strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {transferReasons.map((r) => (
                    <span key={r} className="batch-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px' }}>
                      {r}
                      {transferReasons.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTransferReason(r)}
                          style={{ background: 'none', border: 'none', color: '#be665a', cursor: 'pointer', padding: 0, fontWeight: 'bold' }}
                          title={`Remove ${r}`}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    placeholder="Add new preset reason..."
                    value={newCustomReason}
                    onChange={(e) => setNewCustomReason(e.target.value)}
                    style={{ flex: 1, padding: '6px 10px', fontSize: '12px' }}
                  />
                  <button
                    type="button"
                    className="button secondary"
                    style={{ padding: '6px 12px', fontSize: '11px', whiteSpace: 'nowrap' }}
                    onClick={handleAddReason}
                  >
                    + Add option
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Effective Date & Time with full seconds */}
          <div className="field full">
            <label htmlFor="transferTimestamp">Effective date &amp; time (with minutes &amp; seconds)</label>
            <div className="timestamp-input-row">
              <input
                id="transferTimestamp"
                type="datetime-local"
                step="1"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
                required
              />
              <button
                type="button"
                className="button ghost"
                style={{ whiteSpace: 'nowrap', padding: '9px 12px' }}
                onClick={handleStampCurrentTime}
                title="Timestamp current exact time"
              >
                ◷ Now (Exact)
              </button>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '3px' }}>
              Recorded format: <code>{timestamp.replace('T', ' ')}</code>
            </div>
          </div>

          {/* Notes */}
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
