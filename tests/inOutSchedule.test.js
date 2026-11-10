import test from 'node:test';
import assert from 'node:assert/strict';
import { indexInOutSchedule, scheduleForDay, filterCalendarRecords } from '../src/lib/inOutSchedule.js';
import { canRecordReturn } from '../shared/loanRules.js';
import { groupLoans } from '../src/lib/loanSelectors.js';

test('hide-returned filters calendar events and day details without removing scheduled or active records', () => {
  const day = '2026-11-06';
  const records = [
    { id: 'scheduled', outIso: day },
    { id: 'active', pickupDate: '2026-11-01', inIso: day },
    { id: 'returned', returnDate: day, inIso: day },
    { id: 'legacy', returned_date: day, inIso: day },
    { id: 'derived', isReturned: true, inIso: day },
  ];
  assert.equal(filterCalendarRecords(records, false), records);
  const filtered = filterCalendarRecords(records, true);
  assert.deepEqual(filtered.map((record) => record.id), ['scheduled', 'active']);
  const events = scheduleForDay(indexInOutSchedule(filtered), day);
  assert.deepEqual(events.outgoing.map((record) => record.id), ['scheduled']);
  assert.deepEqual(events.incoming.map((record) => record.id), ['active']);
  assert.equal(scheduleForDay(indexInOutSchedule(filterCalendarRecords(records, false)), day).incoming.length, 4);
});

test('outgoing schedules exclude actual pickups, completed transfers and returns', () => {
  const day = '2026-11-05';
  const records = [
    { id: 'employee', assigneeType: 'Employee', outIso: day },
    { id: 'traveler', assigneeType: 'Business traveler', outIso: day },
    { id: 'picked', outIso: day, pickupDate: day, inIso: '2026-11-06' },
    { id: 'transferred', outIso: day, status: 'Transferred', isArchived: true },
    { id: 'returned', outIso: day, status: 'Returned', returnDate: day },
  ];
  const index = indexInOutSchedule(records);
  assert.deepEqual(scheduleForDay(index, day).outgoing.map((record) => record.id), ['employee', 'traveler']);
  assert.deepEqual(scheduleForDay(index, '2026-11-06').incoming.map((record) => record.id), ['picked']);
  const updated = indexInOutSchedule(records.map((record) => record.id === 'employee' ? { ...record, pickupDate: day } : record));
  assert.deepEqual(scheduleForDay(updated, day).outgoing.map((record) => record.id), ['traveler']);
  assert.equal(scheduleForDay(updated, day, (record) => record.assigneeType === 'Employee').outgoing.length, 0);
});

test('a schedule must complete pickup before return, while historical returns stay editable', () => {
  assert.equal(canRecordReturn({ status: 'Scheduled', startDate: '2026-11-05' }), false);
  assert.equal(canRecordReturn({ status: 'Scheduled', readyForPickup: true }), false);
  assert.equal(canRecordReturn({ pickupDate: '2026-11-05' }), true);
  assert.equal(canRecordReturn({ pickup_date: '2026-11-05' }), true);
  assert.equal(canRecordReturn({ return_date: '2026-11-01' }), true);
});

test('a return date excludes a record from Overdue even if its stored status is stale', () => {
  const records = [
    { id: 'due', status: 'Overdue', pickupDate: '2000-01-01', endDate: '2001-01-01' },
    { id: 'returned', status: 'Overdue', pickupDate: '2000-01-01', endDate: '2001-01-01', returnDate: '2001-01-02' },
    { id: 'legacy-return', status: 'Overdue', pickupDate: '2000-01-01', endDate: '2001-01-01', returnedDate: '2001-01-02' },
  ];
  const groups = groupLoans(records);
  assert.deepEqual(groups.overdue.map((record) => record.id), ['due']);
  assert.deepEqual(groups.returned.map((record) => record.id), ['returned', 'legacy-return']);
});

test('pickup events use actual dates and hide returned applies to both grid and open-day data', () => {
  const records = [
    { id: 'active', pickupDate: '2026-11-10 09:30:00', outIso: '2026-11-01' },
    { id: 'returned', pickupDate: '2026-11-10', returnDate: '2026-11-11', inIso: '2026-11-11' },
    { id: 'scheduled', outIso: '2026-11-10' },
  ];
  const visible = indexInOutSchedule(filterCalendarRecords(records, true));
  assert.deepEqual(scheduleForDay(visible, '2026-11-10').pickedUp.map((row) => row.id), ['active']);
  assert.deepEqual(visible.pickedUpByDate.get('2026-11-10').map((row) => row.id), ['active']);
  assert.equal(scheduleForDay(visible, '2026-11-11').incoming.length, 0);
  const all = indexInOutSchedule(filterCalendarRecords(records, false));
  assert.equal(scheduleForDay(all, '2026-11-10').pickedUp.length, 2);
  assert.equal(scheduleForDay(all, '2026-11-10', (row) => row.id === 'active').pickedUp.length, 1);
  assert.equal(scheduleForDay(all, '2026-11-01').outgoing.length, 0);
});
