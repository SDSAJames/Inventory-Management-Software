import DateInput from './DateInput';
import { dateTimeInputValue, nowLocalIso } from '../lib/utils';

export default function TimestampField({ id, label, hint, value, onChange, onClear, required = false }) {
  return <div className="field timestamp-field">
    <label htmlFor={id}>{label}{hint && <span className="field-hint"> {hint}</span>}{required && <> <span className="required-asterisk">*</span></>}</label>
    <div className="timestamp-input-row">
      <DateInput id={id} type="datetime-local" value={dateTimeInputValue(value)} onChange={(event) => onChange(event.target.value)} required={required} />
      <button type="button" className="button ghost" onClick={() => onChange(nowLocalIso())} title="Set current time">◷ Current time</button>
      {value && onClear && <button type="button" className="button ghost" onClick={onClear} title="Clear timestamp">Clear</button>}
    </div>
  </div>;
}
