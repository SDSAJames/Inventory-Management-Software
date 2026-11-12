import { QUANTITY_FIELDS } from '../../shared/equipment.js';
import { PC_CATEGORIES, MONITOR_CATEGORIES } from '../lib/assetCategories';
import AssetAutocomplete from './AssetAutocomplete';
import EquipmentQuantityInput from './EquipmentQuantityInput';

const quantities = QUANTITY_FIELDS;

export default function EquipmentAccessoryList({ form, onChange, idPrefix, monitorSearch = false, returning = false, pcField }) {
  return <div className="handover-equipment">
    <div className="handover-devices">
      {pcField && <div className="field"><label htmlFor={idPrefix + 'pc'}>PC asset number</label>
        <AssetAutocomplete id={idPrefix + 'pc'} categoryFilter={PC_CATEGORIES} allowCustom={returning}
          value={form[pcField] || ''} onChange={(value) => onChange(pcField, value)}
          placeholder={returning ? 'Returned PC, or leave blank if missing' : 'Search laptop or MES PC asset number'} />
      </div>}
      <div className="field"><label htmlFor={idPrefix + 'monitor'}>Monitor asset number</label>
        {monitorSearch ? <AssetAutocomplete id={idPrefix + 'monitor'} categoryFilter={MONITOR_CATEGORIES}
          value={form.monitor === '0' ? '' : form.monitor} onChange={(value) => onChange('monitor', value)} placeholder="Search monitor asset number" />
          : <input id={idPrefix + 'monitor'} type="text" value={form.monitor} onChange={(event) => onChange('monitor', event.target.value)} placeholder="Returned monitor, or leave blank if missing" />}
      </div>
    </div>
    <div className="handover-quantity-heading"><strong>Accessories</strong><span>{returning ? 'Enter quantities received. Use 0 for missing items.' : 'Enter quantities handed over. Use 0 for items not included.'}</span></div>
    <div className="handover-quantities">{quantities.map((field) => <div className="field" key={field.key}>
      <label htmlFor={idPrefix + field.key}>{field.label}</label>
      <EquipmentQuantityInput id={idPrefix + field.key} aria-label={field.label + (returning ? ' returned quantity' : ' quantity')}
        value={form[field.key]} placeholder="0" onChange={(event) => onChange(field.key, event.target.value)} />
    </div>)}</div>
    <div className="field"><label htmlFor={idPrefix + 'others'}>Others / Peripherals</label>
      <input id={idPrefix + 'others'} type="text" value={form.others} onChange={(event) => onChange('others', event.target.value)} placeholder="e.g. Laptop bag, security lock, headset" />
    </div>
  </div>;
}
