import { CALENDAR_YEARS, MONTH_NAMES } from '../lib/calendarDates.js';

export default function CalendarNavigation({ currentYear, currentMonth, setCurrentYear, setCurrentMonth, handlePrevMonth, handleNextMonth, handleGoToday, idPrefix }) {
  return <div className="calendar-nav-group">
    <div className="calendar-month-selector">
      <button type="button" id={`${idPrefix}prev`} className="button ghost icon-only-btn" onClick={handlePrevMonth} title="Previous month" aria-label="Previous month">‹</button>
      <h3 className="calendar-month-title">{MONTH_NAMES[currentMonth]} {currentYear}</h3>
      <button type="button" id={`${idPrefix}next`} className="button ghost icon-only-btn" onClick={handleNextMonth} title="Next month" aria-label="Next month">›</button>
    </div>
    <button type="button" id={`${idPrefix}today`} className="button ghost small-btn today-jump-btn" onClick={handleGoToday} title="Jump to current month & date">Today</button>
    <div className="calendar-jump-selects">
      <select aria-label="Select month" className="calendar-select" value={currentMonth} onChange={(event) => setCurrentMonth(Number(event.target.value))}>
        {MONTH_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
      </select>
      <select aria-label="Select year" className="calendar-select" value={currentYear} onChange={(event) => setCurrentYear(Number(event.target.value))}>
        {CALENDAR_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
      </select>
    </div>
  </div>;
}
