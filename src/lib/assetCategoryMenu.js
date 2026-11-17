import { isMesEquipment } from './equipmentSchema.js';

export function assetCategoryKey(category) {
  return String(category ?? '').trim().toLowerCase();
}

/** Combine Directory choices with categories already present in this register. */
export function assetCategoryMenu(categories = [], registerAssets = [], { mes = false } = {}) {
  const counts = new Map();
  for (const asset of registerAssets) {
    const key = assetCategoryKey(asset.category);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const entries = new Map();
  const add = (category) => {
    const name = String(category ?? '').trim();
    const key = assetCategoryKey(name);
    if (!entries.has(key)) entries.set(key, { key, name: name || 'Uncategorized', count: counts.get(key) || 0 });
  };
  for (const category of categories) {
    const name = String(category?.name ?? category ?? '').trim();
    if (name && (isMesEquipment({ category: name }) === mes || counts.has(assetCategoryKey(name)))) add(name);
  }
  registerAssets.forEach((asset) => add(asset.category));
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }));
}
