export function RowCountSelect({ value, onChange }) {
  return <label className="row-count-select">Rows per page
    <select aria-label="Rows per page" value={value} onChange={(event) => onChange(Number(event.target.value))}>
      {[10, 15, 20, 30].map((count) => <option key={count} value={count}>{count}</option>)}
    </select>
  </label>;
}

export function SelectionCount({ count, onClear }) {
  return <div className="selection-count" role="status" aria-live="polite">
    <strong>{count} row{count === 1 ? '' : 's'} selected</strong>
    {count > 0 && <button type="button" className="text-button" onClick={onClear}>Clear selection</button>}
  </div>;
}

export default function Pagination({ page, pages, total, start, end, setPage }) {
  return <nav className="pagination" aria-label="Record pages">
    <span>{total ? start + 1 : 0}–{end} of {total}</span>
    <button type="button" className="button ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
    <span aria-live="polite">Page {page} of {pages}</span>
    <button type="button" className="button ghost" disabled={page === pages} onClick={() => setPage(page + 1)}>Next</button>
  </nav>;
}
