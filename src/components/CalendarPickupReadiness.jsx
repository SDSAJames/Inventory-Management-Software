import PickupReadiness from './PickupReadiness';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
export default function CalendarPickupReadiness({ loan }) {
  const { setLoanReadyForPickup } = useDb();
  const toast = useToast();
  return <div className="calendar-pickup-readiness"><PickupReadiness loan={loan} onToggleReady={async () => {
    try { await setLoanReadyForPickup(loan.id, !loan.readyForPickup); }
    catch (error) { toast(error.message || 'Could not update readiness'); }
  }} /></div>;
}
