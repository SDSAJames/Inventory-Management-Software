import { WEEKDAYS } from '../lib/calendarDates.js';

export default function CalendarWeekdays() {
  return <div className="calendar-weekdays-row">{WEEKDAYS.map((day, index) =>
    <div key={day} className={`calendar-weekday-cell ${index === 0 || index === 6 ? 'weekend' : ''}`}>{day}</div>
  )}</div>;
}
