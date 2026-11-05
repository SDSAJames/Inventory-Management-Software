import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCalendarDateTime, dateTimeInputValue } from '../shared/dateTime.js';
import { readableTransferNote } from '../src/lib/transferNotes.js';

const local = { timeZone: 'America/Indiana/Indianapolis' };

test('transfer timestamps display local minutes and fit datetime-local inputs', () => {
  const timestamp = '2026-11-04T19:51:05.353Z';
  assert.equal(formatCalendarDateTime(timestamp, local), '2026-11-04 14:51');
  assert.equal(dateTimeInputValue(timestamp, local), '2026-11-04T14:51');
  assert.equal(formatCalendarDateTime('2026-07-04T19:51:05.353Z', local), '2026-07-04 15:51');
  assert.equal(formatCalendarDateTime('2026-11-04T02:10:00Z', local), '2026-11-03 21:10');
  assert.equal(formatCalendarDateTime('2026-11-04T19:51:05-05:00', local), '2026-11-04 19:51');
  assert.equal(formatCalendarDateTime('2026-11-04T14:51:05', local), '2026-11-04 14:51');
  assert.equal(formatCalendarDateTime('2026-11-04', local), '2026-11-04');
  assert.equal(dateTimeInputValue('', local), '');
});

test('legacy transfer notes hide record IDs and raw UTC while preserving user notes', () => {
  const legacy = 'Inspect keyboard before handover\nTransferred from loan 24d4f01e-0f6e-485c-a7f1-db4c49cbf9e1 (q31.d12) at 2026-11-04T19:51:05.353Z\nTransferred Laptop: SPE-4321 to qeqqf (qeqqf, Business traveler) on 2026-11-04T19:56:41.347Z';
  const formatted = readableTransferNote(legacy, local);
  assert.match(formatted, /^Inspect keyboard before handover\nReceived equipment from q31.d12 on 2026-11-04 14:51/);
  assert.match(formatted, /SPE-4321.*2026-11-04 14:56/);
  assert.doesNotMatch(formatted, /24d4f01e|\.353Z|\.347Z/);
  assert.equal(readableTransferNote('Call IT at 2026-11-04T19:51:05.353Z', local), 'Call IT at 2026-11-04T19:51:05.353Z');
  assert.equal(readableTransferNote('Transferred {"Laptop":"SPE-4321","Dongle":1} to loan loan-internal-id (jane.doe) at 2026-11-04T19:51:05.353Z', local), 'Transferred Laptop: SPE-4321, USB Dongle: 1 to jane.doe on 2026-11-04 14:51');
});
