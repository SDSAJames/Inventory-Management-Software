import { useState } from 'react';
import { getAssetLocation } from '../../shared/assetRules.js';
import { sortDirectoryOptions } from '../lib/directoryOptions';
import AssetTable from './AssetTable';

export default function AssetLocationList({ assets, onEditAsset, onChangeOwner }) {
  const [expanded, setExpanded] = useState(null);
  const locations = new Map();
  for (const asset of assets) {
    const name = getAssetLocation(asset.status, asset.location, '') || 'Unspecified';
    const key = name.toLowerCase();
    if (!locations.has(key)) locations.set(key, { key, name, assets: [], categories: new Map() });
    const group = locations.get(key);
    group.assets.push(asset);
    const category = asset.category || 'Uncategorized';
    group.categories.set(category, (group.categories.get(category) || 0) + 1);
  }
  if (!locations.size) return <div className="empty">No assets match the current filters.</div>;
  return <div className="asset-location-list">
    <p className="modal-intro">Select a location to view its assets. Counts reflect the current search and status filters.</p>
    {sortDirectoryOptions([...locations.values()]).map((group) => <section key={group.key} className="asset-location-group">
      <button type="button" className="asset-location-heading" aria-expanded={expanded === group.key}
        onClick={() => setExpanded((current) => current === group.key ? null : group.key)}>
        <strong>{group.name}</strong>
        <span className="asset-location-types">{sortDirectoryOptions([...group.categories.keys()]).map((category) =>
          <span key={category}>{category}: <strong>{group.categories.get(category)}</strong></span>)}</span>
        <span className="asset-location-total">{group.assets.length} asset{group.assets.length === 1 ? '' : 's'} <span aria-hidden="true">{expanded === group.key ? '▴' : '▾'}</span></span>
      </button>
      {expanded === group.key && <AssetTable assets={group.assets} onEditAsset={onEditAsset} onChangeOwner={onChangeOwner} />}
    </section>)}
  </div>;
}
