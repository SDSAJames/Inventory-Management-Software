import { EQUIPMENT_FIELDS, DEVICE_KEYS, EQUIPMENT_KEYS } from './equipment.js';

export function equipmentCodeMatches(left, right) {
  const expected = String(left ?? '').trim();
  const received = String(right ?? '').trim();
  return Boolean(expected && received) && expected.toLowerCase() === received.toLowerCase();
}

function itemCount(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const number = Number(text);
  return Number.isFinite(number) ? Math.max(0, number) : 1;
}

/** Shared check-in accounting for API edits and every returned-quantity control. */
export function getMissingReturnItems(equipment = {}, returnedEquipment = {}) {
  const missing = EQUIPMENT_FIELDS.filter(({ storageKey }) => {
    const issued = equipment[storageKey];
    if (!itemCount(issued)) return false;
    return DEVICE_KEYS.includes(storageKey)
      ? !equipmentCodeMatches(issued, returnedEquipment[storageKey])
      : itemCount(issued) > itemCount(returnedEquipment[storageKey]);
  }).map(({ returnLabel, storageKey }) => {
    const value = String(equipment[storageKey] ?? '').trim();
    return DEVICE_KEYS.includes(storageKey) && value ? `${returnLabel} (${value})` : returnLabel;
  });
  const laptop = String(equipment.Laptop ?? '').trim();
  if (laptop && laptop !== '0' && laptop !== '1' && !equipmentCodeMatches(laptop, returnedEquipment.Laptop)) missing.unshift(`Laptop (${laptop})`);
  const others = String(equipment.Others ?? '').trim();
  if (others && others !== '0' && !equipmentCodeMatches(others, returnedEquipment.Others)) missing.push('Others / Peripherals');
  return missing;
}

export function getReturnStatus(equipment = {}, returnedEquipment = {}) {
  return getMissingReturnItems(equipment, returnedEquipment).length ? 'Partial' : 'Complete';
}

/** Separate a checked-in portion from the still-out portion of a custody record. */
export function splitReturnedEquipment(equipment = {}, returnedEquipment = {}) {
  const itemKeys = new Set(EQUIPMENT_KEYS);
  const returned = Object.fromEntries(Object.entries(equipment).filter(([key]) => !itemKeys.has(key)));
  const remaining = Object.fromEntries(Object.entries(equipment).filter(([key]) => !itemKeys.has(key)));
  const issuedItems = { ...equipment, Laptop: equipment.Laptop || '' };
  for (const key of EQUIPMENT_KEYS) {
    const issued = String(issuedItems[key] ?? '').trim();
    const received = String(returnedEquipment[key] ?? '').trim();
    if (!issued || issued === '0') {
      if (received && received !== '0') returned[key] = received;
      continue;
    }
    if (DEVICE_KEYS.includes(key)) {
      if (received && received !== '0') returned[key] = received;
      if (!equipmentCodeMatches(issued, received)) remaining[key] = issued;
      continue;
    }
    if (key === 'Others') {
      if (received && received !== '0') returned[key] = received;
      if (!equipmentCodeMatches(issued, received)) remaining[key] = issued;
      continue;
    }
    const issuedCount = itemCount(issued), receivedCount = itemCount(received);
    if (receivedCount > 0) returned[key] = String(Math.min(issuedCount, receivedCount));
    if (issuedCount > receivedCount) remaining[key] = String(issuedCount - receivedCount);
  }
  const hasRemaining = EQUIPMENT_KEYS.some((key) => {
    const value = String(remaining[key] ?? '').trim();
    return value && value !== '0';
  });
  return { returned, remaining, hasRemaining };
}
