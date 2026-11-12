import { normalizeEquipmentQuantity } from '../../shared/equipment.js';
export default function EquipmentQuantityInput({ onChange, min = '0', ...props }) {
  return <input {...props} type="number" min={min} step="1" inputMode="numeric" onChange={(event) => {
    const value = event.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      event.target.value = normalizeEquipmentQuantity(value);
      onChange(event);
    }
  }} />;
}
