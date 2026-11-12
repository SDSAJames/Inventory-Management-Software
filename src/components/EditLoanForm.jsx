import { useState } from 'react';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { updateLoanFormField, isBusinessTraveler } from '../lib/loanEquipment';
import { createLoanForm, loanFormErrors, buildLoanFormData } from '../lib/loanForms';
import LoanDirectoryFields from './LoanDirectoryFields';
import LoanEquipmentSection from './LoanEquipmentSection';
import AssigneeFields from './AssigneeFields';
import LoanDateFields from './LoanDateFields';
import LoanNoteFields from './LoanNoteFields';
import TimestampField from './TimestampField';
import { canRecordReturn } from '../../shared/loanRules.js';

export default function EditLoanForm({ loanId, onClose }) {
  const { db, updateLoan } = useDb();
  const loan = db.loans.find((l) => l.id === loanId);
  return loan ? <LoanEditor key={loan.id} loan={loan} db={db} updateLoan={updateLoan} onClose={onClose} /> : null;
}

function LoanEditor({ loan, db, updateLoan, onClose }) {
  const toast = useToast();
  const equipment = loan.equipment || {};

  const [form, setForm] = useState(() => createLoanForm(loan));

  const updateField = (field, value) => {
    setForm((prev) => updateLoanFormField(prev, field, value));
  };


  const [saving, setSaving] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    const errors = loanFormErrors(form);
    if (Object.keys(errors).length) return toast(Object.values(errors)[0]);
    if (form.returnDate && (!canRecordReturn(loan) || (!form.pickupDate && !loan.returnDate && !loan.returnedDate))) return toast('Record pickup before returning equipment');
    const changes = buildLoanFormData(form, { equipment, includeReturn: true });

    const assetUpdates = {
      code: form.assetCode,
      owner: form.assignee,
      location: form.location,
    };

    setSaving(true);
    try {
      await updateLoan(loan.id, changes, assetUpdates);
      toast('Loan updated');
      onClose();
    } catch (error) { toast(error.message || 'Could not save loan'); }
    finally { setSaving(false); }
  };

  return (
    <>
      <h2>{isBusinessTraveler(form.assigneeType) ? 'Edit loan' : 'Edit assignment'}</h2>
      <p className="modal-intro">
        Update the assignment or loan details. Pickup and return can be added here after creation.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <AssigneeFields form={form} onChange={updateField} />

          <LoanDirectoryFields form={form} onChange={updateField} locations={db.locations} departments={db.departments} idPrefix="edit-" />
          <LoanDateFields form={form} onChange={updateField} />
          <TimestampField id="pickupDate" label="Pickup timestamp" hint="(Clear to revert to Scheduled)" value={form.pickupDate}
            onChange={(value) => updateField('pickupDate', value)} onClear={() => updateField('pickupDate', '')} />
          {canRecordReturn(loan) && Boolean(form.pickupDate || loan.returnDate || loan.returnedDate) && <TimestampField
            id="returnDate" label="Return timestamp" hint="(Clear to revert to Loaned)" value={form.returnDate}
            onChange={(value) => updateField('returnDate', value)} onClear={() => updateField('returnDate', '')} />}

          <LoanEquipmentSection form={form} onChange={updateField} locations={db.locations} idPrefix="edit-" />

          <LoanNoteFields form={form} onChange={updateField} />
        </div>

        <div className="form-actions">
          <button type="button" className="button ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="button" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </>
  );
}
