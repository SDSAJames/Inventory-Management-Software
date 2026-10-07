import { useState, useMemo, useEffect } from 'react';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { todayIso, readableLoanDate } from '../lib/utils';
import Modal from '../components/Modal';
import LoanForm from '../components/LoanForm';
import EditLoanForm from '../components/EditLoanForm';

export default function BusinessTravelersPage() {
  const { db, returnLoan } = useDb();
  const toast = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('active'); // 'all' | 'active' | 'scheduled' | 'overdue' | 'returned'
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editLoanId, setEditLoanId] = useState(null);
  const [returnConfirmTarget, setReturnConfirmTarget] = useState(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

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
  const allTravelers = useMemo(() => {
    // A loan is considered a business travel assignment if assigneeType is 'Business traveler'
    const travelLoans = (db.loans || []).filter(
      (l) => (l.assigneeType || 'Business traveler') === 'Business traveler'
    );

    return travelLoans.map((loan) => {
      const asset = (db.assets || []).find(
        (a) => String(a.code || '').toLowerCase() === String(loan.assetCode || '').toLowerCase()
      );
      const isReturned = Boolean(loan.returnDate || loan.returnedDate || loan.status === 'Returned' || loan.isArchived);
      const hasPickup = Boolean(loan.pickupDate || loan.status === 'Active');
      const dueDate = loan.endDate || loan.dueDate || '';
      const isOverdue = !isReturned && dueDate && dueDate < todayIso();

      let tripStatus = 'Scheduled';
      if (isReturned) {
        tripStatus = 'Returned';
      } else if (isOverdue) {
        tripStatus = 'Overdue';
      } else if (hasPickup) {
        tripStatus = 'In Field';
      }

      // Equipment accessory count
      const eq = loan.equipment || {};
      const accessoryCount = Object.values(eq).reduce((sum, val) => sum + (Number(val) || 0), 0);

      // Remaining days calculation
      let remainingText = '';
      if (!isReturned && dueDate) {
        const diffDays = Math.round(
          (new Date(dueDate) - new Date(todayIso())) / (1000 * 60 * 60 * 24)
        );
        if (diffDays < 0) {
          remainingText = `${Math.abs(diffDays)}d overdue`;
        } else if (diffDays === 0) {
          remainingText = 'Due today';
        } else {
          remainingText = `${diffDays}d left`;
        }
      }

      return {
        ...loan,
        location: loan.location || asset?.location || 'Unspecified',
        assetName: asset?.name || 'Laptop',
        assetModel: asset?.model || '',
        accessoryCount,
        tripStatus,
        isReturned,
        isOverdue,
        remainingText,
      };
    });
  }, [db.loans, db.assets]);

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
  const handleConfirmReturn = () => {
    if (!returnConfirmTarget) return;
    returnLoan(returnConfirmTarget.id, todayIso());
    toast(`Asset ${returnConfirmTarget.assetCode} returned to IT department`);
    setReturnConfirmTarget(null);
  };

  return (
    <>
      <div className="view-header">
        <div>
          <p className="view-subtitle">
            Manage mobile staff on field assignments, business trips, and remote sites. Track current equipment custody by location.
          </p>
        </div>
        <div className="view-header-actions">
          <button className="button" onClick={() => setShowCreateModal(true)}>
            + Record Business Traveler
          </button>
        </div>
      </div>

      {/* ── KPI Stat Cards ("How many they are") ─────────────── */}
      <section className="stat-grid" style={{ marginBottom: '22px' }}>
        <div className="stat-card">
          <div className="stat-label">Active in Field</div>
          <div className="stat-value" style={{ color: 'var(--blue)' }}>
            {metrics.activeTotal}
          </div>
          <div className="stat-hint">
            {metrics.inField} deployed • {metrics.overdue} overdue
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

        <div className="traveler-locations-grid">
          {locationsBreakdown.map((loc) => {
            const activeAtLoc = loc.inField + loc.overdue;
            const isSelected = selectedLocation === loc.location;
            return (
              <div
                key={loc.location}
                className={`traveler-location-card${isSelected ? ' selected' : ''}${activeAtLoc > 0 ? ' has-active' : ''}`}
                onClick={() => setSelectedLocation(isSelected ? 'ALL' : loc.location)}
              >
                <div className="loc-card-top">
                  <div className="loc-name-wrap">
                    <span className="loc-pin">📍</span>
                    <strong>{loc.location}</strong>
                  </div>
                  <span className={`loc-count-pill${activeAtLoc > 0 ? ' active' : ''}`}>
                    {activeAtLoc} Active
                  </span>
                </div>

                <div className="loc-card-body">
                  <div className="loc-stat-row">
                    <span>In field:</span>
                    <strong>{loc.inField}</strong>
                  </div>
                  {loc.overdue > 0 && (
                    <div className="loc-stat-row overdue">
                      <span>Overdue:</span>
                      <strong>{loc.overdue}</strong>
                    </div>
                  )}
                  {loc.scheduled > 0 && (
                    <div className="loc-stat-row">
                      <span>Scheduled:</span>
                      <strong>{loc.scheduled}</strong>
                    </div>
                  )}
                </div>

                {loc.travelers.size > 0 && (
                  <div className="loc-travelers-preview">
                    <span>Personnel:</span>
                    <p>{Array.from(loc.travelers).join(', ')}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Travelers Management Register (With Full Screen Mode) ─ */}
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
                <th style={{ minWidth: '160px' }}>Assigned Hardware</th>
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
                        {t.assetName && (
                          <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>
                            {t.assetName} {t.assetModel ? `(${t.assetModel})` : ''}
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
                        <div>{readableLoanDate(t.startDate || t.loanDate)} → {readableLoanDate(t.endDate || t.dueDate)}</div>
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
                          title="Record equipment return to IT department"
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

      {/* ── Modal: Create Business Traveler Assignment ───────── */}
      <Modal open={showCreateModal} size="wide" onClose={() => setShowCreateModal(false)}>
        <LoanForm onClose={() => setShowCreateModal(false)} />
      </Modal>

      {/* ── Modal: Edit Travel Assignment ─────────────────────── */}
      <Modal open={editLoanId !== null} size="wide" onClose={() => setEditLoanId(null)}>
        {editLoanId && (
          <EditLoanForm loanId={editLoanId} onClose={() => setEditLoanId(null)} />
        )}
      </Modal>

      {/* ── Modal: Return Confirmation ────────────────────────── */}
      <Modal open={returnConfirmTarget !== null} onClose={() => setReturnConfirmTarget(null)}>
        {returnConfirmTarget && (
          <div>
            <h2>Process Return to IT Department</h2>
            <p className="modal-intro">
              Confirm return of equipment from business traveler <strong>{returnConfirmTarget.assignee}</strong>.
            </p>

            <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid var(--line)', marginBottom: '16px', fontSize: '12px' }}>
              <dl style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '6px 12px', margin: 0 }}>
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Traveler:</dt>
                <dd style={{ margin: 0, fontWeight: 600 }}>{returnConfirmTarget.assignee}</dd>
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Hardware:</dt>
                <dd style={{ margin: 0 }}>{returnConfirmTarget.assetCode} ({returnConfirmTarget.assetName})</dd>
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Rental Location:</dt>
                <dd style={{ margin: 0 }}>📍 {returnConfirmTarget.location}</dd>
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Due Date:</dt>
                <dd style={{ margin: 0 }}>{readableLoanDate(returnConfirmTarget.endDate || returnConfirmTarget.dueDate)}</dd>
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Next Status:</dt>
                <dd style={{ margin: 0, color: '#10b981', fontWeight: 700 }}>Available (Held by IT department)</dd>
              </dl>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setReturnConfirmTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                onClick={handleConfirmReturn}
              >
                Confirm Return to IT
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
