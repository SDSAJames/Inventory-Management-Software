import { getLoanEndDate, isBusinessTraveler } from './loanEquipment.js';

/** Format loan records using the standard loan spreadsheet column order. */
export function loansToRows(loans, assets) {
  const assetMap = new Map(
    assets.map((asset) => [String(asset.code || '').trim().toLowerCase(), asset]),
  );

  return loans.map((loan, index) => {
    const asset = assetMap.get(String(loan.assetCode || '').trim().toLowerCase()) || {};
    const equipment = loan.equipment || {};
    const hasEndDate = isBusinessTraveler(loan.assigneeType);

    return [
      index + 1,
      loan.assignee || loan.borrower || '',
      loan.knoxId || '',
      hasEndDate ? 1 : 0,
      asset.location || loan.location || '',
      loan.ip || '',
      loan.startDate || loan.loanDate || '',
      loan.pickupDate || loan.loanDate || '',
      getLoanEndDate(loan),
      loan.returnDate || loan.returnedDate || '',
      loan.assetCode || '',
      equipment.Adapter ?? 1,
      equipment.Cable ?? 1,
      equipment.Dongle ?? 0,
      equipment.Keyboard ?? 0,
      equipment.Mouse ?? 0,
      equipment.Monitor ?? 0,
      equipment['Ethernet cable'] ?? 0,
      loan.others || '',
      loan.note || loan.purpose || '',
    ];
  });
}