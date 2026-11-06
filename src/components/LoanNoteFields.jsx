export default function LoanNoteFields({ form, onChange, idPrefix = '', compact = false }) {
  return <>
    <div className="field"><label htmlFor={`${idPrefix}others`}>Others / Peripherals</label>
      <input id={`${idPrefix}others`} type="text" placeholder="e.g. Headset, Privacy filter" value={form.others} onChange={(event) => onChange('others', event.target.value)} />
    </div>
    <div className={`field ${compact ? 'loan-entry-note' : 'full'}`}><label htmlFor={`${idPrefix}note`}>Note / Purpose</label>
      <textarea id={`${idPrefix}note`} rows={compact ? 1 : undefined} value={form.note} onChange={(event) => onChange('note', event.target.value)}
        placeholder="Project purpose, special requirements, or condition notes..." />
    </div>
  </>;
}
