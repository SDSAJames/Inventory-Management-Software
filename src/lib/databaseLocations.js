import { getAssetLocation, normalizeLocation, normalizeAvailableAsset } from '../../shared/assetRules.js';
import { REPAIR_LOCATION } from '../../shared/referenceData.js';
import { normalizePcRecord } from '../../shared/pcReferences.js';

export function remapDatabaseLocation(database, oldName, newName) {
  const key = (name) => normalizeLocation(name, '').toLowerCase();
  const matches = (name) => key(name) === key(oldName);
  const remap = (row) => matches(row.location) ? { ...row, location: newName } : row;
  const locations = new Map();
  for (const name of [...(database.locations || []), newName]) {
    const value = matches(name) || key(name) === key(newName) ? newName : name;
    locations.set(key(value), value);
  }
  return { ...database, assets: (database.assets || []).map(remap), loans: (database.loans || []).map(remap), locations: [...locations.values()] };
}

/** Keep the local cache, imports, and server snapshots on the same location rules. */
export function normalizeDatabaseLocations(database) {
  if (!database) return database;
  const normalizeRows = (rows, locationFor, normalize = (row) => row) => {
    let changed = false;
    const normalized = (rows || []).map((row) => {
      const normalizedRow = normalize(row);
      const location = locationFor(normalizedRow);
      if (location === row.location && normalizedRow === row) return row;
      changed = true;
      return { ...normalizedRow, location };
    });
    return changed ? normalized : rows;
  };
  const trackedAssets = database.assets?.some((asset) => String(asset.code).trim() === '1') ? database.assets.filter((asset) => String(asset.code).trim() !== '1') : database.assets;
  const assets = normalizeRows(trackedAssets, (asset) => getAssetLocation(asset.status, asset.location), normalizeAvailableAsset);
  const loans = normalizeRows(database.loans, (loan) => normalizeLocation(loan.location, ''), normalizePcRecord);
  const locations = [...new Set([
    ...(database.locations || []),
    ...(assets || []).map((asset) => asset.location),
  ].map((location) => normalizeLocation(location, '')).filter(Boolean))];
  if ((assets || []).some((asset) => asset.status === 'Under repair') && !locations.includes(REPAIR_LOCATION)) {
    locations.push(REPAIR_LOCATION);
  }
  const locationsChanged = locations.length !== (database.locations || []).length ||
    locations.some((location, index) => location !== database.locations[index]);
  if (assets === database.assets && loans === database.loans && !locationsChanged) return database;
  return { ...database, assets, loans, locations: locationsChanged ? locations : database.locations };
}
