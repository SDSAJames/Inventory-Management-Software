import test from 'node:test';
import assert from 'node:assert/strict';
import { directoryLocationOptions, matchesDirectoryAsset, filterDirectoryEntries, sortDirectoryOptions } from '../src/lib/directoryOptions.js';
import { reconcileAssetWithLoans } from '../src/lib/assetIntegrity.js';
import { normalizeDatabaseLocations } from '../src/lib/databaseLocations.js';
import { parseLoansText } from '../src/lib/txtImport.js';
import { normalizePcRecord } from '../shared/pcReferences.js';
import { getHolderReturnChanges } from '../shared/assetRules.js';

test('directory sorting and search do not mutate the underlying options', () => {
  const options = ['Room 10', 'alpha', 'Room 2'];
  assert.deepEqual(sortDirectoryOptions(options), ['alpha', 'Room 2', 'Room 10']);
  assert.deepEqual(options, ['Room 10', 'alpha', 'Room 2']);
  const entries = options.map((name) => ({ name }));
  assert.deepEqual(filterDirectoryEntries(entries, ' ROOM ', 'desc').map((entry) => entry.name), ['Room 10', 'Room 2']);
});

test('location counts and asset browsing include assigned devices and normalize legacy names', () => {
  const assets = [
    { code: 'PC-1', status: 'Assigned', location: ' Stack ' },
    { code: 'PC-2', status: 'On loan', location: 'stack' },
    { code: 'PC-3', status: 'Available', location: 'Head Office' },
    { code: 'PC-4', status: 'Assigned', location: 'New location' },
  ];
  assert.deepEqual(assets.filter((asset) => matchesDirectoryAsset(asset, 'location', 'Stack')).map((asset) => asset.code), ['PC-1', 'PC-2']);
  assert.equal(matchesDirectoryAsset(assets[2], 'location', 'IT Department'), true);
  assert.deepEqual(directoryLocationOptions(['Stack', 'Head Office'], assets), ['IT Department', 'New location', 'Stack']);
});

test('saved asset locations survive active and historical loan reconciliation', () => {
  const asset = { code: 'PC-1', status: 'Assigned', owner: 'Jane', location: 'Stack' };
  const active = { assetCode: 'PC-1', assignee: 'Jane', assigneeType: 'Employee', pickupDate: '2026-11-01', location: 'Old location' };
  assert.equal(reconcileAssetWithLoans(asset, [active]).location, 'Stack');
  const available = { ...asset, status: 'Available', owner: 'IT department' };
  assert.equal(getHolderReturnChanges(available, { owner: 'IT department', status: 'Available', location: 'Stack' }), null);
  assert.equal(reconcileAssetWithLoans(available, [{ ...active, returnDate: '2026-11-02' }]).location, 'Stack');
});

test('PC quantity 1 keeps its loan record without creating or tracking an asset', () => {
  const parsed = parseLoansText([
    ['Name', 'Knox ID', 'Laptop', 'Pickup Date'],
    ['Jane', 'jane.id', '1', '2026-11-01'],
    ['Other', 'other.id', 'SPE-1', '2026-11-01'],
  ], [], []);
  assert.equal(parsed.loans.length, 2);
  assert.equal(parsed.loans[0].assetCode, '');
  assert.equal(parsed.loans[0].equipment.RequestedPC, true);
  assert.ok(!parsed.synthesizedAssets.some((asset) => asset.code === '1'));
  assert.ok(parsed.synthesizedAssets.some((asset) => asset.code === 'SPE-1'));
  const cached = normalizeDatabaseLocations({ assets: [{ code: '1' }, { code: 'SPE-1' }], loans: [{ assetCode: '1', equipment: { Laptop: '1', Keyboard: '2' } }], locations: [] });
  assert.deepEqual(cached.assets.map((asset) => asset.code), ['SPE-1']);
  assert.equal(cached.loans[0].assetCode, '');
  assert.equal(cached.loans[0].equipment.Laptop, '');
  assert.equal(cached.loans[0].equipment.Keyboard, '2');
  assert.equal(normalizePcRecord({ assetCode: 'SPE-1' }).assetCode, 'SPE-1');
});
