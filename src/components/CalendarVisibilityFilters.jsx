import CalendarReturnFilter from './CalendarReturnFilter';

export default function CalendarVisibilityFilters({ hideReturned, setHideReturned, hidePickedUp, setHidePickedUp }) {
  return <div className="calendar-visibility-filters">
    <CalendarReturnFilter label="Hide picked up" checked={hidePickedUp} onChange={setHidePickedUp} />
    <CalendarReturnFilter checked={hideReturned} onChange={setHideReturned} />
  </div>;
}
