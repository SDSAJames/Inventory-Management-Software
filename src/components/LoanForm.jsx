import { useState } from 'react';
import { todayIso } from '../lib/utils';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { updateLoanFormField, isBusinessTraveler } from '../lib/loanEquipment';
import { createLoanForm, loanFormErrors, buildLoanFormData } from '../lib/loanForms';
import LoanDirectoryFields from './LoanDirectoryFields';
import LoanEquipmentSection from './LoanEquipmentSection';
import AssigneeFields from './AssigneeFields';
import LoanDateFields from './LoanDateFields';
import LoanNoteFields from './LoanNoteFields';
import { DEFAULT_LOCATION } from '../../shared/referenceData.js';
import { pcAssetCode } from '../../shared/pcReferences.js';

export default function LoanForm({ onClose, defaultAssigneeType = 'Business traveler', onSuccess }) {
  const { db, addLoan } = useDb();
  const toast = useToast();

  const [form, setForm] = useState(() => createLoanForm(undefined, defaultAssigneeType));

  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

  const updateField = (field, val) => {
    setForm((prev) => updateLoanFormField(prev, field, val));
    const errorKey = field === 'ipSubnet' || field === 'ipNumber' ? 'ip' : field;
    if (errors[errorKey]) {
      setErrors((prev) => ({ ...prev, [errorKey]: null }));
    }
    if (submitError) {
      setSubmitError('');
    }
  };
  const set = (field) => (event) => updateField(field, event.target.value);

  const handleSubmit = (e) => {
    e.preventDefault();

    const assetCode = pcAssetCode(form.assetCode);
    const assignee = form.assignee.trim();
    const knoxId = form.knoxId.trim();
    const newErrors = loanFormErrors(form, { assets: db.assets, validateDevices: true, confirmPickup: true });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const firstError = Object.values(newErrors)[0];
      setSubmitError(`Please fill in required fields: ${firstError}`);
      toast(firstError);

      if (newErrors.knoxId) document.getElementById('knoxId')?.focus();
      else if (newErrors.assetCode) document.getElementById('assetCode')?.focus();
      else if (newErrors.monitor) document.getElementById('monitorAssetCode')?.focus();
      return;
    }

    setSubmitError('');

    const loanData = buildLoanFormData(form);

    const assetUpdates = assetCode && form.pickupDate
      ? {
          code: assetCode,
          location: form.location || DEFAULT_LOCATION,
          ...(form.pickupDate ? { owner: assignee, status: 'On loan' } : {}),
        }
      : null;

    const newEmployee = assignee ? {
      name: assignee,
      department: form.department,
      position: form.assigneeType,
      knoxId,
    } : null;

    addLoan(loanData, assetUpdates, newEmployee);
    const recordType = isBusinessTraveler(form.assigneeType) ? 'Loan' : 'Assignment';
    toast(form.pickupDate ? `${recordType} recorded with pickup date` : `${recordType} scheduled successfully`);

    if (onSuccess) {
      onSuccess(loanData);
    }
    onClose();
  };

  return (
    <div className="loan-entry">
      <div className="modal-header-section">
        <h2>Record assignment or loan</h2>
        <p className="modal-intro">
          Assign equipment to an employee or loan it to a business traveler. Only Knox ID is required. Leave Picked up unchecked to schedule equipment without changing inventory.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {submitError && (
          <div className="modal-warning-banner" role="alert">
            <span className="warning-icon">⚠️</span>
            <span>{submitError}</span>
          </div>
        )}

        <div className="form-grid">
          <AssigneeFields form={form} onChange={updateField} errors={errors} />

          <LoanDateFields form={form} onChange={updateField} errors={errors} />

          <div className="field">
            <label htmlFor="pickedUp">Pickup confirmation</label>
            <label className="pickup-confirmation-control"><input id="pickedUp" type="checkbox" checked={form.pickedUp} onChange={(e) => {
              const checked = e.target.checked;
              setForm((previous) => ({ ...previous, pickedUp: checked, pickupDate: checked ? previous.pickupDate || todayIso() : '' }));
              setErrors((previous) => ({ ...previous, pickupDate: null }));
              setSubmitError('');
            }} /> Picked up</label>
          </div>
          {form.pickedUp && <div className="field">
            <label htmlFor="pickupDate">Pickup date <span className="required-asterisk">*</span></label>
            <input id="pickupDate" type="date" value={form.pickupDate} onChange={set('pickupDate')} required />
            {errors.pickupDate && <span className="field-error-msg">{errors.pickupDate}</span>}
          </div>}

          {/* Location & department */}
          <LoanDirectoryFields form={form} onChange={updateField} locations={db.locations} departments={db.departments} />

          <LoanEquipmentSection form={form} onChange={updateField} locations={db.locations} errors={errors} />

          <LoanNoteFields form={form} onChange={updateField} compact />
        </div>

        <div className="form-actions">
          <button type="button" className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button">
            {form.pickupDate ? 'Record pickup' : 'Schedule pickup'}
          </button>
        </div>
      </form>
    </div>
  );
}
