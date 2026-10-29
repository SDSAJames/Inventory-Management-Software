const RETURN_ITEMS = [
  ['Adapter', 'Charging adapter'],
  ['Cable', 'Charging cable'],
  ['Dongle', 'Dongle / hub'],
  ['Keyboard', 'Keyboard'],
  ['Mouse', 'Mouse'],
  ['Monitor', 'Monitor'],
  ['Ethernet cable', 'Ethernet cable'],
];

export const LOAN_EQUIPMENT_FIELDS = [
  ['Charging Adapter', 'adapter', 'e.g. 65W USB-C'],
  ['Charging Cable', 'cable', 'e.g. USB-C Cable'],
  ['Dongle', 'dongle', 'e.g. HDMI/USB-C Multiport'],
  ['Keyboard', 'keyboard', 'e.g. Wireless keyboard'],
  ['Mouse', 'mouse', 'e.g. Optical mouse'],
  ['Monitor asset number', 'monitor', 'e.g. SPE-MON-01'],
  ['Ethernet Cable', 'ethernetCable', 'e.g. Cat6 cable'],
];

export function isBusinessTraveler(assigneeType) {
  return String(assigneeType || 'Business traveler').trim().toLowerCase() === 'business traveler';
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
    Adapter: form.adapter,
    Cable: form.cable,
    Dongle: form.dongle,
    Keyboard: form.keyboard,
    Mouse: form.mouse,
    Monitor: form.monitor,
    'Ethernet cable': form.ethernetCable,
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
    Adapter: form.adapter,
    Cable: form.cable,
    Dongle: form.dongle,
    Keyboard: form.keyboard,
    Mouse: form.mouse,
    Monitor: form.monitor,
    'Ethernet cable': form.ethernetCable,
    Others: form.others || '',
  };
}

export function getMissingReturnItems(equipment = {}, returnedEquipment = {}) {
  const missing = RETURN_ITEMS
    .filter(([key]) => itemCount(equipment[key]) > itemCount(returnedEquipment[key]))
    .map(([, label]) => label);
  return missing;
}

export function getReturnStatus(equipment = {}, returnedEquipment = {}) {
  return getMissingReturnItems(equipment, returnedEquipment).length ? 'Partial' : 'Complete';
}
