import { statusClass } from '../lib/utils';

export default function AssetTable({ assets, onEditAsset, onDeleteAsset, onViewAsset }) {
  if (!assets.length) {
    return <div className="empty">No assets match the current filters.</div>;
  }

  const handleEdit = onEditAsset || onViewAsset;

  return (
    <div className="table-wrap">
      <table className="asset-table">
        <thead>
          <tr>
            <th className="col-action">Action</th>
            <th>Asset</th>
            <th>Category</th>
            <th>Status</th>
            <th>Location</th>
            <th>Current holder</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr
              key={asset.id}
              style={{ cursor: handleEdit ? 'pointer' : undefined }}
              onClick={(e) => {
                if (['BUTTON', 'INPUT', 'SELECT', 'A'].includes(e.target.tagName)) return;
                if (handleEdit) handleEdit(asset.id);
              }}
              title="Click to edit asset"
            >
              <td className="col-action">
                <div className="action-button-group">
                  {handleEdit && (
                    <button
                      className="btn-action-icon"
                      onClick={() => handleEdit(asset.id)}
                      title="Edit asset"
                    >
                      ✎
                    </button>
                  )}
                  {onDeleteAsset && (
                    <button
                      className="btn-action-icon text-danger"
                      onClick={() => onDeleteAsset(asset)}
                      title="Delete asset"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </td>
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
              <td>{asset.location}</td>
              <td>{asset.owner || 'Unassigned'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
