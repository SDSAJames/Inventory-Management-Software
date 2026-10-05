import { statusClass } from '../lib/utils';

export default function AssetTable({
  assets,
  onEditAsset,
  onViewAsset,
  onChangeOwner,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}) {
  if (!assets.length) {
    return <div className="empty">No assets match the current filters.</div>;
  }

  const handleEdit = onEditAsset || onViewAsset;
  const allSelected = assets.length > 0 && selectedIds && assets.every((a) => selectedIds.has(a.id));

  return (
    <div className="table-wrap">
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
            <th>Asset</th>
            <th>Category</th>
            <th>Status</th>
            <th>Location</th>
            <th>Current holder</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const isSelected = selectedIds && selectedIds.has(asset.id);
            return (
              <tr
                key={asset.id}
                className={isSelected ? 'row-selected' : ''}
                style={{ cursor: handleEdit ? 'pointer' : undefined }}
                onClick={(e) => {
                  if (['INPUT', 'SELECT', 'A', 'BUTTON'].includes(e.target.tagName)) return;
                  if (handleEdit) handleEdit(asset.id);
                }}
                title="Click to view details & history"
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
                  <div className="asset-name">{asset.name}</div>
                  <div className="asset-code">{asset.code}</div>
                </td>
                <td>{asset.category}</td>
                <td>
                  <span className={`status ${statusClass(asset.status)}`}>
                    {asset.status}
                  </span>
                </td>
                <td>{asset.location || '—'}</td>
                <td>
                  <strong>{asset.owner || 'Unassigned'}</strong>
                  {asset.department && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{asset.department}</div>}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {onChangeOwner && (
                    <button
                      type="button"
                      className="button ghost"
                      style={{ padding: '5px 9px', fontSize: '11px', marginRight: '6px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangeOwner(asset);
                      }}
                      title="Transfer ownership"
                    >
                      👤 Owner
                    </button>
                  )}
                  {handleEdit && (
                    <button
                      type="button"
                      className="button secondary"
                      style={{ padding: '5px 9px', fontSize: '11px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(asset.id);
                      }}
                      title="View details and history"
                    >
                      View / Edit
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
