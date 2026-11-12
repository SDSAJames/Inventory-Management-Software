/** Shared native date field with a four-digit year in every form. */
export default function DateInput({ type = 'date', min, max, value, onChange, ...props }) {
  const timestamp = type === 'datetime-local';
  const maximum = timestamp ? '9999-12-31T23:59:59.999' : '9999-12-31';
  return <input {...props} type={type} value={value} min={min || (timestamp ? '0001-01-01T00:00' : '0001-01-01')}
    max={max && max < maximum ? max : maximum} onChange={(event) => {
      const next = event.target.value;
      if (next && !/^\d{4}-/.test(next)) {
        event.target.value = value || '';
        return;
      }
      onChange?.(event);
    }} />;
}
