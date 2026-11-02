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
    requestPc: false,
    requestMonitor: false,
    assigneeType: defaultAssigneeType,
    assignee: '',
    knoxId: '',
    ipSubnet: '',
    ipNumber: '',
    startDate: todayIso(),
    pickupDate: '',
    endDate: '',
    location: '',
    department: (db.departments || []).includes('Operations') ? 'Operations' : '',
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

    if (!knoxId) newErrors.knoxId = 'Knox ID is required';

    const existingPcCode = (db.assets || []).find((asset) =>
      String(asset.code || '').trim().toLowerCase() === assetCode.toLowerCase()
    );
    const existingPcCategory = String(existingPcCode?.category || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (existingPcCode && !['laptop', 'mespc', 'pc'].includes(existingPcCategory)) {
      newErrors.assetCode = 'Select a Laptop or MES PC asset';
    }

    const monitorCode = form.monitor.trim();
    if (monitorCode) {
      const selectedMonitor = (db.assets || []).some((asset) =>
        String(asset.code || '').trim().toLowerCase() === monitorCode.toLowerCase() &&
        ['monitor', 'monitors'].includes(String(asset.category || '').trim().toLowerCase())
      );
      if (!selectedMonitor) newErrors.monitor = 'Select a monitor from the matching asset list';
    }

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

      if (newErrors.knoxId) document.getElementById('knoxId')?.focus();
      else if (newErrors.assetCode) document.getElementById('assetCode')?.focus();
      else if (newErrors.monitor) document.getElementById('monitorAssetCode')?.focus();
      return;
    }

    setSubmitError('');

    const ip = form.ipSubnet && form.ipNumber
      ? `${IP_PREFIX}${form.ipSubnet}.${form.ipNumber}`
      : '';

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
      location: form.location || 'Head Office',
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
          location: form.location || 'Head Office',
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
    toast(form.pickupDate ? 'Loan recorded with pickup date' : 'Loan scheduled successfully');

    if (onSuccess) {
      onSuccess(loanData);
    }
    onClose();
  };

  return (
    <div className="loan-entry">
      <div className="modal-header-section">
        <h2>Record internal loan</h2>
        <p className="modal-intro">
          Only Knox ID is required. Leave pickup blank to schedule equipment without changing inventory.
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
            <label htmlFor="pickupDate">Pickup date <span className="field-hint">(if already picked up)</span></label>
            <input id="pickupDate" type="date" value={form.pickupDate} onChange={set('pickupDate')} />
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
            <select
              id="location"
              value={form.location}
              onChange={set('location')}
            >
              <option value="">Select rental location</option>
              {(db.locations || []).map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="department">Department</label>
            <select
              id="department"
              value={form.department}
              onChange={set('department')}
            >
              <option value="">Select department</option>
              {(db.departments || []).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Equipment Checklist */}
          <div className="field full">
            <div className="equipment-header-row">
              <fieldset className="loan-equipment-requests">
                <legend>Equipment requested</legend>
                <label><input type="checkbox" checked={form.requestPc} onChange={(event) => setForm((prev) => ({ ...prev, requestPc: event.target.checked, ...(!event.target.checked ? { assetCode: '' } : {}) }))} /> Laptop / PC</label>
                <label><input type="checkbox" checked={form.requestMonitor} onChange={(event) => setForm((prev) => ({ ...prev, requestMonitor: event.target.checked, ...(!event.target.checked ? { monitor: '' } : {}) }))} /> Monitor</label>
              </fieldset>
              <span className="equipment-header-hint">Asset numbers can be assigned later.</span>
            </div>

            <div className="equipment-grid">
              {/* Laptop / asset number with searchable autocompletion */}
              <div className="equipment-field asset-autocomplete-wrapper">
                <label htmlFor="assetCode">PC asset number <span className="field-hint">(Optional)</span></label>
                <AssetAutocomplete
                  id="assetCode"
                  categoryFilter={['Laptop', 'MES PC', 'PC']}
                  allowCustom
                  value={form.assetCode}
                  hasError={Boolean(errors.assetCode)}
                  onChange={(val) => {
                    setForm((prev) => ({ ...prev, assetCode: val, requestPc: val ? true : prev.requestPc }));
                    if (errors.assetCode) setErrors((prev) => ({ ...prev, assetCode: null }));
                  }}
                  onSelectAsset={(asset) => {
                    setForm((prev) => ({
                      ...prev,
                      assetCode: asset.code,
                      location: prev.location || ((db.locations || []).includes(asset.location) ? asset.location : ''),
                      department: ((!prev.department || prev.department === 'Operations') && (db.departments || []).includes(asset.department)) ? asset.department : prev.department,
                    }));
                  }}
                  placeholder="Search laptop or MES PC asset number..."
                />
                {errors.assetCode && (
                  <span className="field-error-msg">⚠️ {errors.assetCode}</span>
                )}
              </div>

              {LOAN_EQUIPMENT_FIELDS.map(([label, key, placeholder]) => (
                <div className="equipment-field" key={key}>
                  <label htmlFor={key === 'monitor' ? 'monitorAssetCode' : key}>{label}</label>
                  {key === 'monitor' ? (
                    <AssetAutocomplete
                      id="monitorAssetCode"
                      value={form.monitor}
                      categoryFilter={['Monitor', 'Monitors']}
                      hasError={Boolean(errors.monitor)}
                      onChange={(value) => {
                        setForm((prev) => ({ ...prev, monitor: value, requestMonitor: value ? true : prev.requestMonitor }));
                        if (errors.monitor) setErrors((prev) => ({ ...prev, monitor: null }));
                      }}
                      onSelectAsset={(asset) => {
                        setForm((prev) => ({ ...prev, monitor: asset.code }));
                      }}
                      placeholder="Search monitor asset number..."
                    />
                  ) : (
                    <input
                      id={key}
                      placeholder={placeholder}
                      value={form[key]}
                      onChange={set(key)}
                    />
                  )}
                  {key === 'monitor' && errors.monitor && (
                    <span className="field-error-msg">⚠️ {errors.monitor}</span>
                  )}
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
            {form.pickupDate ? 'Record loan' : 'Schedule loan'}
          </button>
        </div>
      </form>
    </div>
  );
}
