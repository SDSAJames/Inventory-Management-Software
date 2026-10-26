import { useDb } from '../hooks/useDb';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { statusClass } from '../lib/utils';
import Modal from '../components/Modal';

export default function DirectoryPage() {
  const { db, addCategory, addDepartment, addLocation, renameCategory, deleteCategory, renameDepartment, deleteDepartment, renameLocation, deleteLocation } = useDb();
  const { user } = useAuth();
  const toast = useToast();
  const canAddCategory = ['ADMIN', 'OPERATOR'].includes(user?.role);
  const canManageCategories = ['ADMIN', 'OPERATOR'].includes(user?.role);
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
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [manageTarget, setManageTarget] = useState(null);
  const [editedName, setEditedName] = useState('');
  const [selectionType, setSelectionType] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const openManage = (target) => { setManageTarget(target); setEditedName(target.name); };
  const activateEntry = (entry) => {
    if (entry.used) return;
    if (selectionType === entry.type) {
      toggleSelection(entry.key);
      return;
    }
    openManage(entry);
  };
  const handleRowKeyDown = (event, entry) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activateEntry(entry);
    }
  };
  const handleRename = async () => {
    if (!manageTarget || !editedName.trim()) return;
    try {
      if (manageTarget.type === 'Category') await renameCategory(manageTarget.id, editedName);
      if (manageTarget.type === 'Department') await renameDepartment(manageTarget.name, editedName);
      if (manageTarget.type === 'Location') await renameLocation(manageTarget.name, editedName);
      toast(`${manageTarget.type} renamed`);
      setManageTarget(null);
    } catch (error) { toast(error.message || `Could not rename ${manageTarget.type.toLowerCase()}`); }
  };
  const handleDelete = async () => {
    if (!manageTarget || manageTarget.used) return;
    try {
      if (manageTarget.type === 'Category') await deleteCategory(manageTarget.id);
      if (manageTarget.type === 'Department') await deleteDepartment(manageTarget.name);
      if (manageTarget.type === 'Location') await deleteLocation(manageTarget.name);
      toast(`${manageTarget.type} removed`);
      if (selectedLocation === manageTarget.name) setSelectedLocation(null);
      setManageTarget(null);
    } catch (error) { toast(error.message || `Could not remove ${manageTarget.type.toLowerCase()}`); }
  };
  const locations = db.locations || [];
  const assets = db.assets || [];
  const selectedAssets = assets.filter((asset) => asset.location === selectedLocation);
  const categoryEntries = (db.categories || []).map((item) => ({ type: 'Category', key: item.id, name: item.name, id: item.id, used: assets.some((asset) => asset.category?.toLowerCase() === item.name.toLowerCase()) }));
  const departmentEntries = (db.departments || []).map((name) => ({ type: 'Department', key: name, name, used: assets.some((asset) => asset.department?.toLowerCase() === name.toLowerCase()) }));
  const locationEntries = locations.map((name) => ({ type: 'Location', key: name, name, used: assets.some((asset) => asset.location?.toLowerCase() === name.toLowerCase()), count: assets.filter((asset) => asset.location?.toLowerCase() === name.toLowerCase()).length }));
  const entriesForType = (type) => ({ Category: categoryEntries, Department: departmentEntries, Location: locationEntries })[type] || [];
  const toggleSelection = (key) => setSelectedKeys((prev) => prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]);
  const startSelection = (type) => {
    if (selectionType === type) { setSelectionType(null); setSelectedKeys([]); }
    else { setSelectionType(type); setSelectedKeys([]); }
  };
  const selectAll = (type) => {
    const eligible = entriesForType(type).filter((entry) => !entry.used).map((entry) => entry.key);
    setSelectedKeys((prev) => eligible.length && eligible.every((key) => prev.includes(key)) ? [] : eligible);
  };
  const manageActions = (type) => {
    const selected = entriesForType(type).filter((entry) => selectedKeys.includes(entry.key));
    if (selected.length !== 1) return;
    const entry = selected[0];
    openManage({ ...entry });
  };
  const deleteSelected = async (type) => {
    const selected = entriesForType(type).filter((entry) => selectedKeys.includes(entry.key) && !entry.used);
    if (!selected.length || !window.confirm(`Delete ${selected.length} selected ${type.toLowerCase()}${selected.length === 1 ? '' : 's'}?`)) return;
    try {
      for (const entry of selected) {
        if (type === 'Category') await deleteCategory(entry.id);
        if (type === 'Department') await deleteDepartment(entry.name);
        if (type === 'Location') await deleteLocation(entry.name);
      }
      toast(`${selected.length} ${type.toLowerCase()}${selected.length === 1 ? '' : 's'} deleted`);
      setSelectedKeys([]);
    } catch (error) { toast(error.message || `Could not delete selected ${type.toLowerCase()}s`); }
  };
  const renderPanelActions = (type, addOption) => {
    const entries = entriesForType(type);
    const selectedCount = entries.filter((entry) => selectedKeys.includes(entry.key)).length;
    const active = selectionType === type;
    return <div className="directory-panel-actions">
      {active ? <>
        <button type="button" className="button ghost directory-add-button" onClick={() => selectAll(type)}>{entries.filter((entry) => !entry.used).length > 0 && entries.filter((entry) => !entry.used).every((entry) => selectedKeys.includes(entry.key)) ? 'Clear all' : 'Select all'}</button>
        <span className="directory-selection-count">{selectedCount} selected</span>
        {selectedCount === 1 && <button type="button" className="button ghost directory-add-button" onClick={() => manageActions(type)}>Edit</button>}
        {selectedCount > 0 && <button type="button" className="button danger directory-add-button" onClick={() => deleteSelected(type)}>Delete</button>}
        <button type="button" className="text-button" onClick={() => startSelection(type)}>Done</button>
      </> : <>
        {canAddCategory && <button type="button" className="button ghost directory-add-button" onClick={() => handleAddOption(type, addOption)}>+ Add</button>}
        {canManageCategories && <button type="button" className="button ghost directory-add-button" onClick={() => startSelection(type)}>Select</button>}
      </>}
    </div>;
  };

  return (
    <>
      <div className="view-header">
        <div>
          <p className="view-subtitle">Departments and facility locations registered in the system.</p>
        </div>
      </div>

      <div className="directory-columns">
        <section className="panel">
          <div className="directory-panel-heading">
            <h3>Asset categories</h3>
            {renderPanelActions('Category', addCategory)}
          </div>
          <ul className="directory-list">
            {categoryEntries.map((entry) => <li key={entry.key} className={`category-directory-row directory-clickable-row${entry.used ? ' in-use' : ' editable'}${selectionType === entry.type && selectedKeys.includes(entry.key) ? ' selected' : ''}`} role={entry.used ? undefined : 'button'} tabIndex={entry.used ? undefined : 0} aria-disabled={entry.used || undefined} aria-pressed={!entry.used && selectionType === entry.type && selectedKeys.includes(entry.key)} onClick={() => activateEntry(entry)} onKeyDown={(event) => handleRowKeyDown(event, entry)}>{selectionType === entry.type && <input aria-label={`Select ${entry.name}`} type="checkbox" checked={selectedKeys.includes(entry.key)} disabled={entry.used} onClick={(event) => event.stopPropagation()} onChange={() => !entry.used && toggleSelection(entry.key)} />}<span>{entry.name}</span><span className={`directory-edit-state ${entry.used ? 'locked' : 'ready'}`}>{entry.used ? 'In use' : 'Editable'}</span></li>)}
          </ul>
        </section>
        <section className="panel">
          <div className="directory-panel-heading">
            <h3>Departments</h3>
            {renderPanelActions('Department', addDepartment)}
          </div>
          <ul className="directory-list">
            {departmentEntries.map((entry) => <li key={entry.key} className={`category-directory-row directory-clickable-row${entry.used ? ' in-use' : ' editable'}${selectionType === entry.type && selectedKeys.includes(entry.key) ? ' selected' : ''}`} role={entry.used ? undefined : 'button'} tabIndex={entry.used ? undefined : 0} aria-disabled={entry.used || undefined} aria-pressed={!entry.used && selectionType === entry.type && selectedKeys.includes(entry.key)} onClick={() => activateEntry(entry)} onKeyDown={(event) => handleRowKeyDown(event, entry)}>{selectionType === entry.type && <input aria-label={`Select ${entry.name}`} type="checkbox" checked={selectedKeys.includes(entry.key)} disabled={entry.used} onClick={(event) => event.stopPropagation()} onChange={() => !entry.used && toggleSelection(entry.key)} />}<span>{entry.name}</span><span className={`directory-edit-state ${entry.used ? 'locked' : 'ready'}`}>{entry.used ? 'In use' : 'Editable'}</span></li>)}
          </ul>
        </section>

        <section className="panel">
          <div className="directory-panel-heading">
            <h3>Locations</h3>
            {renderPanelActions('Location', addLocation)}
          </div>
          <ul className="directory-list">
            {locationEntries.map((entry) => {
              return (
              <li key={entry.key} className={`category-directory-row directory-clickable-row location-clickable-row${entry.used ? ' in-use' : ' editable'}${selectionType === entry.type && selectedKeys.includes(entry.key) ? ' selected' : ''}`} role={entry.used ? undefined : 'button'} tabIndex={entry.used ? undefined : 0} aria-disabled={entry.used || undefined} aria-pressed={!entry.used && selectionType === entry.type && selectedKeys.includes(entry.key)} onClick={() => activateEntry(entry)} onKeyDown={(event) => handleRowKeyDown(event, entry)}>
                {selectionType === entry.type && <input aria-label={`Select ${entry.name}`} type="checkbox" checked={selectedKeys.includes(entry.key)} disabled={entry.used} onClick={(event) => event.stopPropagation()} onChange={() => !entry.used && toggleSelection(entry.key)} />}
                <span className="directory-location-name">{entry.name}<small>{entry.count} {entry.count === 1 ? 'asset' : 'assets'}</small></span>
                <span className={`directory-edit-state ${entry.used ? 'locked' : 'ready'}`}>{entry.used ? 'In use' : 'Editable'}</span>
              </li>
              );
            })}
          </ul>
        </section>
      </div>

      {selectedLocation && (
        <section className="panel directory-assets-panel" aria-live="polite">
          <div className="directory-assets-heading">
            <div>
              <h3>{selectedLocation}</h3>
              <p>{selectedAssets.length} {selectedAssets.length === 1 ? 'asset' : 'assets'} at this location</p>
            </div>
            <button type="button" className="button ghost" onClick={() => setSelectedLocation(null)}>Close</button>
          </div>
          {selectedAssets.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Asset</th><th>Category / model</th><th>Status</th><th>Holder</th><th>Department</th><th>Serial number</th><th>Condition</th></tr></thead>
                <tbody>{selectedAssets.map((asset) => (
                  <tr key={asset.id || asset.code}>
                    <td><strong>{asset.name || asset.code || 'Unnamed asset'}</strong><div className="asset-code">{asset.code || 'No asset number'}</div></td>
                    <td>{asset.category || '—'}<div className="asset-code">{asset.model || '—'}</div></td>
                    <td><span className={`status ${statusClass(asset.status)}`}>{asset.status || 'Unknown'}</span></td>
                    <td>{asset.owner || '—'}</td><td>{asset.department || '—'}</td><td>{asset.serial || '—'}</td><td>{asset.condition || '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div className="empty">No assets are currently assigned to this location.</div>}
        </section>
      )}

      <Modal open={Boolean(manageTarget)} onClose={() => setManageTarget(null)} size="sm">
        {manageTarget && (
          <div className="directory-manage-dialog">
            <h2>{manageTarget.type}</h2>
            <p className="modal-intro">
              {manageTarget.used
                ? 'This value is assigned to an asset and cannot be edited or deleted.'
                : 'Edit this directory value or remove it from the list.'}
            </p>
            <div className="field">
              <label htmlFor="directoryValueName">{manageTarget.type} name</label>
              <input id="directoryValueName" value={editedName} onChange={(event) => setEditedName(event.target.value)} disabled={!canManageCategories || manageTarget.used} />
            </div>
            {manageTarget.type === 'Location' && (
              <button type="button" className="text-button" onClick={() => { setSelectedLocation(manageTarget.name); setManageTarget(null); }}>
                View {manageTarget.count} {manageTarget.count === 1 ? 'asset' : 'assets'}
              </button>
            )}
            <div className="form-actions">
              <button type="button" className="button ghost" onClick={() => setManageTarget(null)}>Close</button>
              {canManageCategories && <>
                <button type="button" className="button danger" disabled={manageTarget.used} onClick={handleDelete}>Delete</button>
                <button type="button" className="button" disabled={manageTarget.used || !editedName.trim() || editedName.trim() === manageTarget.name} onClick={handleRename}>Save</button>
              </>}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
