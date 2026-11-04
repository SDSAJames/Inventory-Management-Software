import { useCallback, useMemo, useState } from 'react';
import { buildCalendarDays, calendarMonthFromDate, shiftCalendarMonth } from '../lib/calendarDates.js';

/** Shared month state and navigation for the two custody calendars. */
export function useCalendarMonth() {
  const [{ year: currentYear, month: currentMonth }, setMonth] = useState(calendarMonthFromDate);
  const calendarDays = useMemo(() => buildCalendarDays(currentYear, currentMonth), [currentYear, currentMonth]);
  const setCurrentYear = useCallback((year) => setMonth((current) => ({ ...current, year })), []);
  const setCurrentMonth = useCallback((month) => setMonth((current) => ({ ...current, month })), []);
  const handlePrevMonth = useCallback(() => setMonth(({ year, month }) => shiftCalendarMonth(year, month, -1)), []);
  const handleNextMonth = useCallback(() => setMonth(({ year, month }) => shiftCalendarMonth(year, month, 1)), []);
  const handleGoToday = useCallback(() => setMonth(calendarMonthFromDate()), []);

  return {
    currentYear, currentMonth, calendarDays,
    setCurrentYear, setCurrentMonth, handlePrevMonth, handleNextMonth, handleGoToday,
  };
}
