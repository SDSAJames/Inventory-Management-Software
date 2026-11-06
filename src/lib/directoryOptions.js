import { getAssetLocation, normalizeLocation } from '../../shared/assetRules.js';

export function sortDirectoryOptions(items = [], direction = 'asc') {
  const factor = direction === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => factor * String(a?.name ?? a).localeCompare(String(b?.name ?? b), 'en', { numeric: true, sensitivity: 'base' }));
}

export function matchesDirectoryAsset(asset, field, name) {
  const value = field === 'location' ? getAssetLocation(asset.status, asset.location) : asset[field];
  const expected = field === 'location' ? normalizeLocation(name, '') : name;
  return String(value ?? '').trim().toLowerCase() === String(expected ?? '').trim().toLowerCase();
}

export function directoryLocationOptions(locations = [], assets = []) {
  const names = new Map();
  for (const value of [...locations, ...assets.map((asset) => getAssetLocation(asset.status, asset.location))]) {
    const name = normalizeLocation(value, '');
    if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  }
  return sortDirectoryOptions([...names.values()]);
}

export function filterDirectoryEntries(entries, search = '', direction = 'asc') {
  const query = search.trim().toLowerCase();
  return sortDirectoryOptions(entries.filter((entry) => entry.name.toLowerCase().includes(query)), direction);
}
