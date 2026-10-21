import { useState, useRef, useEffect, useMemo } from 'react';
import { useDb } from '../hooks/useDb';
import { isAssetAssignable, isItDepartment } from '../lib/assetIntegrity';

function highlightMatch(text, query) {
  if (!query || !text) return text;
  const q = query.trim().toLowerCase();
  const original = String(text);
  const lower = original.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return original;

  return (
    <>
      {original.slice(0, idx)}
      <mark className="asset-highlight">{original.slice(idx, idx + q.length)}</mark>
      {original.slice(idx + q.length)}
    </>
  );
}

export default function AssetAutocomplete({
  value = '',
  onChange,
  onSelectAsset,
  placeholder = 'Type asset number (e.g. 432, SPE-4321)...',
  id = 'assetCode',
  required = false,
  hasError = false,
  categoryFilter,
}) {
  const { db } = useDb();
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const query = String(value || '').trim();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter & rank matching assets
  const matches = useMemo(() => {
    const all = db.assets || [];
    const q = query.toLowerCase();

    // If query is empty, show all assignable equipment (Available or held by IT department)
    if (!q) {
      return all
        .filter((a) => {
          if (categoryFilter && a.category?.toLowerCase() !== categoryFilter.toLowerCase()) {
            return false;
          }
          return isAssetAssignable(a);
        })
        .sort((a, b) => {
          if (a.category === 'Laptop' && b.category !== 'Laptop') return -1;
          if (b.category === 'Laptop' && a.category !== 'Laptop') return 1;
          return (a.code || '').localeCompare(b.code || '');
        })
        .slice(0, 12);
    }

    // Match query against code (asset number), model, serial, category, holder
    const filtered = all.filter((a) => {
      const code = String(a.code || '').toLowerCase();
      const model = String(a.model || '').toLowerCase();
      const serial = String(a.serial || '').toLowerCase();
      const category = String(a.category || '').toLowerCase();
      const owner = String(a.owner || '').toLowerCase();
      return (
        code.includes(q) ||
        model.includes(q) ||
        serial.includes(q) ||
        category.includes(q) ||
        owner.includes(q)
      );
    });

    // Score & sort:
    // 1. Exact code match
    // 2. Code starts with query
    // 3. Code contains query (e.g. '432' in 'SPE-4321')
    // 4. Assignable status (Available or IT department holder)
    // 5. Category === 'Laptop'
    return filtered
      .sort((a, b) => {
        const codeA = String(a.code || '').toLowerCase();
        const codeB = String(b.code || '').toLowerCase();

        if (codeA === q && codeB !== q) return -1;
        if (codeB === q && codeA !== q) return 1;

        const aStarts = codeA.startsWith(q);
        const bStarts = codeB.startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (bStarts && !aStarts) return 1;

        const aCodeMatch = codeA.includes(q);
        const bCodeMatch = codeB.includes(q);
        if (aCodeMatch && !bCodeMatch) return -1;
        if (bCodeMatch && !aCodeMatch) return 1;

        const aAssignable = isAssetAssignable(a);
        const bAssignable = isAssetAssignable(b);
        if (aAssignable && !bAssignable) return -1;
        if (bAssignable && !aAssignable) return 1;

        const aLaptop = a.category === 'Laptop';
        const bLaptop = b.category === 'Laptop';
        if (aLaptop && !bLaptop) return -1;
        if (bLaptop && !aLaptop) return 1;

        return codeA.localeCompare(codeB);
      })
      .slice(0, 15);
  }, [db.assets, query, categoryFilter]);

  // Check if current value matches an exact asset
  const matchedAsset = useMemo(() => {
    if (!query) return null;
    return (db.assets || []).find(
      (a) => String(a.code || '').trim().toLowerCase() === query.toLowerCase()
    );
  }, [db.assets, query]);

  // Check if the query itself is not an existing asset code (so we offer "Use custom")
  const hasExactMatch = matches.some(
    (m) => String(m.code || '').toLowerCase() === query.toLowerCase()
  );

  const totalOptions = matches.length + (query && !hasExactMatch ? 1 : 0);

  const handleSelect = (asset) => {
    onChange(asset.code);
    if (onSelectAsset) onSelectAsset(asset);
    setIsOpen(false);
  };

  const handleSelectCustom = () => {
    onChange(query);
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true);
      return;
    }

    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % Math.max(1, totalOptions));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev - 1 + totalOptions) % Math.max(1, totalOptions));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex < matches.length) {
        handleSelect(matches[highlightIndex]);
      } else if (query && !hasExactMatch) {
        handleSelectCustom();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const getStatusBadge = (asset) => {
    const isAvail = asset.status === 'Available';
    const isItDept = isItDepartment(asset.owner);

    if (isAvail || isItDept) {
      return {
        cls: 'status-avail',
        label: isItDept && !isAvail ? '● Available (IT Pool)' : '● Available',
      };
    }
    const s = String(asset.status || '').toLowerCase();
    if (s === 'on loan') return { cls: 'status-loan', label: '● On loan' };
    if (s === 'assigned') return { cls: 'status-assigned', label: '● Assigned' };
    if (s === 'under repair') return { cls: 'status-repair', label: '● Under repair' };
    if (s === 'damaged') return { cls: 'status-repair', label: '● Damaged' };
    return { cls: 'status-other', label: `● ${asset.status || 'Active'}` };
  };

  return (
    <div className="asset-autocomplete-container" ref={containerRef}>
      <div className="asset-autocomplete-input-wrap">
        <span className="asset-input-search-icon" aria-hidden="true">
          🔍
        </span>
        <input
          id={id}
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
            setHighlightIndex(0);
          }}
          onFocus={() => {
            setIsOpen(true);
            setHighlightIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          className={`asset-autocomplete-input ${hasError ? 'input-error-red' : ''}`}
        />
        {value && (
          <button
            type="button"
            className="asset-input-clear-btn"
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            title="Clear asset number"
            aria-label="Clear asset number"
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="asset-autocomplete-dropdown" role="listbox">
          <div className="asset-dropdown-header">
            {query ? (
              <span>
                Matching equipment for "<strong>{query}</strong>" ({matches.length})
              </span>
            ) : (
              <span>Assignable equipment ready for loan ({matches.length})</span>
            )}
            <span className="asset-dropdown-hint">↑↓ to navigate, Enter to select</span>
          </div>

          <div className="asset-dropdown-list">
            {matches.map((asset, idx) => {
              const isSelected = highlightIndex === idx;
              const badge = getStatusBadge(asset);
              const isItDept = isItDepartment(asset.owner);
              const isAssignable = isAssetAssignable(asset);

              return (
                <div
                  key={asset.id || asset.code}
                  role="option"
                  aria-selected={isSelected}
                  className={`asset-dropdown-item ${isSelected ? 'highlighted' : ''}`}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  onClick={() => handleSelect(asset)}
                >
                  <div className="asset-item-top">
                    <span className="asset-item-code">
                      {highlightMatch(asset.code, query)}
                    </span>
                    <span className={`asset-status-pill ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="asset-item-bottom">
                    <span className="asset-item-name">
                      {asset.category && <span className="asset-cat-tag">{asset.category}</span>}
                      {asset.model && (
                        <span className="asset-item-model">{highlightMatch(asset.model, query)}</span>
                      )}
                      {isItDept && (
                        <span className="asset-it-pool-tag" title="Held in IT department pool - ready to assign">
                          🏛️ IT pool
                        </span>
                      )}
                    </span>
                    {asset.location && (
                      <span className="asset-item-location" title="Current location">
                        📍 {asset.location}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Custom Code Entry option */}
            {query && !hasExactMatch && (
              <div
                role="option"
                aria-selected={highlightIndex === matches.length}
                className={`asset-dropdown-item custom-entry ${
                  highlightIndex === matches.length ? 'highlighted' : ''
                }`}
                onMouseEnter={() => setHighlightIndex(matches.length)}
                onClick={handleSelectCustom}
              >
                <div className="asset-item-top">
                  <span className="asset-item-code custom-code">
                    ➕ Use "<strong>{query}</strong>"
                  </span>
                  <span className="asset-status-pill status-new">New / Custom</span>
                </div>
                <div className="asset-item-bottom">
                  <span className="asset-item-hint">
                    Enter as new asset number. Registry stub will be created on loan record.
                  </span>
                </div>
              </div>
            )}

            {matches.length === 0 && !query && (
              <div className="asset-dropdown-empty">
                No assignable assets currently found in inventory.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Matched Asset Preview Chip */}
      {matchedAsset && (
        <div className="asset-selected-chip">
          <span className="asset-chip-icon">✓</span>
          <span className="asset-chip-text">
            <strong>{matchedAsset.code}</strong>{matchedAsset.model ? ` — ${matchedAsset.model}` : ''} (
            <span className={`asset-chip-status ${getStatusBadge(matchedAsset).cls}`}>
              {isItDepartment(matchedAsset.owner) ? 'Available (IT pool)' : matchedAsset.status}
            </span>
            {matchedAsset.location ? ` • ${matchedAsset.location}` : ''})
          </span>
        </div>
      )}
    </div>
  );
}
