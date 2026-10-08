import { useState, useMemo } from 'react';
import { normalizeDateToIso, todayIso, readableLoanDate } from '../lib/utils';
import Modal from './Modal';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TravelerCalendar({
  travelers = [],
  onEditTraveler,
  onReturnTraveler,
  onRecordTraveler,
  locations = [],
  selectedLocation = 'ALL',
  onSelectLocation,
}) {
  // Calendar view month & year (defaults to today's month/year)
  const today = todayIso();
  const todayDate = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState(() => todayDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => todayDate.getMonth()); // 0-11

  // Filter state
  const [eventTypeFilter, setEventTypeFilter] = useState('all'); // 'all' | 'incoming' | 'returning'
  const [searchFilter, setSearchFilter] = useState('');

  // Day detail modal state
  const [selectedDayData, setSelectedDayData] = useState(null);
  const [dayModalFilter, setDayModalFilter] = useState('all'); // 'all' | 'incoming' | 'returning'

  /* ── Month navigation ────────────────────────────────────── */
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

  /* ── Index travelers by dates ────────────────────────────── */
  const { incomingByDate, returningByDate } = useMemo(() => {
    const incMap = new Map();
    const retMap = new Map();

    travelers.forEach((t) => {
      // 1. Incoming schedule: Start date or pickup date
      const startIso = normalizeDateToIso(t.startDate || t.pickupDate || t.loanDate);
      if (startIso) {
        if (!incMap.has(startIso)) incMap.set(startIso, []);
        incMap.get(startIso).push(t);
      }

      // 2. Returning schedule: Due date, end date, or actual return date
      const endIso = t.isReturned
        ? normalizeDateToIso(t.returnDate || t.returnedDate || t.endDate || t.dueDate)
        : normalizeDateToIso(t.endDate || t.dueDate);
      if (endIso) {
        if (!retMap.has(endIso)) retMap.set(endIso, []);
        retMap.get(endIso).push(t);
      }
    });

    return { incomingByDate: incMap, returningByDate: retMap };
  }, [travelers]);

  /* ── 42-day Month Grid calculation ───────────────────────── */
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

  /* ── Monthly metrics ─────────────────────────────────────── */
  const monthStats = useMemo(() => {
    const prefix = `${currentYear}-${pad(currentMonth + 1)}`;
    let incomingCount = 0;
    let returningCount = 0;
    let overdueCount = 0;
    let completedReturns = 0;

    // Filter by location & search query
    const query = searchFilter.toLowerCase().trim();
    const filterFn = (t) => {
      if (selectedLocation !== 'ALL' && t.location !== selectedLocation) return false;
      if (query) {
        const match =
          String(t.assignee || '').toLowerCase().includes(query) ||
          String(t.knoxId || '').toLowerCase().includes(query) ||
          String(t.assetCode || '').toLowerCase().includes(query) ||
          String(t.location || '').toLowerCase().includes(query);
        if (!match) return false;
      }
      return true;
    };

    incomingByDate.forEach((list, dateStr) => {
      if (dateStr.startsWith(prefix)) {
        incomingCount += list.filter(filterFn).length;
      }
    });

    returningByDate.forEach((list, dateStr) => {
      if (dateStr.startsWith(prefix)) {
        const filtered = list.filter(filterFn);
        returningCount += filtered.length;
        filtered.forEach((t) => {
          if (t.isOverdue) overdueCount += 1;
          if (t.isReturned) completedReturns += 1;
        });
      }
    });

    return {
      incomingCount,
      returningCount,
      overdueCount,
      completedReturns,
      total: incomingCount + returningCount,
    };
  }, [currentYear, currentMonth, incomingByDate, returningByDate, selectedLocation, searchFilter]);

  /* ── Open day detail modal ───────────────────────────────── */
  const handleOpenDay = (dateStr) => {
    const query = searchFilter.toLowerCase().trim();
    const filterFn = (t) => {
      if (selectedLocation !== 'ALL' && t.location !== selectedLocation) return false;
      if (query) {
        const match =
          String(t.assignee || '').toLowerCase().includes(query) ||
          String(t.knoxId || '').toLowerCase().includes(query) ||
          String(t.assetCode || '').toLowerCase().includes(query) ||
          String(t.location || '').toLowerCase().includes(query);
        if (!match) return false;
      }
      return true;
    };

    const incoming = (incomingByDate.get(dateStr) || []).filter(filterFn);
    const returning = (returningByDate.get(dateStr) || []).filter(filterFn);

    setSelectedDayData({
      dateStr,
      incoming,
      returning,
    });
    setDayModalFilter('all');
  };

  /* ── Format formatted date label ─────────────────────────── */
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
    <div className="traveler-calendar-card">
      {/* ── Calendar Toolbar Header ─────────────────────────── */}
      <div className="calendar-toolbar">
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

          {/* Quick jump dropdowns */}
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

        {/* ── Filters & Search ──────────────────────────────── */}
        <div className="calendar-controls-group">
          {/* Search box */}
          <div className="calendar-search-wrap">
            <span className="cal-search-icon">🔍</span>
            <input
              type="search"
              aria-label="Filter calendar events"
              className="calendar-search-input"
              placeholder="Search traveler or laptop..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>

          {/* Event type filter pills */}
          <div className="calendar-type-pills">
            <button
              type="button"
              className={`cal-filter-pill ${eventTypeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setEventTypeFilter('all')}
            >
              All Events ({monthStats.total})
            </button>
            <button
              type="button"
              className={`cal-filter-pill incoming-pill ${eventTypeFilter === 'incoming' ? 'active' : ''}`}
              onClick={() => setEventTypeFilter('incoming')}
            >
              <span className="pill-dot incoming-dot" />
              📥 Incoming ({monthStats.incomingCount})
            </button>
            <button
              type="button"
              className={`cal-filter-pill returning-pill ${eventTypeFilter === 'returning' ? 'active' : ''}`}
              onClick={() => setEventTypeFilter('returning')}
            >
              <span className="pill-dot returning-dot" />
              📤 Returning ({monthStats.returningCount})
            </button>
          </div>

          {/* Location filter dropdown if locations exist */}
          {locations.length > 0 && onSelectLocation && (
            <select
              aria-label="Filter by destination location"
              className="calendar-select location-select"
              value={selectedLocation}
              onChange={(e) => onSelectLocation(e.target.value)}
            >
              <option value="ALL">📍 All Locations</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  📍 {loc}
                </option>
              ))}
            </select>
          )}

          {onRecordTraveler && (
            <button
              type="button"
              className="button small-btn"
              onClick={onRecordTraveler}
              title="Record new business travel schedule"
            >
              + Add Traveler
            </button>
          )}
        </div>
      </div>

      {/* ── Month Overview Summary Bar ──────────────────────── */}
      <div className="calendar-stats-bar">
        <div className="cal-stat-item">
          <span className="cal-stat-label">Month Total:</span>
          <strong className="cal-stat-val">{monthStats.total} schedules</strong>
        </div>
        <div className="cal-stat-item incoming">
          <span className="cal-stat-badge incoming-badge">📥 Incoming</span>
          <strong className="cal-stat-val">{monthStats.incomingCount} travelers departing / pickup</strong>
        </div>
        <div className="cal-stat-item returning">
          <span className="cal-stat-badge returning-badge">📤 Returning</span>
          <strong className="cal-stat-val">{monthStats.returningCount} expected / completed returns</strong>
        </div>
        {monthStats.overdueCount > 0 && (
          <div className="cal-stat-item overdue">
            <span className="cal-stat-badge overdue-badge">⚠️ Overdue</span>
            <strong className="cal-stat-val">{monthStats.overdueCount} delayed returns</strong>
          </div>
        )}
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
            const query = searchFilter.toLowerCase().trim();
            const filterFn = (t) => {
              if (selectedLocation !== 'ALL' && t.location !== selectedLocation) return false;
              if (query) {
                const match =
                  String(t.assignee || '').toLowerCase().includes(query) ||
                  String(t.knoxId || '').toLowerCase().includes(query) ||
                  String(t.assetCode || '').toLowerCase().includes(query) ||
                  String(t.location || '').toLowerCase().includes(query);
                if (!match) return false;
              }
              return true;
            };

            const incomingList = (incomingByDate.get(cell.dateStr) || []).filter(filterFn);
            const returningList = (returningByDate.get(cell.dateStr) || []).filter(filterFn);

            const showIncoming = eventTypeFilter === 'all' || eventTypeFilter === 'incoming';
            const showReturning = eventTypeFilter === 'all' || eventTypeFilter === 'returning';

            const totalEvents =
              (showIncoming ? incomingList.length : 0) +
              (showReturning ? returningList.length : 0);

            const hasOverdue = returningList.some((t) => t.isOverdue);

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
                {/* Cell Header: Day Number + Quick Indicators */}
                <div className="cal-day-header">
                  <span className={`cal-day-number ${isToday ? 'today-pill' : ''}`}>
                    {cell.dayNum}
                  </span>

                  {totalEvents > 0 && (
                    <div className="cal-day-indicators">
                      {showIncoming && incomingList.length > 0 && (
                        <span
                          className="cal-count-indicator incoming"
                          title={`${incomingList.length} incoming traveler${incomingList.length === 1 ? '' : 's'}`}
                        >
                          ↓{incomingList.length}
                        </span>
                      )}
                      {showReturning && returningList.length > 0 && (
                        <span
                          className={`cal-count-indicator returning ${hasOverdue ? 'alert' : ''}`}
                          title={`${returningList.length} returning traveler${returningList.length === 1 ? '' : 's'}`}
                        >
                          ↑{returningList.length}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Event Chips Container */}
                <div className="cal-chips-container">
                  {/* Incoming travelers list */}
                  {showIncoming &&
                    incomingList.slice(0, 2).map((t) => (
                      <div
                        key={`inc-${t.id}`}
                        className="cal-chip incoming-chip"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDay(cell.dateStr);
                        }}
                        title={`Incoming: ${t.assignee} to ${t.location} (${t.assetCode})`}
                      >
                        <span className="chip-icon">📥</span>
                        <span className="chip-name">{t.assignee}</span>
                        {t.location && (
                          <span className="chip-loc">• {t.location}</span>
                        )}
                      </div>
                    ))}

                  {/* Returning travelers list */}
                  {showReturning &&
                    returningList.slice(0, 2).map((t) => {
                      const chipClass = t.isReturned
                        ? 'returned-chip'
                        : t.isOverdue
                        ? 'overdue-chip'
                        : 'returning-chip';
                      const chipIcon = t.isReturned ? '✓' : t.isOverdue ? '⚠️' : '📤';
                      return (
                        <div
                          key={`ret-${t.id}`}
                          className={`cal-chip ${chipClass}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDay(cell.dateStr);
                          }}
                          title={`Returning: ${t.assignee} (${t.assetCode}) - ${t.tripStatus}`}
                        >
                          <span className="chip-icon">{chipIcon}</span>
                          <span className="chip-name">{t.assignee}</span>
                          <span className="chip-loc">• {t.assetCode}</span>
                        </div>
                      );
                    })}

                  {/* Overflow indicator if > 2 visible events */}
                  {totalEvents > 2 && (
                    <div className="cal-more-chip">
                      +{totalEvents - 2} more schedule{totalEvents - 2 === 1 ? '' : 's'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Day Details Modal ───────────────────────────────── */}
      <Modal
        open={selectedDayData !== null}
        size="wide"
        onClose={() => setSelectedDayData(null)}
      >
        {selectedDayData && (
          <div className="day-schedule-modal">
            <div className="day-schedule-header">
              <div>
                <h2>{formatDayTitle(selectedDayData.dateStr)}</h2>
                <p className="modal-intro" style={{ margin: '4px 0 0 0' }}>
                  Business traveler arrivals, departures, and equipment custody schedule for this date.
                </p>
              </div>

              <div className="day-modal-stats">
                <span className="cal-stat-badge incoming-badge">
                  📥 {selectedDayData.incoming.length} Incoming
                </span>
                <span className="cal-stat-badge returning-badge">
                  📤 {selectedDayData.returning.length} Returning
                </span>
              </div>
            </div>

            {/* Sub-filter tabs inside modal */}
            <div className="loan-tabs" style={{ marginTop: '14px', marginBottom: '16px' }}>
              <button
                type="button"
                className={`loan-tab ${dayModalFilter === 'all' ? 'active' : ''}`}
                onClick={() => setDayModalFilter('all')}
              >
                All Schedules ({selectedDayData.incoming.length + selectedDayData.returning.length})
              </button>
              <button
                type="button"
                className={`loan-tab ${dayModalFilter === 'incoming' ? 'active' : ''}`}
                onClick={() => setDayModalFilter('incoming')}
              >
                📥 Incoming Departures ({selectedDayData.incoming.length})
              </button>
              <button
                type="button"
                className={`loan-tab ${dayModalFilter === 'returning' ? 'active' : ''}`}
                onClick={() => setDayModalFilter('returning')}
              >
                📤 Equipment Returns ({selectedDayData.returning.length})
              </button>
            </div>

            {/* Empty state for the selected day */}
            {selectedDayData.incoming.length === 0 && selectedDayData.returning.length === 0 && (
              <div className="empty" style={{ padding: '36px 12px' }}>
                <p>No business traveler arrivals or returns recorded on {selectedDayData.dateStr}.</p>
                {onRecordTraveler && (
                  <button
                    type="button"
                    className="button small-btn"
                    style={{ marginTop: '10px' }}
                    onClick={() => {
                      setSelectedDayData(null);
                      onRecordTraveler();
                    }}
                  >
                    + Schedule Traveler for this Date
                  </button>
                )}
              </div>
            )}

            {/* 1. Incoming Travelers Section */}
            {(dayModalFilter === 'all' || dayModalFilter === 'incoming') &&
              selectedDayData.incoming.length > 0 && (
                <div className="day-schedule-section">
                  <div className="section-title-row incoming-header">
                    <h4>📥 Incoming Business Travelers (Trip Start / Pickup)</h4>
                    <span className="count-tag">{selectedDayData.incoming.length} personnel</span>
                  </div>

                  <div className="schedule-cards-grid">
                    {selectedDayData.incoming.map((t) => (
                      <div key={`modal-inc-${t.id}`} className="schedule-card incoming-card">
                        <div className="card-top-row">
                          <div>
                            <strong className="traveler-name">{t.assignee}</strong>
                            {t.knoxId && (
                              <code className="knox-tag" style={{ marginLeft: '6px' }}>
                                {t.knoxId}
                              </code>
                            )}
                          </div>
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
                        </div>

                        <div className="card-detail-grid">
                          <div>
                            <span className="detail-label">Destination:</span>
                            <strong className="detail-value">📍 {t.location}</strong>
                          </div>
                          <div>
                            <span className="detail-label">Laptop Assigned:</span>
                            <strong className="detail-value">{t.assetCode}</strong>
                          </div>
                          <div>
                            <span className="detail-label">Start / Pickup:</span>
                            <span className="detail-value">
                              {readableLoanDate(t.startDate || t.pickupDate || t.loanDate)}
                            </span>
                          </div>
                          <div>
                            <span className="detail-label">Scheduled Due:</span>
                            <span className="detail-value">
                              {readableLoanDate(t.endDate || t.dueDate)}
                            </span>
                          </div>
                          {t.ip && (
                            <div>
                              <span className="detail-label">Knox IP:</span>
                              <code className="detail-value" style={{ color: 'var(--blue)' }}>
                                {t.ip}
                              </code>
                            </div>
                          )}
                          {t.accessoryCount > 0 && (
                            <div>
                              <span className="detail-label">Accessories:</span>
                              <span className="detail-value">+{t.accessoryCount} items</span>
                            </div>
                          )}
                        </div>

                        <div className="card-action-row">
                          {onEditTraveler && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => {
                                setSelectedDayData(null);
                                onEditTraveler(t.id);
                              }}
                            >
                              ✎ Edit Details
                            </button>
                          )}
                          {!t.isReturned && onReturnTraveler && (
                            <button
                              type="button"
                              className="button secondary small-btn"
                              onClick={() => {
                                setSelectedDayData(null);
                                onReturnTraveler(t);
                              }}
                            >
                              ↙ Record Return
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* 2. Returning Travelers Section */}
            {(dayModalFilter === 'all' || dayModalFilter === 'returning') &&
              selectedDayData.returning.length > 0 && (
                <div className="day-schedule-section" style={{ marginTop: '20px' }}>
                  <div className="section-title-row returning-header">
                    <h4>📤 Returning Business Travelers (Equipment Return)</h4>
                    <span className="count-tag">{selectedDayData.returning.length} personnel</span>
                  </div>

                  <div className="schedule-cards-grid">
                    {selectedDayData.returning.map((t) => (
                      <div
                        key={`modal-ret-${t.id}`}
                        className={`schedule-card returning-card ${t.isOverdue ? 'card-overdue' : ''} ${
                          t.isReturned ? 'card-returned' : ''
                        }`}
                      >
                        <div className="card-top-row">
                          <div>
                            <strong className="traveler-name">{t.assignee}</strong>
                            {t.knoxId && (
                              <code className="knox-tag" style={{ marginLeft: '6px' }}>
                                {t.knoxId}
                              </code>
                            )}
                          </div>
                          <span
                            className={`status ${
                              t.isReturned
                                ? 'status-archived'
                                : t.isOverdue
                                ? 'status-danger'
                                : 'status-warning'
                            }`}
                          >
                            {t.isReturned ? 'Returned' : t.isOverdue ? 'Overdue Return' : 'Due for Return'}
                          </span>
                        </div>

                        <div className="card-detail-grid">
                          <div>
                            <span className="detail-label">Returning from:</span>
                            <strong className="detail-value">📍 {t.location}</strong>
                          </div>
                          <div>
                            <span className="detail-label">Laptop to Return:</span>
                            <strong className="detail-value">{t.assetCode}</strong>
                          </div>
                          <div>
                            <span className="detail-label">Due Date:</span>
                            <span className="detail-value">
                              {readableLoanDate(t.endDate || t.dueDate)}
                            </span>
                          </div>
                          <div>
                            <span className="detail-label">Status Summary:</span>
                            <span className="detail-value">
                              {t.isReturned
                                ? `Returned on ${readableLoanDate(t.returnDate || t.returnedDate)}`
                                : t.remainingText || 'Active in Field'}
                            </span>
                          </div>
                        </div>

                        <div className="card-action-row">
                          {onEditTraveler && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => {
                                setSelectedDayData(null);
                                onEditTraveler(t.id);
                              }}
                            >
                              ✎ Edit Details
                            </button>
                          )}
                          {!t.isReturned && onReturnTraveler && (
                            <button
                              type="button"
                              className="button secondary small-btn"
                              style={{ background: '#0284c7', color: 'white', borderColor: '#0284c7' }}
                              onClick={() => {
                                setSelectedDayData(null);
                                onReturnTraveler(t);
                              }}
                            >
                              ↙ Confirm Return to IT
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            <div className="form-actions" style={{ marginTop: '20px' }}>
              <button
                type="button"
                className="button ghost"
                onClick={() => setSelectedDayData(null)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
