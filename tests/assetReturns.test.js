import test from 'node:test';
import assert from 'node:assert/strict';
import { getHolderReturnChanges } from '../shared/assetRules.js';
import { isAssetReturnedOnRecord, recordAssetReturn } from '../shared/assetReturns.js';
import { reconcileAssetWithLoans } from '../src/lib/assetIntegrity.js';

test('holder removal means IT custody only for an explicit edit of a held asset', () => {
  const asset = { owner: 'Jane', status: 'Assigned', location: 'Stack' };
  assert.deepEqual(getHolderReturnChanges(asset, { owner: '' }), { owner: 'IT department', status: 'Available', department: '', location: 'IT Department' });
  assert.equal(getHolderReturnChanges(asset, { notes: 'Update' }), null);
  assert.equal(getHolderReturnChanges(asset, { owner: 'Alex' }), null);
  assert.equal(getHolderReturnChanges({ ...asset, owner: '' }, { owner: '' }), null);
  assert.equal(getHolderReturnChanges({ ...asset, status: 'Under repair' }, { owner: '' }).location, 'service center');
});

test('returning one monitor does not return the PC and survives asset reconciliation', () => {
  const loan = { assetCode: 'PC-1', assignee: 'Jane', assigneeType: 'Employee', pickupDate: '2026-11-01', status: 'Active', equipment: { Laptop: 'PC-1', Monitor: 'MON-1', Keyboard: 1 } };
  const returned = recordAssetReturn(loan, 'MON-1', '2026-11-04');
  assert.equal(returned.status, 'Active');
  assert.equal(returned.returnDate, undefined);
  assert.equal(returned.returnedEquipment.Laptop, undefined);
  assert.equal(isAssetReturnedOnRecord(returned, 'MON-1'), true);
  assert.equal(loan.returnedEquipment, undefined);
  const monitor = { code: 'MON-1', owner: 'IT department', status: 'Available', location: 'IT Department' };
  assert.equal(reconcileAssetWithLoans(monitor, [returned]).owner, 'IT department');
  const pcReturn = recordAssetReturn(returned, 'PC-1', '2026-11-05');
  assert.equal(pcReturn.status, 'Returned');
  assert.equal(pcReturn.returnStatus, 'Partial');
  assert.equal(pcReturn.returnedEquipment.Keyboard, undefined);
  assert.equal(recordAssetReturn({ ...loan, pickupDate: '', status: 'Scheduled' }, 'PC-1', '2026-11-04').status, 'Scheduled');
});
