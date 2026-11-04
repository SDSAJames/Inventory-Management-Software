import { useState } from 'react';
import { api } from '../lib/api';
import { useDb } from '../hooks/useDb';
import { TRANSFER_ITEMS } from '../../shared/loanTransfer.js';
import { isLoanReturned } from '../../shared/loanRules.js';
import { todayIso } from '../lib/utils';
export default function LoanTransferForm({ loan, onClose }) {
  const { db, setDb } = useDb();
  const equipment = { ...loan.equipment, Laptop: loan.assetCode || loan.equipment?.Laptop, Others: loan.others };
  const items = TRANSFER_ITEMS.filter((key) => equipment[key] && String(equipment[key]) !== '0');
  const [selection, setSelection] = useState({});
  const [knoxId, setKnoxId] = useState('');
  const [assignee, setAssignee] = useState('');
  const [assigneeType, setAssigneeType] = useState('Employee');
  const [scheduleId, setScheduleId] = useState('');
  const [scheduleSearch, setScheduleSearch] = useState('');
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState('');
  const schedules = db.loans.filter((record) => !record.pickupDate && !isLoanReturned(record) && record.id !== loan.id && String(record.knoxId || '').trim().toLowerCase() !== String(loan.knoxId || '').trim().toLowerCase());
  const scheduleQuery = scheduleSearch.trim().toLowerCase();
  const matchingSchedules = schedules.filter((record) => String(record.knoxId || '').toLowerCase().includes(scheduleQuery));
  const selectedSchedule = schedules.find((record) => record.id === scheduleId);
  const selectedOutsideSearch = selectedSchedule && !matchingSchedules.some((record) => record.id === scheduleId);
  const scheduleLabel = (record) => `${record.knoxId} — ${record.assignee || 'Unnamed recipient'} — ${record.assigneeType || 'Business traveler'} — ${record.startDate?.slice(0, 10) || 'No scheduled date'}`;
  const selectSchedule = (id) => {
    setScheduleId(id);
    const record = schedules.find((item) => item.id === id);
    setKnoxId(record?.knoxId || ''); setAssignee(record?.assignee || '');
    setAssigneeType(record ? record.assigneeType || 'Business traveler' : 'Employee');
    setStartDate(record?.startDate?.slice(0, 10) || todayIso());
    setEndDate(record?.endDate?.slice(0, 10) || '');
    setError('');
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api.loans.transfer(loan.id, { knoxId, assignee, assigneeType, selection, scheduleId: scheduleId || undefined, startDate, endDate });
      const result = await api.exchange.exportData();
      setDb((previous) => ({ ...previous, ...result.db })); onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <form onSubmit={submit}><h2>Transfer equipment</h2><p>Select items moving to the new holder and record whether they are an employee assignment or business-traveler loan. The previous holder's completed record is preserved.</p>
    <div className="field">
      <label htmlFor="transfer-schedule-search">Search pickup schedules by Knox ID</label>
      <input id="transfer-schedule-search" type="search" value={scheduleSearch} onChange={(e) => setScheduleSearch(e.target.value)} placeholder="Enter all or part of a Knox ID" autoComplete="off" spellCheck={false} aria-controls="transfer-schedule" />
      <span className="field-hint" role="status">{matchingSchedules.length ? `${matchingSchedules.length} matching schedule${matchingSchedules.length === 1 ? '' : 's'}` : 'No matching pickup schedules.'}{selectedOutsideSearch ? ' Your selected schedule is retained below.' : ''}</span>
    </div>
    <div className="field"><label htmlFor="transfer-schedule">Recipient / pickup schedule</label><select id="transfer-schedule" value={scheduleId} onChange={(e) => selectSchedule(e.target.value)}><option value="">New recipient record</option>{selectedOutsideSearch && <option value={selectedSchedule.id}>Selected: {scheduleLabel(selectedSchedule)}</option>}{matchingSchedules.map((record) => <option key={record.id} value={record.id}>{scheduleLabel(record)}</option>)}</select></div>
    {scheduleId && <p className="field-hint">This schedule will move to Active with a pickup timestamp and “Pickup by transfer.” Planned equipment is replaced by the items actually transferred.</p>}
    <fieldset disabled={Boolean(scheduleId)} style={{ border: 0, padding: 0, margin: 0 }}>
    <div className="form-grid"><div className="field"><label htmlFor="transfer-type">New holder type *</label><select id="transfer-type" required value={assigneeType} onChange={(e) => setAssigneeType(e.target.value)}><option value="Employee">Employee</option><option value="Business traveler">Business traveler</option></select></div><div className="field"><label htmlFor="transfer-knox">New owner Knox ID *</label><input id="transfer-knox" required value={knoxId} onChange={(e) => setKnoxId(e.target.value)} /></div><div className="field"><label htmlFor="transfer-name">Assignee</label><input id="transfer-name" value={assignee} onChange={(e) => setAssignee(e.target.value)} /></div></div>
    </fieldset>
    <div className="form-grid"><div className="field"><label htmlFor="transfer-start">Start date{assigneeType === 'Business traveler' ? ' *' : ''}</label><input id="transfer-start" type="date" required={assigneeType === 'Business traveler'} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>{assigneeType === 'Business traveler' && <div className="field"><label htmlFor="transfer-end">End date *</label><input id="transfer-end" type="date" required min={startDate || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>}</div>
    <button type="button" className="button ghost" onClick={() => setSelection(Object.fromEntries(items.map((key) => [key, String(equipment[key])])))}>Select all</button>
    <button type="button" className="button ghost" onClick={() => setSelection({})}>Clear all</button>
    <div className="equipment-grid">{items.map((key) => <div className="field" key={key}><label><input type="checkbox" checked={Boolean(selection[key])} onChange={(e) => setSelection((previous) => ({ ...previous, [key]: e.target.checked ? String(equipment[key]) : '' }))} /> {key === 'Dongle' ? 'USB Dongle' : key} ({equipment[key]})</label>{selection[key] && !['Laptop', 'Monitor'].includes(key) && Number.isFinite(Number(equipment[key])) && <input aria-label={`${key} quantity to transfer`} type="number" min="1" max={Number(equipment[key])} value={selection[key]} onChange={(e) => setSelection((previous) => ({ ...previous, [key]: e.target.value }))} />}</div>)}</div>
    {error && <p role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="button" disabled={busy}>{busy ? 'Transferring…' : 'Transfer selected items'}</button></div></form>;
}
