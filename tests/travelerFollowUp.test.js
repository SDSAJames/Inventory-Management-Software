import test from 'node:test';
import assert from 'node:assert/strict';
import { travelerFollowUp, knoxRecipientList } from '../src/lib/travelerFollowUp.js';
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
