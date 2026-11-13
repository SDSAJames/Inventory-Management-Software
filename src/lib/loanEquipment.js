import { tracksEndDate } from '../../shared/loanRules.js';
import { normalizePcRecord, pcAssetCode } from '../../shared/pcReferences.js';
import { EQUIPMENT_FIELDS, QUANTITY_FIELDS, normalizeEquipmentQuantity, normalizeEquipmentQuantities } from '../../shared/equipment.js';
export { isBusinessTravelerType as isBusinessTraveler, tracksEndDate } from '../../shared/loanRules.js';

export const LOAN_EQUIPMENT_FIELDS = EQUIPMENT_FIELDS.map(({ key, label, placeholder }) => [label, key, placeholder]);

export function newLoanEquipmentForm() {
  return Object.fromEntries(EQUIPMENT_FIELDS.map(({ key }) => [
    key, key === 'monitor' ? '' : '0',
  ]));
}

// Keep equipment requests and their defaults consistent in every custody form.
export function updateLoanFormField(previous, field, value) {
  if (QUANTITY_FIELDS.some((item) => item.key === field)) value = normalizeEquipmentQuantity(value);
  const requestingPc = (field === 'assetCode' && value) || (field === 'requestPc' && value);
  return {
    ...previous,
    [field]: value,
    ...(requestingPc ? { requestPc: true } : {}),
    ...(requestingPc && !previous.requestPc ? {
      adapter: Number(previous.adapter) > 0 ? previous.adapter : '1',
      cable: Number(previous.cable) > 0 ? previous.cable : '1',
    } : {}),
    ...(field === 'requestPc' && !value ? { assetCode: '', adapter: '0', cable: '0' } : {}),
    ...(field === 'monitor' && value ? { requestMonitor: true } : {}),
    ...(field === 'requestMonitor' && !value ? { monitor: '' } : {}),
    ...(field === 'assigneeType' && !tracksEndDate(value) ? { endDate: '' } : {}),
    ...(field === 'pickupDate' && !value ? { returnDate: '' } : {}),
  };
}

export function equipmentToForm(equipment = {}) {
  equipment = normalizeEquipmentQuantities(equipment);
  return Object.fromEntries(EQUIPMENT_FIELDS.map(({ storageKey, key }) => [key, String(equipment[storageKey] ?? (key === 'monitor' ? '' : '0'))]));
}

/** Pickup/return controls use string values and retain explicit zero quantities. */
export function equipmentQuantitiesToForm(equipment = {}, fallback = {}) {
  equipment = normalizeEquipmentQuantities(equipment);
  fallback = normalizeEquipmentQuantities(fallback);
  return Object.fromEntries(EQUIPMENT_FIELDS.map(({ storageKey, key }) => [
    key, String(equipment[storageKey] ?? fallback[storageKey] ?? '0'),
  ]));
}

export function getLoanEndDate(loan) {
  if (!loan || !tracksEndDate(loan.assigneeType)) return '';
  return loan.endDate || loan.dueDate || '';
}

export function normalizeLoanEndDate(loan) {
  loan = normalizePcRecord(loan);
  return tracksEndDate(loan?.assigneeType)
    ? loan
    : { ...loan, endDate: '', dueDate: '' };
}

export function buildLoanEquipment(form, assetCode) {
  return normalizeEquipmentQuantities({
    Laptop: pcAssetCode(assetCode),
    ...Object.fromEntries(EQUIPMENT_FIELDS.map(({ storageKey, key }) => [storageKey, form[key]])),
  });
}

function itemCount(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 1;
}

export function buildReturnedEquipment(form) {
  return normalizeEquipmentQuantities({
    Laptop: String(form.returnedLaptopCode || '').trim(),
    ...Object.fromEntries(EQUIPMENT_FIELDS.map(({ storageKey, key }) => [storageKey, form[key]])),
    Others: form.others || '',
  });
}

export function getMissingReturnItems(equipment = {}, returnedEquipment = {}) {
  const missing = EQUIPMENT_FIELDS
    .filter(({ storageKey }) => itemCount(equipment[storageKey]) > itemCount(returnedEquipment[storageKey]))
    .map(({ returnLabel }) => returnLabel);
  const expectedLaptop = String(equipment.Laptop || '').trim();
  const returnedLaptop = String(returnedEquipment.Laptop || '').trim();
  if (expectedLaptop && expectedLaptop !== returnedLaptop) {
    missing.unshift(`Laptop (${expectedLaptop})`);
  }
  return missing;
}

export function getReturnStatus(equipment = {}, returnedEquipment = {}) {
  return getMissingReturnItems(equipment, returnedEquipment).length ? 'Partial' : 'Complete';
}
