import { useState } from 'react';
import { api } from '../lib/api';
import { useDb } from '../hooks/useDb';
import { TRANSFER_ITEMS } from '../../shared/loanTransfer.js';
export default function LoanTransferForm({ loan, onClose }) {
  const { setDb } = useDb();
  const equipment = { ...loan.equipment, Laptop: loan.assetCode || loan.equipment?.Laptop, Others: loan.others };
  const items = TRANSFER_ITEMS.filter((key) => equipment[key] && String(equipment[key]) !== '0');
  const [selection, setSelection] = useState({});
  const [knoxId, setKnoxId] = useState('');
  const [assignee, setAssignee] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api.loans.transfer(loan.id, { knoxId, assignee, selection });
      const result = await api.exchange.exportData();
      setDb((previous) => ({ ...previous, ...result.db })); onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <form onSubmit={submit}><h2>Transfer equipment</h2><p>Select items or quantities moving to the new owner. The original record retains the transfer history.</p>
    <div className="form-grid"><div className="field"><label htmlFor="transfer-knox">New owner Knox ID *</label><input id="transfer-knox" required value={knoxId} onChange={(e) => setKnoxId(e.target.value)} /></div><div className="field"><label htmlFor="transfer-name">Assignee</label><input id="transfer-name" value={assignee} onChange={(e) => setAssignee(e.target.value)} /></div></div>
    <button type="button" className="button ghost" onClick={() => setSelection(Object.fromEntries(items.map((key) => [key, String(equipment[key])])))}>Select all</button>
    <button type="button" className="button ghost" onClick={() => setSelection({})}>Clear all</button>
    <div className="equipment-grid">{items.map((key) => <div className="field" key={key}><label><input type="checkbox" checked={Boolean(selection[key])} onChange={(e) => setSelection((previous) => ({ ...previous, [key]: e.target.checked ? String(equipment[key]) : '' }))} /> {key === 'Dongle' ? 'USB Dongle' : key} ({equipment[key]})</label>{selection[key] && !['Laptop', 'Monitor'].includes(key) && Number.isFinite(Number(equipment[key])) && <input aria-label={`${key} quantity to transfer`} type="number" min="1" max={Number(equipment[key])} value={selection[key]} onChange={(e) => setSelection((previous) => ({ ...previous, [key]: e.target.value }))} />}</div>)}</div>
    {error && <p role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="button" disabled={busy}>{busy ? 'Transferring…' : 'Transfer selected items'}</button></div></form>;
}
