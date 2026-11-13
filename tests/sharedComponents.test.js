import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';
import { createLoanForm } from '../src/lib/loanForms.js';

// Exercise controlled values and callbacks without starting a browser or touching the database.
function harness(database = {}, { effects = false } = {}) {
  const require = createRequire(import.meta.url), cache = new Map(), states = [];
  const db = { assets: [], loans: [], locations: [], departments: [], ...database };
  let cursor = 0;
  let pendingEffects = [];
  const calls = [];
  const e = (type, props, ...children) => typeof type === 'function' ? type({ ...props, children }) : { type, props: { ...props, children } };
  const hooks = {
    Fragment: 'fragment', useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    }, useMemo: (fn) => fn(), useCallback: (fn) => fn, useRef(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    }, useEffect(callback, dependencies) {
      const index = cursor++;
      if (effects && (!states[index] || dependencies.some((value, i) => !Object.is(value, states[index][i])))) pendingEffects.push(callback);
      states[index] = dependencies;
    },
  };
  const context = { db, updateAsset: (...args) => calls.push(['asset-edit', ...args]), verifyAndSyncAssets() {}, addLoan: (...args) => calls.push(['create', ...args]), updateLoan: (...args) => calls.push(['edit', ...args]), returnLoan: (...args) => calls.push(['return', ...args]) };
  function load(relative) {
    const file = path.resolve(relative);
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    const resolve = (specifier) => {
      if (specifier === 'react') return hooks;
      if (specifier === 'react-router-dom') return { useSearchParams: () => [new URLSearchParams()], useNavigate: () => () => {} };
      if (specifier === '../lib/db') return { loadAssetExportHeaders: () => null, saveAssetExportHeaders() {} };
      if (specifier.includes('/hooks/useDb')) return { useDb: () => context };
      if (specifier.includes('/hooks/useAuth')) return { useAuth: () => ({ user: { role: 'ADMIN' } }) };
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
  return { calls, db, render(component, props) { cursor = 0; pendingEffects = []; const tree = load('src/' + (component.startsWith('pages/') ? component : 'components/' + component) + '.jsx').default(props); for (const effect of pendingEffects) effect(); return tree; } };
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

test('transfer schedule search matches names and Knox IDs while retaining the selected schedule', () => {
  const loan = { id: 'source', knoxId: 'source.user', equipment: { Mouse: '1' } };
  const app = harness({ loans: [loan,
    { id: 'jane', knoxId: 'jane.smith', assignee: 'Jane Smith' },
    { id: 'alex', knoxId: 'ax123', assignee: 'Alex Rivera' },
    { id: 'picked', knoxId: 'picked.user', assignee: 'Jane Smith', pickupDate: '2026-11-12' },
  ] });
  const props = { loan, onClose() {} };
  let tree = nodes(app.render('LoanTransferForm', props));
  tree.find((node) => node.props.id === 'transfer-schedule-search').props.onChange({ target: { value: '  RIVERA  ' } });
  tree = nodes(app.render('LoanTransferForm', props));
  assert.deepEqual(tree.filter((node) => node.type === 'option' && ['alex', 'jane', 'picked'].includes(node.props.value)).map((node) => node.props.value), ['alex']);
  tree.find((node) => node.props.id === 'transfer-schedule').props.onChange({ target: { value: 'alex' } });
  tree = nodes(app.render('LoanTransferForm', props));
  tree.find((node) => node.props.id === 'transfer-schedule-search').props.onChange({ target: { value: 'JANE.S' } });
  tree = nodes(app.render('LoanTransferForm', props));
  assert.equal(tree.find((node) => node.props.id === 'transfer-schedule').props.value, 'alex');
  assert.deepEqual(tree.filter((node) => node.type === 'option' && ['alex', 'jane', 'picked'].includes(node.props.value)).map((node) => node.props.value), ['alex', 'jane']);
});

test('asset typing survives periodic refresh while ownership transfers update custody and record switches reset the draft', () => {
  const saved = { id: 'pc', code: 'PC-1', category: 'Laptop', owner: 'Original', status: 'Assigned', location: 'Stack', notes: 'Saved note', serial: 'Saved serial', ownershipHistory: [] };
  const app = harness({ assets: [saved] }, { effects: true });
  let tree = nodes(app.render('AssetForm', { assetId: 'pc' }));
  tree.find((node) => node.props.id === 'notes').props.onChange({ target: { value: 'Unsaved note' } });
  tree.find((node) => node.props.id === 'serial').props.onChange({ target: { value: 'Typing serial' } });
  app.db.assets = [{ ...saved, ownershipHistory: [] }];
  app.render('AssetForm', { assetId: 'pc' });
  tree = nodes(app.render('AssetForm', { assetId: 'pc' }));
  assert.equal(tree.find((node) => node.props.id === 'notes').props.value, 'Unsaved note');
  assert.equal(tree.find((node) => node.props.id === 'serial').props.value, 'Typing serial');
  app.db.assets = [{ ...saved, owner: 'IT Department', status: 'Available', location: 'IT Office' }];
  app.render('AssetForm', { assetId: 'pc' });
  tree = nodes(app.render('AssetForm', { assetId: 'pc' }));
  assert.equal(tree.find((node) => node.props.id === 'owner').props.value, 'IT Department');
  assert.equal(tree.find((node) => node.props.id === 'location').props.value, 'IT Office');
  assert.equal(tree.find((node) => node.props.id === 'notes').props.value, 'Unsaved note');
  app.db.assets.push({ ...saved, id: 'other', code: 'PC-2', notes: 'Other note' });
  app.render('AssetForm', { assetId: 'other' });
  tree = nodes(app.render('AssetForm', { assetId: 'other' }));
  assert.equal(tree.find((node) => node.props.id === 'notes').props.value, 'Other note');
});


test('asset tables sort naturally in both directions and select the displayed order', () => {
  const app = harness(), selected = [];
  const props = { assets: [{ id: '10', code: 'PC-10', location: 'B' }, { id: '2', code: 'PC-2', location: 'A' }], selectedIds: new Set(), onToggleSelect() {}, onToggleSelectAll: (assets) => selected.push(assets.map((asset) => asset.id)) };
  let tree = nodes(app.render('AssetTable', props));
  const codes = () => tree.filter((node) => node.props.className === 'asset-code').map((node) => node.props.children[0]);
  assert.deepEqual(codes(), ['PC-2', 'PC-10']);
  tree.find((node) => node.type === 'button' && node.props.title === 'Sort by Asset number descending').props.onClick();
  tree = nodes(app.render('AssetTable', props));
  assert.deepEqual(codes(), ['PC-10', 'PC-2']);
  tree.find((node) => node.type === 'input' && node.props.title === 'Select all rows on this page').props.onChange();
  assert.deepEqual(selected, [['10', '2']]);
  tree.find((node) => node.type === 'button' && node.props.title === 'Sort by Location ascending').props.onClick();
  tree = nodes(app.render('AssetTable', props));
  assert.deepEqual(codes(), ['PC-2', 'PC-10']);
});

test('edit loan department dropdown reopens all directory choices after filtering', () => {
  const departments = ['Operations', 'Finance', 'IT', 'Formation', 'People & Culture', 'Engineering', 'Quality', 'Production', 'Safety'];
  const app = harness({ departments, loans: [{ id: 'one', knoxId: 'person', department: 'Operations', equipment: {} }] });
  const props = { loanId: 'one', onClose() {} };
  let tree = nodes(app.render('EditLoanForm', props));
  tree.find((node) => node.props.id === 'edit-department').props.onChange({ target: { value: 'Eng' } });
  tree = nodes(app.render('EditLoanForm', props));
  const departmentOptions = () => nodes(tree.find((node) => node.props.id === 'edit-department-options')).filter((node) => node.props.role === 'option');
  assert.equal(departmentOptions().length, 1);
  tree.find((node) => node.props.id === 'edit-department').props.onFocus();
  tree = nodes(app.render('EditLoanForm', props));
  assert.equal(departmentOptions().length, departments.length);
  assert.equal(tree.find((node) => node.props.id === 'edit-department').props.value, 'Eng');
});


test('MES and standard registers partition shared inventory without copying records', () => {
  const assets = [{ id: 'standard', code: 'AST-1', category: 'Laptop' }, { id: 'mes-pc', code: 'MESPC-1', category: 'MES PC' }, { id: 'mes-monitor', code: 'MESM-1', category: 'Monitor' }];
  for (const mes of [false, true]) {
    const app = harness({ assets });
    const tree = nodes(app.render('pages/AssetsPage', { mes }));
    const codes = tree.filter((node) => node.props.className === 'asset-code').map((node) => node.props.children[0]);
    assert.deepEqual(new Set(codes), new Set(mes ? ['MESPC-1', 'MESM-1'] : ['AST-1']));
    assert.equal(app.db.assets.length, 3);
  }
});


test('location view counts every asset by type and opens editable assets for only that location', () => {
  const app = harness(), opened = [];
  const props = { assets: [
    { id: 'pc1', code: 'MESPC-1', category: 'MES PC', location: 'Stack' },
    { id: 'pc2', code: 'MESPC-2', category: 'MES PC', location: ' Stack ' },
    { id: 'mon', code: 'MESM-1', category: 'MES Monitor', location: 'Stack' },
    { id: 'repair', code: 'MESPC-3', category: 'MES PC', status: 'Under repair', location: 'Stack' },
  ], onEditAsset: (id) => opened.push(id) };
  let tree = nodes(app.render('AssetLocationList', props));
  const headings = tree.filter((node) => node.props.className === 'asset-location-heading');
  assert.equal(headings.length, 2);
  const stack = headings.find((node) => nodes(node).some((child) => child.type === 'strong' && child.props.children[0] === 'Stack'));
  const text = (root) => nodes(root).flatMap((node) => node.props.children).filter((value) => typeof value === 'string' || typeof value === 'number');
  assert.ok(text(stack).includes(3));
  assert.ok(text(stack).includes(2));
  assert.ok(text(stack).includes('MES Monitor'));
  stack.props.onClick();
  tree = nodes(app.render('AssetLocationList', props));
  const codes = tree.filter((node) => node.props.className === 'asset-code').map((node) => node.props.children[0]);
  assert.deepEqual(codes, ['MESM-1', 'MESPC-1', 'MESPC-2']);
  tree.find((node) => node.type === 'tr' && node.props['data-ridx'] === 0).props.onClick({ target: { tagName: 'TD' } });
  assert.deepEqual(opened, ['mon']);
});

test('MES location tab retains the register scope and its shared search', () => {
  const app = harness({ assets: [
    { id: 'one', code: 'MESPC-1', category: 'MES PC', location: 'Stack' },
    { id: 'two', code: 'MESM-1', category: 'MES Monitor', location: 'Stack' },
    { id: 'other', code: 'AST-1', category: 'Laptop', location: 'Other' },
  ] });
  const props = { mes: true };
  let tree = nodes(app.render('pages/AssetsPage', props));
  tree.find((node) => node.type === 'button' && node.props.children[0] === 'Location').props.onClick();
  tree = nodes(app.render('pages/AssetsPage', props));
  assert.equal(tree.filter((node) => node.props.className === 'asset-location-heading').length, 1);
  assert.ok(!tree.some((node) => node.type === 'strong' && node.props.children[0] === 'Other'));
});


test('asset department supports typing, keyboard selection, clearing and saving directory choices', async () => {
  const app = harness({ departments: ['Operations', 'Engineering', 'Finance'], assets: [{ id: 'one', code: 'AST-1', category: 'Laptop', owner: 'person', status: 'Assigned', department: 'Legacy team' }] });
  const props = { assetId: 'one', onClose() {} };
  let tree = nodes(app.render('AssetForm', props));
  let input = tree.find((node) => node.props.id === 'department');
  assert.equal(input.props.role, 'combobox');
  assert.equal(input.props.value, 'Legacy team');
  input.props.onFocus();
  tree = nodes(app.render('AssetForm', props));
  const options = () => nodes(tree.find((node) => node.props.id === 'department-options')).filter((node) => node.props.role === 'option');
  assert.equal(options().length, 4);
  tree.find((node) => node.props.id === 'department').props.onChange({ target: { value: 'eng' } });
  tree = nodes(app.render('AssetForm', props));
  assert.equal(options().length, 1);
  assert.equal(options()[0].props.children[0], 'Engineering');
  tree.find((node) => node.props.id === 'department').props.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
  tree = nodes(app.render('AssetForm', props));
  tree.find((node) => node.props.id === 'department').props.onKeyDown({ key: 'Enter', preventDefault() {} });
  tree = nodes(app.render('AssetForm', props));
  assert.equal(tree.find((node) => node.props.id === 'department').props.value, 'Engineering');
  await tree.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(app.calls.find((call) => call[0] === 'asset-edit')[2].department, 'Engineering');
  tree.find((node) => node.props.id === 'department').props.onChange({ target: { value: '' } });
  tree = nodes(app.render('AssetForm', props));
  assert.equal(tree.find((node) => node.props.id === 'department').props.value, '');
});


test('pagination sorts the entire result before slicing, resets on size/filter changes and clamps on deletion', () => {
  const app = harness();
  const assets = Array.from({ length: 36 }, (_, index) => ({ id: String(index + 1), code: 'PC-' + (index + 1) })).reverse();
  let props = { assets, pageSize: 15, resetKey: 'all' };
  let tree = nodes(app.render('AssetTable', props));
  const codes = () => tree.filter((node) => node.props.className === 'asset-code').map((node) => node.props.children[0]);
  const next = () => tree.find((node) => node.type === 'button' && node.props.children[0] === 'Next');
  assert.equal(codes().length, 15); assert.equal(codes()[0], 'PC-1');
  next().props.onClick(); tree = nodes(app.render('AssetTable', props));
  assert.equal(codes()[0], 'PC-16');
  next().props.onClick(); tree = nodes(app.render('AssetTable', props));
  assert.equal(codes().length, 6); assert.equal(next().props.disabled, true);
  props = { ...props, assets: assets.slice(-5) }; tree = nodes(app.render('AssetTable', props));
  assert.equal(codes().length, 5); assert.equal(codes()[0], 'PC-1');
  props = { assets, pageSize: 20, resetKey: 'all' }; tree = nodes(app.render('AssetTable', props));
  assert.equal(codes().length, 20); assert.equal(codes()[0], 'PC-1');
  next().props.onClick(); tree = nodes(app.render('AssetTable', props));
  props = { ...props, resetKey: 'filtered' }; tree = nodes(app.render('AssetTable', props));
  assert.equal(codes()[0], 'PC-1');
  tree.find((node) => node.type === 'button' && node.props.title === 'Sort by Asset number descending').props.onClick();
  tree = nodes(app.render('AssetTable', props)); assert.equal(codes()[0], 'PC-36');
});

test('range selection by drag or Shift-click suppresses editing and uses the visible page', () => {
  const app = harness(), ranges = [], edits = [];
  const props = { assets: Array.from({ length: 20 }, (_, i) => ({ id: String(i), code: 'PC-' + i })), pageSize: 15,
    selectedIds: new Set(), onToggleSelect() {}, onRangeSelect: (...args) => ranges.push(args), onEditAsset: (id) => edits.push(id) };
  let tree = nodes(app.render('AssetTable', props));
  const body = () => tree.find((node) => node.type === 'tbody');
  const event = (index, shiftKey = false) => ({ button: 0, shiftKey, preventDefault() {}, target: { tagName: 'TD', closest: (selector) => selector === 'tr[data-ridx]' ? ({ dataset: { ridx: index } }) : null } });
  body().props.onMouseDown(event(1)); body().props.onMouseMove(event(4));
  tree = nodes(app.render('AssetTable', props)); body().props.onMouseUp(event(4));
  tree.find((node) => node.type === 'tr' && node.props['data-ridx'] === 4).props.onClick({ target: { tagName: 'TD' } });
  assert.deepEqual(ranges[0], [['1', '2', '3', '4'], true]); assert.equal(edits.length, 0);
  body().props.onMouseDown(event(6, true));
  assert.deepEqual(ranges[1], [['1', '2', '3', '4', '5', '6'], true]);
});

test('all three page headers default to 15 rows and report selections across pages', () => {
  for (const [component, mes] of [['pages/AssetsPage', false], ['pages/AssetsPage', true], ['pages/OverviewPage', false]]) {
    const assets = Array.from({ length: 34 }, (_, i) => ({ id: String(i), code: (mes ? 'MESPC-' : 'AST-') + i, category: mes ? 'MES PC' : 'Laptop', status: 'Available', updated: '2026-11-13' }));
    const app = harness({ assets }); const props = { mes };
    let tree = nodes(app.render(component, props));
    assert.equal(tree.find((node) => node.props['aria-label'] === 'Rows per page').props.value, 15);
    assert.equal(tree.filter((node) => node.props.className === 'asset-code').length, 15);
    tree.find((node) => node.props.title === 'Select all rows on this page').props.onChange();
    tree = nodes(app.render(component, props));
    assert.ok(nodes(tree.find((node) => node.props.className === 'selection-count')).some((node) => node.type === 'strong' && node.props.children[0] === 15));
    tree.find((node) => node.type === 'button' && node.props.children[0] === 'Next').props.onClick();
    tree = nodes(app.render(component, props));
    tree.find((node) => node.props.title === 'Select all rows on this page').props.onChange();
    tree = nodes(app.render(component, props));
    assert.ok(nodes(tree.find((node) => node.props.className === 'selection-count')).some((node) => node.type === 'strong' && node.props.children[0] === 30));
    tree.find((node) => node.props['aria-label'] === 'Rows per page').props.onChange({ target: { value: '30' } });
    tree = nodes(app.render(component, props));
    assert.equal(tree.filter((node) => node.props.className === 'asset-code').length, 30);
  }
});
