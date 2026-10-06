import { useState, useEffect, useMemo } from 'react';
import { STATUSES } from '../lib/constants';
import { nextAssetCode, statusClass } from '../lib/utils';
import { getAssetEffectiveOwnershipHistory } from '../lib/assetIntegrity';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';

export default function AssetForm({ assetId, onClose, onOpenChangeOwner }) {
  const { db, addAsset, updateAsset } = useDb();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'loans' | 'ownership'

  const existing = assetId ? db.assets.find((a) => a.id === assetId) : null;
  const currentTab = existing ? activeTab : 'details';

  const makeBlank = () => ({
    code: nextAssetCode(db.assets.length),
    name: '',
    category: 'Laptop',
    model: '',
    serial: '',
    status: 'Available',
    location: db.locations[0] || '',
    owner: '',
    department: '',
    issuedDate: '',
    notes: '',
  });

  const [form, setForm] = useState(() => {
    if (existing) return { ...existing };
    return makeBlank();
  });

  // Re-sync form when assetId changes
  useEffect(() => {
    if (existing) {
      setForm({ ...existing });
    } else {
      setForm(makeBlank());
      setActiveTab('details');
    }
  }, [assetId]);

  // Effective ownership history for this asset including all loans and assignments
  const ownershipHistory = useMemo(() => {
    if (!existing) return [];
    return getAssetEffectiveOwnershipHistory(existing, db.loans);
  }, [existing, db.loans]);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleStatusChange = (e) => {
    const nextStatus = e.target.value;
    setForm((prev) => {
      // If user chooses 'Available', holder must be cleared
      if (nextStatus === 'Available') {
        return { ...prev, status: 'Available', owner: '' };
      }
      return { ...prev, status: nextStatus };
    });
  };

  const handleOwnerChange = (e) => {
    const nextOwner = e.target.value;
    setForm((prev) => {
      const hasHolder = Boolean(nextOwner && nextOwner.trim());
      let nextStatus = prev.status;
      // If there is a current holder, it must be 'Assigned' status, not 'Available'
      if (hasHolder && prev.status === 'Available') {
        nextStatus = 'Assigned';
      } else if (!hasHolder && prev.status === 'Assigned') {
        nextStatus = 'Available';
      }
      return { ...prev, owner: nextOwner, status: nextStatus };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.code || !form.name) {
      toast('Asset code and name are required');
      return;
    }

    const hasHolder = Boolean(form.owner && form.owner.trim());
    let validatedStatus = form.status;
    if (hasHolder && validatedStatus === 'Available') {
      validatedStatus = 'Assigned';
    } else if (!hasHolder && validatedStatus === 'Assigned') {
      validatedStatus = 'Available';
    }

    const payload = {
      ...form,
      owner: form.owner ? form.owner.trim() : '',
      status: validatedStatus,
    };

    if (existing) {
      updateAsset(assetId, payload);
      toast('Asset updated');
    } else {
      addAsset(payload);
      toast('Asset added to the register');
    }
    onClose();
  };

  return (
    <div className="asset-detail-container">
      <div className="asset-detail-header">
        <div className="asset-title-group">
          <h2>{existing ? `Asset: ${existing.name}` : 'Add asset'}</h2>
          {existing && (
            <span className={`status ${statusClass(existing.status)}`}>
              {existing.status}
            </span>
          )}
        </div>
      </div>

      <p className="modal-intro" style={{ marginBottom: '16px' }}>
        {existing
          ? `Code: ${existing.code} • Current Holder: ${existing.owner || 'None (Unassigned)'}`
          : 'The asset remains the master record through every assignment and return.'}
      </p>

      {/* Tabs for existing asset */}
      {existing && (
        <div className="loan-tabs" style={{ marginBottom: '18px' }}>
          <button
            type="button"
            className={`loan-tab ${currentTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            📋 Details
          </button>
          <button
            type="button"
            className={`loan-tab ${currentTab === 'ownership' ? 'active' : ''}`}
            onClick={() => setActiveTab('ownership')}
          >
            👤 Ownership History
            <span className="loan-tab-count">{ownershipHistory.length}</span>
          </button>
        </div>
      )}

      {/* TAB 1: DETAILS FORM */}
      {currentTab === 'details' && (
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="code">Asset code</label>
              <input id="code" value={form.code} onChange={set('code')} required />
            </div>
            <div className="field">
              <label htmlFor="name">Asset name</label>
              <input id="name" value={form.name} onChange={set('name')} />
            </div>
            <div className="field">
              <label htmlFor="category">Category</label>
              <input id="category" value={form.category} onChange={set('category')} />
            </div>
            <div className="field">
              <label htmlFor="model">Model</label>
              <input id="model" value={form.model} onChange={set('model')} />
            </div>
            <div className="field">
              <label htmlFor="serial">Serial number</label>
              <input id="serial" value={form.serial} onChange={set('serial')} />
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" value={form.status} onChange={handleStatusChange}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="location">Location</label>
              <select id="location" value={form.location} onChange={set('location')}>
                {db.locations.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="owner">Current holder</label>
                {existing && onOpenChangeOwner && (
                  <button
                    type="button"
                    className="text-button"
                    style={{ fontSize: '11px', textDecoration: 'underline' }}
                    onClick={() => onOpenChangeOwner(existing)}
                  >
                    Transfer Owner →
                  </button>
                )}
              </div>
              <input id="owner" value={form.owner} onChange={handleOwnerChange} placeholder="Holder name" />
            </div>
            <div className="field">
              <label htmlFor="department">Department</label>
              <input id="department" value={form.department} onChange={set('department')} />
            </div>
            <div className="field">
              <label htmlFor="issuedDate">Issued date</label>
              <input id="issuedDate" type="date" value={form.issuedDate || ''} onChange={set('issuedDate')} />
            </div>
            <div className="field full">
              <label htmlFor="notes">Notes</label>
              <input id="notes" value={form.notes} onChange={set('notes')} />
            </div>
          </div>

          <div className="form-actions" style={{ justifyContent: 'space-between', marginTop: '22px' }}>
            {existing && onOpenChangeOwner ? (
              <button
                type="button"
                className="button secondary"
                onClick={() => onOpenChangeOwner(existing)}
              >
                👤 Change Owner
              </button>
            ) : <div />}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="button ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="button">{existing ? 'Save changes' : 'Create asset'}</button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: OWNERSHIP & CUSTODY HISTORY (Unified with loans) */}
      {currentTab === 'ownership' && existing && (
        <div className="asset-history-tab">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <strong>Ownership &amp; Custody History ({ownershipHistory.length})</strong>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Comprehensive timeline of all permanent assignments, loans, and returns
              </div>
            </div>
            {onOpenChangeOwner && (
              <button
                type="button"
                className="button secondary"
                style={{ padding: '6px 12px', fontSize: '11px' }}
                onClick={() => onOpenChangeOwner(existing)}
              >
                + Transfer Ownership
              </button>
            )}
          </div>

          {ownershipHistory.length === 0 ? (
            <div className="empty" style={{ padding: '24px' }}>
              No ownership transfers or loan history recorded yet.
              {existing?.owner && (
                <div style={{ marginTop: '8px', fontSize: '12px' }}>
                  Current holder: <strong>{existing.owner}</strong> ({existing.department || 'No department'})
                </div>
              )}
            </div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: '340px', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date / Time</th>
                    <th>Previous Holder</th>
                    <th>New Holder</th>
                    <th>Location</th>
                    <th>Reason / Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {ownershipHistory.map((item) => (
                    <tr key={item.id}>
                      <td><code>{item.date}</code></td>
                      <td>{item.previousOwner || 'None'}</td>
                      <td>
                        <strong>{item.newOwner || 'None'}</strong>
                        {item.department && (
                          <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{item.department}</div>
                        )}
                      </td>
                      <td>{item.location || '—'}</td>
                      <td>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span className="batch-chip" style={{ fontSize: '10px' }}>
                            {item.reason || 'Reassigned'}
                          </span>
                          {item.isLoan && item.loanStatus && (
                            <span className={`status ${statusClass(item.loanStatus)}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                              {item.loanStatus}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: '11px' }}>{item.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="form-actions" style={{ marginTop: '20px' }}>
            <button type="button" className="button ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
