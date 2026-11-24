import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useDb } from '../hooks/useDb';
import { TRANSFER_ITEMS } from '../../shared/loanTransfer.js';
import { isLoanReturned } from '../../shared/loanRules.js';
import EquipmentQuantityInput from './EquipmentQuantityInput';
import { nowLocalIso } from '../lib/utils';

export default function LoanSwapForm({ loan, onClose }) {
  const { db, setDb } = useDb();
  const [secondId, setSecondId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [firstSelection, setFirstSelection] = useState({});
  const [secondSelection, setSecondSelection] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const otherLoans = db.loans.filter((item) => item.id !== loan.id && item.pickupDate && !isLoanReturned(item));
  const other = otherLoans.find((item) => item.id === secondId);
  const matchingOtherLoans = otherLoans.filter((item) => `${item.assignee || ''} ${item.knoxId || ''} ${item.assigneeType || ''}`.toLowerCase().includes(userSearch.trim().toLowerCase()));
  const equipmentFor = (item) => item ? { ...item.equipment, Laptop: item.assetCode || item.equipment?.Laptop, Others: item.others || item.equipment?.Others } : {};
  const firstEquipment = useMemo(() => equipmentFor(loan), [loan]);
  const secondEquipment = equipmentFor(other);
  const available = (equipment) => TRANSFER_ITEMS.filter((key) => equipment[key] && String(equipment[key]) !== '0');
  const renderPicker = (title, equipment, selection, setSelection, prefix) => <fieldset className="field full" disabled={busy}>
    <legend><strong>{title}</strong></legend>
    {!available(equipment).length ? <p className="field-hint">No equipment is recorded on this custody record.</p> : <div className="equipment-grid">{available(equipment).map((key) => <div className="field" key={key}>
      <label><input type="checkbox" checked={Boolean(selection[key])} onChange={(event) => setSelection((prev) => ({ ...prev, [key]: event.target.checked ? String(equipment[key]) : '' }))} /> {key === 'Dongle' ? 'USB Dongle' : key} ({equipment[key]})</label>
      {selection[key] && !['Laptop', 'Monitor'].includes(key) && Number.isFinite(Number(equipment[key])) && <EquipmentQuantityInput aria-label={`${prefix} ${key} quantity`} min="1" max={Number(equipment[key])} value={selection[key]} onChange={(event) => setSelection((prev) => ({ ...prev, [key]: event.target.value }))} />}
    </div>)}</div>}
  </fieldset>;
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (!other) return setError('Choose the other active user.');
    if (!Object.values(firstSelection).some(Boolean) || !Object.values(secondSelection).some(Boolean)) return setError('Select at least one item from each user.');
    setBusy(true);
    try {
      await api.loans.swap(loan.id, { secondId, firstSelection, secondSelection, swapDate: new Date(nowLocalIso()).toISOString() });
      const result = await api.exchange.exportData();
      setDb((previous) => ({ ...previous, ...result.db })); onClose();
    } catch (err) { setError(err.message || 'Could not swap equipment.'); }
    finally { setBusy(false); }
  };
  const label = (item) => `${item.assignee || 'Unnamed'} — ${item.knoxId || 'No Knox ID'} (${item.assigneeType || 'Employee'})`;
  return <form onSubmit={submit}>
    <h2>Swap equipment between users</h2>
    <p>Select items each user will give to the other. Unselected equipment stays with its current user.</p>
    <div className="field swap-user-picker"><label htmlFor="swap-user-search">Find other active user</label><input id="swap-user-search" type="search" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search name, Knox ID, or user type" autoComplete="off" />
      <div className="swap-user-results" role="listbox" aria-label="Active users">
        {matchingOtherLoans.map((item) => <button type="button" role="option" aria-selected={secondId === item.id} className={`swap-user-option ${secondId === item.id ? 'selected' : ''}`} key={item.id} onClick={() => { setSecondId(item.id); setSecondSelection({}); }}>{label(item)}</button>)}
        {!matchingOtherLoans.length && <span className="swap-user-empty">No matching active users.</span>}
      </div>
    </div>
    {renderPicker(`${label(loan)} gives`, firstEquipment, firstSelection, setFirstSelection, label(loan))}
    {other && renderPicker(`${label(other)} gives`, secondEquipment, secondSelection, setSecondSelection, label(other))}
    {error && <p role="alert" className="field-error-msg">{error}</p>}
    <div className="form-actions"><button type="button" className="button ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="button" disabled={busy}>{busy ? 'Swapping…' : 'Swap selected equipment'}</button></div>
  </form>;
}
