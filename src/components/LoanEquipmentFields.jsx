import { LOAN_EQUIPMENT_FIELDS } from '../lib/loanEquipment';
import { MONITOR_CATEGORIES } from '../lib/assetCategories';
import AssetAutocomplete from './AssetAutocomplete';
import EquipmentQuantityInput from './EquipmentQuantityInput';

export default function LoanEquipmentFields({ form, onChange, errors = {}, idPrefix = '', searchableMonitor = true, quantities = true }) {
  return LOAN_EQUIPMENT_FIELDS.map(([label, key, placeholder]) => {
    const id = `${idPrefix}${searchableMonitor && key === 'monitor' ? 'monitorAssetCode' : key}`;
    return (
      <div className="equipment-field" key={key}>
        <label htmlFor={id}>{label}</label>
        {searchableMonitor && key === 'monitor' ? (
          <AssetAutocomplete
            id={id}
            value={form[key]}
            categoryFilter={MONITOR_CATEGORIES}
            hasError={Boolean(errors[key])}
            onChange={(value) => onChange(key, value)}
            placeholder="Search monitor asset number..."
          />
        ) : quantities && key !== 'monitor' ? (
          <EquipmentQuantityInput id={id} aria-label={`${label} quantity`} value={form[key]} placeholder="0" onChange={(event) => onChange(key, event.target.value)} />
        ) : (
          <input id={id} placeholder={placeholder} value={form[key]} onChange={(event) => onChange(key, event.target.value)} />
        )}
        {errors[key] && <span className="field-error-msg">⚠️ {errors[key]}</span>}
      </div>
    );
  });
}
