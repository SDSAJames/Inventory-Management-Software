import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';
import { createLoanForm } from '../src/lib/loanForms.js';

// Exercise controlled values and callbacks without starting a browser or touching the database.
function harness(database = {}) {
  const require = createRequire(import.meta.url), cache = new Map(), states = [];
  const db = { assets: [], loans: [], locations: [], departments: [], ...database };
  let cursor = 0;
  const calls = [];
  const e = (type, props, ...children) => typeof type === 'function' ? type({ ...props, children }) : { type, props: { ...props, children } };
  const hooks = {
    Fragment: 'fragment', useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    }, useMemo: (fn) => fn(), useRef: () => ({ current: null }), useEffect() {},
  };
  const context = { db, addLoan: (...args) => calls.push(['create', ...args]), updateLoan: (...args) => calls.push(['edit', ...args]), returnLoan: (...args) => calls.push(['return', ...args]) };
  function load(relative) {
    const file = path.resolve(relative);
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    const resolve = (specifier) => {
      if (specifier === 'react') return hooks;
      if (specifier.includes('/hooks/useDb')) return { useDb: () => context };
      if (specifier.includes('/hooks/useToast')) return { useToast: () => () => {} };
      if (specifier.endsWith('/AssetAutocomplete')) return { default: (props) => e('asset-search', props), __esModule: true };
      if (specifier.endsWith('/Modal')) return { default: ({ open, children }) => open ? children : null, __esModule: true };
      const resolved = path.resolve(path.dirname(file), specifier);
      if (resolved.endsWith('.jsx')) return load(resolved);
      if (fs.existsSync(resolved + '.jsx')) return load(resolved + '.jsx');
      return require(resolved);
    };
    const code = transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', jsxFactory: 'e', jsxFragment: 'fragment' }).code;
    new Function('require', 'module', 'exports', 'e', 'fragment', code)(resolve, module, module.exports, e, 'fragment');
    cache.set(file, module.exports);
    return module.exports;
  }
  return { calls, render(component, props) { cursor = 0; return load('src/components/' + component + '.jsx').default(props); } };
}

function nodes(root) {
  if (Array.isArray(root)) return root.flatMap(nodes);
  return root && typeof root === 'object' ? [root, ...nodes(root.props?.children)] : [];
}

test('create and edit windows render the same controlled recipient and equipment fields', () => {
  for (const editing of [false, true]) {
    const loan = { id: 'one', knoxId: 'person', assigneeType: 'Business traveler', equipment: { Adapter: '0', Cable: '2' } };
    const app = harness({ loans: [loan] });
    const component = editing ? 'EditLoanForm' : 'LoanForm';
    const props = editing ? { loanId: 'one', onClose() {} } : { onClose() {} };
    let tree = nodes(app.render(component, props));
    assert.equal(tree.find((node) => node.props.id === 'knoxId').props.required, true);
    assert.equal(tree.find((node) => node.props.id === 'assignee').props.required, undefined);
    const prefix = editing ? 'edit-' : '';
    assert.equal(tree.find((node) => node.props.id === prefix + 'adapter').props.type, 'number');
    assert.equal(tree.find((node) => node.props.id === prefix + 'adapter').props.value, '0');
    assert.equal(tree.find((node) => node.props.id === 'others').props.type, 'text');
    tree.find((node) => node.props.id === 'knoxId').props.onChange({ target: { value: 'typed.person' } });
    tree = nodes(app.render(component, props));
    tree.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
    const saved = app.calls.find((call) => call[0] === (editing ? 'edit' : 'create'));
    assert.ok(saved);
    const payload = saved[editing ? 2 : 1];
    assert.equal(payload.knoxId, 'typed.person');
    assert.equal(payload.equipment.Adapter, '0');
    if (editing) assert.equal(payload.equipment.Cable, '2');
  }
});

test('pickup and return checklists share quantity constraints while preserving asset and text fields', () => {
  for (const returning of [false, true]) {
    const app = harness(), changes = [];
    const form = { ...createLoanForm(), monitor: 'MON-1', others: 'Headset' };
    const pcField = returning ? 'returnedLaptopCode' : 'assetCode';
    const tree = nodes(app.render('EquipmentAccessoryList', { form, returning, pcField, monitorSearch: !returning, idPrefix: 'check-', onChange: (...args) => changes.push(args) }));
    const quantities = tree.filter((node) => node.type === 'input' && node.props.type === 'number');
    assert.equal(quantities.length, 6);
    for (const input of quantities) { assert.equal(input.props.min, '0'); assert.equal(input.props.step, '1'); }
    const dongle = tree.find((node) => node.props.id === 'check-dongle');
    dongle.props.onChange({ target: { value: '3' } });
    dongle.props.onChange({ target: { value: '-1' } });
    assert.deepEqual(changes, [['dongle', '3']]);
    assert.ok(!tree.some((node) => node.props.className?.includes('highlight-row')));
    assert.ok(!tree.some((node) => node.props.className?.includes('qty-btn')));
    const devices = tree.find((node) => node.props.className === 'handover-devices');
    assert.ok(nodes(devices).some((node) => node.props.id === 'check-pc'));
    assert.ok(nodes(devices).some((node) => node.props.id === 'check-monitor'));
    tree.find((node) => node.props.id === 'check-pc').props.onChange('PC-123');
    assert.deepEqual(changes.at(-1), [pcField, 'PC-123']);
    assert.equal(tree.find((node) => node.props.id === 'check-monitor').props.value, 'MON-1');
    assert.equal(tree.find((node) => node.props.id === 'check-others').props.type, 'text');
  }
});

test('shared return dialog submits accessory shortages with the selected fixed timestamp', () => {
  const loan = { id: 'one', assetCode: 'PC-1', pickupDate: '2026-11-01', equipment: { Laptop: 'PC-1', Dongle: '1' } };
  const app = harness();
  const props = { loan, onClose() {} };
  let tree = nodes(app.render('LoanReturnModal', props));
  tree.find((node) => node.props.id === 'return-accessory-dongle').props.onChange({ target: { value: '0' } });
  tree.find((node) => node.props.id === 'modal-returnDate').props.onChange({ target: { value: '2026-11-06T09:45' } });
  tree = nodes(app.render('LoanReturnModal', props));
  tree.find((node) => node.type === 'button' && node.props.className === 'button btn-return').props.onClick();
  const [, id, timestamp, details] = app.calls.find((call) => call[0] === 'return');
  assert.equal(id, 'one'); assert.equal(timestamp, '2026-11-06T09:45');
  assert.equal(details.returnStatus, 'Partial'); assert.equal(details.returnedEquipment.Dongle, '0');
});

test('all table modes align headers, row cells, readiness and expanded detail spans', () => {
  const loan = { id: 'one', knoxId: 'person', location: 'Stack', equipment: {}, readyForPickup: false };
  for (const options of [{ scheduled: true, showLocation: true }, { showPickupReadiness: true, showLocation: true }, { hideReturnDate: true, showLocation: true }, { showLocation: true }]) {
    const app = harness();
    let tree = nodes(app.render('LoanTable', { loans: [loan], assets: [], ...options }));
    const headers = tree.filter((node) => node.type === 'th');
    assert.equal(headers.length, tree.filter((node) => node.type === 'td').length);
    assert.ok(headers.some((node) => node.props.key === 'location'));
    assert.ok(tree.some((node) => node.type === 'td' && node.props.children.includes('Stack')));
    if (options.scheduled) assert.ok(!headers.some((node) => ['pickupDate', 'returnDate', 'status'].includes(node.props.key)));
    const row = tree.find((node) => node.type === 'tr' && node.props.onClick);
    row.props.onClick({ target: { tagName: 'TD' } });
    tree = nodes(app.render('LoanTable', { loans: [loan], assets: [], ...options }));
    assert.equal(tree.find((node) => node.props.colSpan)?.props.colSpan, headers.length);
  }
});

test('shared calendar navigation calls the same month, year and day actions', () => {
  const app = harness(), called = [];
  const tree = nodes(app.render('CalendarNavigation', { currentMonth: 10, currentYear: 2026, idPrefix: 'cal-', handlePrevMonth: () => called.push('prev'), handleNextMonth: () => called.push('next'), handleGoToday: () => called.push('today'), setCurrentMonth: (month) => called.push(month), setCurrentYear: (year) => called.push(year) }));
  for (const id of ['prev', 'next', 'today']) tree.find((node) => node.props.id === 'cal-' + id).props.onClick();
  tree.find((node) => node.props['aria-label'] === 'Select month').props.onChange({ target: { value: '2' } });
  tree.find((node) => node.props['aria-label'] === 'Select year').props.onChange({ target: { value: '2027' } });
  assert.deepEqual(called, ['prev', 'next', 'today', 2, 2027]);
});

test('quantity input canonicalizes leading zeros before notifying each form', () => {
  const app = harness(), values = [];
  const input = app.render('EquipmentQuantityInput', { value: '0', onChange: (event) => values.push(event.target.value) });
  for (const value of ['01', '000', '002', '', '3.5', '-1']) input.props.onChange({ target: { value } });
  assert.deepEqual(values, ['1', '0', '2', '']);
});

test('shared date fields reject longer years, retain valid values and clearing, and preserve due-date limits', () => {
  for (const type of ['date', 'datetime-local']) {
    const app = harness(), values = [];
    const suffix = type === 'date' ? '' : 'T12:30';
    const original = '2026-11-12' + suffix;
    const input = app.render('DateInput', { type, value: original, min: '2026-11-01', onChange: (event) => values.push(event.target.value) });
    assert.ok(input.props.max.startsWith('9999-12-31'));
    assert.equal(input.props.min, '2026-11-01');
    const invalid = { target: { value: '12026-11-12' + suffix } };
    input.props.onChange(invalid);
    assert.equal(invalid.target.value, original);
    input.props.onChange({ target: { value: '2027-01-02' + suffix } });
    input.props.onChange({ target: { value: '' } });
    assert.deepEqual(values, ['2027-01-02' + suffix, '']);
  }
});

test('scheduled due date prefills only the year and emits no date until month and day are complete and valid', () => {
  const app = harness(), values = [];
  const props = { id: 'due', value: '', onChange: (event) => values.push(event.target.value) };
  let tree = nodes(app.render('ScheduleDueDateInput', props));
  const input = (label) => tree.find((node) => node.props['aria-label'] === label);
  assert.equal(input('Due year').props.value, String(new Date().getFullYear()));
  assert.equal(input('Due month').props.value, '');
  assert.equal(input('Due day').props.value, '');
  assert.deepEqual(values, []);
  input('Due month').props.onChange({ target: { value: '02' } });
  assert.equal(values.at(-1), '');
  tree = nodes(app.render('ScheduleDueDateInput', props));
  input('Due day').props.onChange({ target: { value: '31' } });
  assert.equal(values.at(-1), '');
  tree = nodes(app.render('ScheduleDueDateInput', props));
  input('Due day').props.onChange({ target: { value: '12' } });
  assert.match(values.at(-1), /^\d{4}-02-12$/);
});
