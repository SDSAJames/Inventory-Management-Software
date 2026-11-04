import { isBusinessTravelerType as isBusinessTraveler } from '../../shared/loanRules.js';
export { isBusinessTravelerType as isBusinessTraveler } from '../../shared/loanRules.js';

// Storage keys, form keys, labels, and return descriptions live together so
// create/edit forms and return accounting use the same equipment schema.
const EQUIPMENT_FIELDS = [
  ['Adapter', 'adapter', 'Charging Adapter', 'e.g. 65W USB-C', 'Charging adapter'],
  ['Cable', 'cable', 'Charging Cable', 'e.g. USB-C Cable', 'Charging cable'],
  ['Dongle', 'dongle', 'Dongle', 'e.g. HDMI/USB-C Multiport', 'Dongle / hub'],
  ['Keyboard', 'keyboard', 'Keyboard', 'e.g. Wireless keyboard', 'Keyboard'],
  ['Mouse', 'mouse', 'Mouse', 'e.g. Optical mouse', 'Mouse'],
  ['Monitor', 'monitor', 'Monitor asset number', 'e.g. SPE-MON-01', 'Monitor'],
  ['Ethernet cable', 'ethernetCable', 'Ethernet Cable', 'e.g. Cat6 cable', 'Ethernet cable'],
];

export const LOAN_EQUIPMENT_FIELDS = EQUIPMENT_FIELDS.map(([, key, label, placeholder]) => [label, key, placeholder]);

export function equipmentToForm(equipment = {}) {
  return Object.fromEntries(EQUIPMENT_FIELDS.map(([storageKey, formKey]) => [formKey, equipment[storageKey] || '']));
}

/** Pickup/return controls use string values and retain explicit zero quantities. */
export function equipmentQuantitiesToForm(equipment = {}, fallback = {}) {
  return Object.fromEntries(EQUIPMENT_FIELDS.map(([storageKey, formKey]) => [
    formKey, String(equipment[storageKey] ?? fallback[storageKey] ?? '0'),
  ]));
}

export function getLoanEndDate(loan) {
  if (!loan || !isBusinessTraveler(loan.assigneeType)) return '';
  return loan.endDate || loan.dueDate || '';
}

export function normalizeLoanEndDate(loan) {
  return isBusinessTraveler(loan?.assigneeType)
    ? loan
    : { ...loan, endDate: '', dueDate: '' };
}

export function buildLoanEquipment(form, assetCode) {
  return {
    Laptop: assetCode,
    ...Object.fromEntries(EQUIPMENT_FIELDS.map(([storageKey, formKey]) => [storageKey, form[formKey]])),
  };
}

function itemCount(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 1;
}

export function buildReturnedEquipment(form) {
  return {
    Laptop: String(form.returnedLaptopCode || '').trim(),
    ...Object.fromEntries(EQUIPMENT_FIELDS.map(([storageKey, formKey]) => [storageKey, form[formKey]])),
    Others: form.others || '',
  };
}

export function getMissingReturnItems(equipment = {}, returnedEquipment = {}) {
  const missing = EQUIPMENT_FIELDS
    .filter(([key]) => itemCount(equipment[key]) > itemCount(returnedEquipment[key]))
    .map(([, , , , label]) => label);
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
