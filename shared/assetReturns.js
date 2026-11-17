import { isLoanReturned } from './loanRules.js';
import { TRANSFER_ITEMS } from './loanTransfer.js';
import { DEVICE_KEYS } from './equipment.js';
import { DEFAULT_OWNER } from './referenceData.js';

const sameCode = (left, right) => Boolean(left && right) && String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
const holderMatches = (record, currentOwner) => {
  const owner = String(currentOwner).trim().toLowerCase();
  const holders = [record.assignee, record.knoxId, record.knox_id].filter(Boolean).map((name) => String(name).trim().toLowerCase());
  return Boolean(owner && owner !== DEFAULT_OWNER.toLowerCase() && holders.includes(owner));
};

export function isAssetReturnedOnRecord(record, assetCode) {
  return DEVICE_KEYS.some((key) => sameCode(record.returnedEquipment?.[key], assetCode));
}

/** A partial return can leave a specific device outstanding after the return timestamp. */
export function isOutstandingAssetCustody(record, assetCode, currentOwner) {
  if (record.status === 'Transferred' || (!record.pickupDate && !record.pickup_date && record.status !== 'Active')) return false;
  if (isLoanReturned(record) && (record.returnStatus ?? record.return_status) !== 'Partial') return false;
  if (isLoanReturned(record) && currentOwner != null && !holderMatches(record, currentOwner)) return false;
  return !isAssetReturnedOnRecord(record, assetCode);
}

/** Later handovers or check-ins supersede an older missing-device return. */
export function findLatestAssetCustodyEvent(records, asset) {
  if (['Under repair', 'Retired'].includes(asset.status)) return undefined;
  const time = (value) => {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : -Infinity;
  };
  const events = records.filter((record) => {
    const equipment = record.equipment || (record.equipment_json ? JSON.parse(record.equipment_json) : {});
    const returnedEquipment = record.returnedEquipment || (record.returned_equipment_json ? JSON.parse(record.returned_equipment_json) : null);
    const references = [record.assetCode ?? record.asset_code, equipment.Monitor, ...DEVICE_KEYS.map((key) => returnedEquipment?.[key])];
    if (!references.some((code) => sameCode(code, asset.code))) return false;
    const hasCustodyEvent = record.pickupDate || record.pickup_date || record.returnDate || record.return_date || record.returnedDate || record.returned_date || ['Active', 'Returned', 'Transferred'].includes(record.status);
    if (!hasCustodyEvent) return false;
    // A historical missing-device record cannot displace an unrelated current holder.
    if (isLoanReturned(record) && (record.returnStatus ?? record.return_status) === 'Partial'
      && !isAssetReturnedOnRecord({ returnedEquipment }, asset.code) && !holderMatches(record, asset.owner)) return false;
    return true;
  }).map((record) => {
    const returnedEquipment = record.returnedEquipment || (record.returned_equipment_json ? JSON.parse(record.returned_equipment_json) : null);
    return { record: { ...record, returnedEquipment }, timestamp: Math.max(...[
      record.pickupDate ?? record.pickup_date, record.returnDate ?? record.return_date,
      record.returnedDate ?? record.returned_date,
    ].map(time)), created: time(record.createdAt ?? record.created_at) };
  }).sort((a, b) => b.timestamp - a.timestamp || b.created - a.created);
  return events[0]?.record;
}

export function findOutstandingAssetCustody(records, asset) {
  const latest = findLatestAssetCustodyEvent(records, asset);
  return latest && isOutstandingAssetCustody(latest, asset.code, asset.owner) ? latest : undefined;
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
