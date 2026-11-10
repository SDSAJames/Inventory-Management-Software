import { DEFAULT_OWNER, DEFAULT_LOCATION } from "../../shared/referenceData.js";
import { useState } from 'react';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { nowLocalIsoWithSeconds } from '../lib/utils';

import LoanDirectoryFields from './LoanDirectoryFields';

export default function ChangeOwnerModal({ asset, onClose, onDone }) {
  const { db, changeAssetOwner, transferReasons, addTransferReason, removeTransferReason } = useDb();
  const toast = useToast();

  const [newOwner, setNewOwner] = useState('');
  const [department, setDepartment] = useState(asset?.department || '');
  const [location, setLocation] = useState(asset?.location || '');
  const [reason, setReason] = useState('');
  const [showManageReasons, setShowManageReasons] = useState(false);
  const [newCustomReason, setNewCustomReason] = useState('');
  const [errors, setErrors] = useState({});

  // Datetime-local supporting full seconds: YYYY-MM-DDTHH:mm:ss
  const [timestamp, setTimestamp] = useState(() => nowLocalIsoWithSeconds());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  if (!asset) return null;

  const handleAddReason = (e) => {
    e.preventDefault();
    if (!newCustomReason.trim()) return;
    addTransferReason(newCustomReason.trim());
    setReason(newCustomReason.trim());
    setNewCustomReason('');
    if (errors.reason) setErrors((prev) => ({ ...prev, reason: null }));
    toast('Transfer reason added to options');
  };

  const saveTransfer = async (returnToIt = false) => {
    const owner = returnToIt ? '' : newOwner.trim();
    const returning = !owner || owner.toLowerCase() === 'it department';
    const effectiveReason = reason.trim() || (returning ? 'Returned to IT Department' : '');
    if (!effectiveReason || !timestamp) {
      setErrors({ ...(!effectiveReason ? { reason: 'Please enter a transfer reason' } : {}), ...(!timestamp ? { date: 'Enter a transfer date' } : {}) });
      return;
    }
    setSaving(true);
    try {
      await changeAssetOwner(asset.id, {
        newOwner: owner, department: returning ? '' : department.trim(),
        location: returning ? DEFAULT_LOCATION : location.trim(),
        reason: effectiveReason, notes: notes.trim(), date: timestamp.replace('T', ' '),
      });
      if (reason.trim()) addTransferReason(reason.trim());
      toast(returning ? 'Return to IT Department saved for ' + asset.code : 'Ownership change saved for ' + asset.code + ' to ' + owner);
      onDone?.(); onClose();
    } catch (error) { setErrors({ submit: error.message || 'Could not save transfer' }); }
    finally { setSaving(false); }
  };
  const handleSubmit = (event) => { event.preventDefault(); return saveTransfer(); };
  const handleClearOwner = () => saveTransfer(true);

  return (
    <div className="change-owner-dialog">
      <div className="asset-detail-header" style={{ marginBottom: '10px' }}>
        <h2 style={{ margin: 0 }}>Change Asset Ownership</h2>
      </div>

      <p className="modal-intro" style={{ marginBottom: '16px' }}>
        Transfer ownership for Asset number <strong>{asset.code}</strong>.
        All changes are permanently logged to this asset's history log with minute &amp; second timestamps.
      </p>

      <div className="timestamp-dialog-card">
        <dl>
          <dt>Asset number:</dt>
          <dd><strong>{asset.code}</strong></dd>
          <dt>Current holder:</dt>
          <dd>{asset.owner || '— None (Unassigned)'}</dd>
          <dt>Current status:</dt>
          <dd>{asset.status}</dd>
          <dt>Current location:</dt>
          <dd>{asset.location || '—'}</dd>
        </dl>
      </div>

      <form onSubmit={handleSubmit}>
        {errors.submit && <p role="alert" className="field-error-msg">{errors.submit}</p>}
        <div className="form-grid">
          {/* New Owner */}
          <div className="field full">
            <label htmlFor="newOwnerInput">New owner / holder</label>
            <input
              id="newOwnerInput"
              list="employeeList"
              placeholder="Holder name or Knox ID; leave blank to return to IT Department"
              value={newOwner}
              className={errors.newOwner ? 'input-error-red' : ''}
              onChange={(e) => {
                setNewOwner(e.target.value);
                if (errors.newOwner) setErrors((prev) => ({ ...prev, newOwner: null }));
                const emp = db.employees.find(
                  (em) => [em.name, em.knoxId].some((value) => value && value.toLowerCase() === e.target.value.toLowerCase())
                );
                if (emp && emp.department) {
                  setDepartment(emp.department);
                }
              }}
            />
            {errors.newOwner && <span className="field-error-msg">⚠️ {errors.newOwner}</span>}
            <datalist id="employeeList">
              {db.employees.map((e, idx) => (
                <option key={idx} value={e.knoxId || e.name}>{e.name}{e.department ? ` (${e.department})` : ''}</option>
              ))}
            </datalist>
          </div>

          <LoanDirectoryFields form={{ location, department }} locations={db.locations} departments={db.departments} idPrefix="owner-" onChange={(field, value) => field === 'location' ? setLocation(value) : setDepartment(value)} />

          {/* Transfer Reason - Directly typeable with datalist & reason options manager */}
          <div className="field full">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
              <label htmlFor="transferReason">
                Transfer reason <span className="required-asterisk">*</span>
              </label>
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
                className={errors.reason ? 'input-error-red' : ''}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (errors.reason) setErrors((prev) => ({ ...prev, reason: null }));
                }}
                required={Boolean(newOwner.trim())}
              />
              {errors.reason && <span className="field-error-msg">⚠️ {errors.reason}</span>}
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
              <div className="manage-reasons-box" style={{ marginTop: '10px', padding: '12px', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '11px', color: 'var(--blue-dark)' }}>
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
            {errors.date && <span role="alert" className="field-error-msg">{errors.date}</span>}
            <label htmlFor="transferTimestamp">Transfer date &amp; time</label>
            <div className="timestamp-input-row">
              <input
                id="transferTimestamp"
                type="datetime-local"
                step="1"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
                required
              />

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
          {asset.owner && asset.owner !== DEFAULT_OWNER ? (
            <button
              type="button"
              className="button danger-btn"
              style={{ background: '#be665a', borderColor: '#be665a', color: 'white' }}
              onClick={handleClearOwner}
              disabled={saving}
            >
              Return to IT Department
            </button>
          ) : <div />}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="button ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button" disabled={saving}>
              Confirm Ownership Change
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
