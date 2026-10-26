const RETURN_ITEMS = [
  ['Adapter', 'Charging adapter'],
  ['Cable', 'Charging cable'],
  ['Dongle', 'Dongle / hub'],
  ['Keyboard', 'Keyboard'],
  ['Mouse', 'Mouse'],
  ['Monitor', 'Monitor'],
  ['Ethernet cable', 'Ethernet cable'],
];

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
