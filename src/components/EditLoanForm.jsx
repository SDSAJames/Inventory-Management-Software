import { useState } from 'react';
import { IP_PREFIX } from '../lib/constants';
import { validOctet, nowLocalIso } from '../lib/utils';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';

export default function EditLoanForm({ loanId, onClose }) {
  const { db, updateLoan } = useDb();
  const toast = useToast();

  const loan = db.loans.find((l) => l.id === loanId);
  if (!loan) return null;

  const equipment = loan.equipment || {};
  const rawIp = String(loan.ip || '').replace(/^105\.101\./, '');
  const ipParts = rawIp.split('.');

  const [form, setForm] = useState({
    assetCode: loan.assetCode || '',
    assignee: loan.assignee || loan.borrower || '',
    assigneeType: loan.assigneeType || 'Business traveler',
    knoxId: loan.knoxId || '',
    ipSubnet: ipParts[0] || '',
    ipNumber: ipParts[1] || '',
    startDate: (loan.startDate || loan.loanDate || '').slice(0, 10),
    endDate: (loan.endDate || loan.dueDate || '').slice(0, 10),
    pickupDate: loan.pickupDate || '',
    returnDate: loan.returnDate || loan.returnedDate || '',
    location: loan.location || '',
    department: loan.department || '',
    adapter: equipment.Adapter || '',
    cable: equipment.Cable || '',
    dongle: equipment.Dongle || '',
    keyboard: equipment.Keyboard || '',
    mouse: equipment.Mouse || '',
    monitor: equipment.Monitor || '',
    ethernetCable: equipment['Ethernet cable'] || '',
    others: loan.others || '',
    note: loan.note || loan.purpose || '',
  });

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const stampNow = (field) => () => setForm((prev) => ({ ...prev, [field]: nowLocalIso() }));

  const ipInvalid =
    (form.ipSubnet && !validOctet(form.ipSubnet)) ||
    (form.ipNumber && !validOctet(form.ipNumber));

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validOctet(form.ipSubnet) || !validOctet(form.ipNumber)) {
      return toast('IP subnet and number must each be between 0 and 255');
    }

    const ip = form.ipSubnet && form.ipNumber
      ? `${IP_PREFIX}${form.ipSubnet}.${form.ipNumber}`
      : '';

    const changes = {
      assetCode: form.assetCode,
      assignee: form.assignee,
      assigneeType: form.assigneeType,
      knoxId: form.knoxId,
      ip,
      location: form.location,
      startDate: form.startDate,
      loanDate: form.startDate,
      endDate: form.endDate,
      dueDate: form.endDate,
      pickupDate: form.pickupDate,
      returnDate: form.returnDate,
      returnedDate: form.returnDate,
      department: form.department,
      others: form.others,
      note: form.note,
      equipment: {
        Adapter: form.adapter,
        Cable: form.cable,
        Dongle: form.dongle,
        Keyboard: form.keyboard,
        Mouse: form.mouse,
        Monitor: form.monitor,
        'Ethernet cable': form.ethernetCable,
      },
    };

    const assetUpdates = {
      code: form.assetCode,
      owner: form.assignee,
      location: form.location,
    };

    updateLoan(loanId, changes, assetUpdates);
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
            <label htmlFor="assetCode">Laptop / asset number</label>
            <input id="assetCode" value={form.assetCode} onChange={set('assetCode')} />
          </div>
          <div className="field">
            <label htmlFor="assignee">Assignee</label>
            <input id="assignee" value={form.assignee} onChange={set('assignee')} />
          </div>
          <div className="field">
            <label htmlFor="assigneeType">Assignee type</label>
            <input id="assigneeType" value={form.assigneeType} onChange={set('assigneeType')} />
          </div>
          <div className="field">
            <label htmlFor="knoxId">Knox ID</label>
            <input id="knoxId" value={form.knoxId} onChange={set('knoxId')} />
          </div>

          {/* IP address */}
          <div className="ip-field">
            <label>IP address</label>
            <div className="ip-control">
              <span>{IP_PREFIX}</span>
              <input
                className={ipInvalid && form.ipSubnet ? 'invalid-input' : ''}
                maxLength={3}
                value={form.ipSubnet}
                onChange={set('ipSubnet')}
                placeholder="subnet"
              />
              <span className="ip-separator">.</span>
              <input
                className={ipInvalid && form.ipNumber ? 'invalid-input' : ''}
                maxLength={3}
                value={form.ipNumber}
                onChange={set('ipNumber')}
                placeholder="number"
              />
              {ipInvalid && (
                <div className="ip-warning visible" role="alert">
                  Each IP value must be between 0 and 255.
                </div>
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="location">Rental location</label>
            <input id="location" value={form.location} onChange={set('location')} />
          </div>
          <div className="field">
            <label htmlFor="startDate">Start date</label>
            <input id="startDate" type="date" value={form.startDate} onChange={set('startDate')} />
          </div>
          <div className="field">
            <label htmlFor="endDate">Due date</label>
            <input id="endDate" type="date" value={form.endDate} onChange={set('endDate')} />
          </div>

          {/* Pickup timestamp */}
          <div className="timestamp-field">
            <label htmlFor="pickupDate">Pickup timestamp</label>
            <div className="timestamp-control">
              <input
                id="pickupDate"
                type="datetime-local"
                value={form.pickupDate}
                onChange={set('pickupDate')}
              />
              <button type="button" className="timestamp-button" onClick={stampNow('pickupDate')} title="Stamp current time">◷</button>
            </div>
          </div>

          {/* Return timestamp */}
          <div className="timestamp-field">
            <label htmlFor="returnDate">Return timestamp</label>
            <div className="timestamp-control">
              <input
                id="returnDate"
                type="datetime-local"
                value={form.returnDate}
                onChange={set('returnDate')}
              />
              <button type="button" className="timestamp-button" onClick={stampNow('returnDate')} title="Stamp current time">◷</button>
            </div>
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
              <label htmlFor={`edit-${key}`}>{label}</label>
              <input id={`edit-${key}`} value={form[key]} onChange={set(key)} />
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
          <button type="submit" className="button">Save changes</button>
        </div>
      </form>
    </>
  );
}
