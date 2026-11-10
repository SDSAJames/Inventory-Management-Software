import { travelerFollowUp, knoxRecipientList } from '../lib/travelerFollowUp';
import { enrichCustodyRecords } from '../lib/custodyRecords';
import LoanReturnModal from '../components/LoanReturnModal';

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { readableLoanDate } from "../lib/utils";
import { getLoanEndDate, isBusinessTraveler } from '../lib/loanEquipment';
import Modal from '../components/Modal';
import LoanForm from '../components/LoanForm';
import EditLoanForm from '../components/EditLoanForm';
import TravelerCalendar from '../components/TravelerCalendar';

export default function BusinessTravelersPage() {
  const { db } = useDb();
  const toast = useToast();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('active'); // 'all' | 'active' | 'scheduled' | 'overdue' | 'returned'
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editLoanId, setEditLoanId] = useState(null);
  const [returnConfirmTarget, setReturnConfirmTarget] = useState(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'roster' | 'both'

  /* ── Fullscreen Escape key & scroll-lock handler ─────────── */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    if (isFullScreen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullScreen]);

  /* ── 1. Calculate Traveler Records ────────────────────────── */
  const allTravelers = useMemo(() => enrichCustodyRecords((db.loans || []).filter((loan) => isBusinessTraveler(loan.assigneeType)), db.assets || []), [db.loans, db.assets]);

  const overdueTravelers = useMemo(() => {
    return allTravelers.filter((t) => t.isOverdue || t.tripStatus === 'Overdue');
  }, [allTravelers]);

  const followUpTravelers = useMemo(() => travelerFollowUp(allTravelers), [allTravelers]);

  /* ── 2. Summary Metrics ("How many they are") ─────────────── */
  const metrics = useMemo(() => {
    const totalAssignments = allTravelers.length;
    const inField = allTravelers.filter((t) => t.tripStatus === 'In Field').length;
    const overdue = allTravelers.filter((t) => t.tripStatus === 'Overdue').length;
    const scheduled = allTravelers.filter((t) => t.tripStatus === 'Scheduled').length;
    const returned = allTravelers.filter((t) => t.tripStatus === 'Returned').length;
    const activeTotal = inField + overdue; // Currently holding equipment outside IT

    // Distinct traveler names
    const distinctTravelers = new Set(allTravelers.map((t) => t.assignee)).size;

    return {
      distinctTravelers,
      totalAssignments,
      inField,
      overdue,
      scheduled,
      returned,
      activeTotal,
    };
  }, [allTravelers]);

  /* ── 3. Locations Breakdown ("Where they are") ────────────── */
  const locationsBreakdown = useMemo(() => {
    const map = new Map();

    allTravelers.forEach((t) => {
      const loc = t.location || 'Unspecified';
      if (!map.has(loc)) {
        map.set(loc, {
          location: loc,
          total: 0,
          inField: 0,
          overdue: 0,
          scheduled: 0,
          returned: 0,
          travelers: new Set(),
          laptops: [],
        });
      }
      const item = map.get(loc);
      item.total += 1;
      if (t.tripStatus === 'In Field') item.inField += 1;
      if (t.tripStatus === 'Overdue') item.overdue += 1;
      if (t.tripStatus === 'Scheduled') item.scheduled += 1;
      if (t.tripStatus === 'Returned') item.returned += 1;
      if (!t.isReturned) {
        item.travelers.add(t.assignee);
        if (t.assetCode) item.laptops.push(t.assetCode);
      }
    });

    return Array.from(map.values()).sort((a, b) => (b.inField + b.overdue) - (a.inField + a.overdue));
  }, [allTravelers]);

  /* ── 4. Filtered List ────────────────────────────────────── */
  const filteredTravelers = useMemo(() => {
    return allTravelers.filter((t) => {
      // Search term
      const query = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !query ||
        String(t.assignee || '').toLowerCase().includes(query) ||
        String(t.knoxId || '').toLowerCase().includes(query) ||
        String(t.location || '').toLowerCase().includes(query) ||
        String(t.assetCode || '').toLowerCase().includes(query) ||
        String(t.department || '').toLowerCase().includes(query) ||
        String(t.ip || '').toLowerCase().includes(query);

      // Location filter
      const matchesLocation =
        selectedLocation === 'ALL' || t.location === selectedLocation;

      // Status filter
      let matchesStatus = true;
      if (statusFilter === 'active') {
        matchesStatus = t.tripStatus === 'In Field' || t.tripStatus === 'Overdue';
      } else if (statusFilter === 'in_field') {
        matchesStatus = t.tripStatus === 'In Field';
      } else if (statusFilter === 'overdue') {
        matchesStatus = t.tripStatus === 'Overdue';
      } else if (statusFilter === 'scheduled') {
        matchesStatus = t.tripStatus === 'Scheduled';
      } else if (statusFilter === 'returned') {
        matchesStatus = t.tripStatus === 'Returned';
      }

      return matchesSearch && matchesLocation && matchesStatus;
    });
  }, [allTravelers, searchTerm, selectedLocation, statusFilter]);

  /* ── 5. Handlers ─────────────────────────────────────────── */

  return (
    <>
      <div className="view-header">
        <div>
          <p className="view-subtitle">
            Manage mobile staff on field assignments, business trips, and remote sites. Track current equipment custody by location.
          </p>
        </div>
        <div className="view-header-actions">
          <div className="view-mode-toggle">
            <button type="button" className={`view-mode-btn ${viewMode === 'followup' ? 'active' : ''}`} onClick={() => setViewMode('followup')}>Follow-up ({followUpTravelers.length})</button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'overdue' ? 'active overdue-toggle-active' : ''}`}
              onClick={() => setViewMode('overdue')}
              title="View overdue business travelers only"
            >
              ⚠️ Overdue Only ({metrics.overdue})
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'calendar' ? 'active' : ''}`}
              onClick={() => setViewMode('calendar')}
              title="View monthly schedule calendar"
            >
              📅 Calendar View
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'roster' ? 'active' : ''}`}
              onClick={() => setViewMode('roster')}
              title="View roster list table"
            >
              📋 Roster List
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'both' ? 'active' : ''}`}
              onClick={() => setViewMode('both')}
              title="Show all sections (overdue, calendar, and roster)"
            >
              🗂 All Sections
            </button>
          </div>
          <button
            type="button"
            className="button ghost"
            onClick={() => navigate('/calendar')}
            title="Open unified In & Out Calendar displaying all user types"
            style={{ fontSize: '12px' }}
          >
            📅 In & Out Calendar →
          </button>
          <button className="button" onClick={() => setShowCreateModal(true)}>
            + Record Business Traveler
          </button>
        </div>
      </div>

      {/* ── KPI Stat Cards & Location Breakdown (Hidden when Calendar View is selected) ── */}
      {viewMode !== 'calendar' && (
        <>
          {/* ── KPI Stat Cards ("How many they are") ─────────────── */}
          <section className="stat-grid" style={{ marginBottom: '22px' }}>
            <div
              className="stat-card"
              style={{ cursor: 'pointer' }}
              onClick={() => setViewMode('overdue')}
              title="Click to view overdue travelers only"
            >
              <div className="stat-label">Active in Field</div>
              <div className="stat-value" style={{ color: 'var(--blue)' }}>
                {metrics.activeTotal}
              </div>
              <div className="stat-hint">
                {metrics.inField} deployed •{' '}
                <strong style={{ color: metrics.overdue > 0 ? '#dc2626' : 'inherit' }}>
                  {metrics.overdue} overdue (click to view)
                </strong>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Travel Locations</div>
              <div className="stat-value">{locationsBreakdown.filter((l) => l.inField + l.overdue > 0).length}</div>
              <div className="stat-hint">Active remote deployment sites</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Scheduled Trips</div>
              <div className="stat-value" style={{ color: '#0284c7' }}>
                {metrics.scheduled}
              </div>
              <div className="stat-hint">Upcoming equipment pickups</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Total Travelers</div>
              <div className="stat-value">{metrics.distinctTravelers}</div>
              <div className="stat-hint">{metrics.totalAssignments} total assignments</div>
            </div>
          </section>

          {/* ── Location Breakdown ("Where they are") ────────────── */}
          {viewMode !== 'overdue' && (
            <section className="panel" style={{ marginBottom: '22px' }}>
              <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ margin: 0 }}>Where They Are — Location Distribution</h3>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    Click any location to filter traveler assignments below
                  </span>
                </div>
                {selectedLocation !== 'ALL' && (
                  <button
                    className="text-button"
                    style={{ fontSize: '12px', fontWeight: 600 }}
                    onClick={() => setSelectedLocation('ALL')}
                  >
                    Clear filter (Show all)
                  </button>
                )}
              </div>

              <div className="traveler-locations-list">
                {locationsBreakdown.map((loc) => {
                  const activeAtLoc = loc.inField + loc.overdue;
                  const isSelected = selectedLocation === loc.location;
                  return (
                    <div
                      key={loc.location}
                      className={`traveler-location-row${isSelected ? ' selected' : ''}${activeAtLoc > 0 ? ' has-active' : ''}`}
                      onClick={() => setSelectedLocation(isSelected ? 'ALL' : loc.location)}
                      title={`Click to filter roster and calendar by ${loc.location}`}
                    >
                      <div className="loc-row-left">
                        <span className="loc-pin">📍</span>
                        <div className="loc-row-name-block">
                          <strong className="loc-row-name">{loc.location}</strong>
                          <span className="loc-row-sub">
                            {loc.total} total assignment{loc.total === 1 ? '' : 's'}
                          </span>
                        </div>
                        <span className={`loc-count-pill${activeAtLoc > 0 ? ' active' : ''}`}>
                          {activeAtLoc} Active
                        </span>
                      </div>

                      <div className="loc-row-stats">
                        <div className="loc-stat-cell">
                          <span className="loc-stat-label">In field:</span>
                          <strong>{loc.inField}</strong>
                        </div>
                        <div className={`loc-stat-cell ${loc.overdue > 0 ? 'overdue-cell' : ''}`}>
                          <span className="loc-stat-label">Overdue:</span>
                          <strong>{loc.overdue}</strong>
                        </div>
                        <div className="loc-stat-cell">
                          <span className="loc-stat-label">Scheduled:</span>
                          <strong>{loc.scheduled}</strong>
                        </div>
                        <div className="loc-stat-cell">
                          <span className="loc-stat-label">Returned:</span>
                          <strong>{loc.returned}</strong>
                        </div>
                      </div>

                      <div className="loc-row-personnel">
                        <span className="loc-personnel-label">Personnel:</span>
                        <span className="loc-personnel-names" title={loc.travelers.size > 0 ? Array.from(loc.travelers).join(', ') : 'None'}>
                          {loc.travelers.size > 0 ? Array.from(loc.travelers).join(', ') : 'None'}
                        </span>
                      </div>

                      <div className="loc-row-action">
                        {isSelected ? (
                          <span className="loc-selected-badge">✓ Active Filter</span>
                        ) : (
                          <span className="loc-filter-hint">Filter →</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Dedicated Overdue Business Travelers Section ─────── */}
      {(viewMode === 'overdue' || viewMode === 'both' || (viewMode === 'roster' && overdueTravelers.length > 0)) && (
        <section className="panel overdue-section" id="overdue-travelers-section" style={{ marginBottom: '22px' }}>
          <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="overdue-icon-badge">⚠️</span>
              <div>
                <h3 style={{ margin: 0, color: overdueTravelers.length > 0 ? '#b91c1c' : 'var(--ink)' }}>
                  Overdue Business Travelers ({overdueTravelers.length})
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  {overdueTravelers.length > 0
                    ? 'Urgent attention required: mobile staff holding equipment past scheduled return date.'
                    : 'All mobile staff equipment custody is on schedule. No overdue travelers.'}
                </span>
              </div>
            </div>
            {overdueTravelers.length > 0 && (
              <span className="urgent-count-pill">
                {overdueTravelers.length} Overdue Action{overdueTravelers.length === 1 ? '' : 's'} Required
              </span>
            )}
          </div>

          {overdueTravelers.length === 0 ? (
            <div className="overdue-empty-card">
              <span className="overdue-empty-check">✓</span>
              <div>
                <strong style={{ fontSize: '13px' }}>All Clear: No Overdue Business Travelers</strong>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                  All mobile employees currently in the field are within their authorized travel schedule dates.
                </p>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="loan-table simple-loan-table overdue-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>No</th>
                    <th style={{ minWidth: '150px' }}>Traveler</th>
                    <th style={{ minWidth: '130px' }}>Location</th>
                    <th style={{ minWidth: '150px' }}>Asset Number</th>
                    <th style={{ minWidth: '130px' }}>Due Date</th>
                    <th style={{ minWidth: '120px' }}>Overdue By</th>
                    <th style={{ minWidth: '110px' }}>Knox IP</th>
                    <th style={{ width: '170px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueTravelers.map((t, idx) => (
                    <tr key={`overdue-${t.id}`} className="overdue-row-highlight">
                      <td className="col-no">{idx + 1}</td>
                      <td>
                        <strong>{t.assignee}</strong>
                        {t.knoxId && (
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            ID: <code>{t.knoxId}</code>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="traveler-loc-chip">📍 {t.location}</span>
                      </td>
                      <td>
                        <strong>{t.assetCode}</strong>
                        {t.assetModel && (
                          <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>
                            ({t.assetModel})
                          </span>
                        )}
                      </td>
                      <td>
                        <strong style={{ color: '#b91c1c', fontSize: '12px' }}>
                          {readableLoanDate(getLoanEndDate(t))}
                        </strong>
                      </td>
                      <td>
                        <span className="status status-danger" style={{ fontWeight: 700, padding: '3px 8px' }}>
                          ⚠️ {t.remainingText || 'Overdue'}
                        </span>
                      </td>
                      <td>
                        {t.ip ? (
                          <code style={{ fontSize: '11px', color: 'var(--blue)' }}>{t.ip}</code>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="button secondary small-btn"
                          style={{ marginRight: '6px', background: '#0284c7', color: 'white', borderColor: '#0284c7' }}
                          onClick={() => setReturnConfirmTarget(t)}
                          title="Record equipment return to IT Department"
                        >
                          ↙ Return to IT
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setEditLoanId(t.id)}
                          title="Edit travel assignment"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {viewMode === 'followup' && <section className="panel">
        <div className="panel-heading"><h3>Overdue &amp; unreturned follow-up ({followUpTravelers.length})</h3>
          <button type="button" className="button" disabled={!knoxRecipientList(followUpTravelers)} onClick={async () => {
            try { await navigator.clipboard.writeText(knoxRecipientList(followUpTravelers)); toast('Knox ID list copied'); }
            catch { toast('Clipboard unavailable. Select and copy the recipient list below.'); }
          }}>Copy Knox IDs</button></div>
        <p>Copy the unique Knox IDs below for email follow-up. This includes overdue equipment and partial returns with items outstanding.</p>
        <textarea aria-label="Follow-up Knox IDs" readOnly value={knoxRecipientList(followUpTravelers)} rows={2} style={{ width: '100%' }} />
        <div className="table-wrap"><table className="loan-table"><thead><tr><th>Knox ID</th><th>Assignee</th><th>PC asset #</th><th>Location</th><th>Due date</th><th>Follow-up reason</th><th>Action</th></tr></thead>
        <tbody>{followUpTravelers.map((loan) => <tr key={loan.id}><td>{loan.knoxId || 'Missing Knox ID'}</td><td>{loan.assignee}</td><td>{loan.assetCode || '—'}</td><td>{loan.location}</td><td>{readableLoanDate(getLoanEndDate(loan)) || '—'}</td><td>{loan.followUpReason}</td><td><button type="button" className="text-button" onClick={() => setEditLoanId(loan.id)}>View / edit</button></td></tr>)}
        {!followUpTravelers.length && <tr><td colSpan={7}>No overdue or unreturned travelers.</td></tr>}</tbody></table></div>
      </section>}

      {/* ── Monthly Travel Schedule Calendar ────────────────── */}
      {(viewMode === 'calendar' || viewMode === 'both') && (
        <TravelerCalendar
          travelers={allTravelers}
          locations={locationsBreakdown.map((l) => l.location)}
          selectedLocation={selectedLocation}
          onSelectLocation={setSelectedLocation}
          onEditTraveler={(id) => setEditLoanId(id)}
          onReturnTraveler={(traveler) => setReturnConfirmTarget(traveler)}
          onRecordTraveler={() => setShowCreateModal(true)}
        />
      )}

      {/* ── Travelers Management Register (With Full Screen Mode) ─ */}
      {(viewMode === 'roster' || viewMode === 'both') && (
        <section className={`panel${isFullScreen ? ' roster-fullscreen' : ''}`}>
        <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ margin: 0 }}>Business Traveler Roster ({filteredTravelers.length})</h3>
            {isFullScreen && (
              <span className="fullscreen-indicator">
                <span className="status-indicator-dot" />
                Full Screen View • Press Esc to exit
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className={isFullScreen ? 'button' : 'button ghost'}
              style={{ fontSize: '12px', padding: '6px 12px' }}
              onClick={() => setIsFullScreen((prev) => !prev)}
              title={isFullScreen ? 'Exit full screen (or press Esc)' : 'Expand business travel roster to full screen full-body view'}
            >
              {isFullScreen ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: '6px', verticalAlign: '-1px' }}>
                    <path d="M5.5 0a.5.5 0 0 1 .5.5v4A1.5 1.5 0 0 1 4.5 6h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5zm5 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 10.5 4.5v-4a.5.5 0 0 1 .5-.5zM0 10.5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 6 11.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zm10.5 1a1.5 1.5 0 0 1 1.5-1.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4z"/>
                  </svg>
                  Exit Full Screen
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: '6px', verticalAlign: '-1px' }}>
                    <path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zm9.5 0a.5.5 0 0 1 0-1h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4zM0 10.5a.5.5 0 0 1 1 0v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4zm15 0a.5.5 0 0 1 1 0v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4z"/>
                  </svg>
                  Full Screen Roster
                </>
              )}
            </button>
            {isFullScreen && (
              <button
                type="button"
                className="button"
                style={{ fontSize: '12px', padding: '6px 12px' }}
                onClick={() => setShowCreateModal(true)}
              >
                + Record Traveler
              </button>
            )}
          </div>
        </div>

        {/* Filter controls & search */}
        <div className="search-row" style={{ marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div className="search" style={{ flex: '1 1 260px' }}>
            <span className="search-icon">🔍</span>
            <input
              type="search"
              placeholder="Search traveler name, Knox ID, location, laptop code, or IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="loan-tabs" style={{ margin: 0, padding: 0, border: 'none' }}>
            <button
              className={`loan-tab ${statusFilter === 'active' ? 'active' : ''}`}
              onClick={() => setStatusFilter('active')}
            >
              Active in Field
              <span className="loan-tab-count">{metrics.activeTotal}</span>
            </button>
            <button
              className={`loan-tab ${statusFilter === 'scheduled' ? 'active' : ''}`}
              onClick={() => setStatusFilter('scheduled')}
            >
              Scheduled
              <span className="loan-tab-count">{metrics.scheduled}</span>
            </button>
            <button
              className={`loan-tab ${statusFilter === 'overdue' ? 'active' : ''}`}
              onClick={() => setStatusFilter('overdue')}
            >
              Overdue
              <span className="loan-tab-count">{metrics.overdue}</span>
            </button>
            <button
              className={`loan-tab ${statusFilter === 'returned' ? 'active' : ''}`}
              onClick={() => setStatusFilter('returned')}
            >
              Returned
              <span className="loan-tab-count">{metrics.returned}</span>
            </button>
            <button
              className={`loan-tab ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All
              <span className="loan-tab-count">{metrics.totalAssignments}</span>
            </button>
          </div>
        </div>

        {/* Table grid */}
        <div className="table-wrap">
          <table className="loan-table simple-loan-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>No</th>
                <th style={{ minWidth: '150px' }}>Traveler</th>
                <th style={{ minWidth: '130px' }}>Current Location</th>
                <th style={{ minWidth: '110px' }}>Department</th>
                <th style={{ minWidth: '160px' }}>Asset Number</th>
                <th style={{ minWidth: '110px' }}>Knox IP</th>
                <th style={{ minWidth: '180px' }}>Travel Dates</th>
                <th style={{ minWidth: '100px' }}>Status</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTravelers.length === 0 ? (
                <tr>
                  <td colSpan="9">
                    <div className="empty" style={{ padding: '36px 12px' }}>
                      No business travelers match the selected location and status filter.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTravelers.map((t, idx) => (
                  <tr key={t.id}>
                    <td className="col-no">{idx + 1}</td>
                    <td>
                      <strong>{t.assignee}</strong>
                      {t.knoxId && (
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          ID: <code>{t.knoxId}</code>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="traveler-loc-chip">
                        📍 {t.location}
                      </span>
                    </td>
                    <td>{t.department || '—'}</td>
                    <td>
                      <div>
                        <strong>{t.assetCode}</strong>
                        {t.assetModel && (
                          <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>
                            ({t.assetModel})
                          </span>
                        )}
                        {t.accessoryCount > 0 && (
                          <span className="batch-chip" style={{ fontSize: '9px', marginTop: '2px' }}>
                            +{t.accessoryCount} accessories
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {t.ip ? (
                        <code style={{ fontSize: '11px', color: 'var(--blue)' }}>{t.ip}</code>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '12px' }}>
                        <div>{readableLoanDate(t.startDate || t.loanDate)} → {readableLoanDate(getLoanEndDate(t))}</div>
                        {t.remainingText && (
                          <span
                            className={`status ${t.isOverdue ? 'status-danger' : 'status-info'}`}
                            style={{ fontSize: '9px', padding: '1px 6px', marginTop: '3px' }}
                          >
                            {t.remainingText}
                          </span>
                        )}
                        {t.isReturned && (
                          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                            Returned on {readableLoanDate(t.returnDate || t.returnedDate)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`status ${
                          t.tripStatus === 'In Field'
                            ? 'status-warning'
                            : t.tripStatus === 'Overdue'
                            ? 'status-danger'
                            : t.tripStatus === 'Scheduled'
                            ? 'status-available'
                            : 'status-archived'
                        }`}
                      >
                        {t.tripStatus}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        className="text-button"
                        style={{ marginRight: '8px' }}
                        onClick={() => setEditLoanId(t.id)}
                        title="Edit travel assignment"
                      >
                        Edit
                      </button>
                      {!t.isReturned && (
                        <button
                          className="text-button"
                          style={{ color: 'var(--blue)', fontWeight: 600 }}
                          onClick={() => setReturnConfirmTarget(t)}
                          title="Record equipment return to IT Department"
                        >
                          Return
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* ── Modal: Create Business Traveler Assignment ───────── */}
      <Modal open={showCreateModal} size="wide" onClose={() => setShowCreateModal(false)}>
        <LoanForm
          defaultAssigneeType="Business traveler"
          onClose={() => setShowCreateModal(false)}
        />
      </Modal>

      {/* ── Modal: Edit Travel Assignment ─────────────────────── */}
      <Modal open={editLoanId !== null} size="wide" onClose={() => setEditLoanId(null)}>
        {editLoanId && (
          <EditLoanForm loanId={editLoanId} onClose={() => setEditLoanId(null)} />
        )}
      </Modal>

      {/* ── Modal: Return Confirmation ────────────────────────── */}
      <LoanReturnModal loan={returnConfirmTarget} onClose={() => setReturnConfirmTarget(null)} />
    </>
  );
}
