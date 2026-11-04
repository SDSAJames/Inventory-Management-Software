export const TRANSFER_ITEMS = ['Laptop', 'Adapter', 'Cable', 'Dongle', 'Keyboard', 'Mouse', 'Monitor', 'Ethernet cable', 'Others'];

/** A schedule's equipment describes planned pickup, not additional held quantities. */
export function equipmentForTransferredPickup(planned, transferred) {
  for (const key of ['Laptop', 'Monitor']) {
    const hasPlannedCode = planned[key] && (key === 'Laptop' || !Number.isFinite(Number(planned[key])));
    if (hasPlannedCode && transferred[key] && String(planned[key]) !== String(transferred[key])) {
      throw new Error(`The selected schedule specifies a different ${key}; edit the schedule first`);
    }
  }
  return { RequestedPC: Boolean(planned.RequestedPC), RequestedMonitor: Boolean(planned.RequestedMonitor), ...transferred, PickupMethod: 'Transfer' };
}
export function splitLoanEquipment(equipment, selection) {
  const remaining = { ...equipment }, transferred = {};
  for (const key of TRANSFER_ITEMS) {
    const requested = String(selection[key] ?? '').trim();
    if (!requested || requested === '0') continue;
    const available = String(equipment[key] ?? '').trim();
    if (!available || available === '0') throw new Error(`${key} is not held on this loan`);
    const count = Number(available), amount = Number(requested);
    if (!['Laptop', 'Monitor'].includes(key) && Number.isFinite(count) && Number.isFinite(amount)) {
      if (amount <= 0 || amount > count || !Number.isInteger(amount)) throw new Error(`Invalid ${key} quantity`);
      remaining[key] = String(count - amount); transferred[key] = requested;
    } else {
      if (requested !== available) throw new Error(`Select the recorded ${key}`);
      remaining[key] = ''; transferred[key] = available;
    }
  }
  if (!Object.keys(transferred).length) throw new Error('Select at least one item to transfer');
  return { remaining, transferred, complete: !TRANSFER_ITEMS.some((key) => remaining[key] && String(remaining[key]) !== '0') };
}
