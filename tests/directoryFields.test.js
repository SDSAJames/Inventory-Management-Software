import test from 'node:test';
import assert from 'node:assert/strict';
import { trimDirectoryFields, trimDirectoryValue } from '../shared/directoryFields.js';
import { buildLoanFormData, createLoanForm } from '../src/lib/loanForms.js';
import { normalizeDatabaseLocations } from '../src/lib/databaseLocations.js';

test('directory whitespace trimming preserves internal spaces, omitted fields and caller records', () => {
  const record = { department: '\t Field  Operations \n', location: '\u00a0 Stack Office \u00a0', note: ' Keep this note ' };
  const clean = trimDirectoryFields(record);
  assert.deepEqual(clean, { department: 'Field  Operations', location: 'Stack Office', note: ' Keep this note ' });
  assert.equal(record.department, '\t Field  Operations \n');
  assert.equal(trimDirectoryFields(clean), clean);
  const partial = { note: 'Only a note changed' };
  assert.equal(trimDirectoryFields(partial), partial);
  assert.equal(trimDirectoryValue(' \t\n '), '');
});

test('shared loan forms and cached records trim departments and locations without filling blank schedules', () => {
  const form = createLoanForm({ knoxId: 'spaces.test', location: ' Stack Office ', department: ' Field  Operations ', status: 'Scheduled' });
  assert.equal(form.location, 'Stack Office');
  assert.equal(form.department, 'Field  Operations');
  const payload = buildLoanFormData({ ...form, location: '\t Stack Office  ', department: ' Field  Operations\n' });
  assert.equal(payload.location, 'Stack Office');
  assert.equal(payload.department, 'Field  Operations');
  assert.equal(buildLoanFormData({ ...form, location: ' \t ', department: '  ' }).location, '');
  assert.equal(buildLoanFormData({ ...form, department: '  ' }).department, '');
  const original = { assets: [{ status: 'Assigned', owner: 'a', department: ' Asset Team ', location: ' Stack Office ' }], loans: [{ status: 'Scheduled', location: '  ', department: ' Loan Team ' }], employees: [{ department: '\t Staff Team ' }], locations: [] };
  const clean = normalizeDatabaseLocations(original);
  assert.equal(clean.assets[0].department, 'Asset Team');
  assert.equal(clean.loans[0].department, 'Loan Team');
  assert.equal(clean.loans[0].location, '');
  assert.equal(clean.employees[0].department, 'Staff Team');
  assert.equal(original.assets[0].department, ' Asset Team ');
  assert.equal(normalizeDatabaseLocations(clean), clean);
});
