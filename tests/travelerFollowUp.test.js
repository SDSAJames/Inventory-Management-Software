import test from 'node:test';
import assert from 'node:assert/strict';
import { travelerFollowUp, knoxRecipientList, travelerReminders } from '../src/lib/travelerFollowUp.js';
test('follow-up includes overdue and partial returns, excludes schedules and complete returns, and deduplicates recipients', () => {
  const loans = [
    { id: 'overdue', knoxId: ' user.b ', pickupDate: '2020-01-01', endDate: '2020-01-02', assigneeType: 'Business traveler' },
    { id: 'partial', knoxId: 'user.a', returnDate: '2020-01-02', returnStatus: 'Partial' },
    { id: 'duplicate', knoxId: 'USER.A', returnDate: '2020-01-02', returnStatus: 'Partial' },
    { id: 'missing', returnDate: '2020-01-02', returnStatus: 'Partial' },
    { id: 'complete', knoxId: 'complete', returnDate: '2020-01-02', returnStatus: 'Complete' },
    { id: 'schedule', knoxId: 'scheduled', endDate: '2020-01-02' },
  ];
  const rows = travelerFollowUp(loans);
  assert.deepEqual(rows.map((loan) => loan.id), ['overdue', 'partial', 'duplicate', 'missing']);
  assert.equal(knoxRecipientList(rows).toLowerCase(), 'user.a;user.b;');
  assert.equal(knoxRecipientList([]), '');
});

test('reminders include today through seven calendar days, exclude returned, scheduled and employee records', () => {
  const active = { assigneeType: 'Business traveler', pickupDate: '2026-10-30', knoxId: 'traveler' };
  const records = [
    { ...active, id: 'seven', endDate: '2026-11-08' },
    { ...active, id: 'today', endDate: '2026-11-01' },
    { ...active, id: 'tomorrow', dueDate: '2026-11-02' },
    { ...active, id: 'later', endDate: '2026-11-09' },
    { ...active, id: 'overdue', endDate: '2026-10-31' },
    { ...active, id: 'returned', endDate: '2026-11-02', returnDate: '2026-11-01', returnStatus: 'Partial' },
    { ...active, id: 'schedule', endDate: '2026-11-02', pickupDate: '', status: 'Scheduled' },
    { ...active, id: 'employee', endDate: '2026-11-02', assigneeType: 'Employee' },
    { ...active, id: 'no-date' },
  ];
  const reminders = travelerReminders(records, '2026-11-01');
  assert.deepEqual(reminders.map((loan) => loan.id), ['today', 'tomorrow', 'seven']);
  assert.deepEqual(reminders.map((loan) => loan.daysLeft), [0, 1, 7]);
  assert.equal(reminders[0].followUpReason, 'Due today');
  assert.equal(knoxRecipientList(reminders), 'traveler;');
  assert.equal(records[0].daysLeft, undefined);
});
