export function DirectoryEntry({ entry, selecting = false, selected = false, editable = true, onActivate, onToggleSelection, onBrowse }) {
  const canSelect = editable && !entry.used;
  const browsing = !selecting && Boolean(onBrowse);
  const interactive = browsing || canSelect;
  const checked = canSelect && selected;
  const showCount = entry.count !== undefined;
  const rowClasses = [
    'category-directory-row',
    (editable || browsing) && 'directory-clickable-row',
    browsing && 'directory-browse-row',
    editable && showCount && 'location-clickable-row',
    editable && (entry.used ? 'in-use' : 'editable'),
    checked && 'selected',
  ].filter(Boolean).join(' ');
  const activate = () => { if (browsing) onBrowse(entry); else if (canSelect) onActivate(entry); };
  return (
    <li
      className={rowClasses}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-disabled={(selecting && editable && entry.used) || undefined}
      aria-pressed={selecting && interactive ? checked : undefined}
      title={browsing ? `View assets: ${entry.name}` : undefined}
      onClick={interactive ? activate : undefined}
      onKeyDown={interactive ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
      } : undefined}
    >
      {selecting && editable && <input aria-label={`Select ${entry.name}`} type="checkbox" checked={checked} disabled={entry.used} onClick={(event) => event.stopPropagation()} onChange={() => { if (interactive) onToggleSelection(entry.key); }} />}
      <span className={showCount ? 'directory-location-name' : undefined}>
        {entry.name}
        {showCount && <small>{entry.count} {entry.count === 1 ? 'asset' : 'assets'}</small>}
      </span>
      <span className={`directory-edit-state ${entry.used ? 'locked' : 'ready'}`}>{entry.used ? 'In use' : editable ? 'Editable' : 'Default'}</span>
    </li>
  );
}

export default function DirectoryPanel({ panel, canManage, selecting = false, selectedKeys = [], onAdd, onToggleMode, onSelectAll, onEditSelected, onDeleteSelected, onActivate, onToggleSelection, onBrowse }) {
  const eligible = panel.entries.filter((entry) => !entry.used);
  const selectedCount = eligible.filter((entry) => selectedKeys.includes(entry.key)).length;
  const allSelected = eligible.length > 0 && eligible.every((entry) => selectedKeys.includes(entry.key));
  return (
    <section className="panel">
      <div className="directory-panel-heading">
        <div><h3>{panel.title}</h3><p className="directory-panel-description">{panel.description}</p></div>
        <div className="directory-panel-actions">
          {selecting && !panel.addOnly ? <>
            <button type="button" className="button ghost directory-add-button" onClick={onSelectAll}>{allSelected ? 'Clear all' : 'Select all'}</button>
            <span className="directory-selection-count">{selectedCount} selected</span>
            {selectedCount === 1 && <button type="button" className="button ghost directory-add-button" onClick={onEditSelected}>Edit</button>}
            {selectedCount > 0 && <button type="button" className="button danger directory-add-button" onClick={onDeleteSelected}>Delete</button>}
            <button type="button" className="text-button" onClick={onToggleMode}>Done</button>
          </> : canManage && <>
            <button type="button" className="button ghost directory-add-button" onClick={onAdd}>+ Add</button>
            {!panel.addOnly && <button type="button" className="button ghost directory-add-button" onClick={onToggleMode}>Select</button>}
          </>}
        </div>
      </div>
      <ul className="directory-list">
        {!panel.entries.length && <li className="empty">No matching entries.</li>}
        {panel.entries.map((entry) => <DirectoryEntry key={entry.key} entry={entry} selecting={selecting} selected={selectedKeys.includes(entry.key)} editable={!panel.addOnly} onActivate={onActivate} onToggleSelection={onToggleSelection} onBrowse={onBrowse} />)}
      </ul>
    </section>
  );
}
