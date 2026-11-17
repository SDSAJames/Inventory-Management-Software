import EquipmentAccessoryList from './EquipmentAccessoryList';
import { buildLoanReturnDetails } from '../lib/loanForms';

/** Reuse the same received-item controls and outstanding summary in return and edit windows. */
export default function ReturnedEquipmentFields({ loan, form, onChange, idPrefix = 'return-accessory-' }) {
  const { missingItems } = buildLoanReturnDetails(loan, form);
  return <>
    {missingItems.length ? <div className="partial-return-warning"><strong>Partial return</strong><span>Still outstanding: {missingItems.join(', ')}</span></div> : <div className="complete-return-note">All issued items are marked returned.</div>}
    <EquipmentAccessoryList pcField="returnedLaptopCode" form={form} onChange={onChange} idPrefix={idPrefix} returning />
  </>;
}
