import { useState, useEffect, useMemo } from 'react';
import { STATUSES } from '../lib/constants';
import { nextAssetCode, statusClass } from '../lib/utils';
import { getAssetEffectiveOwnershipHistory } from '../lib/assetIntegrity';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';

export default function AssetForm({ assetId, onClose, onOpenChangeOwner }) {
  const { db, addAsset, updateAsset, addCategory, addStatus, addLocation, addDepartment } = useDb();
  const toast = useToast();
  const { user } = useAuth();
  const canAddCategory = ['ADMIN', 'OPERATOR'].includes(user?.role);

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

  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

  // Re-sync form when assetId changes
  useEffect(() => {
    if (existing) {
      setForm({ ...existing });
    } else {
      setForm(makeBlank());
      setActiveTab('details');
    }
    setErrors({});
    setSubmitError('');
  }, [assetId]);

  // Effective ownership history for this asset including all loans and assignments
  const ownershipHistory = useMemo(() => {
    if (!existing) return [];
    return getAssetEffectiveOwnershipHistory(existing, db.loans);
  }, [existing, db.loans]);

  const set = (field) => (e) => {
    const val = e.target.value;
    setForm((prev) => ({ ...prev, [field]: val }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (submitError) {
      setSubmitError('');
    }
  };

  const handleStatusChange = (e) => {
    const nextStatus = e.target.value;
    setForm((prev) => {
      // If user chooses 'Available', holder defaults to IT department
      if (nextStatus === 'Available') {
        return { ...prev, status: 'Available', owner: 'IT department', department: 'IT' };
      }
      if (nextStatus === 'Assigned' && prev.owner === 'IT department') {
        return { ...prev, status: 'Assigned', owner: '', department: '' };
      }
      return { ...prev, status: nextStatus };
    });
  };

  const handleOwnerChange = (e) => {
    const nextOwner = e.target.value;
    setForm((prev) => {
      const isItDept = nextOwner.trim().toLowerCase() === 'it department';
      const hasEmployeeHolder = Boolean(nextOwner && nextOwner.trim() && !isItDept);
      let nextStatus = prev.status;
      // If assigned to an employee, it must be 'Assigned' status, not 'Available'
      if (hasEmployeeHolder && prev.status === 'Available') {
        nextStatus = 'Assigned';
      } else if (!hasEmployeeHolder && prev.status === 'Assigned') {
        nextStatus = 'Available';
      }
      return { ...prev, owner: nextOwner, status: nextStatus };
    });
  };

  const handleAddCategory = async () => {
    const name = window.prompt('Enter a name for the new asset category');
    if (name === null || !name.trim()) return;
    try {
      const category = await addCategory(name);
      setForm((prev) => ({ ...prev, category: category.name }));
      toast(`Category “${category.name}” added`);
    } catch (error) {
      toast(error.message || 'Could not add category');
    }
  };

  const handleAddDirectoryOption = async (label, addOption, field) => {
    const name = window.prompt(`Enter a name for the new ${label.toLowerCase()}`);
    if (name === null || !name.trim()) return;
    try {
      const value = await addOption(name);
      setForm((prev) => ({ ...prev, [field]: value }));
      toast(`${label} “${value}” added`);
    } catch (error) {
      toast(error.message || `Could not add ${label.toLowerCase()}`);
    }
  };

  const handleAddStatus = async () => {
    const name = window.prompt('Enter a name for the new asset status');
    if (name === null || !name.trim()) return;
    try {
      const status = await addStatus(name);
      setForm((prev) => ({ ...prev, status: status.name }));
      toast(`Status “${status.name}” added`);
    } catch (error) {
      toast(error.message || 'Could not add asset status');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const code = String(form.code || '').trim();

    const newErrors = {};
    if (!code) newErrors.code = 'Asset number is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setSubmitError('Please fill in required field: Asset number');
      toast('Required field missing: Asset number');
      document.getElementById('code')?.focus();
      return;
    }

    setSubmitError('');

    const isItDept = String(form.owner || '').trim().toLowerCase() === 'it department';
    const hasEmployeeHolder = Boolean(form.owner && form.owner.trim() && !isItDept);
    let validatedStatus = form.status;
    if (hasEmployeeHolder && validatedStatus === 'Available') {
      validatedStatus = 'Assigned';
    } else if (!hasEmployeeHolder && validatedStatus === 'Assigned') {
      validatedStatus = 'Available';
    }

    const payload = {
      ...form,
      code,
      name: form.name || code,
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
          <h2>{existing ? `Asset: ${existing.code}` : 'Add asset'}</h2>
          {existing && (
            <span className={`status ${statusClass(existing.status)}`}>
              {existing.status}
            </span>
          )}
        </div>
      </div>

      <p className="modal-intro" style={{ marginBottom: '10px' }}>
        {existing
          ? `Asset Number: ${existing.code} • Current Holder: ${existing.owner || 'None (Unassigned)'}`
          : 'The asset remains the master record through every assignment and return.'}
      </p>

      {/* Tabs for existing asset */}
      {existing && (
        <div className="loan-tabs" style={{ marginBottom: '12px' }}>
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
        <form onSubmit={handleSubmit} noValidate>
          {submitError && (
            <div className="modal-warning-banner" role="alert">
              <span className="warning-icon">⚠️</span>
              <span>{submitError}</span>
            </div>
          )}

          <div className="asset-form-grid">
            {/* ROW 1: Hardware Specs & Identity */}
            <div className="field">
              <label htmlFor="code">
                Asset number <span className="required-asterisk">*</span>
              </label>
              <input
                id="code"
                value={form.code}
                onChange={set('code')}
                className={errors.code ? 'input-error-red' : ''}
                placeholder="e.g. SPE-1001"
                required
              />
              {errors.code && <span className="field-error-msg">⚠️ {errors.code}</span>}
            </div>
            <div className="field">
              <div className="asset-category-label">
                <label htmlFor="category">Category</label>
                {canAddCategory && <button type="button" className="text-button" onClick={handleAddCategory}>+ Add</button>}
              </div>
              <select id="category" value={form.category} onChange={set('category')}>
                {[...new Set([...(db.categories || []).map((category) => category.name), form.category].filter(Boolean))].map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="model">Model</label>
              <input id="model" value={form.model} onChange={set('model')} />
            </div>

            {/* ROW 2: Inventory, Status & Custody */}
            <div className="field">
              <label htmlFor="serial">Serial number</label>
              <input id="serial" value={form.serial} onChange={set('serial')} />
            </div>
            <div className="field">
              <div className="asset-category-label">
                <label htmlFor="status">Status</label>
                {canAddCategory && <button type="button" className="text-button" onClick={handleAddStatus}>+ Add</button>}
              </div>
              <select id="status" value={form.status} onChange={handleStatusChange}>
                {[...new Set([...STATUSES, ...(db.statuses || []).map((item) => item.name)])].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <div className="asset-category-label">
                <label htmlFor="location">Location</label>
                {canAddCategory && <button type="button" className="text-button" onClick={() => handleAddDirectoryOption('Location', addLocation, 'location')}>+ Add</button>}
              </div>
              <select id="location" value={form.location} onChange={set('location')}>
                {[...new Set([...(db.locations || []), form.location].filter(Boolean))].map((location) => <option key={location} value={location}>{location}</option>)}
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

            {/* ROW 3: Department, Issued Date & Notes */}
            <div className="field">
              <div className="asset-category-label">
                <label htmlFor="department">Department</label>
                {canAddCategory && <button type="button" className="text-button" onClick={() => handleAddDirectoryOption('Department', addDepartment, 'department')}>+ Add</button>}
              </div>
              <select id="department" value={form.department || ''} onChange={set('department')}>
                <option value="">Select department</option>
                {[...new Set([...(db.departments || []), form.department].filter(Boolean))].map((department) => <option key={department} value={department}>{department}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="issuedDate">Issued date</label>
              <input id="issuedDate" type="date" value={form.issuedDate || ''} onChange={set('issuedDate')} />
            </div>
            <div className="field col-span-2">
              <label htmlFor="notes">Notes</label>
              <input id="notes" value={form.notes} onChange={set('notes')} placeholder="Optional notes or asset condition" />
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: '14px' }}>
            <button type="button" className="button ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="button">{existing ? 'Save changes' : 'Create asset'}</button>
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
            <div className="ownership-history-wrap">
              <table className="ownership-history-table">
                <thead>
                  <tr>
                    <th style={{ width: '160px', whiteSpace: 'nowrap' }}>Date / Time</th>
                    <th style={{ width: '145px' }}>Previous Holder</th>
                    <th style={{ width: '155px' }}>New Holder</th>
                    <th style={{ width: '125px' }}>Location</th>
                    <th style={{ width: '165px' }}>Reason / Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {ownershipHistory.map((item) => (
                    <tr key={item.id} className="history-row">
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <code style={{ fontSize: '11px', color: 'var(--ink)' }}>{item.date}</code>
                      </td>
                      <td>
                        {item.previousOwner === 'IT department' ? (
                          <span className="it-dept-badge">IT department</span>
                        ) : (
                          <span>{item.previousOwner || 'None'}</span>
                        )}
                      </td>
                      <td>
                        {item.newOwner === 'IT department' ? (
                          <span className="it-dept-badge">IT department</span>
                        ) : (
                          <strong>{item.newOwner || 'None'}</strong>
                        )}
                        {item.department && item.newOwner !== 'IT department' && (
                          <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{item.department}</div>
                        )}
                      </td>
                      <td>{item.location || '—'}</td>
                      <td>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
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
                      <td style={{ color: 'var(--muted)', fontSize: '11px', lineHeight: 1.45 }}>{item.notes || '—'}</td>
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
