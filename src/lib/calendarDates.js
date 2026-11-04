export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const CALENDAR_YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

const pad = (number) => String(number).padStart(2, '0');

export function calendarMonthPrefix(year, month) {
  return `${year}-${pad(month + 1)}`;
}

export function calendarMonthFromDate(date = new Date()) {
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function shiftCalendarMonth(year, month, offset) {
  return calendarMonthFromDate(new Date(year, month + offset, 1));
}

/** Sunday-first six-week grid, built with local dates rather than UTC conversions. */
export function buildCalendarDays(year, month) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: 42 }, (_, index) => {
    const dayOffset = index - firstWeekday + 1;
    const date = new Date(year, month, dayOffset);
    return {
      dateStr: `${calendarMonthPrefix(date.getFullYear(), date.getMonth())}-${pad(date.getDate())}`,
      dayNum: date.getDate(),
      isCurrentMonth: dayOffset >= 1 && dayOffset <= daysInMonth,
      isPrevMonth: dayOffset < 1,
      isNextMonth: dayOffset > daysInMonth,
    };
  });
}

export function formatCalendarDayTitle(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return date.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
