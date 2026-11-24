import CalendarPickedUpSection from './CalendarPickedUpSection';
import CalendarPickupReadiness from './CalendarPickupReadiness';
import { enrichCustodyRecords } from '../lib/custodyRecords';
import CalendarNavigation from './CalendarNavigation';
import CalendarWeekdays from './CalendarWeekdays';
import { indexInOutSchedule, scheduleForDay, filterCalendarRecords } from '../lib/inOutSchedule.js';
import CalendarVisibilityFilters from './CalendarVisibilityFilters';
import { useCalendarVisibility } from '../hooks/useCalendarVisibility.js';
import { canRecordReturn } from "../../shared/loanRules.js";
import { useState, useMemo } from 'react';
import { todayIso, readableLoanDate } from "../lib/utils";
import { getLoanEndDate } from "../lib/loanEquipment";
import Modal from './Modal';
import { calendarMonthPrefix, formatCalendarDayTitle as formatDayTitle } from '../lib/calendarDates.js';
import { useCalendarMonth } from '../hooks/useCalendarMonth.js';

const getCalendarEquipmentEntries = (loan) => {
  const assetCode = String(loan.assetCode || '').trim();
  const assetModel = String(loan.assetModel || '').trim();
  const normalizedAssetCode = assetCode.toLowerCase();
  const assetLabel = [assetCode, assetModel].filter(Boolean).join(' — ');
  const equipmentEntries = Object.entries(loan.equipment || {}).filter(([key, value]) => {
    if (!value || ['requestedpc', 'requestedmonitor', 'pickupmethod'].includes(String(key).trim().toLowerCase())) return false;
    const normalizedValue = String(value).trim().toLowerCase();
    const repeatsAsset = normalizedAssetCode && (
      normalizedValue === normalizedAssetCode ||
      normalizedValue.startsWith(`${normalizedAssetCode} `) ||
      normalizedValue.startsWith(`${normalizedAssetCode}(`)
    );
    return !repeatsAsset;
  });
  return [
    ...(assetLabel ? [['Asset', assetLabel]] : []),
    ...equipmentEntries,
  ];
};

export default function InOutCalendar({
  loans = [],
  assets = [],
  locations = [],
  onEditLoan,
  onReturnLoan,
  onRecordLoan,
  onPickupLoan,
  editingLoanId = null,
  initialRequesterType = 'ALL',
  initialRequester = 'ALL',
}) {
  const today = todayIso();
  const {
    currentYear, currentMonth, calendarDays, setCurrentYear, setCurrentMonth,
    handlePrevMonth, handleNextMonth, handleGoToday,
  } = useCalendarMonth();

  // Filter state
  const [requesterTypeFilter, setRequesterTypeFilter] = useState(initialRequesterType); // 'ALL' | 'Business traveler' | 'Employee' | 'Contractor'
  const [selectedRequester, setSelectedRequester] = useState(initialRequester); // 'ALL' | specific name
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [searchFilter, setSearchFilter] = useState('');
  const {
    hideReturned, setHideReturned, hidePickedUp, setHidePickedUp,
    eventTypeFilter, setEventTypeFilter, dayModalFilter, setDayModalFilter,
  } = useCalendarVisibility('in-out-calendar-visibility-v1');

  // Day detail modal state
  const [selectedDay, setSelectedDayData] = useState(null);

  /* ── 2. Enrich loans with asset details & normalization ──────── */
  const enrichedLoans = useMemo(() => enrichCustodyRecords(loans, assets), [loans, assets]);

  /* ── 3. Extract unique requesters for dropdown ──────────────── */
  const uniqueRequesters = useMemo(() => {
    const map = new Map();
    enrichedLoans.forEach((l) => {
      const name = l.assignee.trim();
      if (!name) return;
      if (!map.has(name)) {
        map.set(name, {
          name,
          knoxId: l.knoxId || '',
          department: l.department || '',
          userType: l.userType,
          userTypeLabel: l.userTypeLabel,
          count: 0,
        });
      }
      map.get(name).count += 1;
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [enrichedLoans]);

  // Distinct counts for filter badges
  const requesterCounts = useMemo(() => {
    let travelerCount = 0;
    let employeeCount = 0;
    let contractorCount = 0;
    enrichedLoans.forEach((l) => {
      if (l.isTraveler) travelerCount += 1;
      else if (l.userType === 'Contractor') contractorCount += 1;
      else employeeCount += 1;
    });
    return {
      all: enrichedLoans.length,
      travelers: travelerCount,
      employees: employeeCount,
      contractors: contractorCount,
    };
  }, [enrichedLoans]);

  /* ── 4. Unified Filtering Function ─────────────────────────── */
  const matchesFilters = (loan) => {
    // Requester Type filter
    if (requesterTypeFilter !== 'ALL') {
      if (loan.userType !== requesterTypeFilter) return false;
    }

    // Specific Requester individual filter
    if (selectedRequester !== 'ALL') {
      if (loan.assignee.toLowerCase() !== selectedRequester.toLowerCase()) return false;
    }

    // Location filter
    if (selectedLocation !== 'ALL') {
      if (loan.location !== selectedLocation) return false;
    }

    // Search query filter
    const query = searchFilter.toLowerCase().trim();
    if (query) {
      const match =
        String(loan.assignee || '').toLowerCase().includes(query) ||
        String(loan.knoxId || '').toLowerCase().includes(query) ||
        String(loan.assetCode || '').toLowerCase().includes(query) ||
        String(loan.location || '').toLowerCase().includes(query) ||
        String(loan.department || '').toLowerCase().includes(query) ||
        String(loan.userTypeLabel || '').toLowerCase().includes(query);
      if (!match) return false;
    }

    return true;
  };

  /* ── 5. Index Outgoing & Incoming events by Date ────────────── */
  const scheduleIndex = useMemo(() => indexInOutSchedule(filterCalendarRecords(enrichedLoans, hideReturned), { hidePickedUp }), [enrichedLoans, hideReturned, hidePickedUp]);
  const { outgoingByDate, incomingByDate, pickedUpByDate } = scheduleIndex;
  const selectedDayData = selectedDay ? scheduleForDay(scheduleIndex, selectedDay.dateStr, matchesFilters) : null;
  const dayModalEditItems = selectedDayData && onEditLoan ? [
    ...(dayModalFilter === 'all' || dayModalFilter === 'outgoing' ? selectedDayData.outgoing : []),
    ...(dayModalFilter === 'all' || dayModalFilter === 'incoming' ? selectedDayData.incoming : []),
    ...(!hidePickedUp && (dayModalFilter === 'all' || dayModalFilter === 'pickedup') ? selectedDayData.pickedUp : []),
  ] : [];


  /* ── 7. Monthly Summary Metrics ─────────────────────────────── */
  const monthStats = useMemo(() => {
    const prefix = calendarMonthPrefix(currentYear, currentMonth);
    let outgoingCount = 0;
    let incomingCount = 0;
    let overdueCount = 0;
    let completedReturns = 0;
    let travelerEvents = 0;
    let employeeEvents = 0;
    let contractorEvents = 0;

    outgoingByDate.forEach((list, dateStr) => {
      if (dateStr.startsWith(prefix)) {
        const filtered = list.filter(matchesFilters);
        outgoingCount += filtered.length;
        filtered.forEach((l) => {
          if (l.isTraveler) travelerEvents += 1;
          else if (l.userType === 'Contractor') contractorEvents += 1; else employeeEvents += 1;
        });
      }
    });

    let pickedUpCount = 0;
    pickedUpByDate.forEach((list, dateStr) => {
      if (dateStr.startsWith(prefix)) {
        const filtered = list.filter(matchesFilters);
        pickedUpCount += filtered.length;
        filtered.forEach((loan) => { if (loan.isTraveler) travelerEvents += 1; else if (loan.userType === 'Contractor') contractorEvents += 1; else employeeEvents += 1; });
      }
    });

    incomingByDate.forEach((list, dateStr) => {
      if (dateStr.startsWith(prefix)) {
        const filtered = list.filter(matchesFilters);
        incomingCount += filtered.length;
        filtered.forEach((l) => {
          if (l.isOverdue) overdueCount += 1;
          if (l.isReturned) completedReturns += 1;
          if (l.isTraveler) travelerEvents += 1;
          else if (l.userType === 'Contractor') contractorEvents += 1; else employeeEvents += 1;
        });
      }
    });

    return {
      outgoingCount,
      incomingCount,
      overdueCount,
      completedReturns,
      travelerEvents,
      employeeEvents,
      contractorEvents,
      total: outgoingCount + incomingCount + pickedUpCount,
      pickedUpCount,
    };
  }, [currentYear, currentMonth, outgoingByDate, incomingByDate, pickedUpByDate, requesterTypeFilter, selectedRequester, selectedLocation, searchFilter]);

  /* ── 8. Open Day Detail Modal ───────────────────────────────── */
  const handleOpenDay = (dateStr) => {
    setSelectedDayData({ dateStr });
    setDayModalFilter('all');
  };

  return (
    <div className="traveler-calendar-card in-out-calendar-root">
      {/* ── Calendar Toolbar Header ─────────────────────────── */}
      <div className="calendar-toolbar">
        {/* Navigation & Month Jump */}
        <CalendarNavigation currentYear={currentYear} currentMonth={currentMonth} setCurrentYear={setCurrentYear} setCurrentMonth={setCurrentMonth} handlePrevMonth={handlePrevMonth} handleNextMonth={handleNextMonth} handleGoToday={handleGoToday} idPrefix="in-out-calendar-" />

        {/* Action button */}
        {onRecordLoan && (
          <div className="calendar-header-actions">
            <button
              type="button"
              className="button small-btn"
              onClick={onRecordLoan}
              title="Record new equipment checkout schedule"
              id="record-in-out-schedule-btn"
            >
              + Record In/Out Schedule
            </button>
          </div>
        )}
      </div>

      {/* ── Filters Bar (Requester Type, Individual User, Event Flow, Location, Search) ── */}
      <div className="calendar-filters-bar">
        <CalendarVisibilityFilters hideReturned={hideReturned} setHideReturned={setHideReturned} hidePickedUp={hidePickedUp} setHidePickedUp={setHidePickedUp} />
          {!hidePickedUp && <button type="button" className={`cal-filter-pill ${eventTypeFilter === 'pickedup' ? 'active' : ''}`} onClick={() => setEventTypeFilter(eventTypeFilter === 'pickedup' ? 'all' : 'pickedup')}>Picked up ({monthStats.pickedUpCount})</button>}
        {/* Primary Filter: Requester Type Buttons */}
        <div className="filter-block">
          <label className="filter-block-label">Requester Type:</label>
          <div className="calendar-type-pills">
            <button
              type="button"
              className={`cal-filter-pill ${requesterTypeFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => {
                setRequesterTypeFilter('ALL');
                setSelectedRequester('ALL');
              }}
              title="Display requests from all personnel (employees, business travelers and contractors)"
            >
              All User Types ({requesterCounts.all})
            </button>
            <button
              type="button"
              className={`cal-filter-pill traveler-pill ${requesterTypeFilter === 'Business traveler' ? 'active' : ''}`}
              onClick={() => {
                setRequesterTypeFilter('Business traveler');
                setSelectedRequester('ALL');
              }}
              title="Filter to only mobile Business Travelers"
            >
              <span className="pill-dot traveler-dot" />
              💼 Business Travelers ({requesterCounts.travelers})
            </button>
            <button
              type="button"
              className={`cal-filter-pill employee-pill ${requesterTypeFilter === 'Employee' ? 'active' : ''}`}
              onClick={() => {
                setRequesterTypeFilter('Employee');
                setSelectedRequester('ALL');
              }}
              title="Filter to only standard SPE Employees"
            >
              <span className="pill-dot employee-dot" />
              🏢 SPE Employees ({requesterCounts.employees})
            </button>
            <button type="button" className={`cal-filter-pill ${requesterTypeFilter === 'Contractor' ? 'active' : ''}`}
              onClick={() => { setRequesterTypeFilter('Contractor'); setSelectedRequester('ALL'); }}>Contractors ({requesterCounts.contractors})</button>
          </div>
        </div>

        {/* Secondary Filter: Specific Individual Requester */}
        <div className="filter-block">
          <label htmlFor="requester-dropdown-select" className="filter-block-label">
            Specific Requester:
          </label>
          <select
            id="requester-dropdown-select"
            className="calendar-select requester-select"
            value={selectedRequester}
            onChange={(e) => setSelectedRequester(e.target.value)}
            aria-label="Filter by specific individual requester"
          >
            <option value="ALL">👤 All Individuals ({uniqueRequesters.length} staff)</option>
            {uniqueRequesters
              .filter((r) => requesterTypeFilter === 'ALL' || r.userType === requesterTypeFilter)
              .map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name} ({r.userTypeLabel} • {r.count} request{r.count === 1 ? '' : 's'})
                </option>
              ))}
          </select>
        </div>

        {/* Flow Direction Filter (All, Out/Checkout, In/Return) */}
        <div className="filter-block">
          <label className="filter-block-label">Schedule Event:</label>
          <div className="calendar-type-pills">
            <button
              type="button"
              className={`cal-filter-pill ${eventTypeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setEventTypeFilter('all')}
              title="Show both Outgoing and Incoming schedules"
            >
              All In & Out ({monthStats.total})
            </button>
            <button
              type="button"
              className={`cal-filter-pill incoming-pill ${eventTypeFilter === 'outgoing' ? 'active' : ''}`}
              onClick={() => setEventTypeFilter('outgoing')}
              title="Show equipment Checkouts and Departures"
            >
              <span className="pill-dot incoming-dot" />
              📥 Out / Checkout ({monthStats.outgoingCount})
            </button>
            <button
              type="button"
              className={`cal-filter-pill returning-pill ${eventTypeFilter === 'incoming' ? 'active' : ''}`}
              onClick={() => setEventTypeFilter('incoming')}
              title="Show equipment Returns and Check-ins"
            >
              <span className="pill-dot returning-dot" />
              📤 In / Return ({monthStats.incomingCount})
            </button>
          </div>
        </div>

        {/* Location Dropdown Filter */}
        {locations.length > 0 && (
          <div className="filter-block">
            <label htmlFor="location-dropdown-select" className="filter-block-label">
              Location:
            </label>
            <select
              id="location-dropdown-select"
              aria-label="Filter by destination location"
              className="calendar-select location-select"
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
            >
              <option value="ALL">📍 All Locations</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  📍 {loc}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Real-time search box */}
        <div className="filter-block search-block">
          <label className="filter-block-label">Keyword Search:</label>
          <div className="calendar-search-wrap">
            <span className="cal-search-icon">🔍</span>
            <input
              type="search"
              aria-label="Filter calendar events by requester, knox id, or laptop"
              className="calendar-search-input"
              placeholder="Filter requester, knox ID, laptop..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Active Filters Notification Pill ────────────────── */}
      {(requesterTypeFilter !== 'ALL' || selectedRequester !== 'ALL' || selectedLocation !== 'ALL' || searchFilter || eventTypeFilter !== 'all') && (
        <div className="calendar-active-filters-bar">
          <span className="active-filters-title">Active Filter:</span>
          {requesterTypeFilter !== 'ALL' && (
            <span className="filter-tag">
              Type: {requesterTypeFilter}
              <button type="button" onClick={() => setRequesterTypeFilter('ALL')}>×</button>
            </span>
          )}
          {selectedRequester !== 'ALL' && (
            <span className="filter-tag">
              Requester: 👤 {selectedRequester}
              <button type="button" onClick={() => setSelectedRequester('ALL')}>×</button>
            </span>
          )}
          {eventTypeFilter !== 'all' && (
            <span className="filter-tag">
              Flow: {eventTypeFilter === 'pickedup' ? 'Picked up' : eventTypeFilter === 'outgoing' ? '📥 Out / Checkout' : '📤 In / Return'}
              <button type="button" onClick={() => setEventTypeFilter('all')}>×</button>
            </span>
          )}
          {selectedLocation !== 'ALL' && (
            <span className="filter-tag">
              Location: 📍 {selectedLocation}
              <button type="button" onClick={() => setSelectedLocation('ALL')}>×</button>
            </span>
          )}
          {searchFilter && (
            <span className="filter-tag">
              Query: &ldquo;{searchFilter}&rdquo;
              <button type="button" onClick={() => setSearchFilter('')}>×</button>
            </span>
          )}
          <button
            type="button"
            className="clear-all-filters-btn"
            onClick={() => {
              setRequesterTypeFilter('ALL');
              setSelectedRequester('ALL');
              setEventTypeFilter('all');
              setSelectedLocation('ALL');
              setSearchFilter('');
            }}
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* ── Month Overview Summary Bar ──────────────────────── */}
      <div className="calendar-stats-bar in-out-stats-bar">
        <div className="cal-stat-item">
          <span className="cal-stat-label">Month Total:</span>
          <strong className="cal-stat-val">{monthStats.total} schedule events</strong>
        </div>
        <div className="cal-stat-item incoming">
          <span className="cal-stat-badge incoming-badge">📥 Out / Checkout</span>
          <strong className="cal-stat-val">{monthStats.outgoingCount} scheduled / departures</strong>
        </div>
        <div className="cal-stat-item returning">
          <span className="cal-stat-badge returning-badge">📤 In / Return</span>
          <strong className="cal-stat-val">{monthStats.incomingCount} scheduled / returns</strong>
        </div>
        {monthStats.overdueCount > 0 && (
          <div className="cal-stat-item overdue">
            <span className="cal-stat-badge overdue-badge">⚠️ Overdue</span>
            <strong className="cal-stat-val">{monthStats.overdueCount} delayed returns</strong>
          </div>
        )}
        <div className="cal-stat-item requester-mix">
          <span className="cal-stat-label">Requester Mix:</span>
          <span className="requester-mix-pill traveler-mix">
            💼 {monthStats.travelerEvents} Business Traveler
          </span>
          <span className="requester-mix-pill employee-mix">
            🏢 {monthStats.employeeEvents} SPE Employee / {monthStats.contractorEvents} Contractor
          </span>
        </div>
      </div>

      {/* ── Calendar Grid ───────────────────────────────────── */}
      <div className="calendar-grid-wrapper">
        {/* Weekday Headers */}
        <CalendarWeekdays />

        {/* 42-day Month Days Grid */}
        <div className="calendar-days-grid">
          {calendarDays.map((cell) => {
            const isToday = cell.dateStr === today;
            const pickedUpList = (pickedUpByDate.get(cell.dateStr) || []).filter(matchesFilters);
            const showPickedUp = eventTypeFilter === 'all' || eventTypeFilter === 'pickedup';
            const outgoingList = (outgoingByDate.get(cell.dateStr) || []).filter(matchesFilters);
            const incomingList = (incomingByDate.get(cell.dateStr) || []).filter(matchesFilters);

            const showOutgoing = eventTypeFilter === 'all' || eventTypeFilter === 'outgoing';
            const showIncoming = eventTypeFilter === 'all' || eventTypeFilter === 'incoming';

            const totalEvents = (showPickedUp ? pickedUpList.length : 0) +
              (showOutgoing ? outgoingList.length : 0) +
              (showIncoming ? incomingList.length : 0);

            const hasOverdue = incomingList.some((t) => t.isOverdue);

            return (
              <div
                key={cell.dateStr}
                className={`calendar-day-cell ${
                  cell.isCurrentMonth ? 'current-month' : 'other-month'
                } ${isToday ? 'is-today' : ''} ${hasOverdue ? 'has-overdue' : ''} ${
                  totalEvents > 0 ? 'has-events' : ''
                }`}
                onClick={() => handleOpenDay(cell.dateStr)}
                title={`Click to view schedule for ${cell.dateStr}`}
              >
                {/* Cell Header: Day Number + Count Badges */}
                <div className="cal-day-header">
                  <span className={`cal-day-number ${isToday ? 'today-pill' : ''}`}>
                    {cell.dayNum}
                  </span>

                  {totalEvents > 0 && (
                    <div className="cal-day-indicators">
                      {showOutgoing && outgoingList.length > 0 && (
                        <span
                          className="cal-count-indicator incoming"
                          title={`${outgoingList.length} checkouts / departing`}
                        >
                          ↓{outgoingList.length}
                        </span>
                      )}
                      {showIncoming && incomingList.length > 0 && (
                        <span
                          className={`cal-count-indicator returning ${hasOverdue ? 'alert' : ''}`}
                          title={`${incomingList.length} returns / arrivals`}
                        >
                          ↑{incomingList.length}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Event Chips Container */}
                <div className="cal-chips-container">
                  {showPickedUp && pickedUpList.slice(0, 2).map((loan) => <div key={`pickedup-${loan.id}`} className="cal-chip returned-chip" title={`Picked up: ${loan.knoxId || loan.assignee} · ${loan.assetCode || 'No PC'}`}><span className="chip-icon">✓</span><span className="chip-name">Picked up · {loan.knoxId || loan.assignee}</span></div>)}
                  {/* Outgoing (Checkouts / Departures) */}
                  {showOutgoing &&
                    outgoingList.slice(0, 2).map((l) => (
                      <div
                        key={`out-${l.id}`}
                        className="cal-chip incoming-chip in-out-chip"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDay(cell.dateStr);
                        }}
                        title={`Out: ${l.assignee} (${l.userTypeLabel}) • Asset: ${l.assetCode} (${l.location})`}
                      >
                        <span className="chip-icon">📥</span>
                        <span className={`chip-user-badge ${l.isTraveler ? 'traveler' : 'employee'}`}>
                          {l.userType === 'Contractor' ? 'CTR' : l.isTraveler ? 'TRV' : 'SPE'}
                        </span>
                        <span className="chip-name">{l.assignee}</span>
                        {l.assetCode && <span className="chip-loc">• {l.assetCode}</span>}
                      </div>
                    ))}

                  {/* Incoming (Returns / Due back) */}
                  {showIncoming &&
                    incomingList.slice(0, 2).map((l) => {
                      const chipClass = l.isReturned
                        ? 'returned-chip'
                        : l.isOverdue
                        ? 'overdue-chip'
                        : 'returning-chip';
                      const chipIcon = l.isReturned ? '✓' : l.isOverdue ? '⚠️' : '📤';
                      return (
                        <div
                          key={`in-${l.id}`}
                          className={`cal-chip ${chipClass} in-out-chip`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDay(cell.dateStr);
                          }}
                          title={`In: ${l.assignee} (${l.userTypeLabel}) • ${
                            l.isReturned ? 'Returned' : l.isOverdue ? 'Overdue' : 'Due'
                          } (${l.assetCode})`}
                        >
                          <span className="chip-icon">{chipIcon}</span>
                          <span className={`chip-user-badge ${l.isTraveler ? 'traveler' : 'employee'}`}>
                            {l.userType === 'Contractor' ? 'CTR' : l.isTraveler ? 'TRV' : 'SPE'}
                          </span>
                          <span className="chip-name">{l.assignee}</span>
                          {l.isOverdue && <span className="chip-loc">• Overdue</span>}
                        </div>
                      );
                    })}

                  {/* Overflow count indicator */}
                  {totalEvents > 4 && (
                    <div
                      className="cal-more-chip"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDay(cell.dateStr);
                      }}
                      title="Click to view all events for this date"
                    >
                      +{totalEvents - 4} more requests...
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Day Detail Modal Dialog ─────────────────────────── */}
      {selectedDayData && (
        <Modal
          open={Boolean(selectedDayData) && !editingLoanId}
          size="wide"
          className="in-out-day-modal"
          onClose={() => setSelectedDayData(null)}
        >
          <div className="day-modal-header">
            <div>
              <span className="day-modal-eyebrow">EQUIPMENT IN & OUT SCHEDULE</span>
              <h2 className="day-modal-title">{formatDayTitle(selectedDayData.dateStr)}</h2>
              <span className="day-modal-subtitle">
                {(selectedDayData.outgoing?.length || 0) + (selectedDayData.incoming?.length || 0) + selectedDayData.pickedUp.length} schedule requests recorded for this date
              </span>
            </div>

            {/* Quick Filter tabs inside modal */}
            <div className="calendar-type-pills day-modal-pills">
              {!hidePickedUp && <button type="button" className={`loan-tab ${dayModalFilter === 'pickedup' ? 'active' : ''}`} onClick={() => setDayModalFilter('pickedup')}>Picked up ({selectedDayData.pickedUp.length})</button>}
              <button
                type="button"
                className={`cal-filter-pill ${dayModalFilter === 'all' ? 'active' : ''}`}
                onClick={() => setDayModalFilter('all')}
              >
                All ({selectedDayData.outgoing.length + selectedDayData.incoming.length + selectedDayData.pickedUp.length})
              </button>
              <button
                type="button"
                className={`cal-filter-pill incoming-pill ${dayModalFilter === 'outgoing' ? 'active' : ''}`}
                onClick={() => setDayModalFilter('outgoing')}
              >
                📥 Out / Checkout ({selectedDayData.outgoing.length})
              </button>
              <button
                type="button"
                className={`cal-filter-pill returning-pill ${dayModalFilter === 'incoming' ? 'active' : ''}`}
                onClick={() => setDayModalFilter('incoming')}
              >
                📤 In / Return ({selectedDayData.incoming.length})
              </button>
            </div>
          </div>

          <div className="day-modal-toolbar">
            <CalendarVisibilityFilters hideReturned={hideReturned} setHideReturned={setHideReturned} hidePickedUp={hidePickedUp} setHidePickedUp={setHidePickedUp} />
            <div className="day-modal-toolbar-actions">
              {dayModalEditItems.map((loan, index) => {
                const person = loan.assignee && loan.assignee !== 'Unknown Staff' ? loan.assignee : loan.knoxId || `Schedule ${index + 1}`;
                return (
                  <button
                    key={`day-edit-${loan.id}`}
                    type="button"
                    className="button small-btn ghost calendar-edit-action"
                    title={`Edit schedule for ${person}${loan.knoxId ? ` (${loan.knoxId})` : ''}`}
                    aria-label={`Edit schedule for ${person}${loan.knoxId ? ` (${loan.knoxId})` : ''}`}
                    onClick={() => onEditLoan(loan.id)}
                  >
                    ✎ Edit {person}
                  </button>
                );
              })}
              {onRecordLoan && <button type="button" className="button small-btn" onClick={() => { const date = selectedDayData.dateStr; setSelectedDayData(null); onRecordLoan(date); }}>+ Add Schedule</button>}
            </div>
          </div>

          <div className="day-modal-content-stream">
            {!hidePickedUp && selectedDayData.pickedUp.length > 0 && (dayModalFilter === 'all' || dayModalFilter === 'pickedup') && <CalendarPickedUpSection records={selectedDayData.pickedUp} />}
            {/* 1. Outgoing Section (Checkouts & Departures) */}
            {selectedDayData.outgoing.length > 0 && (dayModalFilter === 'all' || dayModalFilter === 'outgoing') && (
              <div className="day-modal-section">
                <div className="day-modal-section-title incoming-title">
                  <span>📥 Outgoing: Checkouts & Departures ({selectedDayData.outgoing.length})</span>
                </div>

                <div className="day-modal-cards-grid">
                    <div className="day-modal-table-head outgoing-table-head"><span>Name</span><span>Knox ID</span><span>Borrower</span><span>Department</span><span>Status</span><span>Location</span><span>Expected return</span><span>Equipment</span><span>Actions</span></div>
                    {selectedDayData.outgoing.map((loan) => (
                      <div key={`out-card-${loan.id}`} className="day-detail-card outgoing-card is-editable-row" onClick={(event) => { if (!event.target.closest('button') && onEditLoan) onEditLoan(loan.id); }} onKeyDown={(event) => { if (!event.target.closest('button') && onEditLoan && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onEditLoan(loan.id); } }} tabIndex={onEditLoan ? 0 : undefined} role={onEditLoan ? 'group' : undefined} aria-label={onEditLoan ? `Edit schedule for ${loan.assignee || loan.knoxId}` : undefined}>
                        <div className="day-card-header">
                          <strong className="day-row-name">{loan.assignee || 'Unknown Staff'}</strong>
                          <code className="day-row-knox">{loan.knoxId || 'N/A'}</code>
                          <span className="day-row-borrower">{loan.userTypeLabel}</span>
                          <span className="day-row-department">{loan.department || 'Operations'}</span>
                          <div className="day-row-state">
                          <span className={`status ${
                            loan.computedStatus === 'In Field'
                              ? 'status-warning'
                              : loan.computedStatus === 'Overdue'
                              ? 'status-danger'
                              : 'status-archived'
                          }`}>
                            {loan.computedStatus || 'Scheduled'}
                          </span>
                          <CalendarPickupReadiness loan={loan} />
                          </div>
                        </div>
                        <div className="day-card-body">
                          <div className="day-card-info-item">
                            <span className="info-lbl">Rental Location:</span>
                            <span className="info-val">📍 {loan.location}</span>
                          </div>
                          <div className="day-card-info-item">
                            <span className="info-lbl">Expected Return:</span>
                            <span className="info-val">{readableLoanDate(getLoanEndDate(loan)) || 'Indefinite'}</span>
                          </div>

                          {getCalendarEquipmentEntries(loan).length > 0 && (
                            <div className="day-card-accessories">
                              <span className="info-lbl">Accessories:</span>
                              <div className="accessory-tags-wrap">
                                {getCalendarEquipmentEntries(loan).map(([key, val]) => (
                                    <span key={key} className="acc-tag">
                                      {key}: {val}
                                    </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="day-card-footer">
                          {!loan.hasPickup && onPickupLoan && (
                            <button
                              type="button"
                              className="button small-btn ghost"
                              onClick={() => {
                                onPickupLoan(loan.id, todayIso());
                                setSelectedDayData(null);
                              }}
                            >
                              Confirm Pickup
                            </button>
                          )}
                          {!loan.isReturned && canRecordReturn(loan) && onReturnLoan && (
                            <button
                              type="button"
                              className="button small-btn"
                              onClick={() => {
                                setSelectedDayData(null);
                                onReturnLoan(loan);
                              }}
                            >
                              Return Asset
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* 2. Incoming Section (Returns & Check-ins) */}
            {selectedDayData.incoming.length > 0 && (dayModalFilter === 'all' || dayModalFilter === 'incoming') && (
              <div className="day-modal-section" style={{ marginTop: '20px' }}>
                <div className="day-modal-section-title returning-title">
                  <span>📤 Incoming: Returns & Check-ins ({selectedDayData.incoming.length})</span>
                </div>

                <div className="day-modal-cards-grid">
                    <div className="day-modal-table-head incoming-table-head"><span>Name</span><span>Knox ID</span><span>Borrower</span><span>Department</span><span>Location</span><span>Due date</span><span>Equipment</span><span>Actions</span></div>
                    {selectedDayData.incoming.map((loan) => (
                      <div
                        key={`in-card-${loan.id}`}
                        className={`day-detail-card incoming-card is-editable-row ${
                          loan.isOverdue ? 'overdue-card' : loan.isReturned ? 'returned-card' : ''
                        }`}
                        onClick={(event) => { if (!event.target.closest('button') && onEditLoan) onEditLoan(loan.id); }}
                        onKeyDown={(event) => { if (!event.target.closest('button') && onEditLoan && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onEditLoan(loan.id); } }}
                        tabIndex={onEditLoan ? 0 : undefined}
                        role={onEditLoan ? 'group' : undefined}
                        aria-label={onEditLoan ? `Edit schedule for ${loan.assignee || loan.knoxId}` : undefined}
                      >
                        <div className="day-card-header">
                          <strong className="day-row-name">{loan.assignee || 'Unknown Staff'}</strong>
                          <code className="day-row-knox">{loan.knoxId || 'N/A'}</code>
                          <span className="day-row-borrower">{loan.userTypeLabel}</span>
                          <span className="day-row-department">{loan.department || 'Operations'}</span>
                        </div>

                        <div className="day-card-body">
                          <div className="day-card-info-item">
                            <span className="info-lbl">Rental Location:</span>
                            <span className="info-val">📍 {loan.location}</span>
                          </div>
                          <div className="day-card-info-item">
                            <span className="info-lbl">Scheduled Due Date:</span>
                            <span className="info-val calendar-due-value">
                              <span>{readableLoanDate(getLoanEndDate(loan))}</span>
                              {loan.isOverdue && <span className="status status-danger">Overdue</span>}
                              {loan.isReturned && <span className="status status-archived">Returned</span>}
                            </span>
                            {loan.isReturned && (
                              <span className="info-val" style={{ color: '#059669', fontWeight: 600 }}>
                                ✓ {readableLoanDate(loan.returnDate || loan.returnedDate)}
                              </span>
                            )}
                          </div>
                          {getCalendarEquipmentEntries(loan).length > 0 && (
                            <div className="day-card-accessories">
                              <span className="info-lbl">Accessories:</span>
                              <div className="accessory-tags-wrap">
                                {getCalendarEquipmentEntries(loan).map(([key, val]) => (
                                    <span key={key} className="acc-tag">
                                      {key}: {val}
                                    </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="day-card-footer">
                          {!loan.isReturned && canRecordReturn(loan) && onReturnLoan && (
                            <button
                              type="button"
                              className="button small-btn"
                              onClick={() => {
                                setSelectedDayData(null);
                                onReturnLoan(loan);
                              }}
                            >
                              Return Asset to IT
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
