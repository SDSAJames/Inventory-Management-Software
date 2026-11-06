import { useState } from 'react';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { nowLocalIso } from '../lib/utils';
import { createLoanReturnForm, buildLoanReturnDetails } from '../lib/loanForms';
import Modal from './Modal';
import LoanReturnForm from './LoanReturnForm';

function ReturnEditor({ loan, onClose }) {
  const { returnLoan } = useDb();
  const toast = useToast();
  const [form, setForm] = useState(() => createLoanReturnForm(loan, nowLocalIso()));
  const onConfirm = () => {
    const { details, missingItems } = buildLoanReturnDetails(loan, form);
    returnLoan(loan.id, form.returnDate || nowLocalIso(), details);
    toast(missingItems.length ? `Return recorded with missing items: ${missingItems.join(', ')}` : `Laptop and accessories returned & archived (${loan.assetCode})`);
    onClose();
  };
  return <LoanReturnForm loan={loan} form={form} onChange={(field, value) => setForm((previous) => ({ ...previous, [field]: value }))} onConfirm={onConfirm} onClose={onClose} />;
}

export default function LoanReturnModal({ loan, onClose }) {
  return <Modal open={Boolean(loan)} size="wide" onClose={onClose}>{loan && <ReturnEditor key={loan.id} loan={loan} onClose={onClose} />}</Modal>;
}
