import { BORROWER_TYPES } from '../../shared/loanRules.js';
import IPAddressFields from './IPAddressFields';

export default function AssigneeFields({ form, onChange, errors = {}, idPrefix = '', includeIp = true }) {
  const fields = [
    { key: 'assigneeType', label: 'Assignee type' },
    { key: 'assignee', label: 'Assignee', optional: true, placeholder: 'Full name or username' },
    { key: 'knoxId', label: 'Knox ID', required: true, placeholder: 'e.g. wnjef.123 or KNOX-1234' },
  ];
  return <>
    {fields.map(({ key, label, optional, required, placeholder }) => <div className="field" key={key}>
      <label htmlFor={`${idPrefix}${key}`}>{label}{optional && <> <span className="field-hint">(Optional)</span></>}{required && <> <span className="required-asterisk">*</span></>}</label>
      {key === 'assigneeType' ? <select id={`${idPrefix}${key}`} value={form[key]} onChange={(event) => onChange(key, event.target.value)}>
        {BORROWER_TYPES.map((type) => <option key={type} value={type}>{type === "Employee" ? "Employee (Internal)" : type}</option>)}
      </select> : <input id={`${idPrefix}${key}`} value={form[key]} required={required} placeholder={placeholder}
        className={errors[key] ? 'input-error-red' : ''} onChange={(event) => onChange(key, event.target.value)} />}
      {errors[key] && <span className="field-error-msg">⚠️ {errors[key]}</span>}
    </div>)}
    {includeIp && <IPAddressFields form={form} optional onChange={onChange} />}
  </>;
}
