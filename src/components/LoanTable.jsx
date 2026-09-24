import { useState } from 'react';
import { readableLoanDate, statusClass } from '../lib/utils';

const HEADERS = [
  'Action',
  'No',
  'Knox ID',
  'Start date',
  'Pickup date',
  'End date',
  'Return date',
  'Status',
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
}) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

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
      <table className="loan-table simple-loan-table">
        <thead>
          <tr>
            {HEADERS.map((h, i) => (
              <th
                key={i}
                className={
                  i === 0
                    ? 'col-action'
                    : i === 1
                    ? 'col-no'
                    : i === 2
                    ? 'col-knox'
                    : undefined
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loans.map((loan, index) => {
            const eq = loan.equipment || {};
            const asset = assets.find((a) => a.code === loan.assetCode);
            const isEditing = editingId === loan.id;
            const isExpanded = expandedId === loan.id;
            const isReturned = Boolean(
              loan.returnDate || loan.returnedDate || loan.status === 'Returned' || loan.isArchived,
            );
            const isPickedUp = Boolean(loan.pickupDate);

            // Compute current lifecycle status label
            const statusLabel = isReturned
              ? 'Returned'
              : isPickedUp
              ? 'Loaned'
              : 'Scheduled';

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
              <>
                <tr
                  key={loan.id}
                  className={`loan-row ${isExpanded ? 'row-expanded' : ''} ${
                    isReturned ? 'archived-row' : ''
                  }`}
                  onClick={(e) => {
                    if (['BUTTON', 'INPUT', 'SELECT', 'A'].includes(e.target.tagName)) return;
                    toggleExpand(loan.id);
                  }}
                  title="Click to view loaner and equipment information"
                >
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

                      <button
                        className="btn-action-icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(loan);
                        }}
                        title={editMode ? 'Edit inline' : 'Edit row'}
                      >
                        ✎
                      </button>

                      {onDeleteLoan && (
                        <button
                          className="btn-action-icon text-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteLoan(loan);
                          }}
                          title="Delete loan record"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </td>
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
                  <tr key={`${loan.id}-details`} className="loan-detail-tr">
                    <td colSpan={HEADERS.length} className="loan-detail-td">
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
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
