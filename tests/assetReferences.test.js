import test from 'node:test';
import assert from 'node:assert/strict';
import { renameLoanAssetReferences } from '../shared/assetReferences.js';

test('renaming an asset updates only exact PC and monitor references without mutating history', () => {
  const original = { assetCode: 'PC-1', equipment: { Laptop: 'PC-1', Monitor: ' mon-1 ', Mouse: 1 }, returnedEquipment: { Monitor: 'MON-1', Laptop: 'PC-1' }, note: 'MON-1 was issued', serial: 'MON-1' };
  const renamed = renameLoanAssetReferences(original, 'MON-1', 'MON-2');
  assert.equal(renamed.assetCode, 'PC-1');
  assert.equal(renamed.equipment.Monitor, 'MON-2');
  assert.equal(renamed.returnedEquipment.Monitor, 'MON-2');
  assert.equal(renamed.note, original.note);
  assert.equal(renamed.serial, original.serial);
  assert.equal(original.equipment.Monitor, ' mon-1 ');
  assert.equal(renameLoanAssetReferences(original, 'MON', 'NEW'), original);
  assert.equal(renameLoanAssetReferences({ asset_code: 'old' }, 'OLD', 'new').asset_code, 'new');
});
