import DateInput from './DateInput';
import { isBusinessTraveler } from '../lib/loanEquipment';

export default function LoanDateFields({ form, onChange, errors = {}, idPrefix = '' }) {
  return <>
    <div className="field"><label htmlFor={`${idPrefix}startDate`}>Start / Scheduled date</label>
      <DateInput id={`${idPrefix}startDate`} type="date" value={form.startDate} onChange={(event) => onChange('startDate', event.target.value)} />
    </div>
    <div className="field"><label htmlFor={`${idPrefix}endDate`}>Due date <span className="field-hint">(Business travelers only)</span></label>
      <DateInput id={`${idPrefix}endDate`} type="date" value={form.endDate} disabled={!isBusinessTraveler(form.assigneeType)}
        className={errors.endDate ? 'invalid-input' : ''} onChange={(event) => onChange('endDate', event.target.value)} />
      {errors.endDate && <span className="field-error-msg">{errors.endDate}</span>}
    </div>
  </>;
}
