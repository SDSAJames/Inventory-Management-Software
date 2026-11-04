import { useDb } from '../hooks/useDb';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { statusClass } from '../lib/utils';
import { STATUSES } from '../lib/constants';
import Modal from '../components/Modal';
import DirectoryPanel from '../components/DirectoryPanel';

export default function DirectoryPage() {
  const { db, addCategory, addStatus, addDepartment, addLocation, renameCategory, deleteCategory, renameDepartment, deleteDepartment, renameLocation, deleteLocation } = useDb();
  const { user } = useAuth();
  const toast = useToast();
  const canManageDirectory = ['ADMIN', 'OPERATOR'].includes(user?.role);
  const assets = db.assets || [];
  const panelDefinitions = [
    { type: 'Category', title: 'Asset categories', description: 'Equipment type, such as Laptop or Printer.', items: db.categories || [], assetField: 'category', add: addCategory, rename: (entry, name) => renameCategory(entry.id, name), remove: (entry) => deleteCategory(entry.id) },
    { type: 'Department', title: 'Departments', description: 'Teams assigned to company assets.', items: db.departments || [], assetField: 'department', add: addDepartment, rename: (entry, name) => renameDepartment(entry.name, name), remove: (entry) => deleteDepartment(entry.name) },
    { type: 'Location', title: 'Locations', description: 'Sites where company assets are held.', items: db.locations || [], assetField: 'location', showCount: true, add: addLocation, rename: (entry, name) => renameLocation(entry.name, name), remove: (entry) => deleteLocation(entry.name) },
  ];
  const panels = panelDefinitions.map((definition) => ({
    ...definition,
    entries: definition.items.map((item) => {
      const entry = typeof item === 'string' ? { name: item, key: item } : { ...item, key: item.id };
      const count = assets.filter((asset) => asset[definition.assetField]?.toLowerCase() === entry.name.toLowerCase()).length;
      return { ...entry, type: definition.type, used: count > 0, ...(definition.showCount ? { count } : {}) };
    }),
  }));
  const statusPanel = {
    type: 'Asset status', title: 'Asset statuses', description: 'Lifecycle state shown on every asset record.', addOnly: true, add: addStatus,
    entries: (db.statuses?.length ? db.statuses.map((item) => item.name) : STATUSES).map((name) => ({ key: name, name, used: assets.some((asset) => asset.status?.toLowerCase() === name.toLowerCase()) })),
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
  const handleRename = async () => {
    if (!manageTarget || manageTarget.used || !editedName.trim()) return;
    try {
      await panelForType(manageTarget.type).rename(manageTarget, editedName);
      toast(`${manageTarget.type} renamed`);
      setManageTarget(null);
    } catch (error) { toast(error.message || `Could not rename ${manageTarget.type.toLowerCase()}`); }
  };
  const handleDelete = async () => {
    if (!manageTarget || manageTarget.used) return;
    try {
      await panelForType(manageTarget.type).remove(manageTarget);
      toast(`${manageTarget.type} removed`);
      if (selectedLocation === manageTarget.name) setSelectedLocation(null);
      setManageTarget(null);
    } catch (error) { toast(error.message || `Could not remove ${manageTarget.type.toLowerCase()}`); }
  };
  const selectedAssets = assets.filter((asset) => asset.location === selectedLocation);
  const entriesForType = (type) => panelForType(type)?.entries || [];
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
    const selected = entriesForType(type).filter((entry) => !entry.used && selectedKeys.includes(entry.key));
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
          <p className="view-subtitle">Manage the shared lists used by asset records: statuses, categories, departments, and locations.</p>
        </div>
      </div>

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
          />
        ))}
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
              <input id="directoryValueName" value={editedName} onChange={(event) => setEditedName(event.target.value)} disabled={!canManageDirectory || manageTarget.used} />
            </div>
            {manageTarget.type === 'Location' && (
              <button type="button" className="text-button" onClick={() => { setSelectedLocation(manageTarget.name); setManageTarget(null); }}>
                View {manageTarget.count} {manageTarget.count === 1 ? 'asset' : 'assets'}
              </button>
            )}
            <div className="form-actions">
              <button type="button" className="button ghost" onClick={() => setManageTarget(null)}>Close</button>
              {canManageDirectory && <>
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
