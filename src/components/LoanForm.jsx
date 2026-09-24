import { useState } from 'react';
import { IP_PREFIX } from '../lib/constants';
import { todayIso, validOctet } from '../lib/utils';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';

export default function LoanForm({ onClose }) {
  const { db, addLoan } = useDb();
  const toast = useToast();
  const available = db.assets.filter((a) => a.status === 'Available');

  const [form, setForm] = useState({
    assetCode: '',
    assigneeType: 'Business traveler',
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

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const ipInvalid =
    (form.ipSubnet && !validOctet(form.ipSubnet)) ||
    (form.ipNumber && !validOctet(form.ipNumber));

  const handleSubmit = (e) => {
    e.preventDefault();

    const assetCode = form.assetCode.trim();
    const knoxId = form.knoxId.trim();
    if (!assetCode) return toast('Enter an asset number');
    if (!knoxId) return toast('Knox ID is required');
    if (!form.assignee.trim()) return toast('Enter an assignee');
    if (form.assigneeType === 'Business traveler' && !form.endDate) {
      return toast('Enter a due date for a business traveler');
    }
    if ((form.ipSubnet || form.ipNumber) && (!validOctet(form.ipSubnet) || !validOctet(form.ipNumber))) {
      return toast('IP subnet and number must each be between 0 and 255');
    }

    const ip = form.ipSubnet && form.ipNumber
      ? `${IP_PREFIX}${form.ipSubnet}.${form.ipNumber}`
      : '';

    const loanData = {
      assetCode,
      assignee: form.assignee.trim(),
      assigneeType: form.assigneeType,
      knoxId: form.knoxId,
      ip,
      startDate: form.startDate,
      loanDate: form.startDate,
      endDate: form.endDate,
      dueDate: form.endDate,
      pickupDate: '',
      returnDate: '',
      location: form.location,
      department: form.department,
      equipment: {
        Adapter: form.adapter,
        Cable: form.cable,
        Dongle: form.dongle,
        Keyboard: form.keyboard,
        Mouse: form.mouse,
        Monitor: form.monitor,
        'Ethernet cable': form.ethernetCable,
      },
      others: form.others,
      note: form.note,
    };

    const assetUpdates = {
      code: assetCode,
      status: 'On loan',
      owner: form.assignee.trim(),
      department: form.department,
      location: form.location,
    };

    const newEmployee = {
      name: form.assignee.trim(),
      department: form.department,
      position: form.assigneeType,
    };

    addLoan(loanData, assetUpdates, newEmployee);
    toast('Loan recorded');
    onClose();
  };

  const isTraveler = form.assigneeType === 'Business traveler';

  return (
    <>
      <h2>Record internal loan</h2>
      <p className="modal-intro">
        Capture the complete loan-list record for an employee or business traveler.
        Pickup and return can be added later.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          {/* Asset code */}
          <div className="field full">
            <label htmlFor="assetCode">Laptop / asset number</label>
            <input
              id="assetCode"
              list="assetCodeList"
              placeholder="Type asset number, e.g. SPE-1234"
              value={form.assetCode}
              onChange={set('assetCode')}
            />
            <datalist id="assetCodeList">
              {available.map((a) => (
                <option key={a.id} value={a.code}>{a.name}</option>
              ))}
            </datalist>
          </div>

          {/* Assignee type */}
          <div className="field">
            <label htmlFor="assigneeType">Assignee type</label>
            <select id="assigneeType" value={form.assigneeType} onChange={set('assigneeType')}>
              <option>Business traveler</option>
              <option>Employee</option>
            </select>
          </div>

          {/* Assignee */}
          <div className="field">
            <label htmlFor="assignee">Assignee</label>
            <input id="assignee" value={form.assignee} onChange={set('assignee')} />
          </div>

          {/* Knox ID */}
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
          <div className="ip-field">
            <label>IP address</label>
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
            <label htmlFor="startDate">Start date</label>
            <input id="startDate" type="date" value={form.startDate} onChange={set('startDate')} />
          </div>
          <div className={`field${isTraveler ? '' : ' hidden-field'}`}>
            <label htmlFor="endDate">Due date</label>
            <input id="endDate" type="date" value={form.endDate} onChange={set('endDate')} />
          </div>

          {/* Location & department */}
          <div className="field">
            <label htmlFor="location">Rental location</label>
            <input
              id="location"
              list="locationList"
              placeholder="Type rental location"
              value={form.location}
              onChange={set('location')}
            />
            <datalist id="locationList">
              {db.locations.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="department">Department</label>
            <input id="department" value={form.department} onChange={set('department')} />
          </div>

          {/* Equipment */}
          {[
            ['Charging Adapter', 'adapter'],
            ['Charging Cable', 'cable'],
            ['Dongle', 'dongle'],
            ['Keyboard', 'keyboard'],
            ['Mouse', 'mouse'],
            ['Monitor asset number', 'monitor'],
            ['Ethernet cable', 'ethernetCable'],
          ].map(([label, key]) => (
            <div className="equipment-field" key={key}>
              <label htmlFor={key}>{label}</label>
              <input id={key} value={form[key]} onChange={set(key)} />
            </div>
          ))}

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
          <button type="submit" className="button">Create loan</button>
        </div>
      </form>
    </>
  );
}
