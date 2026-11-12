import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoanForm, loanFormErrors, buildLoanFormData, createLoanReturnForm, buildLoanReturnDetails } from '../src/lib/loanForms.js';
import { updateLoanFormField } from '../src/lib/loanEquipment.js';
import { DEFAULT_LOCATION } from '../shared/referenceData.js';
import { EQUIPMENT_FIELDS, EQUIPMENT_KEYS } from '../shared/equipment.js';
import { TRANSFER_ITEMS } from '../shared/loanTransfer.js';
import { enrichCustodyRecords } from '../src/lib/custodyRecords.js';

test('create and edit share defaults and persist explicit quantities, request flags and custom fields', () => {
  let form = createLoanForm();
  assert.equal(form.department, '');
  assert.equal(form.adapter, '0');
  assert.equal(form.pickupDate, '');
  form = updateLoanFormField(form, 'requestPc', true);
  assert.equal(form.adapter, '1');
  assert.equal(form.cable, '1');
  Object.assign(form, { knoxId: ' user.id ', assignee: ' Jane ', assetCode: 'PC-1', monitor: 'MON-1', adapter: '0', cable: '2', department: 'Custom team', others: 'Headset' });
  const first = buildLoanFormData(form);
  assert.equal(first.location, '');
  assert.equal(buildLoanFormData({ ...form, pickupDate: '2026-11-12' }).location, DEFAULT_LOCATION);
  assert.equal(first.equipment.Adapter, '0');
  assert.equal(first.equipment.Cable, '2');
  assert.equal(first.equipment.RequestedPC, true);
  assert.equal(first.equipment.RequestedMonitor, true);
  const edit = createLoanForm({ ...first, equipment: { ...first.equipment, PickupMethod: 'Transfer' } });
  const saved = buildLoanFormData(edit, { equipment: { ...first.equipment, PickupMethod: 'Transfer' }, includeReturn: true });
  for (const key of ['assetCode', 'knoxId', 'assignee', 'department', 'others', 'pickupDate', 'location']) assert.equal(saved[key], first[key]);
  assert.equal(saved.equipment.PickupMethod, 'Transfer');
  assert.equal(saved.equipment.Adapter, '0');
  assert.equal(saved.equipment.Monitor, 'MON-1');
});

test('shared form validation accepts optional names and enforces traveler dates, IPs and device categories', () => {
  const form = { ...createLoanForm(), knoxId: 'person', startDate: '2026-11-06', endDate: '2026-11-05' };
  assert.ok(loanFormErrors(form).endDate);
  assert.ok(!loanFormErrors({ ...form, assigneeType: 'Employee' }).endDate);
  assert.ok(!loanFormErrors({ ...form, endDate: '', assignee: '' }).assignee);
  assert.ok(loanFormErrors({ ...form, ipSubnet: '999' }).ip);
  const assets = [{ code: 'MON-1', category: 'Monitor' }, { code: 'PC-1', category: 'Laptop' }];
  assert.ok(loanFormErrors({ ...form, assetCode: 'MON-1', monitor: 'PC-1' }, { assets, validateDevices: true }).assetCode);
  assert.ok(loanFormErrors({ ...form, monitor: 'PC-1' }, { assets, validateDevices: true }).monitor);
  assert.ok(loanFormErrors({ ...form, pickedUp: true }, { confirmPickup: true }).pickupDate);
});

test('all return entry points preserve partial returns and exact device identifiers', () => {
  const loan = { assetCode: 'PC-1', equipment: { Laptop: 'PC-1', Monitor: 'MON-1', Keyboard: '2', Dongle: '1' }, others: 'Headset' };
  const form = createLoanReturnForm(loan, '2026-11-06T10:00');
  assert.equal(buildLoanReturnDetails(loan, form).details.returnStatus, 'Complete');
  const partial = { ...form, keyboard: '1', dongle: '0', monitor: '' };
  const { details, missingItems } = buildLoanReturnDetails(loan, partial);
  assert.equal(details.returnedEquipment.Laptop, 'PC-1');
  assert.deepEqual(missingItems, ['Dongle / hub', 'Keyboard', 'Monitor']);
  assert.equal(details.returnStatus, 'Partial');
  assert.equal(details.others, 'Headset');
  const reopened = createLoanReturnForm({ ...loan, returnedEquipment: details.returnedEquipment }, '2026-11-07T11:00');
  assert.equal(reopened.dongle, '0');
  assert.equal(reopened.keyboard, '1');
  assert.equal(reopened.monitor, '');
});

test('equipment controls and transfers use one complete schema', () => {
  assert.equal(new Set(EQUIPMENT_FIELDS.map((field) => field.key)).size, 7);
  assert.deepEqual(TRANSFER_ITEMS, EQUIPMENT_KEYS);
  const quantityOnly = buildLoanFormData({ ...createLoanForm(), assetCode: '1', knoxId: 'user', requestPc: true });
  assert.equal(quantityOnly.assetCode, '');
  assert.equal(quantityOnly.equipment.Laptop, '');
  assert.equal(quantityOnly.equipment.RequestedPC, true);
});

test('calendar and traveler records use the same custody state and asset lookup', () => {
  const records = enrichCustodyRecords([
    { id: 'scheduled', assetCode: ' PC-1 ', assigneeType: 'Business traveler', endDate: '2001-01-01' },
    { id: 'picked', assetCode: 'PC-1', assigneeType: 'Business traveler', pickupDate: '2000-01-01', endDate: '2001-01-01' },
    { id: 'employee', assigneeType: 'Employee', pickupDate: '2000-01-01', endDate: '2001-01-01' },
    { id: 'returned', assigneeType: 'Business traveler', pickupDate: '2000-01-01', endDate: '2001-01-01', returnDate: '2001-01-02' },
  ], [{ code: 'PC-1', model: 'Latitude', location: 'Stack' }]);
  assert.equal(records[0].computedStatus, 'Scheduled');
  assert.equal(records[0].tripStatus, 'Scheduled');
  assert.equal(records[0].isOverdue, false);
  assert.equal(records[0].assetModel, 'Latitude');
  assert.equal(records[0].location, '');
  assert.equal(records[1].location, 'Stack');
  assert.equal(records[1].computedStatus, 'Overdue');
  assert.equal(records[2].computedStatus, 'In Field');
  assert.equal(records[2].inIso, '');
  assert.equal(records[3].computedStatus, 'Returned');
  assert.equal(records[3].isOverdue, false);
  assert.equal(records[3].inIso, '2001-01-02');
});

test('scheduled location stays blank through forms and calendar enrichment even when a PC has a location', () => {
  const form = { ...createLoanForm(), knoxId: 'schedule.user', assetCode: 'PC-1', location: '  ' };
  const payload = buildLoanFormData(form);
  assert.equal(payload.location, '');
  assert.equal(createLoanForm(payload).location, '');
  const [displayed] = enrichCustodyRecords([payload], [{ code: 'PC-1', location: 'IT Office' }]);
  assert.equal(displayed.location, '');
});
