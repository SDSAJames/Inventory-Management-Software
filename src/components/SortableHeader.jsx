export default function SortableHeader({ column, sort, onSort }) {
  const active = sort.key === column.key;
  return <th aria-sort={active ? sort.dir === 'asc' ? 'ascending' : 'descending' : 'none'}>
    <button type="button" className="text-button" onClick={() => onSort(column.key)} title={'Sort by ' + column.label + (active && sort.dir === 'asc' ? ' descending' : ' ascending')}>
      {column.label} <span aria-hidden="true">{active ? sort.dir === 'asc' ? '▲' : '▼' : '↕'}</span>
    </button>
  </th>;
}
