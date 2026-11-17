import { useState } from 'react';

/** One default visibility policy for calendar toolbars and their open day dialogs. */
export function useCalendarVisibility() {
  const [hideReturned, setHideReturned] = useState(false);
  const [hidePickedUp, setPickedUpHidden] = useState(true);
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [dayModalFilter, setDayModalFilter] = useState('all');
  const setHidePickedUp = (hidden) => {
    setPickedUpHidden(hidden);
    if (hidden) {
      setEventTypeFilter((filter) => filter === 'pickedup' ? 'all' : filter);
      setDayModalFilter((filter) => filter === 'pickedup' ? 'all' : filter);
    }
  };
  return {
    hideReturned, setHideReturned, hidePickedUp, setHidePickedUp,
    eventTypeFilter, setEventTypeFilter, dayModalFilter, setDayModalFilter,
  };
}
