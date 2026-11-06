import DirectorySelect from './DirectorySelect';

export default function LoanDirectoryFields({ form, onChange, locations = [], departments = [], idPrefix = '' }) {
  return <>
    <DirectorySelect allowCustom id={`${idPrefix}location`} label="Rental location" options={locations}
      value={form.location} onChange={(event) => onChange('location', event.target.value)} />
    <DirectorySelect allowCustom id={`${idPrefix}department`} label="Department" options={departments}
      value={form.department} onChange={(event) => onChange('department', event.target.value)} />
  </>;
}
