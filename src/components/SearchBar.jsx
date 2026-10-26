export default function SearchBar({
  id = 'search-input',
  searchTerm = '',
  onSearchChange,
  searchField,
  onSearchFieldChange,
  filterStatus,
  onFilterStatusChange,
  statuses,
  searchFieldOptions,
  placeholder = 'Search asset number (e.g. SPE-1234), category or holder',
  children,
}) {
  return (
    <div className="search-row">
      <div className="search-box">
        <span className="search-icon" aria-hidden="true">🔍</span>
        <input
          id={id}
          type="search"
          className="search search-has-icon"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => onSearchChange?.(e.target.value)}
        />
        {searchTerm && (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => onSearchChange?.('')}
            title="Clear search"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {searchFieldOptions && searchFieldOptions.length > 0 && onSearchFieldChange && (
        <select
          id={`${id}-field-select`}
          className="filter"
          value={searchField}
          onChange={(e) => onSearchFieldChange(e.target.value)}
          aria-label="Search field"
        >
          {searchFieldOptions.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      )}

      {statuses && statuses.length > 0 && onFilterStatusChange && (
        <select
          id={`${id}-status-select`}
          className="filter"
          value={filterStatus}
          onChange={(e) => onFilterStatusChange(e.target.value)}
          aria-label="Status filter"
        >
          <option value="All statuses">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}

      {children}
    </div>
  );
}

