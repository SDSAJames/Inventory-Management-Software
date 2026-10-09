import { useState, useMemo } from 'react';
import Modal from './Modal';
import { PATCH_HISTORY } from '../data/patchHistory';
import { APP_VERSION } from '../lib/constants';

export default function PatchHistoryModal({ open, onClose }) {
  const [selectedVersion, setSelectedVersion] = useState('ALL'); // 'ALL' | '1.2.1' | ...
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'major' | 'minor' | 'patch'
  const [expandedVersions, setExpandedVersions] = useState(() => {
    // Expand the latest versions by default
    return new Set(['1.2.1', '1.2.0']);
  });

  const toggleExpand = (ver) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(ver)) {
        next.delete(ver);
      } else {
        next.add(ver);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpandedVersions(new Set(PATCH_HISTORY.map((p) => p.version)));
  };

  const handleCollapseAll = () => {
    setExpandedVersions(new Set());
  };

  /* ── Filter Logic ────────────────────────────────────────── */
  const filteredHistory = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return PATCH_HISTORY.filter((item) => {
      // 1. Version filter
      if (selectedVersion !== 'ALL' && item.version !== selectedVersion) {
        return false;
      }

      // 2. Type filter
      if (typeFilter !== 'ALL' && item.type !== typeFilter) {
        return false;
      }

      // 3. Search query
      if (!q) return true;

      const inVersion = item.version.toLowerCase().includes(q);
      const inTitle = item.title.toLowerCase().includes(q);
      const inSummary = item.summary.toLowerCase().includes(q);
      const inHighlights = (item.highlights || []).some((h) => h.toLowerCase().includes(q));
      const inSections = (item.sections || []).some((sec) =>
        sec.heading.toLowerCase().includes(q) ||
        (sec.items || []).some((it) => it.toLowerCase().includes(q))
      );

      return inVersion || inTitle || inSummary || inHighlights || inSections;
    });
  }, [selectedVersion, typeFilter, searchQuery]);

  return (
    <Modal open={open} onClose={onClose} size="wide" className="patch-history-modal-wrapper">
      <div className="patch-history-container">
        {/* ── Fixed Pinned Header ─────────────────────────────── */}
        <div className="patch-history-header">
          <div className="patch-title-group">
            <div className="patch-badge-row">
              <span className="brand-pill">STARPLUS ENERGY</span>
              <span className="active-ver-pill" title="Current Installed Version">
                v{APP_VERSION} Active
              </span>
              <span className="semver-tag" title="Version Governance Standard">
                SemVer 2.0.0 Compliant
              </span>
            </div>
            <h2>Patch History & Release Notes</h2>
            <p className="modal-intro">
              Inspect version updates, release notes, and architecture changelogs per version. Standard Semantic Versioning (Major.Minor.Patch) with 100% air-gapped offline guarantees.
            </p>
          </div>
          <button
            type="button"
            className="patch-modal-header-close"
            onClick={onClose}
            aria-label="Close release notes"
            title="Close modal (Esc)"
          >
            ×
          </button>
        </div>

        {/* ── Fixed Controls & Filter Bar ─────────────────────── */}
        <div className="patch-controls-bar">
          {/* Version Pills Navigation */}
          <div className="patch-version-pills-row">
            <span className="pills-label">Version:</span>
            <div className="patch-version-pills" role="tablist" aria-label="Version selector">
              <button
                type="button"
                className={`patch-ver-pill-btn ${selectedVersion === 'ALL' ? 'active' : ''}`}
                onClick={() => setSelectedVersion('ALL')}
              >
                All Versions ({PATCH_HISTORY.length})
              </button>
              {PATCH_HISTORY.map((p) => {
                const isCurrent = p.version === APP_VERSION;
                const isSelected = selectedVersion === p.version;
                return (
                  <button
                    key={p.version}
                    type="button"
                    className={`patch-ver-pill-btn ${isSelected ? 'active' : ''} ${isCurrent ? 'is-current' : ''}`}
                    onClick={() => {
                      setSelectedVersion(p.version);
                      setExpandedVersions((prev) => new Set(prev).add(p.version));
                    }}
                    title={`View v${p.version} details`}
                  >
                    v{p.version}
                    {isCurrent && <span className="current-dot" title="Active Version" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search & Type Filter Row */}
          <div className="patch-search-row">
            <div className="patch-search-box">
              <span className="search-icon">🔍</span>
              <input
                type="search"
                placeholder="Search patch notes, features, fixes, or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="patch-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="patch-type-filters">
              <button
                type="button"
                className={`patch-type-btn ${typeFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setTypeFilter('ALL')}
              >
                All Types
              </button>
              <button
                type="button"
                className={`patch-type-btn ${typeFilter === 'patch' ? 'active' : ''}`}
                onClick={() => setTypeFilter('patch')}
              >
                Patches
              </button>
              <button
                type="button"
                className={`patch-type-btn ${typeFilter === 'minor' ? 'active' : ''}`}
                onClick={() => setTypeFilter('minor')}
              >
                Minor
              </button>
              <button
                type="button"
                className={`patch-type-btn ${typeFilter === 'major' ? 'active' : ''}`}
                onClick={() => setTypeFilter('major')}
              >
                Major
              </button>
            </div>

            <div className="patch-expand-actions">
              <button type="button" className="text-button" onClick={handleExpandAll}>
                Expand All
              </button>
              <span className="divider-dot">•</span>
              <button type="button" className="text-button" onClick={handleCollapseAll}>
                Collapse All
              </button>
            </div>
          </div>
        </div>

        {/* ── Scrollable Body Area (Only this area scrolls!) ── */}
        <div className="patch-cards-stream">
          {filteredHistory.length === 0 ? (
            <div className="empty-patch-state">
              <div className="empty-patch-icon">📋</div>
              <strong>No patch notes match your search</strong>
              <p>Try searching for a different keyword or select &ldquo;All Versions&rdquo;.</p>
              <button
                type="button"
                className="button ghost small-btn"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedVersion('ALL');
                  setTypeFilter('ALL');
                }}
              >
                Reset Filters
              </button>
            </div>
          ) : (
            filteredHistory.map((item) => {
              const isExpanded = expandedVersions.has(item.version) || selectedVersion === item.version;
              const isCurrent = item.version === APP_VERSION;

              let typeTagClass = 'tag-patch';
              if (item.type === 'major') typeTagClass = 'tag-major';
              else if (item.type === 'minor') typeTagClass = 'tag-minor';

              return (
                <article
                  key={item.version}
                  className={`patch-card ${isCurrent ? 'current-release-card' : ''}`}
                >
                  {/* Card Header */}
                  <header
                    className="patch-card-header"
                    onClick={() => toggleExpand(item.version)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExpand(item.version);
                      }
                    }}
                    aria-expanded={isExpanded}
                  >
                    <div className="patch-card-header-left">
                      <div className="patch-version-block">
                        <span className={`patch-version-tag ${typeTagClass}`}>
                          v{item.version}
                        </span>
                        {isCurrent && (
                          <span className="badge-active-now">CURRENT INSTALLED</span>
                        )}
                        <span className="patch-release-tag">{item.tag}</span>
                      </div>
                      <h3 className="patch-card-title">{item.title}</h3>
                      <div className="patch-meta-row">
                        <span className="patch-date">
                          📅 Released on <strong>{item.date}</strong>
                        </span>
                        <span className="meta-bullet">•</span>
                        <span className="patch-change-count">
                          {item.highlights?.length || 0} Key Highlights
                        </span>
                      </div>
                    </div>

                    <div className="patch-card-header-right">
                      <span className="toggle-expand-icon">
                        {isExpanded ? '▲ Collapse' : '▼ View Details'}
                      </span>
                    </div>
                  </header>

                  {/* Card Body */}
                  {isExpanded && (
                    <div className="patch-card-body">
                      <p className="patch-summary-text">{item.summary}</p>

                      {/* Key Highlights */}
                      {item.highlights && item.highlights.length > 0 && (
                        <div className="patch-highlights-block">
                          <strong className="highlights-title">⭐ Release Highlights</strong>
                          <ul className="highlights-list">
                            {item.highlights.map((h, i) => (
                              <li key={i}>{h}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Detailed Sections */}
                      {item.sections && item.sections.length > 0 && (
                        <div className="patch-sections-grid">
                          {item.sections.map((sec, secIdx) => (
                            <div key={secIdx} className="patch-section-card">
                              <div className="patch-section-heading-row">
                                <h4 className="patch-section-title">{sec.heading}</h4>
                                {sec.badge && (
                                  <span className="patch-section-badge">{sec.badge}</span>
                                )}
                              </div>
                              <ul className="patch-items-list">
                                {sec.items.map((it, itIdx) => (
                                  <li key={itIdx}>{it}</li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>

        {/* ── Fixed Pinned Footer ─────────────────────────────── */}
        <div className="patch-history-footer">
          <div className="patch-footer-info">
            <span className="storage-note">
              💾 100% Offline Architecture • Client-Side Persistence • StarPlus Energy
            </span>
          </div>
          <div className="patch-footer-actions">
            <button type="button" className="button" onClick={onClose}>
              Close Release Notes
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
