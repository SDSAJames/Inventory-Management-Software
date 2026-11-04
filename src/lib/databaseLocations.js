import { getAssetLocation, normalizeLocation } from '../../shared/assetRules.js';
import { REPAIR_LOCATION } from '../../shared/referenceData.js';

/** Keep the local cache, imports, and server snapshots on the same location rules. */
export function normalizeDatabaseLocations(database) {
  if (!database) return database;
  const normalizeRows = (rows, locationFor) => {
    let changed = false;
    const normalized = (rows || []).map((row) => {
      const location = locationFor(row);
      if (location === row.location) return row;
      changed = true;
      return { ...row, location };
    });
    return changed ? normalized : rows;
  };
  const assets = normalizeRows(database.assets, (asset) => getAssetLocation(asset.status, asset.location));
  const loans = normalizeRows(database.loans, (loan) => normalizeLocation(loan.location, ''));
  const locations = [...new Set((database.locations || []).map((location) => normalizeLocation(location, '')).filter(Boolean))];
  if ((assets || []).some((asset) => asset.status === 'Under repair') && !locations.includes(REPAIR_LOCATION)) {
    locations.push(REPAIR_LOCATION);
  }
  const locationsChanged = locations.length !== (database.locations || []).length ||
    locations.some((location, index) => location !== database.locations[index]);
  if (assets === database.assets && loans === database.loans && !locationsChanged) return database;
  return { ...database, assets, loans, locations: locationsChanged ? locations : database.locations };
}
