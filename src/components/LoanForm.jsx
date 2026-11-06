import { useState } from 'react';
import { todayIso } from '../lib/utils';
import { buildIpAddress, isIpAddressInvalid } from '../lib/ipAddress';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { buildLoanEquipment, newLoanEquipmentForm, updateLoanFormField, isBusinessTraveler } from '../lib/loanEquipment';
import { findAssetByCode, matchesAssetCategory, PC_CATEGORIES, MONITOR_CATEGORIES } from '../lib/assetCategories';
import LoanDirectoryFields from './LoanDirectoryFields';
import LoanEquipmentSection from './LoanEquipmentSection';
import IPAddressFields from './IPAddressFields';
import { DEFAULT_LOCATION } from '../../shared/referenceData.js';

export default function LoanForm({ onClose, defaultAssigneeType = 'Business traveler', onSuccess }) {
  const { db, addLoan } = useDb();
  const toast = useToast();

  const [form, setForm] = useState({
    assetCode: '',
    requestPc: false,
    requestMonitor: false,
    assigneeType: defaultAssigneeType,
    assignee: '',
    knoxId: '',
    ipSubnet: '',
    ipNumber: '',
    startDate: todayIso(),
    pickupDate: '',
    pickedUp: false,
    endDate: '',
    location: '',
    department: '',
    ...newLoanEquipmentForm(),
    others: '',
    note: '',
  });

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

    const newErrors = {};
    const assetCode = form.assetCode.trim();
    const knoxId = form.knoxId.trim();
    const assignee = form.assignee.trim();

    if (!knoxId) newErrors.knoxId = 'Knox ID is required';
    if (form.pickedUp && !form.pickupDate) newErrors.pickupDate = 'Enter the pickup date or uncheck Picked up';

    const existingPcCode = findAssetByCode(db.assets, assetCode);
    if (existingPcCode && !matchesAssetCategory(existingPcCode.category, PC_CATEGORIES)) {
      newErrors.assetCode = 'Select a Laptop or MES PC asset';
    }

    const monitorCode = form.monitor.trim();
    if (monitorCode) {
      const monitorAsset = findAssetByCode(db.assets, monitorCode);
      const selectedMonitor = monitorAsset && matchesAssetCategory(monitorAsset.category, MONITOR_CATEGORIES);
      if (!selectedMonitor) newErrors.monitor = 'Select a monitor from the matching asset list';
    }

    // Due date is optional. If provided, validate that end date is not earlier than start date
    if (isBusinessTraveler(form.assigneeType) && form.startDate && form.endDate && form.endDate < form.startDate) {
      newErrors.endDate = 'Due date cannot be earlier than start date';
    }

    if (isIpAddressInvalid(form)) {
      newErrors.ip = 'IP subnet and number must each be between 0 and 255';
    }

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

    const ip = buildIpAddress(form);

    // A pickup date records a handover now; leaving it blank keeps this as a scheduled loan.
    const loanData = {
      assetCode,
      assignee,
      assigneeType: form.assigneeType,
      knoxId,
      ip,
      startDate: form.startDate,
      loanDate: form.startDate,
      endDate: isBusinessTraveler(form.assigneeType) ? form.endDate : '',
      dueDate: isBusinessTraveler(form.assigneeType) ? form.endDate : '',
      pickupDate: form.pickupDate,
      returnDate: '',
      location: form.location || DEFAULT_LOCATION,
      department: form.department,
      equipment: {
        ...buildLoanEquipment(form, assetCode),
        RequestedPC: form.requestPc || Boolean(assetCode),
        RequestedMonitor: form.requestMonitor || Boolean(monitorCode),
      },
      others: form.others,
      note: form.note,
    };

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
          {/* Assignee type (defaults to Business traveler) */}
          <div className="field">
            <label htmlFor="assigneeType">Assignee type</label>
            <select id="assigneeType" value={form.assigneeType} onChange={set('assigneeType')}>
              <option value="Business traveler">Business traveler</option>
              <option value="Employee">Employee (Internal)</option>
            </select>
          </div>

          {/* Assignee */}
          <div className="field">
            <label htmlFor="assignee">Assignee <span className="field-hint">(Optional)</span></label>
            <input
              id="assignee"
              placeholder="Full name or username"
              value={form.assignee}
              onChange={set('assignee')}
              className={errors.assignee ? 'input-error-red' : ''}
            />
            {errors.assignee && (
              <span className="field-error-msg">⚠️ {errors.assignee}</span>
            )}
          </div>

          {/* Knox ID */}
          <div className="field">
            <label htmlFor="knoxId">
              Knox ID <span className="required-asterisk">*</span>
            </label>
            <input
              id="knoxId"
              value={form.knoxId}
              onChange={set('knoxId')}
              placeholder="e.g. wnjef.123 or KNOX-1234"
              className={errors.knoxId ? 'input-error-red' : ''}
              required
            />
            {errors.knoxId && (
              <span className="field-error-msg">⚠️ {errors.knoxId}</span>
            )}
          </div>

          {/* IP address */}
          <IPAddressFields form={form} optional onChange={updateField} />

          {/* Dates */}
          <div className="field">
            <label htmlFor="startDate">Start / Scheduled date</label>
            <input id="startDate" type="date" value={form.startDate} onChange={set('startDate')} />
          </div>
          <div className="field">
            <label htmlFor="endDate">
              Due date <span className="field-hint">(Business travelers only)</span>
            </label>
            <input
              id="endDate"
              type="date"
              value={form.endDate}
              onChange={set('endDate')}
              disabled={!isBusinessTraveler(form.assigneeType)}
              className={errors.endDate ? 'invalid-input' : ''}
            />
            {errors.endDate && (
              <span className="field-error-msg">{errors.endDate}</span>
            )}
          </div>

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

          <div className="field">
            <label htmlFor="others">Others / Peripherals</label>
            <input
              id="others"
              type="text"
              placeholder="e.g. Headset, Privacy filter"
              value={form.others}
              onChange={set('others')}
            />
          </div>

          <div className="field loan-entry-note">
            <label htmlFor="note">Note / Purpose</label>
            <textarea
              id="note"
              rows={1}
              placeholder="Project purpose, special requirements, or condition notes..."
              value={form.note}
              onChange={set('note')}
            />
          </div>
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
