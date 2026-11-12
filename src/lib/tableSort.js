/** Stable sorting of a copy, with natural text ordering and missing values last. */
export function sortTableRows(rows, sort, getValue) {
  const factor = sort.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = getValue(a, sort.key), right = getValue(b, sort.key);
    const missing = (value) => value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value));
    if (missing(left) || missing(right)) return Number(missing(left)) - Number(missing(right));
    return factor * (typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' }));
  });
}
