import { useState } from 'react';
import { nowLocalIso } from '../lib/utils';
import { buildIpAddress, ipAddressToForm, isIpAddressInvalid } from '../lib/ipAddress';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { buildLoanEquipment, equipmentToForm, isBusinessTraveler } from '../lib/loanEquipment';
import AssetAutocomplete from './AssetAutocomplete';
import DirectorySelect from './DirectorySelect';
import LoanEquipmentFields from './LoanEquipmentFields';
import IPAddressFields from './IPAddressFields';

export default function EditLoanForm({ loanId, onClose }) {
  const { db, updateLoan } = useDb();
  const loan = db.loans.find((l) => l.id === loanId);
  return loan ? <LoanEditor key={loan.id} loan={loan} db={db} updateLoan={updateLoan} onClose={onClose} /> : null;
}

function LoanEditor({ loan, db, updateLoan, onClose }) {
  const toast = useToast();
  const equipment = loan.equipment || {};

  const [form, setForm] = useState({
    assetCode: loan.assetCode || '',
    assignee: loan.assignee || loan.borrower || '',
    assigneeType: loan.assigneeType || 'Business traveler',
    knoxId: loan.knoxId || '',
    ...ipAddressToForm(loan.ip),
    startDate: (loan.startDate || loan.loanDate || '').slice(0, 10),
    endDate: isBusinessTraveler(loan.assigneeType) ? (loan.endDate || loan.dueDate || '').slice(0, 10) : '',
    pickupDate: loan.pickupDate || '',
    returnDate: loan.returnDate || loan.returnedDate || '',
    location: loan.location || '',
    department: loan.department || '',
    ...equipmentToForm(equipment),
    others: loan.others || '',
    note: loan.note || loan.purpose || '',
  });

  const updateField = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'assigneeType' && !isBusinessTraveler(value) ? { endDate: '' } : {}),
    }));
  };
  const set = (field) => (event) => updateField(field, event.target.value);

  const stampNow = (field) => () => setForm((prev) => ({ ...prev, [field]: nowLocalIso() }));

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!form.knoxId.trim()) {
      return toast('Knox ID is required');
    }

    if (isIpAddressInvalid(form)) {
      return toast('IP subnet and number must each be between 0 and 255');
    }

    if (isBusinessTraveler(form.assigneeType) && form.startDate && form.endDate && form.endDate < form.startDate) {
      return toast('End date cannot be earlier than start date');
    }

    const ip = buildIpAddress(form);

    const changes = {
      assetCode: form.assetCode,
      assignee: form.assignee,
      assigneeType: form.assigneeType,
      knoxId: form.knoxId,
      ip,
      location: form.location,
      startDate: form.startDate,
      loanDate: form.startDate,
      endDate: isBusinessTraveler(form.assigneeType) ? form.endDate : '',
      dueDate: isBusinessTraveler(form.assigneeType) ? form.endDate : '',
      pickupDate: form.pickupDate,
      returnDate: form.returnDate,
      returnedDate: form.returnDate,
      department: form.department,
      others: form.others,
      note: form.note,
      equipment: { ...equipment, ...buildLoanEquipment(form, form.assetCode) },
    };

    const assetUpdates = {
      code: form.assetCode,
      owner: form.assignee,
      location: form.location,
    };

    updateLoan(loan.id, changes, assetUpdates);
    toast('Loan updated');
    onClose();
  };

  return (
    <>
      <h2>Edit loan record</h2>
      <p className="modal-intro">
        Update any loan field. Pickup and return can be added here after creation.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="assignee">Assignee</label>
            <input id="assignee" value={form.assignee} onChange={set('assignee')} />
          </div>
          <div className="field">
            <label htmlFor="assigneeType">Assignee type</label>
            <select id="assigneeType" value={form.assigneeType} onChange={set('assigneeType')}>
              <option value="Business traveler">Business traveler</option>
              <option value="Employee">Employee (Internal)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="knoxId">Knox ID <span style={{ color: '#be665a' }}>*</span></label>
            <input
              id="knoxId"
              value={form.knoxId}
              onChange={set('knoxId')}
              placeholder="e.g. KNOX-1234"
              required
            />
          </div>

          {/* IP address */}
          <IPAddressFields form={form} onChange={updateField} />

          <DirectorySelect id="location" label="Rental location" options={db.locations} value={form.location} onChange={set('location')} preserveCurrentValue />
          <div className="field">
            <label htmlFor="startDate">Start date</label>
            <input id="startDate" type="date" value={form.startDate} onChange={set('startDate')} />
          </div>
          <div className="field">
            <label htmlFor="endDate">Due date (Business travelers only)</label>
            <input
              id="endDate"
              type="date"
              value={form.endDate}
              onChange={set('endDate')}
              disabled={!isBusinessTraveler(form.assigneeType)}
            />
          </div>

          {/* Pickup timestamp */}
          <div className="timestamp-field">
            <label htmlFor="pickupDate">
              Pickup timestamp
              <span className="field-hint"> (Clear to revert to Scheduled)</span>
            </label>
            <div className="timestamp-control">
              <input
                id="pickupDate"
                type="datetime-local"
                value={form.pickupDate}
                onChange={set('pickupDate')}
              />
              <button type="button" className="timestamp-button" onClick={stampNow('pickupDate')} title="Stamp current time">◷</button>
              {form.pickupDate && (
                <button
                  type="button"
                  className="button ghost"
                  style={{ padding: '6px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}
                  onClick={() => setForm((prev) => ({ ...prev, pickupDate: '' }))}
                  title="Remove pickup date (revert to Scheduled)"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Return timestamp */}
          <div className="timestamp-field">
            <label htmlFor="returnDate">
              Return timestamp
              <span className="field-hint"> (Clear to revert to Loaned)</span>
            </label>
            <div className="timestamp-control">
              <input
                id="returnDate"
                type="datetime-local"
                value={form.returnDate}
                onChange={set('returnDate')}
              />
              <button type="button" className="timestamp-button" onClick={stampNow('returnDate')} title="Stamp current time">◷</button>
              {form.returnDate && (
                <button
                  type="button"
                  className="button ghost"
                  style={{ padding: '6px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}
                  onClick={() => setForm((prev) => ({ ...prev, returnDate: '' }))}
                  title="Remove return date (revert to Loaned)"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Equipment */}
          <div className="field full">
            <label style={{ fontWeight: 700, fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
              Equipment Checklist
            </label>
            <div className="equipment-grid">
              <div className="equipment-field asset-autocomplete-wrapper">
                <label htmlFor="edit-assetCode">Laptop / asset number</label>
                <AssetAutocomplete
                  id="edit-assetCode"
                  value={form.assetCode}
                  onChange={(value) => updateField('assetCode', value)}
                  onSelectAsset={(asset) => {
                    setForm((prev) => ({
                      ...prev,
                      assetCode: asset.code,
                      location: prev.location || asset.location || prev.location,
                      department: (prev.department === 'Operations' && asset.department) ? asset.department : prev.department,
                    }));
                  }}
                  placeholder="e.g. 432 or SPE-4321..."
                />
              </div>
              <LoanEquipmentFields form={form} idPrefix="edit-" onChange={updateField} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="others">Others</label>
            <input id="others" value={form.others} onChange={set('others')} />
          </div>
          <div className="field full">
            <label htmlFor="note">Note</label>
            <textarea id="note" value={form.note} onChange={set('note')} />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="button ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="button">Save changes</button>
        </div>
      </form>
    </>
  );
}
