import { useEffect, useRef, useState } from 'react';
import DateInput from './DateInput';
import { todayIso } from '../lib/utils';

function dateParts(value) {
  const [year, month = '', day = ''] = (value || todayIso().slice(0, 4)).split('-');
  return { year, month, day };
}
function completeDate(parts) {
  if (!/^\d{4}$/.test(parts.year) || !/^\d{1,2}$/.test(parts.month) || !/^\d{1,2}$/.test(parts.day)) return '';
  const value = parts.year + '-' + parts.month.padStart(2, '0') + '-' + parts.day.padStart(2, '0');
  const date = new Date(value + 'T00:00:00Z');
  return parts.year !== '0000' && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

/** A year-only draft is never emitted as a saved date. */
export default function ScheduleDueDateInput({ id, value = '', disabled, className, onChange }) {
  const [parts, setParts] = useState(() => dateParts(value));
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (value !== lastEmitted.current) { setParts(dateParts(value)); lastEmitted.current = value; }
  }, [value]);
  const update = (key, next) => {
    if (!/^\d*$/.test(next) || next.length > (key === 'year' ? 4 : 2)) return;
    const draft = { ...parts, [key]: next };
    setParts(draft);
    lastEmitted.current = completeDate(draft);
    onChange({ target: { value: lastEmitted.current } });
  };
  return <div className={'schedule-due-date ' + (className || '')}>
    <input className="schedule-date-part" id={id} aria-label="Due month" type="text" inputMode="numeric" maxLength={2} placeholder="MM" disabled={disabled} value={parts.month} onChange={(event) => update('month', event.target.value)} />
    <span aria-hidden="true">/</span>
    <input className="schedule-date-part" aria-label="Due day" type="text" inputMode="numeric" maxLength={2} placeholder="DD" disabled={disabled} value={parts.day} onChange={(event) => update('day', event.target.value)} />
    <span aria-hidden="true">/</span>
    <input className="schedule-date-part schedule-date-year" aria-label="Due year" type="text" inputMode="numeric" maxLength={4} placeholder="YYYY" disabled={disabled} value={parts.year} onChange={(event) => update('year', event.target.value)} />
    <DateInput id={id + '-picker'} aria-label="Choose due date" className="schedule-due-date-picker" disabled={disabled} value={value} onChange={(event) => {
      lastEmitted.current = event.target.value;
      setParts(dateParts(event.target.value));
      onChange(event);
    }} />
  </div>;
}
