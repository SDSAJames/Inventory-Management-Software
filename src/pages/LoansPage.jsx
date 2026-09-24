import { useState } from 'react';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { todayIso } from '../lib/utils';
import LoanTable from '../components/LoanTable';
import Modal from '../components/Modal';
import LoanForm from '../components/LoanForm';
import EditLoanForm from '../components/EditLoanForm';

export default function LoansPage() {
  const { db, updateLoan, returnLoan } = useDb();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editLoanId, setEditLoanId] = useState(null);
  const [editMode, setEditMode] = useState(false);

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

  const handleReturn = (id) => {
    returnLoan(id);
    toast('Asset returned and available');
  };

  return (
    <>
      <div className="view-header">
        <div>
          <h2>Loans and returns</h2>
          <p>All loan fields are visible here. Edit a record to add pickup or return details.</p>
        </div>
        <div className="view-header-actions">
          {editMode && <span className="edit-mode-indicator">EDIT MODE</span>}
          <button
            className={`button ${editMode ? 'secondary' : 'ghost'}`}
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? '✓ Done' : '✎ Edit'}
          </button>
          <button className="button" onClick={() => setShowCreate(true)}>+ Create loan</button>
        </div>
      </div>

      <section className="panel">
        <LoanTable
          loans={db.loans}
          assets={db.assets}
          editMode={editMode}
          onSaveLoan={handleInlineSave}
          onReturnLoan={handleReturn}
        />
      </section>

      {/* Create loan modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)}>
        <LoanForm onClose={() => setShowCreate(false)} />
      </Modal>

      {/* Edit loan modal (fallback) */}
      <Modal open={editLoanId !== null} onClose={() => setEditLoanId(null)}>
        {editLoanId && (
          <EditLoanForm loanId={editLoanId} onClose={() => setEditLoanId(null)} />
        )}
      </Modal>
    </>
  );
}
