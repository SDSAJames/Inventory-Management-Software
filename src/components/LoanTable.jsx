import { Fragment, useMemo, useState } from 'react';
import { readableLoanDate, statusClass, getLoanStatus, isLoanOverdue, normalizeDateToIso } from '../lib/utils';

const STATUS_ORDER = { Scheduled: 0, Loaned: 1, Overdue: 2, Returned: 3 };

/** Converts stored date strings into a lexicographically sortable key ('' when empty). */
function dateSortKey(raw) {
  const str = String(raw || '').trim();
  if (!str) return '';
  const normalized = normalizeDateToIso(str);
  if (normalized) {
    const timeMatch = str.match(/\b(\d{2}:\d{2})(?::\d{2})?\b/);
    return timeMatch ? `${normalized} ${timeMatch[1]}` : normalized;
  }
  return str;
}

/* Sortable data columns (the first Action/checkbox column is prepended at render time). */
const COLUMNS = [
  { key: 'no', label: 'No', className: 'col-no', getValue: (_l, idx) => idx },
  { key: 'knoxId', label: 'Knox ID', className: 'col-knox', getValue: (l) => String(l.knoxId || '').toLowerCase() },
  { key: 'startDate', label: 'Start date', getValue: (l) => dateSortKey(l.startDate || l.loanDate) },
  { key: 'pickupDate', label: 'Pickup date', getValue: (l) => dateSortKey(l.pickupDate) },
  { key: 'endDate', label: 'End date', getValue: (l) => dateSortKey(l.endDate || l.dueDate) },
  { key: 'returnDate', label: 'Return date', getValue: (l) => dateSortKey(l.returnDate || l.returnedDate) },
  { key: 'status', label: 'Status', getValue: (l) => STATUS_ORDER[getLoanStatus(l)] },
];

export default function LoanTable({
  loans,
  assets,
  editMode,
  onSaveLoan,
  onPickupLoan,
  onRevertPickup,
  onReturnLoan,
  onRevertReturn,
  onDeleteLoan,
  onEditFullLoan,
  // Checkbox selection mode (replaces the per-row Action column)
  selectable = false,
  selectedIds = new Set(),
  onToggleSelect,
  onToggleSelectAll,
}) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [sort, setSort] = useState({ key: null, dir: 'asc' });

  const totalColumns = COLUMNS.length + 1;

  // Keep the original position (No) attached to each loan, then apply sorting.
  const sortedRows = useMemo(() => {
    const rows = loans.map((loan, idx) => ({ loan, idx }));
    const column = COLUMNS.find((c) => c.key === sort.key);
    if (!column) return rows;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = column.getValue(a.loan, a.idx);
      const vb = column.getValue(b.loan, b.idx);
      const emptyA = va === '' || va === undefined || va === null;
      const emptyB = vb === '' || vb === undefined || vb === null;
      // Empty values always go to the bottom regardless of direction
      if (emptyA && emptyB) return a.idx - b.idx;
      if (emptyA) return 1;
      if (emptyB) return -1;
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return a.idx - b.idx;
    });
  }, [loans, sort]);

  // Cycle: ascending → descending → original order
  const handleSort = (key) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  };

  const allSelected = selectable && loans.length > 0 && loans.every((l) => selectedIds.has(l.id));
  const someSelected = selectable && !allSelected && loans.some((l) => selectedIds.has(l.id));

  const startEdit = (loan) => {
    setEditingId(loan.id);
    setDraft({
      ...loan,
      equipment: { ...(loan.equipment || {}) },
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = () => {
    if (draft) {
      if (!draft.knoxId || !draft.knoxId.trim()) {
        alert('Knox ID is required');
        return;
      }
      onSaveLoan(draft);
    }
    setEditingId(null);
    setDraft(null);
  };

  const update = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (!loans.length) {
    return <div className="empty">No loan records in this category.</div>;
  }

  return (
    <div className="table-wrap">
      <table className={`loan-table simple-loan-table ${selectable ? 'selectable-loan-table' : ''}`}>
        <thead>
          <tr>
            {selectable ? (
              <th className="col-checkbox">
                <input
                  type="checkbox"
                  aria-label="Select all loans"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={() => onToggleSelectAll && onToggleSelectAll(loans)}
                />
              </th>
            ) : (
              <th className="col-action">Action</th>
            )}
            {COLUMNS.map((col) => {
              const isActive = sort.key === col.key;
              return (
                <th
                  key={col.key}
                  className={`sortable-th ${col.className || ''} ${isActive ? 'sorted' : ''}`}
                  onClick={() => handleSort(col.key)}
                  aria-sort={isActive ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  title={
                    !isActive
                      ? `Sort by ${col.label} (ascending)`
                      : sort.dir === 'asc'
                      ? `Sort by ${col.label} (descending)`
                      : 'Clear sorting'
                  }
                >
                  <span className="sortable-th-inner">
                    {col.label}
                    <span className="sort-indicator">
                      {isActive ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map(({ loan, idx: index }) => {
            const eq = loan.equipment || {};
            const asset = assets.find((a) => a.code === loan.assetCode);
            const isEditing = editingId === loan.id;
            const isExpanded = expandedId === loan.id;
            const isSelected = selectable && selectedIds.has(loan.id);
            const isReturned = Boolean(
              loan.returnDate || loan.returnedDate || loan.status === 'Returned' || loan.isArchived,
            );
            const isPickedUp = Boolean(loan.pickupDate);

            // Compute current lifecycle status label (accurately reflecting Overdue if end date is over today)
            const statusLabel = isEditing && draft ? getLoanStatus(draft) : getLoanStatus(loan);

            if (isEditing && draft) {
              return (
                <tr key={loan.id} className="editing-row">
                  <td className="col-action">
                    <div className="action-button-group">
                      <button className="btn-action btn-save" onClick={saveEdit}>Save</button>
                      <button className="btn-action btn-cancel" onClick={cancelEdit}>Cancel</button>
                    </div>
                  </td>
                  <td className="col-no">{index + 1}</td>
                  <td>
                    <input
                      className="inline-input"
                      value={draft.knoxId || ''}
                      onChange={(e) => update('knoxId', e.target.value)}
                      placeholder="Knox ID (required)"
                      required
                    />
                  </td>
                  <td>
                    <input
                      className="inline-input"
                      type="date"
                      value={(draft.startDate || draft.loanDate || '').slice(0, 10)}
                      onChange={(e) => update('startDate', e.target.value)}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                      <input
                        className="inline-input"
                        type="datetime-local"
                        value={draft.pickupDate || ''}
                        onChange={(e) => update('pickupDate', e.target.value)}
                        placeholder="Clear to revert"
                      />
                      {draft.pickupDate && (
                        <button
                          type="button"
                          className="btn-clear-date"
                          onClick={() => update('pickupDate', '')}
                          title="Clear pickup date (revert to Scheduled)"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <input
                      className="inline-input"
                      type="date"
                      value={(draft.endDate || draft.dueDate || '').slice(0, 10)}
                      onChange={(e) => update('endDate', e.target.value)}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                      <input
                        className="inline-input"
                        type="datetime-local"
                        value={draft.returnDate || draft.returnedDate || ''}
                        onChange={(e) => update('returnDate', e.target.value)}
                        placeholder="Clear to revert"
                      />
                      {(draft.returnDate || draft.returnedDate) && (
                        <button
                          type="button"
                          className="btn-clear-date"
                          onClick={() => {
                            update('returnDate', '');
                            update('returnedDate', '');
                          }}
                          title="Clear return date (revert to Loaned)"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`status ${statusClass(statusLabel)}`}>
                      {statusLabel}
                    </span>
                  </td>
                </tr>
              );
            }

            return (
              <Fragment key={loan.id}>
                <tr
                  className={`loan-row ${isExpanded ? 'row-expanded' : ''} ${
                    isReturned ? 'archived-row' : ''
                  } ${isSelected ? 'row-selected' : ''}`}
                  onClick={(e) => {
                    if (['BUTTON', 'INPUT', 'SELECT', 'A'].includes(e.target.tagName)) return;
                    toggleExpand(loan.id);
                  }}
                  title="Click to view loaner and equipment information"
                >
                  {selectable ? (
                  <td className="col-checkbox">
                    <input
                      type="checkbox"
                      aria-label={`Select loan ${loan.knoxId || loan.assetCode || ''}`}
                      checked={isSelected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggleSelect && onToggleSelect(loan.id)}
                    />
                  </td>
                  ) : (
                  <td className="col-action">
                    <div className="action-button-group">
                      {isReturned ? (
                        <>
                          <button
                            className="btn-action btn-revert"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRevertReturn && onRevertReturn(loan);
                            }}
                            title="Revert return: removes return date and puts record back on Loaned"
                          >
                            ↶ Revert
                          </button>
                        </>
                      ) : isPickedUp ? (
                        <>
                          <button
                            className="btn-action btn-return"
                            onClick={(e) => {
                              e.stopPropagation();
                              onReturnLoan && onReturnLoan(loan);
                            }}
                            title="Record return & archive"
                          >
                            Return
                          </button>
                          <button
                            className="btn-action-icon text-warn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRevertPickup && onRevertPickup(loan);
                            }}
                            title="Revert pickup: removes pickup date and puts record back in Scheduled"
                          >
                            ↶
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn-action btn-pickup"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPickupLoan && onPickupLoan(loan);
                          }}
                          title="Record pickup"
                        >
                          Pickup
                        </button>
                      )}
                    </div>
                  </td>
                  )}
                  <td className="col-no">{index + 1}</td>
                  <td className="col-knox">
                    <div className="knox-cell">
                      <span className="expand-indicator">{isExpanded ? '▾' : '▸'}</span>
                      <strong className="knox-id-text">{loan.knoxId || '—'}</strong>
                    </div>
                  </td>
                  <td>{readableLoanDate(loan.startDate || loan.loanDate) || '—'}</td>
                  <td>
                    {loan.pickupDate ? (
                      <span className="timestamp-badge">
                        {readableLoanDate(loan.pickupDate)}
                      </span>
                    ) : (
                      <span className="text-muted-badge">Not picked up</span>
                    )}
                  </td>
                  <td>{readableLoanDate(loan.endDate || loan.dueDate) || '—'}</td>
                  <td>
                    {loan.returnDate || loan.returnedDate ? (
                      <span className="timestamp-badge">
                        {readableLoanDate(loan.returnDate || loan.returnedDate)}
                      </span>
                    ) : (
                      <span className="text-muted-badge">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`status ${statusClass(statusLabel)}`}>
                      {statusLabel}
                    </span>
                  </td>
                </tr>

                {/* Expanded Loaner Information Panel */}
                {isExpanded && (
                  <tr className="loan-detail-tr">
                    <td colSpan={totalColumns} className="loan-detail-td">
                      <div className="loan-detail-card">
                        <div className="loan-detail-header">
                          <div className="loan-detail-title">
                            <h4>{loan.assignee || 'Unnamed Loaner'}</h4>
                            <span className="assignee-badge">
                              {loan.assigneeType || 'Employee'}
                            </span>
                            <span className={`status ${statusClass(statusLabel)}`}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className="loan-detail-actions">
                            {/* Revert / Pickup / Return actions */}
                            {!loan.pickupDate && (
                              <button
                                className="button small-btn"
                                onClick={() => onPickupLoan && onPickupLoan(loan)}
                              >
                                ↗ Confirm pickup
                              </button>
                            )}
                            {loan.pickupDate && !isReturned && (
                              <>
                                <button
                                  className="button secondary small-btn"
                                  onClick={() => onReturnLoan && onReturnLoan(loan)}
                                >
                                  ↙ Record return & archive
                                </button>
                                <button
                                  className="button ghost small-btn warn-action-btn"
                                  onClick={() => onRevertPickup && onRevertPickup(loan)}
                                  title="Clear pickup date and revert to Scheduled"
                                >
                                  ↶ Revert pickup to Scheduled
                                </button>
                              </>
                            )}
                            {isReturned && (
                              <button
                                className="button secondary small-btn"
                                onClick={() => onRevertReturn && onRevertReturn(loan)}
                                title="Clear return date and revert to Loaned"
                              >
                                ↶ Revert to Loaned (remove return date)
                              </button>
                            )}

                            {onEditFullLoan && (
                              <button
                                className="button ghost small-btn"
                                onClick={() => onEditFullLoan(loan.id)}
                              >
                                ✎ Edit full details
                              </button>
                            )}

                            {onDeleteLoan && (
                              <button
                                className="button ghost small-btn danger-action-btn"
                                onClick={() => onDeleteLoan(loan)}
                                title="Permanently delete this loan record"
                              >
                                🗑 Delete record
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="loan-detail-grid">
                          {/* Loaner Details */}
                          <div className="detail-section">
                            <h5>👤 Loaner information</h5>
                            <dl>
                              <dt>Assignee:</dt>
                              <dd><strong>{loan.assignee || '—'}</strong></dd>
                              <dt>Type:</dt>
                              <dd>{loan.assigneeType || 'Employee'}</dd>
                              <dt>Knox ID:</dt>
                              <dd><code>{loan.knoxId || '—'}</code></dd>
                              <dt>Department:</dt>
                              <dd>{loan.department || '—'}</dd>
                              <dt>Rental location:</dt>
                              <dd>{loan.location || asset?.location || 'Head Office'}</dd>
                              <dt>Assigned IP:</dt>
                              <dd><code>{loan.ip || '—'}</code></dd>
                            </dl>
                          </div>

                          {/* Laptop & Equipment */}
                          <div className="detail-section">
                            <h5>💻 Laptop & equipment</h5>
                            <dl>
                              <dt>Laptop number:</dt>
                              <dd>
                                <strong>{loan.assetCode || '—'}</strong>{' '}
                                {asset?.name ? <span className="asset-subname">({asset.name})</span> : ''}
                              </dd>
                              <dt>Charging Adapter:</dt>
                              <dd>{eq.Adapter || '0'}</dd>
                              <dt>Charging Cable:</dt>
                              <dd>{eq.Cable || '0'}</dd>
                              <dt>Dongle:</dt>
                              <dd>{eq.Dongle || '0'}</dd>
                              <dt>Keyboard:</dt>
                              <dd>{eq.Keyboard || '0'}</dd>
                              <dt>Mouse:</dt>
                              <dd>{eq.Mouse || '0'}</dd>
                              <dt>Monitor:</dt>
                              <dd>{eq.Monitor || '0'}</dd>
                              <dt>Ethernet cable:</dt>
                              <dd>{eq['Ethernet cable'] || '0'}</dd>
                              {loan.others && (
                                <>
                                  <dt>Others:</dt>
                                  <dd>{loan.others}</dd>
                                </>
                              )}
                            </dl>
                          </div>

                          {/* Schedule & Notes */}
                          <div className="detail-section">
                            <h5>📅 Schedule & notes</h5>
                            <dl>
                              <dt>Start date:</dt>
                              <dd>{readableLoanDate(loan.startDate || loan.loanDate) || '—'}</dd>
                              <dt>Pickup time:</dt>
                              <dd>
                                {loan.pickupDate ? (
                                  <strong className="timestamp-badge">
                                    {readableLoanDate(loan.pickupDate)}
                                  </strong>
                                ) : (
                                  <span className="text-muted-badge">Awaiting pickup</span>
                                )}
                              </dd>
                              <dt>Due / End date:</dt>
                              <dd>{readableLoanDate(loan.endDate || loan.dueDate) || '—'}</dd>
                              <dt>Return time:</dt>
                              <dd>
                                {(loan.returnDate || loan.returnedDate) ? (
                                  <strong className="timestamp-badge">
                                    {readableLoanDate(loan.returnDate || loan.returnedDate)}
                                  </strong>
                                ) : (
                                  <span className="text-muted-badge">Not returned</span>
                                )}
                              </dd>
                              {loan.note && (
                                <>
                                  <dt>Note:</dt>
                                  <dd className="detail-note">{loan.note}</dd>
                                </>
                              )}
                            </dl>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
