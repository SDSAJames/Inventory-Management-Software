import { useState } from 'react';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { nowLocalIsoWithSeconds } from '../lib/utils';

export default function ChangeOwnerModal({ asset, onClose, onDone }) {
  const { db, changeAssetOwner, transferReasons, addTransferReason, removeTransferReason } = useDb();
  const toast = useToast();

  const [newOwner, setNewOwner] = useState('');
  const [department, setDepartment] = useState(asset?.department || '');
  const [location, setLocation] = useState(asset?.location || '');
  const [reason, setReason] = useState('');
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

    if (!reason.trim()) {
      toast('Please enter a transfer reason');
      return;
    }

    const effectiveReason = reason.trim();

    // If typed reason is not in the presets, save it so it appears in suggestions
    if (effectiveReason) {
      addTransferReason(effectiveReason);
    }

    changeAssetOwner(asset.id, {
      newOwner: newOwner.trim(),
      department: department.trim(),
      location: location.trim(),
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
      newOwner: 'IT department',
      department: 'IT',
      location: location.trim() || asset.location || 'IT Store',
      reason: reason.trim() || 'Returned to IT department',
      notes: notes.trim() || 'Returned to IT department custody',
      date: timestamp.replace('T', ' '),
    });
    toast(`Asset ${asset.code} returned to IT department`);
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
          <dt>Current location:</dt>
          <dd>{asset.location || '—'}</dd>
        </dl>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          {/* New Owner */}
          <div className="field full">
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

          {/* Location */}
          <div className="field">
            <label htmlFor="ownerLocation">Location</label>
            <input
              id="ownerLocation"
              list="locationsList"
              placeholder="e.g. Head Office, Regional Office, IT Store"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <datalist id="locationsList">
              {db.locations?.map((loc, idx) => (
                <option key={idx} value={loc} />
              ))}
            </datalist>
          </div>

          {/* Transfer Reason - Directly typeable with datalist & reason options manager */}
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

            <div style={{ position: 'relative' }}>
              <input
                id="transferReason"
                list="transferReasonsList"
                placeholder="Type transfer reason here (e.g. Reassigned to new staff, Project allocation)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
              <datalist id="transferReasonsList">
                {transferReasons.map((r, idx) => (
                  <option key={idx} value={r} />
                ))}
              </datalist>
            </div>

            {/* Quick preset suggestions */}
            {transferReasons.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Quick suggestions:</span>
                {transferReasons.slice(0, 5).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="batch-chip"
                    style={{
                      border: reason === r ? '1px solid var(--accent)' : '1px solid var(--line)',
                      background: reason === r ? '#e8f0fe' : '#f5f5f5',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                    onClick={() => setReason(r)}
                    title={`Click to fill: "${r}"`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}

            {/* Manage Reason Options panel */}
            {showManageReasons && (
              <div className="manage-reasons-box" style={{ marginTop: '10px', padding: '12px', background: '#f7faf8', border: '1px solid var(--line)', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '11px', color: 'var(--green-dark)' }}>
                    Preset Reason Options (click to populate field or manage)
                  </strong>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {transferReasons.map((r) => (
                    <span
                      key={r}
                      className="batch-chip"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 8px',
                        cursor: 'pointer',
                      }}
                      onClick={() => setReason(r)}
                      title="Click to select this reason"
                    >
                      <span>{r}</span>
                      {transferReasons.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTransferReason(r);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#be665a',
                            cursor: 'pointer',
                            padding: 0,
                            fontWeight: 'bold',
                            fontSize: '12px',
                          }}
                          title={`Remove "${r}" option`}
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
          {asset.owner && asset.owner !== 'IT department' ? (
            <button
              type="button"
              className="button danger-btn"
              style={{ background: '#be665a', borderColor: '#be665a', color: 'white' }}
              onClick={handleClearOwner}
            >
              Return to IT department
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
