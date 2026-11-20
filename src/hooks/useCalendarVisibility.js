import { useEffect, useState } from 'react';

/** One default visibility policy for calendar toolbars and their open day dialogs. */
export function useCalendarVisibility(persistKey = '') {
  const [savedVisibility] = useState(() => {
    if (!persistKey || typeof localStorage === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem(persistKey) || 'null'); } catch { return null; }
  });
  const [hideReturned, setHideReturned] = useState(() => savedVisibility?.hideReturned ?? false);
  const [hidePickedUp, setPickedUpHidden] = useState(() => savedVisibility?.hidePickedUp ?? true);
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [dayModalFilter, setDayModalFilter] = useState('all');
  const setHidePickedUp = (hidden) => {
    setPickedUpHidden(hidden);
    if (hidden) {
      setEventTypeFilter((filter) => filter === 'pickedup' ? 'all' : filter);
      setDayModalFilter((filter) => filter === 'pickedup' ? 'all' : filter);
    }
  };
  useEffect(() => {
    if (!persistKey || typeof localStorage === 'undefined') return;
    try { localStorage.setItem(persistKey, JSON.stringify({ hideReturned, hidePickedUp })); } catch { /* Storage can be unavailable in private or restricted contexts. */ }
  }, [persistKey, hideReturned, hidePickedUp]);
  return {
    hideReturned, setHideReturned, hidePickedUp, setHidePickedUp,
    eventTypeFilter, setEventTypeFilter, dayModalFilter, setDayModalFilter,
  };
}
