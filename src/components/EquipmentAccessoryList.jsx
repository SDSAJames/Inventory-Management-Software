import { EQUIPMENT_FIELDS } from '../../shared/equipment.js';
import { MONITOR_CATEGORIES } from '../lib/assetCategories';
import AssetAutocomplete from './AssetAutocomplete';
import EquipmentQuantityInput from './EquipmentQuantityInput';

const fields = [...EQUIPMENT_FIELDS].sort((a, b) => a.panelOrder - b.panelOrder);

export default function EquipmentAccessoryList({ form, onChange, idPrefix, monitorSearch = false, returning = false }) {
  return <div className="equipment-accessory-list">
    {fields.map((field) => <div key={field.key} className={`accessory-row${field.highlighted ? ' highlight-row' : ''}`}>
      <div className="accessory-info">
        <span className="accessory-icon" aria-hidden="true">{field.icon}</span>
        <div><label htmlFor={`${idPrefix}${field.key}`}><strong>{field.kind === 'asset' ? 'Monitor' : field.label}</strong></label><span className="accessory-desc">{field.description}</span></div>
      </div>
      <div className="accessory-control">
        {field.kind === 'asset' ? monitorSearch ? <AssetAutocomplete id={`${idPrefix}${field.key}`} categoryFilter={MONITOR_CATEGORIES}
          value={form.monitor === '0' ? '' : form.monitor} onChange={(value) => onChange('monitor', value)} placeholder="Search monitor asset number" />
          : <input id={`${idPrefix}${field.key}`} type="text" className="accessory-input accessory-input-wide" value={form.monitor}
            onChange={(event) => onChange('monitor', event.target.value)} placeholder="Tag or 0" />
          : <>
            <div className="quick-btn-group">{['0', '1'].map((quantity) => <button key={quantity} type="button"
              className={`qty-btn ${String(form[field.key] || '0') === quantity ? 'active' : ''}`}
              aria-label={`Set ${field.label} ${returning ? 'returned ' : ''}quantity to ${quantity}`}
              onClick={() => onChange(field.key, quantity)}>{quantity}</button>)}</div>
            <EquipmentQuantityInput id={`${idPrefix}${field.key}`} className="accessory-input" value={form[field.key]}
              onChange={(event) => onChange(field.key, event.target.value)} placeholder={returning ? 'Returned qty' : 'Qty'} />
          </>}
      </div>
    </div>)}
    <div className="accessory-row"><div className="accessory-info"><span className="accessory-icon" aria-hidden="true">💼</span>
      <div><label htmlFor={`${idPrefix}others`}><strong>Others / Peripherals</strong></label><span className="accessory-desc">Bag, lock, headset, etc.</span></div>
    </div><div className="accessory-control"><input id={`${idPrefix}others`} type="text" className="accessory-input accessory-input-wide" value={form.others}
      onChange={(event) => onChange('others', event.target.value)} placeholder="e.g. Laptop bag, security lock" /></div></div>
  </div>;
}
