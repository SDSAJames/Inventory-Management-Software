import AssetAutocomplete from './AssetAutocomplete';
import LoanEquipmentFields from './LoanEquipmentFields';
import { PC_CATEGORIES } from '../lib/assetCategories';

export default function LoanEquipmentSection({ form, onChange, errors = {}, locations = [], idPrefix = '' }) {
  const assetId = `${idPrefix}assetCode`;
  return <div className="field full">
    <div className="equipment-header-row">
      <fieldset className="loan-equipment-requests">
        <legend>Equipment requested</legend>
        <label><input type="checkbox" checked={Boolean(form.requestPc)} onChange={(event) => onChange('requestPc', event.target.checked)} /> Laptop / PC</label>
        <label><input type="checkbox" checked={Boolean(form.requestMonitor)} onChange={(event) => onChange('requestMonitor', event.target.checked)} /> Monitor</label>
      </fieldset>
      <span className="equipment-header-hint">Asset numbers can be assigned later.</span>
    </div>
    <div className="equipment-grid">
      <div className="equipment-field asset-autocomplete-wrapper">
        <label htmlFor={assetId}>PC asset number <span className="field-hint">(Optional)</span></label>
        <AssetAutocomplete id={assetId} categoryFilter={PC_CATEGORIES} allowCustom value={form.assetCode}
          hasError={Boolean(errors.assetCode)} onChange={(value) => onChange('assetCode', value)}
          onSelectAsset={(asset) => {
            if (!form.location && locations.includes(asset.location)) onChange('location', asset.location);
          }}
          placeholder="Search laptop or MES PC asset number..." />
        {errors.assetCode && <span className="field-error-msg">⚠️ {errors.assetCode}</span>}
      </div>
      <LoanEquipmentFields form={form} errors={errors} idPrefix={idPrefix} onChange={onChange} />
    </div>
  </div>;
}
