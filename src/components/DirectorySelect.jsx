export default function DirectorySelect({ id, label, options = [], value, onChange, placeholder, preserveCurrentValue = false }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={onChange}>
        <option value="">{placeholder || `Select ${label.toLowerCase()}`}</option>
        {preserveCurrentValue && value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}
