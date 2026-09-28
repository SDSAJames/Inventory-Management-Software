import { useState, useMemo } from 'react';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { STATUSES } from '../lib/constants';
import AssetTable from '../components/AssetTable';
import SearchBar from '../components/SearchBar';
import Modal from '../components/Modal';
import AssetForm from '../components/AssetForm';

const SEARCH_FIELDS = ['All fields', 'Asset code', 'Asset name', 'Category', 'Holder', 'Location', 'Serial number'];

export default function AssetsPage() {
  const { db, deleteAsset } = useDb();
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('All fields');
  const [filterStatus, setFilterStatus] = useState('All statuses');
  const [editAssetId, setEditAssetId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

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

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteAsset(deleteTarget.id);
    toast(`Asset record for ${deleteTarget.name} (${deleteTarget.code}) has been deleted.`);
    setDeleteTarget(null);
  };

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
        <AssetTable
          assets={filtered}
          onEditAsset={setEditAssetId}
          onDeleteAsset={setDeleteTarget}
        />
      </section>

      <Modal open={showNew || editAssetId !== null} onClose={() => { setShowNew(false); setEditAssetId(null); }}>
        <AssetForm
          assetId={editAssetId}
          onClose={() => { setShowNew(false); setEditAssetId(null); }}
        />
      </Modal>

      {/* Deletion Confirmation Modal */}
      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        {deleteTarget && (
          <div className="delete-dialog">
            <h2>Delete asset</h2>
            <p className="modal-intro">
              Are you sure you want to permanently delete this asset? This action cannot be undone.
            </p>

            <div className="timestamp-dialog-card">
              <dl>
                <dt>Asset:</dt>
                <dd><strong>{deleteTarget.name}</strong></dd>
                <dt>Asset code:</dt>
                <dd><code>{deleteTarget.code}</code></dd>
                <dt>Category:</dt>
                <dd>{deleteTarget.category || '—'}</dd>
                <dt>Status:</dt>
                <dd>{deleteTarget.status || '—'}</dd>
                <dt>Location:</dt>
                <dd>{deleteTarget.location || '—'}</dd>
                {deleteTarget.owner && (
                  <>
                    <dt>Current holder:</dt>
                    <dd>{deleteTarget.owner}</dd>
                  </>
                )}
              </dl>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button danger-btn"
                style={{ background: '#be665a', borderColor: '#be665a', color: 'white' }}
                onClick={handleConfirmDelete}
              >
                Delete permanently
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
