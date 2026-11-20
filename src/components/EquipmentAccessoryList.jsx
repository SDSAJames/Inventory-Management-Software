import { QUANTITY_FIELDS } from '../../shared/equipment.js';
import { PC_CATEGORIES, MONITOR_CATEGORIES } from '../lib/assetCategories';
import AssetAutocomplete from './AssetAutocomplete';
import EquipmentQuantityInput from './EquipmentQuantityInput';

const quantities = QUANTITY_FIELDS;

export default function EquipmentAccessoryList({ form, onChange, idPrefix, monitorSearch = false, returning = false, pcField, issuedEquipment = {} }) {
  return <div className="handover-equipment">
    <div className="handover-devices">
      {pcField && <div className={returning ? 'field return-device-row' : 'field'}>
        {returning && <input className="return-item-check" type="checkbox" aria-label="Laptop returned" checked={Boolean(form[pcField])} disabled={!form[pcField] && !issuedEquipment.Laptop}
          onChange={(event) => onChange(pcField, event.target.checked ? form[pcField] || issuedEquipment.Laptop || '' : '')} />}
        {returning && <span className="return-device-description">Laptop returned</span>}
        <label className={returning ? 'return-device-label' : ''} htmlFor={idPrefix + 'pc'}>{returning ? 'Returned PC asset number' : 'PC asset number'}</label>
        <AssetAutocomplete id={idPrefix + 'pc'} categoryFilter={PC_CATEGORIES} allowCustom={returning}
          value={form[pcField] || ''} onChange={(value) => onChange(pcField, value)}
          placeholder={returning ? 'Returned PC, or leave blank if missing' : 'Search laptop or MES PC asset number'} />
      </div>}
      <div className={returning ? 'field return-device-row' : 'field'}>
        {returning && <input className="return-item-check" type="checkbox" aria-label="Monitor returned" checked={Boolean(form.monitor && form.monitor !== '0')} disabled={!form.monitor && !issuedEquipment.Monitor}
          onChange={(event) => onChange('monitor', event.target.checked ? form.monitor || issuedEquipment.Monitor || '' : '')} />}
        {returning && <span className="return-device-description">Monitor returned</span>}
        <label className={returning ? 'return-device-label' : ''} htmlFor={idPrefix + 'monitor'}>{returning ? 'Returned monitor asset number' : 'Monitor asset number'}</label>
        {monitorSearch ? <AssetAutocomplete id={idPrefix + 'monitor'} categoryFilter={MONITOR_CATEGORIES}
          value={form.monitor === '0' ? '' : form.monitor} onChange={(value) => onChange('monitor', value)} placeholder="Search monitor asset number" />
          : <input id={idPrefix + 'monitor'} type="text" value={form.monitor} onChange={(event) => onChange('monitor', event.target.value)} placeholder="Returned monitor, or leave blank if missing" />}
      </div>
    </div>
    <div className="handover-quantity-heading"><strong>Accessories</strong><span>{returning ? 'Select each item returned, then adjust the quantity received.' : 'Enter quantities handed over. Use 0 for items not included.'}</span></div>
    <div className="handover-quantities">{quantities.map((field) => <div className={returning ? 'field return-quantity-row' : 'field'} key={field.key}>
      {returning && <input className="return-item-check" type="checkbox" aria-label={`${field.label} returned`} checked={Number(form[field.key]) > 0} disabled={Number(form[field.key]) <= 0 && Number(issuedEquipment[field.storageKey] || 0) <= 0}
        onChange={(event) => onChange(field.key, event.target.checked
          ? Number(form[field.key]) > 0 ? form[field.key] : String(issuedEquipment[field.storageKey] || '1')
          : '0')} />}
      {returning && <span className="return-quantity-label">{field.label} returned</span>}
      {!returning && <label htmlFor={idPrefix + field.key}>{field.label}</label>}
      <EquipmentQuantityInput id={idPrefix + field.key} aria-label={field.label + (returning ? ' returned quantity' : ' quantity')}
        value={form[field.key]} placeholder="0" disabled={returning && Number(form[field.key]) <= 0}
        onChange={(event) => onChange(field.key, event.target.value)} />
    </div>)}</div>
    <div className={returning ? 'field return-others-row' : 'field'}>
      {returning && <label className="return-item-checkbox"><input type="checkbox" checked={Boolean(form.others)} disabled={!form.others && !issuedEquipment.Others}
        onChange={(event) => onChange('others', event.target.checked ? form.others || issuedEquipment.Others || '' : '')} />{!returning && 'Others / Peripherals returned'}</label>}
      {returning && <span className="return-others-description">Others / Peripherals returned</span>}
      {!returning && <label htmlFor={idPrefix + 'others'}>Others / Peripherals</label>}
      <input id={idPrefix + 'others'} type="text" value={form.others} disabled={returning && !form.others && !issuedEquipment.Others}
        onChange={(event) => onChange('others', event.target.value)} placeholder="e.g. Laptop bag, security lock, headset" />
    </div>
  </div>;
}
