import { useState, useMemo } from 'react';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { nowLocalIso, readableLoanDate } from '../lib/utils';
import LoanTable from '../components/LoanTable';
import Modal from '../components/Modal';
import LoanForm from '../components/LoanForm';
import EditLoanForm from '../components/EditLoanForm';

export default function LoansPage() {
  const { db, updateLoan, pickupLoan, revertPickup, returnLoan, unarchiveLoan, deleteLoan } = useDb();
  const toast = useToast();

  // 3 Process categories: 'scheduled' | 'loaned' | 'returned' | 'all'
  const [category, setCategory] = useState('scheduled');
  const [showCreate, setShowCreate] = useState(false);
  const [editLoanId, setEditLoanId] = useState(null);
  const [editMode, setEditMode] = useState(false);

  // Pickup modal state
  const [pickupTarget, setPickupTarget] = useState(null);
  const [pickupTime, setPickupTime] = useState('');

  // Return & Archive modal state
  const [returnTarget, setReturnTarget] = useState(null);
  const [returnTime, setReturnTime] = useState('');

  // Deletion confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState(null);

  // 1. Scheduled: Laptops scheduled for pickup (no pickup timestamp yet, not returned)
  const scheduledLoans = useMemo(
    () =>
      db.loans.filter(
        (l) =>
          !l.pickupDate &&
          !l.returnDate &&
          !l.returnedDate &&
          l.status !== 'Returned' &&
          !l.isArchived,
      ),
    [db.loans],
  );

  // 2. Loaned: Laptops currently handed out & in use (has pickup timestamp, not returned)
  const loanedLoans = useMemo(
    () =>
      db.loans.filter(
        (l) =>
          Boolean(l.pickupDate) &&
          !l.returnDate &&
          !l.returnedDate &&
          l.status !== 'Returned' &&
          !l.isArchived,
      ),
    [db.loans],
  );

  // 3. Returned: Laptops that have been returned & archived
  const returnedLoans = useMemo(
    () =>
      db.loans.filter(
        (l) =>
          Boolean(l.returnDate || l.returnedDate || l.status === 'Returned' || l.isArchived),
      ),
    [db.loans],
  );

  const displayedLoans = useMemo(() => {
    if (category === 'scheduled') return scheduledLoans;
    if (category === 'loaned') return loanedLoans;
    if (category === 'returned') return returnedLoans;
    return db.loans;
  }, [category, scheduledLoans, loanedLoans, returnedLoans, db.loans]);

  /* ── Pickup flow ────────────────────────────────── */

  const handleOpenPickup = (loan) => {
    setPickupTarget(loan);
    setPickupTime(nowLocalIso());
  };

  const handleConfirmPickup = () => {
    if (!pickupTarget) return;
    pickupLoan(pickupTarget.id, pickupTime || nowLocalIso());
    toast(`Laptop picked up for ${pickupTarget.assignee || 'assignee'}`);
    setPickupTarget(null);
  };

  const handleRevertPickup = (loan) => {
    revertPickup(loan.id);
    toast(`Pickup reverted for ${loan.assignee || 'loan'}. Record moved back to Scheduled.`);
  };

  /* ── Return & Archive flow ──────────────────────── */

  const handleOpenReturn = (loan) => {
    setReturnTarget(loan);
    setReturnTime(nowLocalIso());
  };

  const handleConfirmReturn = () => {
    if (!returnTarget) return;
    returnLoan(returnTarget.id, returnTime || nowLocalIso());
    toast(`Laptop returned & archived (${returnTarget.assetCode})`);
    setReturnTarget(null);
  };

  const handleRevertReturn = (loan) => {
    unarchiveLoan(loan.id);
    toast(`Return reverted for ${loan.assignee || 'loan'}. Record moved back to Loaned.`);
  };

  /* ── Record Deletion flow ───────────────────────── */

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteLoan(deleteTarget.id);
    toast(`Loan record for ${deleteTarget.assignee || 'assignee'} has been deleted.`);
    setDeleteTarget(null);
  };

  /* ── Inline save ────────────────────────────────── */

  const handleInlineSave = (draft) => {
    const changes = {
      assetCode: draft.assetCode,
      assignee: draft.assignee,
      assigneeType: draft.assigneeType,
      knoxId: draft.knoxId,
      ip: draft.ip,
      location: draft.location,
      startDate: draft.startDate,
      loanDate: draft.startDate || draft.loanDate,
      endDate: draft.endDate,
      dueDate: draft.endDate || draft.dueDate,
      pickupDate: draft.pickupDate,
      returnDate: draft.returnDate,
      returnedDate: draft.returnDate || draft.returnedDate,
      department: draft.department,
      others: draft.others,
      note: draft.note,
      status: draft.status,
      equipment: draft.equipment,
    };

    const assetUpdates = {
      code: draft.assetCode,
      owner: draft.assignee,
      location: draft.location,
    };

    updateLoan(draft.id, changes, assetUpdates);
    toast('Loan updated');
  };

  return (
    <>
      <div className="view-header">
        <div>
          <h2>Laptop loan scheduling & process management</h2>
          <p>
            Track scheduled pickups, timestamp handovers, process returns, or revert stages if marked by mistake. Click any row to view loaner details.
          </p>
        </div>
        <div className="view-header-actions">
          {editMode && <span className="edit-mode-indicator">EDIT MODE</span>}
          <button
            className={`button ${editMode ? 'secondary' : 'ghost'}`}
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? '✓ Done' : '✎ Edit'}
          </button>
          <button className="button" onClick={() => setShowCreate(true)}>
            + Schedule laptop
          </button>
        </div>
      </div>

      {/* 3 Categories: Scheduled, Loaned, Returned (+ All) */}
      <div className="loan-tabs">
        <button
          className={`loan-tab ${category === 'scheduled' ? 'active' : ''}`}
          onClick={() => setCategory('scheduled')}
        >
          <span className="category-dot scheduled-dot">●</span>
          Scheduled
          <span className="loan-tab-count">{scheduledLoans.length}</span>
        </button>
        <button
          className={`loan-tab ${category === 'loaned' ? 'active' : ''}`}
          onClick={() => setCategory('loaned')}
        >
          <span className="category-dot loaned-dot">●</span>
          Loaned
          <span className="loan-tab-count">{loanedLoans.length}</span>
        </button>
        <button
          className={`loan-tab ${category === 'returned' ? 'active' : ''}`}
          onClick={() => setCategory('returned')}
        >
          <span className="category-dot returned-dot">●</span>
          Returned
          <span className="loan-tab-count">{returnedLoans.length}</span>
        </button>
        <button
          className={`loan-tab ${category === 'all' ? 'active' : ''}`}
          onClick={() => setCategory('all')}
        >
          All records
          <span className="loan-tab-count">{db.loans.length}</span>
        </button>
      </div>

      <div className="category-description">
        {category === 'scheduled' && (
          <span>📋 <strong>Scheduled pickups:</strong> Laptops awaiting handover. Click <strong>Pickup</strong> to timestamp handover. Click row for loaner details.</span>
        )}
        {category === 'loaned' && (
          <span>🚀 <strong>Active loans:</strong> Laptops currently with employees/travelers. Click <strong>Return</strong> to archive, or <strong>↶ Revert</strong> if picked up by mistake.</span>
        )}
        {category === 'returned' && (
          <span>📦 <strong>Returned & archived:</strong> Completed laptop loans. Click <strong>↶ Revert</strong> if returned by mistake to move back to Loaned.</span>
        )}
        {category === 'all' && (
          <span>🗂️ <strong>All records:</strong> Complete schedule and loan history with full status management.</span>
        )}
      </div>

      <section className="panel">
        <LoanTable
          loans={displayedLoans}
          assets={db.assets}
          editMode={editMode}
          onSaveLoan={handleInlineSave}
          onPickupLoan={handleOpenPickup}
          onRevertPickup={handleRevertPickup}
          onReturnLoan={handleOpenReturn}
          onRevertReturn={handleRevertReturn}
          onDeleteLoan={(loan) => setDeleteTarget(loan)}
          onEditFullLoan={(id) => setEditLoanId(id)}
        />
      </section>

      {/* Pickup timestamp modal */}
      <Modal open={pickupTarget !== null} onClose={() => setPickupTarget(null)}>
        {pickupTarget && (
          <div className="pickup-dialog">
            <h2>Record laptop pickup</h2>
            <p className="modal-intro">
              Timestamp defaults to current time. You can manually adjust the date and time if the pickup occurred at a different time.
            </p>

            <div className="timestamp-dialog-card">
              <dl>
                <dt>Knox ID:</dt>
                <dd><code>{pickupTarget.knoxId || '—'}</code></dd>
                <dt>Assignee:</dt>
                <dd>{pickupTarget.assignee || 'Unknown'} ({pickupTarget.assigneeType || 'Employee'})</dd>
                <dt>Laptop number:</dt>
                <dd>{pickupTarget.assetCode}</dd>
                <dt>Rental location:</dt>
                <dd>{pickupTarget.location || 'Head Office'}</dd>
                {pickupTarget.ip && (
                  <>
                    <dt>Assigned IP:</dt>
                    <dd>{pickupTarget.ip}</dd>
                  </>
                )}
              </dl>
            </div>

            <div className="field">
              <label htmlFor="pickupTimeInput">Pickup timestamp (default: current time)</label>
              <div className="timestamp-input-row">
                <input
                  id="pickupTimeInput"
                  type="datetime-local"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                />
                <button
                  type="button"
                  className="button ghost"
                  style={{ whiteSpace: 'nowrap', padding: '9px 12px' }}
                  onClick={() => setPickupTime(nowLocalIso())}
                  title="Reset to current time"
                >
                  ◷ Current time
                </button>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setPickupTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                onClick={handleConfirmPickup}
              >
                Confirm pickup
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Return & Archive timestamp modal */}
      <Modal open={returnTarget !== null} onClose={() => setReturnTarget(null)}>
        {returnTarget && (
          <div className="return-dialog">
            <h2>Record return & archive</h2>
            <p className="modal-intro">
              Timestamp defaults to current time. Confirming return will make the laptop available in inventory and archive this loan record.
            </p>

            <div className="timestamp-dialog-card">
              <dl>
                <dt>Knox ID:</dt>
                <dd><code>{returnTarget.knoxId || '—'}</code></dd>
                <dt>Assignee:</dt>
                <dd>{returnTarget.assignee || 'Unknown'}</dd>
                <dt>Laptop number:</dt>
                <dd>{returnTarget.assetCode}</dd>
                <dt>Picked up on:</dt>
                <dd>{readableLoanDate(returnTarget.pickupDate) || '—'}</dd>
              </dl>
            </div>

            <div className="field">
              <label htmlFor="returnTimeInput">Return timestamp (default: current time)</label>
              <div className="timestamp-input-row">
                <input
                  id="returnTimeInput"
                  type="datetime-local"
                  value={returnTime}
                  onChange={(e) => setReturnTime(e.target.value)}
                />
                <button
                  type="button"
                  className="button ghost"
                  style={{ whiteSpace: 'nowrap', padding: '9px 12px' }}
                  onClick={() => setReturnTime(nowLocalIso())}
                  title="Reset to current time"
                >
                  ◷ Current time
                </button>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setReturnTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                onClick={handleConfirmReturn}
              >
                Confirm return & archive
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Deletion Confirmation Modal */}
      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        {deleteTarget && (
          <div className="delete-dialog">
            <h2>Delete loan record</h2>
            <p className="modal-intro">
              Are you sure you want to permanently delete this loan record? This action cannot be undone.
            </p>

            <div className="timestamp-dialog-card">
              <dl>
                <dt>Assignee:</dt>
                <dd><strong>{deleteTarget.assignee || 'Unknown'}</strong></dd>
                <dt>Knox ID:</dt>
                <dd><code>{deleteTarget.knoxId || '—'}</code></dd>
                <dt>Laptop:</dt>
                <dd>{deleteTarget.assetCode}</dd>
                <dt>Status:</dt>
                <dd>{deleteTarget.returnDate ? 'Returned' : deleteTarget.pickupDate ? 'Loaned' : 'Scheduled'}</dd>
              </dl>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button danger-btn"
                style={{ background: '#be665a', borderColor: '#be665a', color: 'white' }}
                onClick={handleConfirmDelete}
              >
                Delete permanently
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create loan modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)}>
        <LoanForm onClose={() => setShowCreate(false)} />
      </Modal>

      {/* Edit loan modal (fallback / full edit from expanded row) */}
      <Modal open={editLoanId !== null} onClose={() => setEditLoanId(null)}>
        {editLoanId && (
          <EditLoanForm loanId={editLoanId} onClose={() => setEditLoanId(null)} />
        )}
      </Modal>
    </>
  );
}
