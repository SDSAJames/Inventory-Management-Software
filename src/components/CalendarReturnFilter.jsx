export default function CalendarReturnFilter({ checked, onChange }) {
  return <label className="calendar-return-filter">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    Hide returned
  </label>;
}
