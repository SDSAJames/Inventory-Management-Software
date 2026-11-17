import { randomUUID } from 'node:crypto';
import { DEVICE_KEYS } from '../../shared/equipment.js';
import { equipmentCodeMatches } from '../../shared/returnedEquipment.js';
import { findLatestAssetCustodyEvent } from '../../shared/assetReturns.js';
import { custodyStatusForBorrower } from '../../shared/loanRules.js';
import { DEFAULT_OWNER } from '../../shared/referenceData.js';
import { returnAssetToIt } from './assetLoans.js';
import { assetLocationForWrite } from './assetLocations.js';
import { formatLoanRow } from './loanRows.js';

const codeKey = (value) => String(value ?? '').trim().toLowerCase();
const deviceCodes = (equipment) => DEVICE_KEYS.map((key) => String(equipment?.[key] ?? '').trim()).filter((code) => code && code !== '0' && code !== '1');

/** Correct received devices without taking assets away from a later recipient. */
export function syncEditedReturnDevices(database, previousLoan, nextLoan, updated) {
  const previous = formatLoanRow(previousLoan), next = formatLoanRow(nextLoan);
  const issued = { ...next.equipment, Laptop: next.assetCode || next.equipment?.Laptop || '' };
  const received = next.returnedEquipment;
  const previousReceived = previous.returnedEquipment;
  if (!received && next.returnStatus === 'Partial') return []; // Legacy partial receipts are unknown; do not infer a device return.
  const codes = [...new Set([
    ...deviceCodes(issued), ...deviceCodes(received), ...deviceCodes(previousReceived),
  ])];
  const otherLoans = database.prepare('SELECT * FROM loans WHERE id <> ?').all(next.id).map(formatLoanRow);
  const owners = [previous.assignee, previous.knoxId, next.assignee, next.knoxId].map(codeKey).filter(Boolean);
  for (const code of codes) {
    const asset = database.prepare('SELECT * FROM assets WHERE code = ? COLLATE NOCASE').get(code);
    if (!asset) continue;
    const latestCustody = findLatestAssetCustodyEvent([...otherLoans, next], asset);
    if (latestCustody && latestCustody.id !== next.id) continue;
    const owner = codeKey(asset.owner);
    const inItCustody = !owner || owner === 'none' || owner === codeKey(DEFAULT_OWNER);
    if (!inItCustody && !owners.includes(owner)) continue;
    const checkedIn = received ? deviceCodes(received).some((item) => equipmentCodeMatches(item, code)) : deviceCodes(issued).some((item) => equipmentCodeMatches(item, code));
    let newOwner;
    if (checkedIn) {
      if (inItCustody) continue; // Preserve later storage-room edits on a previously returned device.
      returnAssetToIt(database, code, updated);
      newOwner = DEFAULT_OWNER;
    } else if (deviceCodes(issued).some((item) => equipmentCodeMatches(item, code))) {
      if (['Under repair', 'Retired'].includes(asset.status)) continue;
      newOwner = next.assignee || next.knoxId;
      const status = asset.status === 'Damaged' ? asset.status : custodyStatusForBorrower(next.assigneeType);
      const location = assetLocationForWrite(database, status, next.location);
      if (asset.owner === newOwner && asset.status === status && asset.location === location && asset.department === next.department) continue;
      database.prepare('UPDATE assets SET owner = ?, status = ?, location = ?, department = ?, updated = ? WHERE id = ?').run(newOwner, status, location, next.department, updated, asset.id);
    } else continue;
    database.prepare('INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      `hist-${randomUUID()}`, asset.code, asset.owner || DEFAULT_OWNER, newOwner, next.returnDate || next.returnedDate,
      'Return details corrected', checkedIn ? 'Corrected received equipment; device checked in to IT custody.' : 'Corrected received equipment; device remains outstanding.', new Date().toISOString(),
    );
  }
  return codes;
}
