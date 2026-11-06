import { randomUUID } from 'node:crypto';
import { DEFAULT_LOCATION, REPAIR_LOCATION } from '../../shared/referenceData.js';
import { getAssetLocation, normalizeLocation } from '../../shared/assetRules.js';

export function ensureLocation(database, name) {
  name = normalizeLocation(name, '');
  if (!name) return;
  const existing = database.prepare('SELECT id FROM locations WHERE LOWER(TRIM(name)) = LOWER(?)').get(name);
  if (!existing) {
    database.prepare('INSERT INTO locations (id, name) VALUES (?, ?)').run(`loc-${randomUUID()}`, name);
  }
}

/** Rename or merge a location and all relational references as one transaction. */
export function renameDirectoryLocation(database, reference, requestedName) {
  const key = (value) => normalizeLocation(value, '').toLowerCase();
  const name = normalizeLocation(requestedName, '');
  if (!name) {
    const error = new Error('Location name is required.'); error.status = 400; throw error;
  }
  const rows = database.prepare('SELECT id, name FROM locations').all();
  const byId = rows.find((row) => row.id === reference);
  const previousName = normalizeLocation(byId?.name || reference, '');
  const previousKey = key(previousName);
  const sourceRows = rows.filter((row) => key(row.name) === previousKey);
  const destinations = rows.filter((row) => key(row.name) === key(name) && key(row.name) !== previousKey);
  const destination = destinations.find((row) => row.name === name) || destinations[0];
  const targetName = destination ? normalizeLocation(destination.name, '') : name;
  const related = (row) => key(row.location) === previousKey || (destination && key(row.location) === key(targetName));
  const assets = database.prepare('SELECT id, location FROM assets').all().filter(related);
  const loans = database.prepare('SELECT id, location FROM loans').all().filter(related);
  if (!sourceRows.length && !assets.some((row) => key(row.location) === previousKey) && !loans.some((row) => key(row.location) === previousKey)) {
    const error = new Error('Location not found.'); error.status = 404; throw error;
  }
  const targetId = destination?.id || sourceRows[0]?.id || `loc-${randomUUID()}`;
  database.exec('SAVEPOINT rename_location');
  try {
    for (const row of [...sourceRows, ...destinations]) {
      if (row.id !== targetId) database.prepare('DELETE FROM locations WHERE id = ?').run(row.id);
    }
    if (destination || sourceRows.length) database.prepare('UPDATE locations SET name = ? WHERE id = ?').run(targetName, targetId);
    else database.prepare('INSERT INTO locations (id, name) VALUES (?, ?)').run(targetId, targetName);
    for (const row of assets) database.prepare('UPDATE assets SET location = ? WHERE id = ?').run(targetName, row.id);
    for (const row of loans) database.prepare('UPDATE loans SET location = ? WHERE id = ?').run(targetName, row.id);
    database.exec('RELEASE SAVEPOINT rename_location');
  } catch (error) {
    database.exec('ROLLBACK TO SAVEPOINT rename_location'); database.exec('RELEASE SAVEPOINT rename_location'); throw error;
  }
  return { location: { id: targetId, name: targetName }, previousName, merged: Boolean(destination), updatedAssets: assets.length, updatedLoans: loans.length };
}

/** Remove unused directory entries, including stale names known only to a cache. */
export function deleteUnusedLocation(database, reference) {
  const value = String(reference || '').trim();
  const key = normalizeLocation(value, '').toLowerCase();
  const rows = database.prepare('SELECT id, name FROM locations').all().filter((row) =>
    row.id === value || normalizeLocation(row.name, '').toLowerCase() === key);
  const name = normalizeLocation(rows[0]?.name || value, '');
  const used = database.prepare('SELECT code, status, location FROM assets').all().filter((asset) =>
    String(asset.code).trim() !== '1' && getAssetLocation(asset.status, asset.location).toLowerCase() === name.toLowerCase()).length;
  if (used) {
    const error = new Error(`Cannot remove ${name}; it is assigned to ${used} asset${used === 1 ? '' : 's'}.`);
    error.status = 409;
    throw error;
  }
  database.exec('SAVEPOINT delete_location');
  try {
    for (const row of rows) database.prepare('DELETE FROM locations WHERE id = ?').run(row.id);
    database.exec('RELEASE SAVEPOINT delete_location');
  } catch (error) {
    database.exec('ROLLBACK TO SAVEPOINT delete_location');
    database.exec('RELEASE SAVEPOINT delete_location');
    throw error;
  }
  return { name, ids: rows.map((row) => row.id) };
}

/** Resolve the shared rule and register the automatic destination for dropdowns. */
export function assetLocationForWrite(database, status, location, fallback = DEFAULT_LOCATION) {
  const resolved = getAssetLocation(status, location, fallback);
  if (resolved === REPAIR_LOCATION) ensureLocation(database, REPAIR_LOCATION);
  return resolved;
}

/** Idempotent migration of current data; stored audit history and snapshots stay intact. */
export function normalizeStoredLocations(database) {
  database.exec('SAVEPOINT normalize_locations;');
  try {
    normalizeLocationRecords(database);
    database.exec('RELEASE SAVEPOINT normalize_locations;');
  } catch (error) {
    database.exec('ROLLBACK TO SAVEPOINT normalize_locations;');
    database.exec('RELEASE SAVEPOINT normalize_locations;');
    throw error;
  }
}

function normalizeLocationRecords(database) {
  const canonicalNames = new Map([
    ['head office', DEFAULT_LOCATION],
    [DEFAULT_LOCATION.toLowerCase(), DEFAULT_LOCATION],
    [REPAIR_LOCATION.toLowerCase(), REPAIR_LOCATION],
  ]);
  const groups = new Map();
  for (const row of database.prepare('SELECT id, name FROM locations').all()) {
    const name = canonicalNames.get(row.name.trim().toLowerCase()) || row.name.trim();
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  for (const [name, rows] of groups) {
    const keep = rows.find((row) => row.name === name) || rows[0];
    for (const row of rows) {
      if (row.id !== keep.id) database.prepare('DELETE FROM locations WHERE id = ?').run(row.id);
    }
    if (keep.name !== name) database.prepare('UPDATE locations SET name = ? WHERE id = ?').run(name, keep.id);
  }
  ensureLocation(database, DEFAULT_LOCATION);

  const updateAsset = database.prepare('UPDATE assets SET location = ? WHERE id = ?');
  for (const asset of database.prepare('SELECT id, status, location FROM assets').all()) {
    const location = assetLocationForWrite(database, asset.status, asset.location, asset.location);
    if (location !== asset.location) updateAsset.run(location, asset.id);
  }
  const updateLoan = database.prepare('UPDATE loans SET location = ? WHERE id = ?');
  for (const loan of database.prepare('SELECT id, location FROM loans').all()) {
    const location = normalizeLocation(loan.location, loan.location);
    if (location !== loan.location) updateLoan.run(location, loan.id);
  }
}
