import { useState, useRef, useCallback, useEffect } from 'react';
import { statusClass } from '../lib/utils';

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
}) {
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
      if (['INPUT', 'SELECT', 'A', 'BUTTON'].includes(e.target.tagName)) return;
      if (!onToggleSelect || !onRangeSelect) return;

      const idx = rowIndexFromEvent(e);
      if (idx === null) return;

      const assetId = assets[idx]?.id;
      if (!assetId) return;

      // Shift+click: range from last clicked row
      if (e.shiftKey && lastClickIdx.current !== null) {
        e.preventDefault();
        const ids = rangeIds(lastClickIdx.current, idx);
        onRangeSelect(ids, true);
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

  if (!assets.length) {
    return <div className="empty">No assets match the current filters.</div>;
  }

  const handleEdit = onEditAsset || onViewAsset;
  const allSelected = assets.length > 0 && selectedIds && assets.every((a) => selectedIds.has(a.id));

  return (
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
                  title="Select all"
                />
              </th>
            )}
            <th>Asset number</th>
            <th>Category</th>
            <th>Status</th>
            <th>Location</th>
            <th>Current holder</th>
            {showUpdatedDate && <th>Modification date</th>}
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
                  if (['INPUT', 'SELECT', 'A', 'BUTTON'].includes(e.target.tagName)) return;
                  if (handleEdit) handleEdit(asset.id);
                }}
                title="Click to view · Drag to select multiple"
              >
                {onToggleSelect && (
                  <td className="col-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected || false}
                      onChange={() => onToggleSelect(asset.id)}
                      onClick={(e) => e.stopPropagation()}
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
  );
}

