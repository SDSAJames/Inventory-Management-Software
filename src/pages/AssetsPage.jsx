import { useState, useMemo } from 'react';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { STATUSES } from '../lib/constants';
import AssetTable from '../components/AssetTable';
import SearchBar from '../components/SearchBar';
import Modal from '../components/Modal';
import AssetForm from '../components/AssetForm';
import BatchEditForm from '../components/BatchEditForm';

const SEARCH_FIELDS = ['All fields', 'Asset code', 'Asset name', 'Category', 'Holder', 'Location', 'Serial number'];

export default function AssetsPage() {
  const { db, deleteAsset } = useDb();
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('All fields');
  const [filterStatus, setFilterStatus] = useState('All statuses');
  const [editAssetId, setEditAssetId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBatchEdit, setShowBatchEdit] = useState(false);

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

  /* ── Selection handlers ──────────────────────── */

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = (assets) => {
    const allSelected = assets.every((a) => selectedIds.has(a.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(assets.map((a) => a.id)));
    }
  };

  /* ── Bulk delete handlers ────────────────────── */

  const selectedAssets = useMemo(() => {
    return db.assets.filter((a) => selectedIds.has(a.id));
  }, [db.assets, selectedIds]);

  const handleConfirmBulkDelete = () => {
    const count = selectedIds.size;
    selectedIds.forEach((id) => deleteAsset(id));
    toast(`${count} asset${count > 1 ? 's' : ''} deleted.`);
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
  };

  return (
    <>
      <div className="view-header">
        <div>
          <h2>Asset register</h2>
          <p>{filtered.length} of {db.assets.length} assets shown.</p>
        </div>
        <div className="view-header-actions">
          {selectedIds.size > 0 && (
            <>
              <button
                className="button secondary"
                onClick={() => setShowBatchEdit(true)}
              >
                ✎ Batch edit ({selectedIds.size})
              </button>
              <button
                className="button danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                🗑 Delete ({selectedIds.size})
              </button>
            </>
          )}
          <button className="button" onClick={() => setShowNew(true)}>+ Add asset</button>
        </div>
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
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
        />
      </section>

      <Modal open={showNew || editAssetId !== null} onClose={() => { setShowNew(false); setEditAssetId(null); }}>
        <AssetForm
          assetId={editAssetId}
          onClose={() => { setShowNew(false); setEditAssetId(null); }}
        />
      </Modal>

      {/* Batch Edit Modal */}
      <Modal open={showBatchEdit} onClose={() => setShowBatchEdit(false)}>
        <BatchEditForm
          selectedAssets={selectedAssets}
          onClose={() => setShowBatchEdit(false)}
          onDone={() => setSelectedIds(new Set())}
        />
      </Modal>

      {/* Bulk Deletion Confirmation Modal */}
      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
        <div className="delete-dialog">
          <h2>Delete {selectedAssets.length} asset{selectedAssets.length > 1 ? 's' : ''}</h2>
          <p className="modal-intro">
            Are you sure you want to permanently delete the selected asset{selectedAssets.length > 1 ? 's' : ''}? This action cannot be undone.
          </p>

          <div className="timestamp-dialog-card">
            <ul className="bulk-delete-list">
              {selectedAssets.map((a) => (
                <li key={a.id}>
                  <strong>{a.name}</strong> <code>{a.code}</code>
                  <span className="bulk-delete-meta"> — {a.category}, {a.status}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="button ghost"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button danger-btn"
              style={{ background: '#be665a', borderColor: '#be665a', color: 'white' }}
              onClick={handleConfirmBulkDelete}
            >
              Delete permanently
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
