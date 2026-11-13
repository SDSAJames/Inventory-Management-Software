import ScheduleDueDateInput from './ScheduleDueDateInput';
import DateInput from './DateInput';
import { tracksEndDate } from '../lib/loanEquipment';

export default function LoanDateFields({ form, onChange, errors = {}, idPrefix = '' }) {
  const DueDateInput = !form.pickupDate ? ScheduleDueDateInput : DateInput;
  return <>
    <div className="field"><label htmlFor={`${idPrefix}startDate`}>Start / Scheduled date</label>
      <DateInput id={`${idPrefix}startDate`} type="date" value={form.startDate} onChange={(event) => onChange('startDate', event.target.value)} />
    </div>
    <div className="field"><label htmlFor={`${idPrefix}endDate`}>Due date <span className="field-hint">(Business travelers and contractors)</span></label>
      <DueDateInput id={`${idPrefix}endDate`} value={form.endDate} disabled={!tracksEndDate(form.assigneeType)}
        className={errors.endDate ? 'invalid-input' : ''} onChange={(event) => onChange('endDate', event.target.value)} />
      {errors.endDate && <span className="field-error-msg">{errors.endDate}</span>}
    </div>
  </>;
}
