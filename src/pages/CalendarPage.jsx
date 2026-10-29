import { useState, useMemo } from 'react';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { todayIso, readableLoanDate, isLoanOverdue } from '../lib/utils';
import { getLoanEndDate, isBusinessTraveler } from '../lib/loanEquipment';
import Modal from '../components/Modal';
import LoanForm from '../components/LoanForm';
import EditLoanForm from '../components/EditLoanForm';
import InOutCalendar from '../components/InOutCalendar';

export default function CalendarPage() {
  const { db, returnLoan, pickupLoan } = useDb();
  const toast = useToast();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editLoanId, setEditLoanId] = useState(null);
  const [returnConfirmTarget, setReturnConfirmTarget] = useState(null);
  const [returnDate, setReturnDate] = useState(() => todayIso());

  /* ── 1. Calculate overall metrics for high-level KPI cards ───── */
  const metrics = useMemo(() => {
    const loans = db.loans || [];
    let inField = 0;
    let overdue = 0;
    let scheduled = 0;
    let returned = 0;
    let travelers = 0;
    let employees = 0;

    loans.forEach((l) => {
      const isReturned = Boolean(l.returnDate || l.returnedDate || l.status === 'Returned' || l.isArchived);
      const hasPickup = Boolean(l.pickupDate || l.status === 'Active');
      const isOverdue = !isReturned && isLoanOverdue(l);

      const isTraveler = isBusinessTraveler(l.assigneeType);
      if (isTraveler) travelers += 1;
      else employees += 1;

      if (isReturned) {
        returned += 1;
      } else if (isOverdue) {
        overdue += 1;
        inField += 1;
      } else if (hasPickup) {
        inField += 1;
      } else {
        scheduled += 1;
      }
    });

    return {
      total: loans.length,
      inField,
      scheduled,
      overdue,
      returned,
      travelers,
      employees,
    };
  }, [db.loans]);

  /* ── 2. Handle Return confirmation ──────────────────────────── */
  const handleConfirmReturn = () => {
    if (!returnConfirmTarget) return;
    returnLoan(returnConfirmTarget.id, returnDate || todayIso());
    toast(`Asset ${returnConfirmTarget.assetCode} successfully returned to IT department`);
    setReturnConfirmTarget(null);
  };

  return (
    <div className="calendar-page-container">
      {/* ── Page Header ────────────────────────────────────────── */}
      <div className="view-header">
        <div>
          <p className="view-subtitle">
            Unified schedule for equipment checkouts (Out) and returns (In) across all SPE employees and mobile business travelers.
          </p>
        </div>
      </div>

      {/* ── Quick KPI Stat Cards ───────────────────────────────── */}
      <section className="stat-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card">
          <div className="stat-label">Currently In Field</div>
          <div className="stat-value" style={{ color: 'var(--blue)' }}>
            {metrics.inField}
          </div>
          <div className="stat-hint">
            Equipment deployed outside IT store
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Scheduled Checkouts</div>
          <div className="stat-value" style={{ color: '#0284c7' }}>
            {metrics.scheduled}
          </div>
          <div className="stat-hint">Awaiting pickup / dispatch</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Overdue Returns</div>
          <div className="stat-value" style={{ color: metrics.overdue > 0 ? '#dc2626' : 'var(--ink)' }}>
            {metrics.overdue}
          </div>
          <div className="stat-hint">
            {metrics.overdue > 0 ? '⚠️ Custody past scheduled due date' : '✓ All custody schedules on time'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Total Custody Records</div>
          <div className="stat-value">{metrics.total}</div>
          <div className="stat-hint">
            <strong>{metrics.travelers}</strong> Business Travelers • <strong>{metrics.employees}</strong> SPE Employees
          </div>
        </div>
      </section>

      {/* ── Master In & Out Calendar Component ─────────────────── */}
      <InOutCalendar
        loans={db.loans}
        assets={db.assets}
        locations={db.locations}
        onRecordLoan={() => setShowCreateModal(true)}
        onEditLoan={(id) => setEditLoanId(id)}
        onReturnLoan={(loan) => {
          setReturnConfirmTarget(loan);
          setReturnDate(todayIso());
        }}
        onPickupLoan={(id, date) => {
          pickupLoan(id, date);
          toast('Equipment pickup confirmed');
        }}
      />

      {/* ── Modal: Record New In/Out Schedule ─────────────────── */}
      <Modal open={showCreateModal} size="wide" onClose={() => setShowCreateModal(false)}>
        <LoanForm
          defaultAssigneeType="Business traveler"
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => toast('New in/out equipment schedule recorded')}
        />
      </Modal>

      {/* ── Modal: Edit Loan Schedule ─────────────────────────── */}
      {editLoanId && (
        <Modal open={Boolean(editLoanId)} size="wide" onClose={() => setEditLoanId(null)}>
          <EditLoanForm
            loanId={editLoanId}
            onClose={() => setEditLoanId(null)}
          />
        </Modal>
      )}

      {/* ── Modal: Confirm Return to IT Department ─────────────── */}
      {returnConfirmTarget && (
        <Modal
          open={Boolean(returnConfirmTarget)}
          onClose={() => setReturnConfirmTarget(null)}
        >
          <div style={{ padding: '4px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '18px' }}>
              Confirm Equipment Return
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '0 0 16px', lineHeight: 1.5 }}>
              Return asset <strong>{returnConfirmTarget.assetCode}</strong> from{' '}
              <strong>{returnConfirmTarget.assignee}</strong> back to the{' '}
              <strong>IT department</strong>. The asset status will be restored to{' '}
              <strong style={{ color: '#059669' }}>Available</strong> while retaining borrower audit lineage.
            </p>

            <div className="field" style={{ marginBottom: '20px' }}>
              <label htmlFor="confirm-return-date-picker">
                Actual Return Date:
              </label>
              <input
                id="confirm-return-date-picker"
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                style={{ width: '100%', padding: '8px 10px' }}
              />
            </div>

            <div className="form-actions" style={{ justifyContent: 'flex-end', gap: '8px' }}>
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
        </Modal>
      )}
    </div>
  );
}
