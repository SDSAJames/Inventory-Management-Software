import { statusClass } from '../lib/utils';

export default function AssetTable({
  assets,
  onEditAsset,
  onViewAsset,
  onChangeOwner,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  showUpdatedDate = true,
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
            {showUpdatedDate && <th>Modification date</th>}
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
                title="Click row to view details & history"
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
