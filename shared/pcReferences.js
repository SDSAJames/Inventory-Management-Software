import { normalizeEquipmentQuantities } from './equipment.js';
/** A standalone 1 in the PC column is a quantity, never an asset tag. */
export function pcAssetCode(value) {
  const code = String(value ?? '').trim();
  return code === '1' ? '' : code;
}

export function normalizePcRecord(record) {
  if (!record) return record;
  const equipment = normalizeEquipmentQuantities(record.equipment);
  const returnedEquipment = normalizeEquipmentQuantities(record.returnedEquipment);
  if (equipment !== record.equipment || returnedEquipment !== record.returnedEquipment) {
    record = { ...record, ...(equipment ? { equipment } : {}), ...(returnedEquipment ? { returnedEquipment } : {}) };
  }
  const quantityOnly = String(record.assetCode ?? record.asset_code ?? '').trim() === '1' || String(record.equipment?.Laptop ?? '').trim() === '1';
  if (!quantityOnly) return record;
  return {
    ...record,
    assetCode: pcAssetCode(record.assetCode || record.asset_code || record.equipment?.Laptop),
    ...(Object.hasOwn(record, 'asset_code') ? { asset_code: pcAssetCode(record.asset_code) } : {}),
    equipment: { ...record.equipment, Laptop: pcAssetCode(record.equipment?.Laptop || record.assetCode || record.asset_code), RequestedPC: true },
  };
}
