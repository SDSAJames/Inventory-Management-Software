import { statusClass } from '../lib/utils';

export default function AssetTable({ assets, onViewAsset }) {
  if (!assets.length) {
    return <div className="empty">No assets match the current filters.</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Category</th>
            <th>Status</th>
            <th>Location</th>
            <th>Current holder</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr key={asset.id}>
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
              <td>
                <button
                  className="text-button"
                  onClick={() => onViewAsset(asset.id)}
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
