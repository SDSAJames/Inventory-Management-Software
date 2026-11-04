export default function DirectorySelect({ id, label, options = [], value, onChange, placeholder, preserveCurrentValue = false, allowCustom = false }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {allowCustom ? <><input id={id} list={`${id}-options`} value={value} onChange={onChange} placeholder={placeholder || 'Select or type a location'} /><datalist id={`${id}-options`}>{options.map((option) => <option key={option} value={option} />)}</datalist></> : <select id={id} value={value} onChange={onChange}>
        <option value="">{placeholder || `Select ${label.toLowerCase()}`}</option>
        {preserveCurrentValue && value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>}
    </div>
  );
}
