export default function EquipmentRequestFields({ form, onChange }) {
  return <fieldset className="loan-equipment-requests"><legend>Equipment requested</legend>
    <label><input type="checkbox" checked={Boolean(form.requestPc)} onChange={(event) => onChange('requestPc', event.target.checked)} /> Laptop / PC</label>
    <label><input type="checkbox" checked={Boolean(form.requestMonitor)} onChange={(event) => onChange('requestMonitor', event.target.checked)} /> Monitor</label>
  </fieldset>;
}
