import { useDb } from '../hooks/useDb';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { statusClass } from '../lib/utils';

export default function DirectoryPage() {
  const { db, addCategory, renameCategory, deleteCategory } = useDb();
  const { user } = useAuth();
  const toast = useToast();
  const [newCategory, setNewCategory] = useState('');
  const canAddCategory = ['ADMIN', 'OPERATOR'].includes(user?.role);
  const canManageCategories = user?.role === 'ADMIN';
  const [selectedLocation, setSelectedLocation] = useState(null);
  const locations = db.locations || [];
  const assets = db.assets || [];
  const selectedAssets = assets.filter((asset) => asset.location === selectedLocation);

  return (
    <>
      <div className="view-header">
        <div>
          <p className="view-subtitle">Departments and facility locations registered in the system.</p>
        </div>
      </div>

      <div className="directory-columns">
        <section className="panel">
          <h3>Asset categories</h3>
          <ul className="directory-list">
            {(db.categories || []).map((category) => (
              <li key={category.id} className="category-directory-row">
                <span>{category.name}</span>
                {canManageCategories && <span className="category-directory-actions">
                  <button type="button" className="text-button" onClick={async () => {
                    const name = window.prompt('Rename category', category.name);
                    if (name === null || !name.trim()) return;
                    try { await renameCategory(category.id, name); toast('Category renamed'); }
                    catch (error) { toast(error.message); }
                  }}>Rename</button>
                  <button type="button" className="text-button" onClick={async () => {
                    try { await deleteCategory(category.id); toast('Category removed'); }
                    catch (error) { toast(error.message); }
                  }}>Remove</button>
                </span>}
              </li>
            ))}
          </ul>
          {canAddCategory && <form className="category-add-form" onSubmit={async (event) => {
            event.preventDefault();
            try { await addCategory(newCategory); setNewCategory(''); toast('Category added'); }
            catch (error) { toast(error.message); }
          }}>
            <input aria-label="New asset category" placeholder="New category name" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} />
            <button type="submit" className="button" disabled={!newCategory.trim()}>Add</button>
          </form>}
        </section>
        <section className="panel">
          <h3>Departments</h3>
          <ul className="directory-list">
            {(db.departments || []).map((dept) => (
              <li key={dept}>{dept}</li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h3>Locations</h3>
          <ul className="directory-list">
            {locations.map((loc) => {
              const count = assets.filter((asset) => asset.location === loc).length;
              const isSelected = selectedLocation === loc;
              return (
              <li key={loc}>
                <button
                  type="button"
                  className={`directory-location${isSelected ? ' selected' : ''}`}
                  aria-expanded={isSelected}
                  onClick={() => setSelectedLocation(isSelected ? null : loc)}
                >
                  <span>{loc}</span>
                  <small>{count} {count === 1 ? 'asset' : 'assets'}</small>
                </button>
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
    </>
  );
}
