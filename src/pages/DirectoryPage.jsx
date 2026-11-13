import { departmentDirectoryNames, matchesDepartment } from '../../shared/departmentDirectory.js';
import { useDb } from '../hooks/useDb';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { STATUSES } from '../lib/constants';
import Modal from '../components/Modal';
import DirectoryPanel from '../components/DirectoryPanel';
import AssetTable from '../components/AssetTable';
import AssetForm from '../components/AssetForm';
import SearchBar from '../components/SearchBar';
import DirectorySelect from '../components/DirectorySelect';
import { directoryLocationOptions, filterDirectoryEntries, matchesDirectoryAsset } from '../lib/directoryOptions';

export default function DirectoryPage() {
  const { db, addCategory, addStatus, addDepartment, addLocation, renameCategory, deleteCategory, renameDepartment, deleteDepartment, renameLocation, deleteLocation } = useDb();
  const { user } = useAuth();
  const toast = useToast();
  const canManageDirectory = ['ADMIN', 'OPERATOR'].includes(user?.role);
  const assets = db.assets || [];
  const [directorySearch, setDirectorySearch] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  const panelDefinitions = [
    { type: 'Category', title: 'Asset categories', description: 'Equipment type, such as Laptop or Printer.', items: db.categories || [], assetField: 'category', add: addCategory, rename: (entry, name) => renameCategory(entry.id, name), remove: (entry) => deleteCategory(entry.id) },
    { type: 'Department', title: 'Departments', description: 'Teams linked to assets and assignment or pickup history.', items: departmentDirectoryNames(db), assetField: 'department', add: addDepartment, rename: (entry, name) => renameDepartment(entry.name, name), remove: (entry) => deleteDepartment(entry.name) },
    { type: 'Location', title: 'Locations', description: 'Sites where company assets are held.', items: directoryLocationOptions(db.locations, assets), assetField: 'location', showCount: true, add: addLocation, rename: (entry, name) => renameLocation(entry.name, name), remove: (entry) => deleteLocation(entry.name) },
  ];
  const panels = panelDefinitions.map((definition) => ({
    ...definition,
    entries: filterDirectoryEntries(definition.items.map((item) => {
      const entry = typeof item === 'string' ? { name: item, key: item } : { ...item, key: item.id };
      const count = assets.filter((asset) => matchesDirectoryAsset(asset, definition.assetField, entry.name)).length;
      const historyCount = definition.type === 'Department' ? (db.loans || []).filter((loan) => matchesDepartment(loan, entry.name)).length : 0;
      const personUsed = definition.type === 'Department' && (db.employees || []).some((person) => matchesDepartment(person, entry.name));
      return { ...entry, historyCount, type: definition.type, used: count > 0 || historyCount > 0 || personUsed, canRenameUsed: definition.type === 'Location', ...(definition.showCount ? { count } : {}) };
    }), directorySearch, sortDirection),
  }));
  const statusPanel = {
    type: 'Asset status', title: 'Asset statuses', description: 'Lifecycle state shown on every asset record.', addOnly: true, add: addStatus,
    entries: filterDirectoryEntries((db.statuses?.length ? db.statuses.map((item) => item.name) : STATUSES).map((name) => ({ key: name, name, used: assets.some((asset) => matchesDirectoryAsset(asset, 'status', name)) })), directorySearch, sortDirection),
  };
  const panelForType = (type) => panels.find((panel) => panel.type === type);
  const handleAddOption = async (label, addOption) => {
    const name = window.prompt(`Enter a name for the new ${label.toLowerCase()}`);
    if (name === null || !name.trim()) return;
    try {
      await addOption(name);
      toast(`${label} added`);
    } catch (error) {
      toast(error.message || `Could not add ${label.toLowerCase()}`);
    }
  };
  const [assetTarget, setAssetTarget] = useState(null);
  const [assetSearch, setAssetSearch] = useState('');
  const [editAssetId, setEditAssetId] = useState(null);
  const openAssets = (panel, entry) => {
    setAssetTarget({ field: panel.assetField || 'status', type: panel.type, name: entry.name });
    setAssetSearch('');
  };
  const [manageTarget, setManageTarget] = useState(null);
  const [editedName, setEditedName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [selectionType, setSelectionType] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const openManage = (target) => { setManageTarget(target); setEditedName(target.name); };
  const activateEntry = (entry) => {
    if (entry.used && !entry.canRenameUsed) return;
    if (selectionType === entry.type) {
      toggleSelection(entry.key);
      return;
    }
    openManage(entry);
  };
  const handleRename = async () => {
    if (!canManageDirectory || savingName || !manageTarget || (manageTarget.used && !manageTarget.canRenameUsed) || !editedName.trim() || editedName.trim() === manageTarget.name) return;
    setSavingName(true);
    try {
      const result = await panelForType(manageTarget.type).rename(manageTarget, editedName);
      toast(result?.merged ? `Location merged into ${result.location.name}` : `${manageTarget.type} renamed`);
      if (manageTarget.type === 'Location') setAssetTarget((target) => target?.field === 'location' && target.name === manageTarget.name ? { ...target, name: result.location.name } : target);
      setSelectedKeys([]);
      setManageTarget(null);
    } catch (error) { toast(error.message || `Could not rename ${manageTarget.type.toLowerCase()}`); }
    finally { setSavingName(false); }
  };
  const handleDelete = async () => {
    if (!manageTarget || manageTarget.used) return;
    try {
      await panelForType(manageTarget.type).remove(manageTarget);
      toast(`${manageTarget.type} removed`);
      setManageTarget(null);
    } catch (error) { toast(error.message || `Could not remove ${manageTarget.type.toLowerCase()}`); }
  };
  const selectedAssets = assetTarget ? assets.filter((asset) => matchesDirectoryAsset(asset, assetTarget.field, assetTarget.name)) : [];
  const visibleAssets = selectedAssets.filter((asset) => [asset.code, asset.name, asset.category, asset.model, asset.serial, asset.owner, asset.department, asset.location].some((value) => String(value || '').toLowerCase().includes(assetSearch.trim().toLowerCase())));
  const entriesForType = (type) => panelForType(type)?.entries || [];
  const toggleSelection = (key) => setSelectedKeys((prev) => prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]);
  const startSelection = (type) => {
    if (selectionType === type) { setSelectionType(null); setSelectedKeys([]); }
    else { setSelectionType(type); setSelectedKeys([]); }
  };
  const selectAll = (type) => {
    const eligible = entriesForType(type).filter((entry) => !entry.used || entry.canRenameUsed).map((entry) => entry.key);
    setSelectedKeys((prev) => eligible.length && eligible.every((key) => prev.includes(key)) ? [] : eligible);
  };
  const manageActions = (type) => {
    const selected = entriesForType(type).filter((entry) => (!entry.used || entry.canRenameUsed) && selectedKeys.includes(entry.key));
    if (selected.length !== 1) return;
    const entry = selected[0];
    openManage({ ...entry });
  };
  const deleteSelected = async (type) => {
    const selected = entriesForType(type).filter((entry) => selectedKeys.includes(entry.key) && !entry.used);
    if (!selected.length || !window.confirm(`Delete ${selected.length} selected ${type.toLowerCase()}${selected.length === 1 ? '' : 's'}?`)) return;
    try {
      for (const entry of selected) {
        await panelForType(type).remove(entry);
      }
      toast(`${selected.length} ${type.toLowerCase()}${selected.length === 1 ? '' : 's'} deleted`);
      setSelectedKeys([]);
    } catch (error) { toast(error.message || `Could not delete selected ${type.toLowerCase()}s`); }
  };

  return (
    <>
      <div className="view-header">
        <div>
          <p className="view-subtitle">Click a directory value to view its assets. Use Select to manage values. Renaming a location updates all linked records; using an existing name merges locations. Only unused values can be deleted.</p>
        </div>
      </div>

      <SearchBar id="directory-search" searchTerm={directorySearch} onSearchChange={(value) => { setDirectorySearch(value); setSelectedKeys([]); }} placeholder="Search statuses, categories, departments, or locations">
        <select className="filter" aria-label="Sort directory by name" value={sortDirection} onChange={(event) => setSortDirection(event.target.value)}>
          <option value="asc">Name: A–Z</option>
          <option value="desc">Name: Z–A</option>
        </select>
      </SearchBar>
      <div className="directory-columns">
        {[statusPanel, ...panels].map((panel) => (
          <DirectoryPanel
            key={panel.type}
            panel={panel}
            canManage={canManageDirectory}
            selecting={selectionType === panel.type}
            selectedKeys={selectionType === panel.type ? selectedKeys : []}
            onAdd={() => handleAddOption(panel.type, panel.add)}
            onToggleMode={() => startSelection(panel.type)}
            onSelectAll={() => selectAll(panel.type)}
            onEditSelected={() => manageActions(panel.type)}
            onDeleteSelected={() => deleteSelected(panel.type)}
            onActivate={activateEntry}
            onToggleSelection={toggleSelection}
            onBrowse={(entry) => openAssets(panel, entry)}
          />
        ))}
      </div>

      <Modal open={Boolean(assetTarget) && editAssetId === null} size="wide" onClose={() => setAssetTarget(null)}>
        {assetTarget && <>
          <h2>{assetTarget.type}: {assetTarget.name}</h2>
          <p className="modal-intro">{selectedAssets.length} {selectedAssets.length === 1 ? 'asset' : 'assets'}.{canManageDirectory ? ' Click an asset to edit its location or other details.' : ''}</p>
          <SearchBar id="directory-asset-search" searchTerm={assetSearch} onSearchChange={setAssetSearch} placeholder="Search asset number, holder, model, or serial number" />
          {visibleAssets.length ? <AssetTable assets={visibleAssets} onEditAsset={canManageDirectory ? setEditAssetId : undefined} /> : <div className="empty">{selectedAssets.length ? 'No assets match your search.' : 'No assets currently use this directory value.'}</div>}
          <div className="form-actions"><button type="button" className="button ghost" onClick={() => setAssetTarget(null)}>Close</button></div>
        </>}
      </Modal>
      <Modal open={editAssetId !== null} size="wide" onClose={() => setEditAssetId(null)}>
        {editAssetId !== null && <AssetForm assetId={editAssetId} onClose={() => setEditAssetId(null)} />}
      </Modal>

      <Modal open={Boolean(manageTarget)} onClose={() => setManageTarget(null)} size="sm">
        {manageTarget && (
          <form className="directory-manage-dialog" onSubmit={(event) => { event.preventDefault(); return handleRename(); }}>
            <h2>{manageTarget.type}</h2>
            <p className="modal-intro">
              {manageTarget.type === 'Location' ? 'Renaming updates all assets and assignment or loan records using this location. Choose an existing location to merge into it.' : manageTarget.used
                ? 'This value is assigned to an asset and cannot be edited or deleted.'
                : 'Edit this directory value or remove it from the list.'}
            </p>
            {manageTarget.type === 'Location' ? <DirectorySelect allowCustom id="directoryValueName" label="Location name" options={db.locations} value={editedName} onChange={(event) => setEditedName(event.target.value)} /> : <div className="field">
              <label htmlFor="directoryValueName">{manageTarget.type} name</label>
              <input id="directoryValueName" value={editedName} onChange={(event) => setEditedName(event.target.value)} disabled={!canManageDirectory || manageTarget.used} />
            </div>}
            {manageTarget.type === 'Location' && (
              <button type="button" className="text-button" onClick={() => { openAssets(panelForType(manageTarget.type), manageTarget); setManageTarget(null); }}>
                View {manageTarget.count} {manageTarget.count === 1 ? 'asset' : 'assets'}
              </button>
            )}
            <div className="form-actions">
              <button type="button" className="button ghost" onClick={() => setManageTarget(null)}>Close</button>
              {canManageDirectory && <>
                <button type="button" className="button danger" disabled={manageTarget.used} onClick={handleDelete}>Delete</button>
                <button type="submit" className="button" disabled={savingName || (manageTarget.used && !manageTarget.canRenameUsed) || !editedName.trim() || editedName.trim() === manageTarget.name}>{savingName ? 'Saving…' : 'Save'}</button>
              </>}
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
