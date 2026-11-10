export default function CalendarReturnFilter({ checked, onChange }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`calendar-return-filter pickup-readiness-toggle ${checked ? 'is-ready' : ''}`}>
    <span className="pickup-readiness-track" aria-hidden="true"><span /></span>
    Hide returned
  </button>;
}
