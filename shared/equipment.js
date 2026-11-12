/** Common field metadata for entry, handover, return, transfer, and detail views. */
export const EQUIPMENT_FIELDS = [
  { storageKey: 'Adapter', key: 'adapter', label: 'Charging Adapter', returnLabel: 'Charging adapter', placeholder: 'e.g. 65W USB-C', icon: '🔌', description: 'Power brick', panelOrder: 2 },
  { storageKey: 'Cable', key: 'cable', label: 'Charging Cable', returnLabel: 'Charging cable', placeholder: 'e.g. USB-C Cable', icon: '⚡', description: 'AC power cable', panelOrder: 3 },
  { storageKey: 'Dongle', key: 'dongle', label: 'Dongle', returnLabel: 'Dongle / hub', placeholder: 'e.g. HDMI/USB-C Multiport', icon: '🔄', description: 'USB-C multi-adapter', panelOrder: 4 },
  { storageKey: 'Keyboard', key: 'keyboard', label: 'Keyboard', returnLabel: 'Keyboard', placeholder: 'e.g. Wireless keyboard', icon: '⌨️', description: 'External keyboard', panelOrder: 0, highlighted: true },
  { storageKey: 'Mouse', key: 'mouse', label: 'Mouse', returnLabel: 'Mouse', placeholder: 'e.g. Optical mouse', icon: '🖱️', description: 'Wireless / wired mouse', panelOrder: 1, highlighted: true },
  { storageKey: 'Monitor', key: 'monitor', label: 'Monitor asset number', returnLabel: 'Monitor', placeholder: 'e.g. SPE-MON-01', icon: '🖥️', description: 'Monitor asset number', panelOrder: 5, kind: 'asset' },
  { storageKey: 'Ethernet cable', key: 'ethernetCable', label: 'Ethernet Cable', returnLabel: 'Ethernet cable', placeholder: 'e.g. Cat6 cable', icon: '🌐', description: 'LAN RJ45', panelOrder: 6 },
];

export const DEVICE_KEYS = ['Laptop', 'Monitor'];
export const EQUIPMENT_KEYS = ['Laptop', ...EQUIPMENT_FIELDS.map((field) => field.storageKey), 'Others'];

export const QUANTITY_FIELDS = EQUIPMENT_FIELDS.filter((field) => field.kind !== 'asset');

/** Canonicalize counts without changing asset tags, free text or legacy descriptions. */
export function normalizeEquipmentQuantity(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return value;
  return value.trim().replace(/^0+(?=\d)/, '');
}

export function normalizeEquipmentQuantities(equipment) {
  if (!equipment) return equipment;
  let result = equipment;
  for (const { storageKey } of QUANTITY_FIELDS) {
    const value = normalizeEquipmentQuantity(equipment[storageKey]);
    if (value !== equipment[storageKey]) {
      if (result === equipment) result = { ...equipment };
      result[storageKey] = value;
    }
  }
  return result;
}
