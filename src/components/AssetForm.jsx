import { useState } from 'react';
import { STATUSES } from '../lib/constants';
import { nextAssetCode } from '../lib/utils';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';

export default function AssetForm({ assetId, onClose }) {
  const { db, addAsset, updateAsset } = useDb();
  const toast = useToast();

  const existing = assetId ? db.assets.find((a) => a.id === assetId) : null;

  const [form, setForm] = useState(() => {
    if (existing) return { ...existing };
    return {
      code: nextAssetCode(db.assets.length),
      name: '',
      category: 'Laptop',
      model: '',
      serial: '',
      status: 'Available',
      location: db.locations[0] || '',
      owner: '',
      department: '',
      condition: 'Good',
      notes: '',
    };
  });

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.code || !form.name) {
      toast('Asset code and name are required');
      return;
    }
    if (existing) {
      updateAsset(assetId, form);
      toast('Asset updated');
    } else {
      addAsset(form);
      toast('Asset added to the register');
    }
    onClose();
  };

  return (
    <>
      <h2>{existing ? 'Asset details' : 'Add asset'}</h2>
      <p className="modal-intro">The asset remains the master record through every assignment and return.</p>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="code">Asset code</label>
            <input id="code" value={form.code} onChange={set('code')} required />
          </div>
          <div className="field">
            <label htmlFor="name">Asset name</label>
            <input id="name" value={form.name} onChange={set('name')} />
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <input id="category" value={form.category} onChange={set('category')} />
          </div>
          <div className="field">
            <label htmlFor="model">Model</label>
            <input id="model" value={form.model} onChange={set('model')} />
          </div>
          <div className="field">
            <label htmlFor="serial">Serial number</label>
            <input id="serial" value={form.serial} onChange={set('serial')} />
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="location">Location</label>
            <select id="location" value={form.location} onChange={set('location')}>
              {db.locations.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="owner">Current holder</label>
            <input id="owner" value={form.owner} onChange={set('owner')} />
          </div>
          <div className="field">
            <label htmlFor="department">Department</label>
            <input id="department" value={form.department} onChange={set('department')} />
          </div>
          <div className="field">
            <label htmlFor="condition">Condition</label>
            <input id="condition" value={form.condition} onChange={set('condition')} />
          </div>
          <div className="field full">
            <label htmlFor="notes">Notes</label>
            <input id="notes" value={form.notes} onChange={set('notes')} />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="button ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="button">{existing ? 'Save changes' : 'Create asset'}</button>
        </div>
      </form>
    </>
  );
}
