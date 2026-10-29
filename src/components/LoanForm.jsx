import { useState } from 'react';
import { IP_PREFIX } from '../lib/constants';
import { todayIso, validOctet } from '../lib/utils';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { buildLoanEquipment, isBusinessTraveler, LOAN_EQUIPMENT_FIELDS } from '../lib/loanEquipment';
import AssetAutocomplete from './AssetAutocomplete';

export default function LoanForm({ onClose, defaultAssigneeType = 'Business traveler', onSuccess }) {
  const { db, addLoan } = useDb();
  const toast = useToast();

  const [form, setForm] = useState({
    assetCode: '',
    assigneeType: defaultAssigneeType,
    assignee: '',
    knoxId: '',
    ipSubnet: '',
    ipNumber: '',
    startDate: todayIso(),
    endDate: '',
    location: '',
    department: 'Operations',
    adapter: '',
    cable: '',
    dongle: '',
    keyboard: '',
    mouse: '',
    monitor: '',
    ethernetCable: '',
    others: '',
    note: '',
  });

  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

  const set = (field) => (e) => {
    const val = e.target.value;
    setForm((prev) => ({
      ...prev,
      [field]: val,
      ...(field === 'assigneeType' && !isBusinessTraveler(val) ? { endDate: '' } : {}),
    }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
    if (submitError) {
      setSubmitError('');
    }
  };

  const ipInvalid =
    (form.ipSubnet && !validOctet(form.ipSubnet)) ||
    (form.ipNumber && !validOctet(form.ipNumber));

  const handleSubmit = (e) => {
    e.preventDefault();

    const newErrors = {};
    const assetCode = form.assetCode.trim();
    const knoxId = form.knoxId.trim();
    const assignee = form.assignee.trim();

    if (!assetCode) newErrors.assetCode = 'Please select or enter an asset number';
    if (!knoxId) newErrors.knoxId = 'Knox ID is required';
    if (!assignee) newErrors.assignee = 'Assignee name is required';

    // Due date is optional. If provided, validate that end date is not earlier than start date
    if (isBusinessTraveler(form.assigneeType) && form.startDate && form.endDate && form.endDate < form.startDate) {
      newErrors.endDate = 'Due date cannot be earlier than start date';
    }

    if ((form.ipSubnet || form.ipNumber) && (!validOctet(form.ipSubnet) || !validOctet(form.ipNumber))) {
      newErrors.ip = 'IP subnet and number must each be between 0 and 255';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const firstError = Object.values(newErrors)[0];
      setSubmitError(`Please fill in required fields: ${firstError}`);
      toast(firstError);

      if (newErrors.assignee) document.getElementById('assignee')?.focus();
      else if (newErrors.knoxId) document.getElementById('knoxId')?.focus();
      else if (newErrors.assetCode) document.getElementById('assetCode')?.focus();
      return;
    }

    setSubmitError('');

    const ip = form.ipSubnet && form.ipNumber
      ? `${IP_PREFIX}${form.ipSubnet}.${form.ipNumber}`
      : '';

    // Recording an internal loan schedules the pickup. Pickup is processed separately from Scheduled Loans.
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
      pickupDate: '',
      returnDate: '',
      location: form.location || 'Head Office',
      department: form.department,
      equipment: buildLoanEquipment(form, assetCode),
      others: form.others,
      note: form.note,
    };

    const assetUpdates = {
      code: assetCode,
      location: form.location || 'Head Office',
    };

    const newEmployee = {
      name: assignee,
      department: form.department,
      position: form.assigneeType,
      knoxId,
    };

    addLoan(loanData, assetUpdates, newEmployee);
    toast('Loan scheduled successfully');

    if (onSuccess) {
      onSuccess(loanData);
    }
    onClose();
  };

  return (
    <>
      <div className="modal-header-section">
        <h2>Record internal loan</h2>
        <p className="modal-intro">
          Schedule an equipment loan record for an employee or business traveler.
          Equipment pickup is processed separately from the Scheduled Loans page.
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
            <label htmlFor="assignee">
              Assignee <span className="required-asterisk">*</span>
            </label>
            <input
              id="assignee"
              placeholder="Full name or username"
              value={form.assignee}
              onChange={set('assignee')}
              className={errors.assignee ? 'input-error-red' : ''}
              required
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
          <div className="ip-field">
            <label>IP address <span className="field-hint">(Optional)</span></label>
            <div className="ip-control">
              <span>{IP_PREFIX}</span>
              <input
                className={ipInvalid && form.ipSubnet ? 'invalid-input' : ''}
                inputMode="numeric"
                maxLength={3}
                placeholder="subnet"
                aria-label="IP subnet"
                value={form.ipSubnet}
                onChange={set('ipSubnet')}
              />
              <span className="ip-separator">.</span>
              <input
                className={ipInvalid && form.ipNumber ? 'invalid-input' : ''}
                inputMode="numeric"
                maxLength={3}
                placeholder="number"
                aria-label="IP number"
                value={form.ipNumber}
                onChange={set('ipNumber')}
              />
              {ipInvalid && (
                <div className="ip-warning visible" role="alert">
                  Each IP value must be between 0 and 255.
                </div>
              )}
            </div>
          </div>

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

          {/* Location & department */}
          <div className="field">
            <label htmlFor="location">Rental location</label>
            <input
              id="location"
              list="locationList"
              placeholder="e.g. Head Office, Plant 1"
              value={form.location}
              onChange={set('location')}
            />
            <datalist id="locationList">
              {(db.locations || []).map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="department">Department</label>
            <input
              id="department"
              list="deptList"
              placeholder="Operations, IT, Engineering..."
              value={form.department}
              onChange={set('department')}
            />
            <datalist id="deptList">
              {(db.departments || []).map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>

          {/* Equipment Checklist */}
          <div className="field full">
            <div className="equipment-header-row">
              <label style={{ fontWeight: 700, fontSize: '11px', color: 'var(--muted)', margin: 0 }}>
                Equipment Checklist
              </label>
              <span className="equipment-header-hint">
                Type <strong>432</strong> or asset number for instant assignable equipment auto-completion
              </span>
            </div>

            <div className="equipment-grid">
              {/* Laptop / asset number with searchable autocompletion */}
              <div className="equipment-field asset-autocomplete-wrapper">
                <label htmlFor="assetCode">
                  Laptop / asset number <span className="required-asterisk">*</span>
                </label>
                <AssetAutocomplete
                  id="assetCode"
                  value={form.assetCode}
                  hasError={Boolean(errors.assetCode)}
                  onChange={(val) => {
                    setForm((prev) => ({ ...prev, assetCode: val }));
                    if (errors.assetCode) setErrors((prev) => ({ ...prev, assetCode: null }));
                  }}
                  onSelectAsset={(asset) => {
                    setForm((prev) => ({
                      ...prev,
                      assetCode: asset.code,
                      location: prev.location || asset.location || 'Head Office',
                      department: (prev.department === 'Operations' && asset.department) ? asset.department : prev.department,
                    }));
                  }}
                  placeholder="e.g. 432 or SPE-4321..."
                  required
                />
                {errors.assetCode && (
                  <span className="field-error-msg">⚠️ {errors.assetCode}</span>
                )}
              </div>

              {LOAN_EQUIPMENT_FIELDS.map(([label, key, placeholder]) => (
                <div className="equipment-field" key={key}>
                  <label htmlFor={key}>{label}</label>
                  <input
                    id={key}
                    placeholder={placeholder}
                    value={form[key]}
                    onChange={set(key)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="others">Others / Peripherals</label>
            <input
              id="others"
              placeholder="e.g. Headset, Privacy filter"
              value={form.others}
              onChange={set('others')}
            />
          </div>

          <div className="field full">
            <label htmlFor="note">Note / Purpose</label>
            <textarea
              id="note"
              rows={2}
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
            Schedule loan
          </button>
        </div>
      </form>
    </>
  );
}
