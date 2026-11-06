import { isLoanReturned } from './loanRules.js';
import { TRANSFER_ITEMS } from './loanTransfer.js';
import { DEVICE_KEYS } from './equipment.js';

const sameCode = (left, right) => Boolean(left && right) && String(left).trim().toLowerCase() === String(right).trim().toLowerCase();

export function isAssetReturnedOnRecord(record, assetCode) {
  return DEVICE_KEYS.some((key) => sameCode(record.returnedEquipment?.[key], assetCode));
}

/** Record only the device checked in; other issued equipment remains outstanding. */
export function recordAssetReturn(record, assetCode, timestamp) {
  if (isLoanReturned(record) || (!record.pickupDate && record.status !== 'Active')) return record;
  const equipment = { ...record.equipment, Laptop: record.assetCode || record.equipment?.Laptop || '', Others: record.others || record.equipment?.Others || '' };
  const deviceKeys = DEVICE_KEYS.filter((key) => sameCode(equipment[key], assetCode));
  if (!deviceKeys.length || isAssetReturnedOnRecord(record, assetCode)) return record;
  const returnedEquipment = { ...record.returnedEquipment };
  for (const key of deviceKeys) returnedEquipment[key] = equipment[key];
  const complete = TRANSFER_ITEMS.every((key) => {
    const issued = String(equipment[key] ?? '').trim();
    if (!issued || issued === '0') return true;
    const received = String(returnedEquipment[key] ?? '').trim();
    if (!received) return false;
    if (!DEVICE_KEYS.includes(key) && Number.isFinite(Number(issued)) && Number.isFinite(Number(received))) return Number(received) >= Number(issued);
    return sameCode(issued, received);
  });
  const devices = DEVICE_KEYS.filter((key) => equipment[key] && String(equipment[key]) !== '0' && (key === 'Laptop' || !Number.isFinite(Number(equipment[key]))));
  const devicesReturned = devices.every((key) => sameCode(returnedEquipment[key], equipment[key]));
  return {
    ...record, returnedEquipment, returnStatus: complete ? 'Complete' : 'Partial',
    ...(devicesReturned ? { returnDate: timestamp, returnedDate: timestamp, status: 'Returned', isArchived: true, readyForPickup: false } : {}),
  };
}
