import { useState } from 'react';
import { STATUSES } from '../lib/constants';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';

/**
 * BatchEditForm – apply field changes to multiple selected assets.
 *
 * Only fields the user explicitly enables (via checkboxes) are applied.
 * Blank / unchanged fields are left untouched on the target assets.
 */
export default function BatchEditForm({ selectedAssets, onClose, onDone }) {
  const { db, batchUpdateAssets } = useDb();
  const toast = useToast();

  // Which fields are enabled for batch editing
  const [enabled, setEnabled] = useState({
    status: false,
    location: false,
    owner: false,
    department: false,
    category: false,
  });

  // Values to apply
  const [values, setValues] = useState({
    status: 'Available',
    location: db.locations[0] || '',
    owner: '',
    department: '',
    category: '',
  });

  const toggle = (field) =>
    setEnabled((prev) => ({ ...prev, [field]: !prev[field] }));

  const set = (field) => (e) =>
    setValues((prev) => ({ ...prev, [field]: e.target.value }));

  const enabledCount = Object.values(enabled).filter(Boolean).length;

  const handleApply = (e) => {
    e.preventDefault();
    if (enabledCount === 0) {
      toast('Select at least one field to update.');
      return;
    }

    // Build a changes object with only the enabled fields
    const changes = {};
    for (const [field, on] of Object.entries(enabled)) {
      if (on) changes[field] = values[field];
    }

    const ids = new Set(selectedAssets.map((a) => a.id));
    batchUpdateAssets(ids, changes);

    const fieldNames = Object.keys(changes).join(', ');
    toast(`Updated ${fieldNames} on ${selectedAssets.length} asset${selectedAssets.length > 1 ? 's' : ''}.`);

    if (onDone) onDone();
    onClose();
  };

  const FIELDS = [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: STATUSES,
    },
    {
      key: 'location',
      label: 'Location',
      type: 'select',
      options: db.locations,
    },
    {
      key: 'owner',
      label: 'Current holder',
      type: 'text',
      placeholder: 'e.g. John Smith (blank to clear)',
    },
    {
      key: 'department',
      label: 'Department',
      type: 'text',
      placeholder: 'e.g. IT (blank to clear)',
    },
    {
      key: 'category',
      label: 'Category',
      type: 'text',
      placeholder: 'e.g. Laptop',
    },
  ];

  return (
    <>
      <h2>Batch edit {selectedAssets.length} asset{selectedAssets.length > 1 ? 's' : ''}</h2>
      <p className="modal-intro">
        Enable the fields you want to change. Only enabled fields will be updated across all selected assets.
      </p>

      <div className="batch-selected-summary">
        {selectedAssets.map((a) => (
          <span key={a.id} className="batch-chip">{a.code}</span>
        ))}
      </div>

      <form onSubmit={handleApply}>
        <div className="batch-fields">
          {FIELDS.map((f) => (
            <div key={f.key} className={`batch-field-row ${enabled[f.key] ? 'active' : ''}`}>
              <label className="batch-toggle">
                <input
                  type="checkbox"
                  checked={enabled[f.key]}
                  onChange={() => toggle(f.key)}
                />
                <span className="batch-field-label">{f.label}</span>
              </label>
              <div className="batch-field-input">
                {f.type === 'select' ? (
                  <select
                    value={values[f.key]}
                    onChange={set(f.key)}
                    disabled={!enabled[f.key]}
                  >
                    {f.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={values[f.key]}
                    onChange={set(f.key)}
                    disabled={!enabled[f.key]}
                    placeholder={f.placeholder}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="form-actions">
          <button type="button" className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="button"
            disabled={enabledCount === 0}
          >
            Apply to {selectedAssets.length} asset{selectedAssets.length > 1 ? 's' : ''}
          </button>
        </div>
      </form>
    </>
  );
}
