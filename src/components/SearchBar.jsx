export default function SearchBar({
  searchTerm,
  onSearchChange,
  searchField,
  onSearchFieldChange,
  filterStatus,
  onFilterStatusChange,
  statuses,
  searchFieldOptions,
}) {
  return (
    <div className="search-row">
      <input
        className="search"
        placeholder="Search asset code (e.g. SPE-1234), name, category or holder"
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <select
        className="filter"
        value={searchField}
        onChange={(e) => onSearchFieldChange(e.target.value)}
      >
        {searchFieldOptions.map((f) => (
          <option key={f}>{f}</option>
        ))}
      </select>
      <select
        className="filter"
        value={filterStatus}
        onChange={(e) => onFilterStatusChange(e.target.value)}
      >
        <option>All statuses</option>
        {statuses.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}
