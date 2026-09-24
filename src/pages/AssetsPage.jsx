import { useState, useMemo } from 'react';
import { useDb } from '../hooks/useDb';
import { STATUSES } from '../lib/constants';
import AssetTable from '../components/AssetTable';
import SearchBar from '../components/SearchBar';
import Modal from '../components/Modal';
import AssetForm from '../components/AssetForm';

const SEARCH_FIELDS = ['All fields', 'Asset code', 'Asset name', 'Category', 'Holder', 'Location', 'Serial number'];

export default function AssetsPage() {
  const { db } = useDb();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('All fields');
  const [filterStatus, setFilterStatus] = useState('All statuses');
  const [editAssetId, setEditAssetId] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const filtered = useMemo(() => {
    return db.assets.filter((asset) => {
      const searchable = {
        'All fields': `${asset.name} ${asset.code} ${asset.category} ${asset.location} ${asset.owner} ${asset.serial}`,
        'Asset code': asset.code,
        'Asset name': asset.name,
        Category: asset.category,
        Holder: asset.owner,
        Location: asset.location,
        'Serial number': asset.serial,
      }[searchField] || '';
      return (
        searchable.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (filterStatus === 'All statuses' || asset.status === filterStatus)
      );
    });
  }, [db.assets, searchTerm, searchField, filterStatus]);

  return (
    <>
      <div className="view-header">
        <div>
          <h2>Asset register</h2>
          <p>{filtered.length} of {db.assets.length} assets shown.</p>
        </div>
        <button className="button" onClick={() => setShowNew(true)}>+ Add asset</button>
      </div>

      <section className="panel">
        <SearchBar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          filterStatus={filterStatus}
          onFilterStatusChange={setFilterStatus}
          statuses={STATUSES}
          searchFieldOptions={SEARCH_FIELDS}
        />
        <AssetTable assets={filtered} onViewAsset={setEditAssetId} />
      </section>

      <Modal open={showNew || editAssetId !== null} onClose={() => { setShowNew(false); setEditAssetId(null); }}>
        <AssetForm
          assetId={editAssetId}
          onClose={() => { setShowNew(false); setEditAssetId(null); }}
        />
      </Modal>
    </>
  );
}
