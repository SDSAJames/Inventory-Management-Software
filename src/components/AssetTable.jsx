import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { statusClass } from '../lib/utils';
import usePagination from '../hooks/usePagination';
import Pagination from './Pagination';
import SortableHeader from './SortableHeader';
import { sortTableRows } from '../lib/tableSort';

export default function AssetTable({
  assets,
  onEditAsset,
  onViewAsset,
  onChangeOwner,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onRangeSelect,
  showUpdatedDate = true,
  pageSize = null,
  resetKey = '',
  initialSort = { key: 'code', dir: 'asc' },
}) {
  const [sort, setSort] = useState(initialSort);
  assets = useMemo(() => sortTableRows(assets, sort, (asset, key) => asset[key]), [assets, sort]);
  const pagination = usePagination(assets.length, pageSize, JSON.stringify([resetKey, sort]));
  assets = assets.slice(pagination.start, pagination.end);
  const suppressClick = useRef(false);
  const onSort = (key) => setSort((previous) => ({ key, dir: previous.key === key && previous.dir === 'asc' ? 'desc' : 'asc' }));
  const tbodyRef = useRef(null);
  const dragState = useRef(null);          // { startIdx, adding }
  const lastClickIdx = useRef(null);       // for Shift+click range
  const [dragging, setDragging] = useState(false);

  /* ── helpers ────────────────────────────────── */

  const rangeIds = useCallback(
    (a, b) => {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return assets.slice(lo, hi + 1).map((asset) => asset.id);
    },
    [assets],
  );

  const rowIndexFromEvent = useCallback((e) => {
    const row = e.target.closest('tr[data-ridx]');
    return row ? Number(row.dataset.ridx) : null;
  }, []);

  /* ── Drag handlers ─────────────────────────── */

  const handleMouseDown = useCallback(
    (e) => {
      // Only react to primary button; skip interactive elements
      if (e.button !== 0) return;
      if (e.target.closest?.('input, select, a, button') || ['INPUT', 'SELECT', 'A', 'BUTTON'].includes(e.target.tagName)) return;
      if (!onToggleSelect || !onRangeSelect) return;

      suppressClick.current = false;
      const idx = rowIndexFromEvent(e);
      if (idx === null) return;

      const assetId = assets[idx]?.id;
      if (!assetId) return;

      // Shift+click: range from last clicked row
      if (e.shiftKey && lastClickIdx.current !== null) {
        e.preventDefault();
        const ids = rangeIds(lastClickIdx.current, idx);
        onRangeSelect(ids, true);
        suppressClick.current = true;
        return;
      }

      // Start potential drag
      const adding = !(selectedIds && selectedIds.has(assetId));
      dragState.current = { startIdx: idx, adding };
      lastClickIdx.current = idx;

      // Don't set dragging yet – wait for mousemove to confirm drag intent
    },
    [assets, onToggleSelect, onRangeSelect, selectedIds, rangeIds, rowIndexFromEvent],
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!dragState.current) return;

      const idx = rowIndexFromEvent(e);
      if (idx === null) return;

      // Only enter drag mode when mouse actually moves to a different row
      if (!dragging && idx !== dragState.current.startIdx) {
        setDragging(true);
        suppressClick.current = true;
      }

      if (idx !== dragState.current.startIdx || dragging) {
        const ids = rangeIds(dragState.current.startIdx, idx);
        onRangeSelect(ids, dragState.current.adding);
      }
    },
    [dragging, onRangeSelect, rangeIds, rowIndexFromEvent],
  );

  const handleMouseUp = useCallback(
    (e) => {
      if (!dragState.current) return;

      const wasDragging = dragging;
      const ds = dragState.current;
      dragState.current = null;
      setDragging(false);

      // If it was a simple click (no drag), toggle the single row
      if (!wasDragging) {
        const idx = rowIndexFromEvent(e);
        if (idx !== null && idx === ds.startIdx) {
          // If not on an interactive element, let the row click handler decide
          // whether to edit or toggle – we just toggle selection here
          if (!['INPUT', 'SELECT', 'A', 'BUTTON'].includes(e.target.tagName)) {
            // Don't toggle here – let onClick handle it (edit or toggle)
          }
        }
      }
    },
    [dragging, rowIndexFromEvent],
  );

  /* ── Global listeners for mouseup (in case mouse leaves table) ── */

  useEffect(() => {
    if (!dragging) return;
    const onUp = () => {
      dragState.current = null;
      setDragging(false);
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [dragging]);

  useEffect(() => { lastClickIdx.current = null; dragState.current = null; }, [pagination.page, pageSize, resetKey, sort]);

  if (!assets.length) {
    return <div className="empty">No assets match the current filters.</div>;
  }

  const handleEdit = onEditAsset || onViewAsset;
  const allSelected = assets.length > 0 && selectedIds && assets.every((a) => selectedIds.has(a.id));

  return (
    <>
    <div className={`table-wrap${dragging ? ' drag-selecting' : ''}`}>
      <table className="asset-table">
        <thead>
          <tr>
            {onToggleSelect && (
              <th className="col-checkbox">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleSelectAll && onToggleSelectAll(assets)}
                  title="Select all rows on this page" aria-label="Select all rows on this page"
                />
              </th>
            )}
            {([['code', 'Asset number'], ['category', 'Category'], ['status', 'Status'], ['location', 'Location'], ['owner', 'Current holder'], ...(showUpdatedDate ? [['updated', 'Modification date']] : [])]).map(([key, label]) => (
              <SortableHeader key={key} column={{ key, label }} sort={sort} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody
          ref={tbodyRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          {assets.map((asset, idx) => {
            const isSelected = selectedIds && selectedIds.has(asset.id);
            return (
              <tr
                key={asset.id}
                data-ridx={idx}
                className={isSelected ? 'row-selected' : ''}
                style={{ cursor: handleEdit ? 'pointer' : undefined }}
                onClick={(e) => {
                  if (e.target.closest?.('input, select, a, button')) return;
                  if (['INPUT', 'SELECT', 'A', 'BUTTON'].includes(e.target.tagName)) return;
                  if (suppressClick.current || e.shiftKey) { suppressClick.current = false; return; }
                  if (handleEdit) handleEdit(asset.id);
                }}
                title="Click to view · Drag to select multiple"
              >
                {onToggleSelect && (
                  <td className="col-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected || false}
                      onChange={(e) => { if (!e.nativeEvent?.shiftKey) onToggleSelect(asset.id); }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (e.shiftKey && lastClickIdx.current !== null && onRangeSelect) {
                          e.preventDefault();
                          onRangeSelect(rangeIds(lastClickIdx.current, idx), true);
                        } else lastClickIdx.current = idx;
                      }}
                    />
                  </td>
                )}
                <td>
                  <strong className="asset-code" style={{ fontSize: '13px', fontWeight: 700 }}>{asset.code}</strong>
                </td>
                <td>{asset.category}</td>
                <td>
                  <span className={`status ${statusClass(asset.status)}`}>
                    {asset.status}
                  </span>
                </td>
                <td>{asset.location || '—'}</td>
                <td>
                  {onChangeOwner ? (
                    <button
                      type="button"
                      className={`holder-badge-btn ${!asset.owner ? 'is-unassigned' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangeOwner(asset);
                      }}
                      title={asset.owner ? `Click to transfer ownership from ${asset.owner}` : `Click to assign owner to ${asset.code}`}
                    >
                      <span className="holder-name">{asset.owner || 'Unassigned'}</span>
                      <span className="holder-transfer-icon" title="Transfer ownership">⇄</span>
                    </button>
                  ) : (
                    <strong>{asset.owner || 'Unassigned'}</strong>
                  )}
                </td>
                {showUpdatedDate && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <code style={{ fontSize: '11px', color: 'var(--ink)' }}>
                      {asset.updated || '—'}
                    </code>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {pageSize && <Pagination {...pagination} />}
    </>
  );
}

