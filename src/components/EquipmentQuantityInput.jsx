export default function EquipmentQuantityInput({ onChange, ...props }) {
  return <input {...props} type="number" min="0" step="1" inputMode="numeric" onChange={(event) => {
    const value = event.target.value;
    if (value === '' || /^\d+$/.test(value)) onChange(event);
  }} />;
}
