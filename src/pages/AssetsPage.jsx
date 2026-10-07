import { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { STATUSES } from '../lib/constants';
import { todayIso, statusClass } from '../lib/utils';
import { makeXlsx, readXlsx, downloadBlob } from '../lib/xlsx';
import { parseAssetRows, assetsToRows } from '../lib/assetExcel';
import AssetTable from '../components/AssetTable';
import SearchBar from '../components/SearchBar';
import Modal from '../components/Modal';
import AssetForm from '../components/AssetForm';
import BatchEditForm from '../components/BatchEditForm';
import ChangeOwnerModal from '../components/ChangeOwnerModal';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const SEARCH_FIELDS = ['All fields', 'Asset code', 'Asset name', 'Category', 'Holder', 'Location', 'Serial number'];

export default function AssetsPage() {
  const { db, deleteAsset, importAssets, verifyAndSyncAssets } = useDb();
  const toast = useToast();
  const fileRef = useRef(null);
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('All fields');
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get('status') || 'All statuses');

  useEffect(() => {
    const s = searchParams.get('status');
    if (s) {
      setFilterStatus(s);
    }
  }, [searchParams]);

  // Passive verification and synchronization with loan records
  useEffect(() => {
    verifyAndSyncAssets();
  }, [verifyAndSyncAssets]);
  const [editAssetId, setEditAssetId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [ownerTargetAsset, setOwnerTargetAsset] = useState(null);

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

  /* ── Excel import / export ───────────────────── */

  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const rows = await readXlsx(file);
      const result = parseAssetRows(rows, db.assets);
      if (!result.added.length && !result.duplicates.length) {
        throw new Error('The workbook contains no asset rows');
      }
      setImportPreview({ fileName: file.name, ...result });
      setOverwriteDuplicates(false);
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
  };

  const [overwriteDuplicates, setOverwriteDuplicates] = useState(false);

  const handleConfirmImport = () => {
    const freshCount = importPreview.added.length;
    const overwriteCount = overwriteDuplicates ? importPreview.duplicates.length : 0;
    const assetsToImport = overwriteDuplicates
      ? [...importPreview.added, ...importPreview.duplicates]
      : importPreview.added;

    importAssets(assetsToImport, overwriteDuplicates);

    let msg = '';
    if (freshCount > 0 && overwriteCount > 0) {
      msg = `${freshCount} added, ${overwriteCount} updated from Excel.`;
    } else if (freshCount > 0) {
      msg = `${freshCount} asset${freshCount === 1 ? '' : 's'} added from Excel.`;
    } else if (overwriteCount > 0) {
      msg = `${overwriteCount} existing asset${overwriteCount === 1 ? '' : 's'} overwritten from Excel.`;
    } else {
      msg = 'No assets changed.';
    }
    toast(msg);
    setImportPreview(null);
    setOverwriteDuplicates(false);
  };

  const handleExport = async () => {
    if (!filtered.length) {
      toast('No assets to export');
      return;
    }
    const workbook = await makeXlsx(assetsToRows(filtered));
    downloadBlob(new Blob([workbook], { type: XLSX_MIME }), `SPE_Equipments_${todayIso()}.xlsx`);
    toast(`${filtered.length} asset${filtered.length === 1 ? '' : 's'} exported.`);
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
          <button id="asset-import-btn" className="button ghost" onClick={() => fileRef.current?.click()}>
            ↑ Import Excel
          </button>
          <button id="asset-export-btn" className="button ghost" onClick={handleExport}>
            ↓ Export Excel
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={`.xlsx,${XLSX_MIME}`}
            className="hidden-field"
            onChange={handleImportFile}
          />
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
          onChangeOwner={(asset) => setOwnerTargetAsset(asset)}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
        />
      </section>

      <Modal open={showNew || editAssetId !== null} size="wide" onClose={() => { setShowNew(false); setEditAssetId(null); }}>
        {(showNew || editAssetId !== null) && (
          <AssetForm
            assetId={editAssetId}
            onClose={() => { setShowNew(false); setEditAssetId(null); }}
            onOpenChangeOwner={(asset) => setOwnerTargetAsset(asset)}
          />
        )}
      </Modal>

      {/* Change Owner Modal */}
      <Modal open={ownerTargetAsset !== null} onClose={() => setOwnerTargetAsset(null)}>
        {ownerTargetAsset && (
          <ChangeOwnerModal
            asset={ownerTargetAsset}
            onClose={() => setOwnerTargetAsset(null)}
            onDone={() => setOwnerTargetAsset(null)}
          />
        )}
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
      <Modal open={showDeleteConfirm} size="sm" onClose={() => setShowDeleteConfirm(false)}>
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

      {/* Excel Import Preview Modal */}
      <Modal open={importPreview !== null} size="wide" onClose={() => { setImportPreview(null); setOverwriteDuplicates(false); }}>
        {importPreview && (
          <div className="import-preview">
            <h2>Import assets from Excel</h2>
            <p className="modal-intro">
              <code>{importPreview.fileName}</code> — review the assets found in the workbook before applying.
            </p>

            <div className="import-stats">
              <div className="import-stat ok">
                <strong>{importPreview.added.length}</strong>
                <span>new to add</span>
              </div>
              <div className={`import-stat ${importPreview.duplicates.length > 0 ? (overwriteDuplicates ? 'alert' : 'warn') : 'muted'}`}>
                <strong>{importPreview.duplicates.length}</strong>
                <span>{overwriteDuplicates ? 'to overwrite' : 'already exist (skip)'}</span>
              </div>
              <div className="import-stat muted">
                <strong>{importPreview.invalid}</strong>
                <span>missing code (skipped)</span>
              </div>
            </div>

            {importPreview.duplicates.length > 0 && (
              <div className="import-conflict-box">
                <div className="conflict-header">
                  <strong>⚠️ Existing Assets Detected ({importPreview.duplicates.length})</strong>
                  <p>Some asset codes in this file already exist in your inventory.</p>
                </div>
                <div className="conflict-options">
                  <label className="conflict-radio-label">
                    <input
                      type="radio"
                      name="conflictAction"
                      checked={!overwriteDuplicates}
                      onChange={() => setOverwriteDuplicates(false)}
                    />
                    <span>
                      <strong>Skip existing</strong> — keep existing asset details intact and only add new records
                    </span>
                  </label>
                  <label className="conflict-radio-label">
                    <input
                      type="radio"
                      name="conflictAction"
                      checked={overwriteDuplicates}
                      onChange={() => setOverwriteDuplicates(true)}
                    />
                    <span>
                      <strong>Overwrite existing</strong> — update matching asset records with the details from Excel
                    </span>
                  </label>
                </div>
                <p className="import-duplicates-codes">
                  Matching codes: {importPreview.duplicates.map((d) => d.code).join(', ')}
                </p>
              </div>
            )}

            {/* Table of new assets to add */}
            {importPreview.added.length > 0 && (
              <>
                <div className="preview-subheading">
                  <strong>New assets to be created ({importPreview.added.length})</strong>
                </div>
                <div className="table-wrap import-preview-table">
                  <table>
                    <thead>
                      <tr><th>Code</th><th>Serial</th><th>Status</th><th>Holder</th><th>Issued</th></tr>
                    </thead>
                    <tbody>
                      {importPreview.added.map((a) => (
                        <tr key={a.id}>
                          <td><strong>{a.code}</strong></td>
                          <td>{a.serial || '—'}</td>
                          <td><span className={`status ${statusClass(a.status)}`}>{a.status}</span></td>
                          <td>{a.owner || '—'}</td>
                          <td>{a.issuedDate || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Table of duplicates when overwrite is enabled */}
            {overwriteDuplicates && importPreview.duplicates.length > 0 && (
              <>
                <div className="preview-subheading" style={{ marginTop: '14px' }}>
                  <strong style={{ color: '#be665a' }}>Existing assets to be updated ({importPreview.duplicates.length})</strong>
                </div>
                <div className="table-wrap import-preview-table">
                  <table>
                    <thead>
                      <tr><th>Code</th><th>Incoming Serial</th><th>Incoming Status</th><th>Incoming Holder</th><th>Incoming Issued</th></tr>
                    </thead>
                    <tbody>
                      {importPreview.duplicates.map((a) => (
                        <tr key={a.id}>
                          <td><strong>{a.code}</strong></td>
                          <td>{a.serial || '—'}</td>
                          <td><span className={`status ${statusClass(a.status)}`}>{a.status}</span></td>
                          <td>{a.owner || '—'}</td>
                          <td>{a.issuedDate || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => { setImportPreview(null); setOverwriteDuplicates(false); }}
              >
                Cancel
              </button>
              <button
                id="asset-import-confirm"
                type="button"
                className={`button ${overwriteDuplicates && importPreview.duplicates.length > 0 ? 'secondary' : ''}`}
                disabled={!importPreview.added.length && (!overwriteDuplicates || !importPreview.duplicates.length)}
                onClick={handleConfirmImport}
              >
                {overwriteDuplicates && importPreview.duplicates.length > 0
                  ? (importPreview.added.length > 0
                      ? `Add ${importPreview.added.length} & Overwrite ${importPreview.duplicates.length}`
                      : `Overwrite ${importPreview.duplicates.length} asset${importPreview.duplicates.length === 1 ? '' : 's'}`)
                  : `Add ${importPreview.added.length} new asset${importPreview.added.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
