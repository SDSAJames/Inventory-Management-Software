import { useState, useMemo } from 'react';
import { normalizeDateToIso, todayIso, readableLoanDate } from '../lib/utils';
import Modal from './Modal';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function InOutCalendar({
  loans = [],
  assets = [],
  locations = [],
  onEditLoan,
  onReturnLoan,
  onRecordLoan,
  onPickupLoan,
  initialRequesterType = 'ALL',
  initialRequester = 'ALL',
}) {
  const today = todayIso();
  const todayDate = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState(() => todayDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => todayDate.getMonth()); // 0-11

  // Filter state
  const [requesterTypeFilter, setRequesterTypeFilter] = useState(initialRequesterType); // 'ALL' | 'Business traveler' | 'Employee'
  const [selectedRequester, setSelectedRequester] = useState(initialRequester); // 'ALL' | specific name
  const [eventTypeFilter, setEventTypeFilter] = useState('all'); // 'all' | 'outgoing' | 'incoming'
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [searchFilter, setSearchFilter] = useState('');

  // Day detail modal state
  const [selectedDayData, setSelectedDayData] = useState(null);
  const [dayModalFilter, setDayModalFilter] = useState('all'); // 'all' | 'outgoing' | 'incoming'

  /* ── 1. Month navigation ────────────────────────────────────── */
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleGoToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
  };

  /* ── 2. Enrich loans with asset details & normalization ──────── */
  const enrichedLoans = useMemo(() => {
    const assetMap = new Map();
    assets.forEach((a) => {
      if (a.code) assetMap.set(String(a.code).toLowerCase(), a);
    });

    return loans.map((loan) => {
      const asset = assetMap.get(String(loan.assetCode || '').toLowerCase());
      const isReturned = Boolean(loan.returnDate || loan.returnedDate || loan.status === 'Returned' || loan.isArchived);
      const hasPickup = Boolean(loan.pickupDate || loan.status === 'Active');
      const dueDate = loan.endDate || loan.dueDate || '';
      const isOverdue = !isReturned && dueDate && dueDate < todayIso();

      // Normalize requester type
      const rawType = String(loan.assigneeType || '').trim();
      const isTraveler = rawType.toLowerCase() === 'business traveler';
      const userType = isTraveler ? 'Business traveler' : 'Employee';
      const userTypeLabel = isTraveler ? 'Business Traveler' : 'SPE Employee';

      let computedStatus = 'Scheduled';
      if (isReturned) {
        computedStatus = 'Returned';
      } else if (isOverdue) {
        computedStatus = 'Overdue';
      } else if (hasPickup) {
        computedStatus = 'In Field';
      }

      const eq = loan.equipment || {};
      const accessoryCount = Object.values(eq).reduce((sum, val) => sum + (Number(val) || 0), 0);

      // Start / Outgoing date (Checkout / Departure)
      const outIso = normalizeDateToIso(loan.startDate || loan.pickupDate || loan.loanDate);

      // Due / Incoming date (Return / Due back)
      const inIso = isReturned
        ? normalizeDateToIso(loan.returnDate || loan.returnedDate || loan.endDate || loan.dueDate)
        : normalizeDateToIso(loan.endDate || loan.dueDate);

      return {
        ...loan,
        assignee: loan.assignee || loan.borrower || 'Unknown Staff',
        userType,
        userTypeLabel,
        isTraveler,
        assetName: asset?.name || 'Hardware Device',
        assetModel: asset?.model || '',
        location: loan.location || asset?.location || 'Unspecified',
        outIso,
        inIso,
        isReturned,
        hasPickup,
        isOverdue,
        computedStatus,
        accessoryCount,
      };
    });
  }, [loans, assets]);

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
    enrichedLoans.forEach((l) => {
      if (l.isTraveler) travelerCount += 1;
      else employeeCount += 1;
    });
    return {
      all: enrichedLoans.length,
      travelers: travelerCount,
      employees: employeeCount,
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
  const { outgoingByDate, incomingByDate } = useMemo(() => {
    const outMap = new Map();
    const inMap = new Map();

    enrichedLoans.forEach((loan) => {
      // 1. Outgoing schedule: Checkouts, Start dates, Pickup dates
      if (loan.outIso) {
        if (!outMap.has(loan.outIso)) outMap.set(loan.outIso, []);
        outMap.get(loan.outIso).push(loan);
      }

      // 2. Incoming schedule: Returns, Due dates, Completed check-ins
      if (loan.inIso) {
        if (!inMap.has(loan.inIso)) inMap.set(loan.inIso, []);
        inMap.get(loan.inIso).push(loan);
      }
    });

    return { outgoingByDate: outMap, incomingByDate: inMap };
  }, [enrichedLoans]);

  /* ── 6. 42-day Month Grid calculation ───────────────────────── */
  const pad = (n) => String(n).padStart(2, '0');

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 (Sun) - 6 (Sat)
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const days = [];

    // 1. Previous month padding days
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const prevMonthNum = currentMonth === 0 ? 12 : currentMonth;
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const dateStr = `${prevYear}-${pad(prevMonthNum)}-${pad(dayNum)}`;
      days.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isPrevMonth: true,
        isNextMonth: false,
      });
    }

    // 2. Current month days
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateStr = `${currentYear}-${pad(currentMonth + 1)}-${pad(dayNum)}`;
      days.push({
        dateStr,
        dayNum,
        isCurrentMonth: true,
        isPrevMonth: false,
        isNextMonth: false,
      });
    }

    // 3. Next month padding days to complete 6 rows (42 cells)
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const nextMonthNum = currentMonth === 11 ? 1 : currentMonth + 2;
    const remaining = 42 - days.length;
    for (let dayNum = 1; dayNum <= remaining; dayNum++) {
      const dateStr = `${nextYear}-${pad(nextMonthNum)}-${pad(dayNum)}`;
      days.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isPrevMonth: false,
        isNextMonth: true,
      });
    }

    return days;
  }, [currentYear, currentMonth]);

  /* ── 7. Monthly Summary Metrics ─────────────────────────────── */
  const monthStats = useMemo(() => {
    const prefix = `${currentYear}-${pad(currentMonth + 1)}`;
    let outgoingCount = 0;
    let incomingCount = 0;
    let overdueCount = 0;
    let completedReturns = 0;
    let travelerEvents = 0;
    let employeeEvents = 0;

    outgoingByDate.forEach((list, dateStr) => {
      if (dateStr.startsWith(prefix)) {
        const filtered = list.filter(matchesFilters);
        outgoingCount += filtered.length;
        filtered.forEach((l) => {
          if (l.isTraveler) travelerEvents += 1;
          else employeeEvents += 1;
        });
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
          else employeeEvents += 1;
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
      total: outgoingCount + incomingCount,
    };
  }, [currentYear, currentMonth, outgoingByDate, incomingByDate, requesterTypeFilter, selectedRequester, selectedLocation, searchFilter]);

  /* ── 8. Open Day Detail Modal ───────────────────────────────── */
  const handleOpenDay = (dateStr) => {
    const outgoing = (outgoingByDate.get(dateStr) || []).filter(matchesFilters);
    const incoming = (incomingByDate.get(dateStr) || []).filter(matchesFilters);

    setSelectedDayData({
      dateStr,
      outgoing,
      incoming,
    });
    setDayModalFilter('all');
  };

  const formatDayTitle = (dateStr) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="traveler-calendar-card in-out-calendar-root">
      {/* ── Calendar Toolbar Header ─────────────────────────── */}
      <div className="calendar-toolbar">
        {/* Navigation & Month Jump */}
        <div className="calendar-nav-group">
          <div className="calendar-month-selector">
            <button
              type="button"
              id="cal-prev-btn"
              className="button ghost icon-only-btn"
              onClick={handlePrevMonth}
              title="Previous month"
              aria-label="Previous month"
            >
              ‹
            </button>
            <h3 className="calendar-month-title">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </h3>
            <button
              type="button"
              id="cal-next-btn"
              className="button ghost icon-only-btn"
              onClick={handleNextMonth}
              title="Next month"
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <button
            type="button"
            id="cal-today-btn"
            className="button ghost small-btn today-jump-btn"
            onClick={handleGoToday}
            title="Jump to current month & date"
          >
            Today
          </button>

          <div className="calendar-jump-selects">
            <select
              aria-label="Select month"
              className="calendar-select"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(Number(e.target.value))}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Select year"
              className="calendar-select"
              value={currentYear}
              onChange={(e) => setCurrentYear(Number(e.target.value))}
            >
              {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

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
              title="Display requests from all personnel (SPE employees and business travelers)"
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
                  {r.name} ({r.userType === 'Business traveler' ? 'Traveler' : 'SPE Staff'} • {r.count} request{r.count === 1 ? '' : 's'})
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
              Type: {requesterTypeFilter === 'Business traveler' ? '💼 Business Traveler' : '🏢 SPE Employee'}
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
              Flow: {eventTypeFilter === 'outgoing' ? '📥 Out / Checkout' : '📤 In / Return'}
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
            🏢 {monthStats.employeeEvents} SPE Employee
          </span>
        </div>
      </div>

      {/* ── Calendar Grid ───────────────────────────────────── */}
      <div className="calendar-grid-wrapper">
        {/* Weekday Headers */}
        <div className="calendar-weekdays-row">
          {WEEKDAYS.map((day, idx) => (
            <div
              key={day}
              className={`calendar-weekday-cell ${idx === 0 || idx === 6 ? 'weekend' : ''}`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* 42-day Month Days Grid */}
        <div className="calendar-days-grid">
          {calendarDays.map((cell) => {
            const isToday = cell.dateStr === today;
            const outgoingList = (outgoingByDate.get(cell.dateStr) || []).filter(matchesFilters);
            const incomingList = (incomingByDate.get(cell.dateStr) || []).filter(matchesFilters);

            const showOutgoing = eventTypeFilter === 'all' || eventTypeFilter === 'outgoing';
            const showIncoming = eventTypeFilter === 'all' || eventTypeFilter === 'incoming';

            const totalEvents =
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
                          {l.isTraveler ? 'TRV' : 'SPE'}
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
                            {l.isTraveler ? 'TRV' : 'SPE'}
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
          open={Boolean(selectedDayData)}
          size="wide"
          onClose={() => setSelectedDayData(null)}
        >
          <div className="day-modal-header">
            <div>
              <span className="day-modal-eyebrow">EQUIPMENT IN & OUT SCHEDULE</span>
              <h2 className="day-modal-title">{formatDayTitle(selectedDayData.dateStr)}</h2>
              <span className="day-modal-subtitle">
                {(selectedDayData.outgoing?.length || 0) + (selectedDayData.incoming?.length || 0)} schedule requests recorded for this date
              </span>
            </div>

            {/* Quick Filter tabs inside modal */}
            <div className="calendar-type-pills day-modal-pills">
              <button
                type="button"
                className={`cal-filter-pill ${dayModalFilter === 'all' ? 'active' : ''}`}
                onClick={() => setDayModalFilter('all')}
              >
                All ({selectedDayData.outgoing.length + selectedDayData.incoming.length})
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

          <div className="day-modal-content-stream">
            {/* 1. Outgoing Section (Checkouts & Departures) */}
            {(dayModalFilter === 'all' || dayModalFilter === 'outgoing') && (
              <div className="day-modal-section">
                <div className="day-modal-section-title incoming-title">
                  <span>📥 Outgoing: Checkouts & Departures ({selectedDayData.outgoing.length})</span>
                </div>

                {selectedDayData.outgoing.length === 0 ? (
                  <div className="day-modal-empty-note">No equipment checkouts or departures scheduled for this day.</div>
                ) : (
                  <div className="day-modal-cards-grid">
                    {selectedDayData.outgoing.map((loan) => (
                      <div key={`out-card-${loan.id}`} className="day-detail-card outgoing-card">
                        <div className="day-card-header">
                          <div>
                            <div className="day-card-user-row">
                              <strong className="day-card-name">{loan.assignee}</strong>
                              <span className={`requester-type-pill-badge ${loan.isTraveler ? 'traveler' : 'employee'}`}>
                                {loan.isTraveler ? '💼 Business Traveler' : '🏢 SPE Employee'}
                              </span>
                            </div>
                            <span className="day-card-sub">
                              Knox ID: <code>{loan.knoxId || 'N/A'}</code> • Dept: {loan.department || 'Operations'}
                            </span>
                          </div>
                          <span className={`status ${
                            loan.computedStatus === 'In Field'
                              ? 'status-warning'
                              : loan.computedStatus === 'Overdue'
                              ? 'status-danger'
                              : loan.computedStatus === 'Scheduled'
                              ? 'status-available'
                              : 'status-archived'
                          }`}>
                            {loan.computedStatus}
                          </span>
                        </div>

                        <div className="day-card-body">
                          <div className="day-card-info-item">
                            <span className="info-lbl">Hardware:</span>
                            <span className="info-val">
                              <strong>{loan.assetCode}</strong> ({loan.assetName})
                            </span>
                          </div>
                          <div className="day-card-info-item">
                            <span className="info-lbl">Rental Location:</span>
                            <span className="info-val">📍 {loan.location}</span>
                          </div>
                          <div className="day-card-info-item">
                            <span className="info-lbl">Checkout / Start:</span>
                            <span className="info-val">{readableLoanDate(loan.startDate || loan.pickupDate)}</span>
                          </div>
                          <div className="day-card-info-item">
                            <span className="info-lbl">Expected Return:</span>
                            <span className="info-val">{readableLoanDate(loan.endDate || loan.dueDate) || 'Indefinite'}</span>
                          </div>

                          {loan.accessoryCount > 0 && (
                            <div className="day-card-accessories">
                              <span className="info-lbl">Accessories:</span>
                              <div className="accessory-tags-wrap">
                                {Object.entries(loan.equipment || {})
                                  .filter(([, val]) => Boolean(val))
                                  .map(([key, val]) => (
                                    <span key={key} className="acc-tag">
                                      {key}: {val}
                                    </span>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="day-card-footer">
                          {onEditLoan && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => {
                                setSelectedDayData(null);
                                onEditLoan(loan.id);
                              }}
                            >
                              Edit Schedule
                            </button>
                          )}
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
                          {!loan.isReturned && onReturnLoan && (
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
                )}
              </div>
            )}

            {/* 2. Incoming Section (Returns & Check-ins) */}
            {(dayModalFilter === 'all' || dayModalFilter === 'incoming') && (
              <div className="day-modal-section" style={{ marginTop: '20px' }}>
                <div className="day-modal-section-title returning-title">
                  <span>📤 Incoming: Returns & Check-ins ({selectedDayData.incoming.length})</span>
                </div>

                {selectedDayData.incoming.length === 0 ? (
                  <div className="day-modal-empty-note">No equipment returns scheduled for this day.</div>
                ) : (
                  <div className="day-modal-cards-grid">
                    {selectedDayData.incoming.map((loan) => (
                      <div
                        key={`in-card-${loan.id}`}
                        className={`day-detail-card incoming-card ${
                          loan.isOverdue ? 'overdue-card' : loan.isReturned ? 'returned-card' : ''
                        }`}
                      >
                        <div className="day-card-header">
                          <div>
                            <div className="day-card-user-row">
                              <strong className="day-card-name">{loan.assignee}</strong>
                              <span className={`requester-type-pill-badge ${loan.isTraveler ? 'traveler' : 'employee'}`}>
                                {loan.isTraveler ? '💼 Business Traveler' : '🏢 SPE Employee'}
                              </span>
                            </div>
                            <span className="day-card-sub">
                              Knox ID: <code>{loan.knoxId || 'N/A'}</code> • Dept: {loan.department || 'Operations'}
                            </span>
                          </div>
                          <span className={`status ${
                            loan.isReturned
                              ? 'status-archived'
                              : loan.isOverdue
                              ? 'status-danger'
                              : 'status-warning'
                          }`}>
                            {loan.isReturned ? 'Returned' : loan.isOverdue ? 'Overdue' : 'Due Today'}
                          </span>
                        </div>

                        <div className="day-card-body">
                          <div className="day-card-info-item">
                            <span className="info-lbl">Hardware:</span>
                            <span className="info-val">
                              <strong>{loan.assetCode}</strong> ({loan.assetName})
                            </span>
                          </div>
                          <div className="day-card-info-item">
                            <span className="info-lbl">Rental Location:</span>
                            <span className="info-val">📍 {loan.location}</span>
                          </div>
                          <div className="day-card-info-item">
                            <span className="info-lbl">Scheduled Due Date:</span>
                            <span className="info-val">{readableLoanDate(loan.endDate || loan.dueDate)}</span>
                          </div>
                          {loan.isReturned && (
                            <div className="day-card-info-item">
                              <span className="info-lbl">Actual Return Date:</span>
                              <span className="info-val" style={{ color: '#059669', fontWeight: 600 }}>
                                ✓ {readableLoanDate(loan.returnDate || loan.returnedDate)}
                              </span>
                            </div>
                          )}
                          {loan.isOverdue && (
                            <div className="day-card-info-item overdue-alert-text">
                              <span className="info-lbl">Alert:</span>
                              <span className="info-val" style={{ color: '#dc2626', fontWeight: 700 }}>
                                ⚠️ Equipment custody past scheduled return date.
                              </span>
                            </div>
                          )}

                          {loan.accessoryCount > 0 && (
                            <div className="day-card-accessories">
                              <span className="info-lbl">Accessories:</span>
                              <div className="accessory-tags-wrap">
                                {Object.entries(loan.equipment || {})
                                  .filter(([, val]) => Boolean(val))
                                  .map(([key, val]) => (
                                    <span key={key} className="acc-tag">
                                      {key}: {val}
                                    </span>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="day-card-footer">
                          {onEditLoan && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => {
                                setSelectedDayData(null);
                                onEditLoan(loan.id);
                              }}
                            >
                              Edit Schedule
                            </button>
                          )}
                          {!loan.isReturned && onReturnLoan && (
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
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
