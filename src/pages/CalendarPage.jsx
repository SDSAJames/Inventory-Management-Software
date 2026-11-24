import LoanReturnModal from '../components/LoanReturnModal';
import { useState } from 'react';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import LoanForm from '../components/LoanForm';
import EditLoanForm from '../components/EditLoanForm';
import InOutCalendar from '../components/InOutCalendar';

export default function CalendarPage() {
  const { db, pickupLoan } = useDb();
  const toast = useToast();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editLoanId, setEditLoanId] = useState(null);
  const [returnConfirmTarget, setReturnConfirmTarget] = useState(null);

  /* Handle return confirmation. */

  return (
    <div className="calendar-page-container">
      {/* ── Master In & Out Calendar Component ─────────────────── */}
      <InOutCalendar
        loans={db.loans}
        assets={db.assets}
        locations={db.locations}
        editingLoanId={editLoanId}
        onRecordLoan={() => setShowCreateModal(true)}
        onEditLoan={(id) => setEditLoanId(id)}
        onReturnLoan={(loan) => {
          setReturnConfirmTarget(loan);

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
      <LoanReturnModal loan={returnConfirmTarget} onClose={() => setReturnConfirmTarget(null)} />
    </div>
  );
}
