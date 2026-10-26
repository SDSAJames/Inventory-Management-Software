import { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { nowLocalIso, readableLoanDate, todayIso, statusClass, isLoanOverdue, getLoanStatus } from '../lib/utils';
import { readXlsx, makeXlsx, downloadBlob } from '../lib/xlsx';
import { parseDelimitedText, parseLoansText, detectFileType } from '../lib/txtImport';
import { LOAN_HEADERS } from '../lib/constants';
import LoanTable from '../components/LoanTable';
import SearchBar from '../components/SearchBar';
import Modal from '../components/Modal';
import LoanForm from '../components/LoanForm';
import EditLoanForm from '../components/EditLoanForm';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const LOAN_SEARCH_FIELDS = [
  'All fields',
  'Assignee / Name',
  'Knox ID',
  'Laptop / Asset #',
  'Location',
  'IP address',
  'Department',
  'Note / Purpose',
];

function filterLoan(loan, term, field) {
  if (!term || !term.trim()) return true;
  const q = term.toLowerCase().trim();
  const terms = q.split(/\s+/);

  let searchable = '';
  switch (field) {
    case 'Assignee / Name':
      searchable = loan.assignee || '';
      break;
    case 'Knox ID':
      searchable = loan.knoxId || '';
      break;
    case 'Laptop / Asset #':
      searchable = `${loan.assetCode || ''} ${loan.equipment?.Laptop || ''}`;
      break;
    case 'Location':
      searchable = loan.location || '';
      break;
    case 'IP address':
      searchable = loan.ip || '';
      break;
    case 'Department':
      searchable = loan.department || '';
      break;
    case 'Note / Purpose':
      searchable = `${loan.note || ''} ${loan.purpose || ''}`;
      break;
    case 'All fields':
    default: {
      const laptop = loan.assetCode || loan.equipment?.Laptop || '';
      const accessories = loan.equipment
        ? Object.entries(loan.equipment)
            .map(([k, v]) => `${k} ${v}`)
            .join(' ')
        : '';
      const status = getLoanStatus(loan);
      searchable = `${loan.assignee || ''} ${loan.knoxId || ''} ${laptop} ${loan.location || ''} ${loan.ip || ''} ${loan.department || ''} ${loan.note || ''} ${loan.purpose || ''} ${loan.others || ''} ${loan.assigneeType || ''} ${status} ${accessories}`;
      break;
    }
  }

  const lower = searchable.toLowerCase();
  return terms.every((t) => lower.includes(t));
}

export default function LoansPage() {
  const { db, updateLoan, pickupLoan, revertPickup, returnLoan, unarchiveLoan, deleteLoan, mergeImportData } = useDb();
  const toast = useToast();
  const fileRef = useRef(null);
  const [searchParams] = useSearchParams();

  // 4 Process categories: 'scheduled' | 'loaned' | 'overdue' | 'returned' | 'all'
  const [category, setCategory] = useState(
    () => searchParams.get('tab') || searchParams.get('category') || 'scheduled',
  );
  const [searchTerm, setSearchTerm] = useState(
    () => searchParams.get('q') || searchParams.get('search') || '',
  );
  const [searchField, setSearchField] = useState('All fields');
  const [showCreate, setShowCreate] = useState(false);
  const [editLoanId, setEditLoanId] = useState(null);
  const [editMode, setEditMode] = useState(false);

  // Pickup modal state
  const [pickupTarget, setPickupTarget] = useState(null);
  const [pickupForm, setPickupForm] = useState({
    pickupDate: '',
    startDate: '',
    endDate: '',
    location: '',
    adapter: '1',
    cable: '1',
    dongle: '0',
    keyboard: '0',
    mouse: '0',
    monitor: '0',
    ethernetCable: '0',
    others: '',
    note: '',
  });

  // Return & Archive modal state (one or many loans)
  const [returnTargets, setReturnTargets] = useState(null);
  const [returnTime, setReturnTime] = useState('');
  const [returnForm, setReturnForm] = useState({
    returnDate: '',
    adapter: '1',
    cable: '1',
    dongle: '0',
    keyboard: '0',
    mouse: '0',
    monitor: '0',
    ethernetCable: '0',
    others: '',
    note: '',
  });

  // Deletion confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Loaned & Overdue tabs: checkbox selection + bulk delete confirmation
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  // TXT / Excel import preview
  const [importPreview, setImportPreview] = useState(null);

  // 1. Scheduled: Laptops scheduled for pickup (no pickup timestamp yet, not returned, not overdue)
  const scheduledLoans = useMemo(
    () =>
      db.loans.filter(
        (l) =>
          !l.pickupDate &&
          !l.returnDate &&
          !l.returnedDate &&
          l.status !== 'Returned' &&
          !l.isArchived &&
          !isLoanOverdue(l),
      ),
    [db.loans],
  );

  // 2. Loaned: Laptops currently handed out & in use (has pickup timestamp, not returned, not overdue)
  const loanedLoans = useMemo(
    () =>
      db.loans.filter(
        (l) =>
          Boolean(l.pickupDate) &&
          !l.returnDate &&
          !l.returnedDate &&
          l.status !== 'Returned' &&
          !l.isArchived &&
          !isLoanOverdue(l),
      ),
    [db.loans],
  );

  // 3. Overdue: Laptops where end date has passed today and have not been returned
  const overdueLoans = useMemo(
    () => db.loans.filter(isLoanOverdue),
    [db.loans],
  );

  // 4. Returned: Laptops that have been returned & archived
  const returnedLoans = useMemo(
    () =>
      db.loans.filter(
        (l) =>
          Boolean(l.returnDate || l.returnedDate || l.status === 'Returned' || l.isArchived),
      ),
    [db.loans],
  );

  const filteredScheduledLoans = useMemo(
    () => scheduledLoans.filter((l) => filterLoan(l, searchTerm, searchField)),
    [scheduledLoans, searchTerm, searchField],
  );

  const filteredLoanedLoans = useMemo(
    () => loanedLoans.filter((l) => filterLoan(l, searchTerm, searchField)),
    [loanedLoans, searchTerm, searchField],
  );

  const filteredOverdueLoans = useMemo(
    () => overdueLoans.filter((l) => filterLoan(l, searchTerm, searchField)),
    [overdueLoans, searchTerm, searchField],
  );

  const filteredReturnedLoans = useMemo(
    () => returnedLoans.filter((l) => filterLoan(l, searchTerm, searchField)),
    [returnedLoans, searchTerm, searchField],
  );

  const filteredAllLoans = useMemo(
    () => db.loans.filter((l) => filterLoan(l, searchTerm, searchField)),
    [db.loans, searchTerm, searchField],
  );

  const hasSearch = Boolean(searchTerm && searchTerm.trim());

  const displayedLoans = useMemo(() => {
    if (category === 'scheduled') return filteredScheduledLoans;
    if (category === 'loaned') return filteredLoanedLoans;
    if (category === 'overdue') return filteredOverdueLoans;
    if (category === 'returned') return filteredReturnedLoans;
    return filteredAllLoans;
  }, [
    category,
    filteredScheduledLoans,
    filteredLoanedLoans,
    filteredOverdueLoans,
    filteredReturnedLoans,
    filteredAllLoans,
  ]);

  const totalCategoryCount = useMemo(() => {
    if (category === 'scheduled') return scheduledLoans.length;
    if (category === 'loaned') return loanedLoans.length;
    if (category === 'overdue') return overdueLoans.length;
    if (category === 'returned') return returnedLoans.length;
    return db.loans.length;
  }, [
    category,
    scheduledLoans.length,
    loanedLoans.length,
    overdueLoans.length,
    returnedLoans.length,
    db.loans.length,
  ]);

  /* ── Selection & Bulk operations (Loaned & Overdue tabs) ── */

  const isSelectableTab = category === 'loaned' || category === 'overdue';

  // Reset selection whenever the user switches tabs
  useEffect(() => {
    setSelectedIds(new Set());
  }, [category]);

  // Only loans currently displayed count as selected
  const selectedLoans = useMemo(
    () => displayedLoans.filter((l) => selectedIds.has(l.id)),
    [displayedLoans, selectedIds],
  );

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = (loans) => {
    const allSelected = loans.length > 0 && loans.every((l) => selectedIds.has(l.id));
    setSelectedIds(allSelected ? new Set() : new Set(loans.map((l) => l.id)));
  };

  const handleBulkRevertPickup = () => {
    if (!selectedLoans.length) return;
    selectedLoans.forEach((loan) => revertPickup(loan.id));
    toast(`Pickup reverted for ${selectedLoans.length} loan${selectedLoans.length === 1 ? '' : 's'}. Moved back to Scheduled.`);
    setSelectedIds(new Set());
  };

  const handleConfirmBulkDelete = () => {
    const count = selectedLoans.length;
    selectedLoans.forEach((loan) => deleteLoan(loan.id));
    toast(`${count} loan record${count === 1 ? '' : 's'} deleted.`);
    setSelectedIds(new Set());
    setShowBulkDelete(false);
  };

  /* ── Pickup flow ────────────────────────────────── */

  const handleOpenPickup = (loan) => {
    setPickupTarget(loan);
    const eq = loan.equipment || {};
    setPickupForm({
      pickupDate: nowLocalIso(),
      startDate: (loan.startDate || loan.loanDate || todayIso()).slice(0, 10),
      endDate: (loan.endDate || loan.dueDate || '').slice(0, 10),
      location: loan.location || 'Head Office',
      adapter: String(eq.Adapter ?? '1'),
      cable: String(eq.Cable ?? '1'),
      dongle: String(eq.Dongle ?? '0'),
      keyboard: String(eq.Keyboard ?? '0'),
      mouse: String(eq.Mouse ?? '0'),
      monitor: String(eq.Monitor ?? '0'),
      ethernetCable: String(eq['Ethernet cable'] ?? '0'),
      others: loan.others || '',
      note: loan.note || loan.purpose || '',
    });
  };

  const updatePickupField = (field, val) => {
    setPickupForm((prev) => ({ ...prev, [field]: val }));
  };

  const handleConfirmPickup = () => {
    if (!pickupTarget) return;
    const timestamp = pickupForm.pickupDate || nowLocalIso();
    const details = {
      startDate: pickupForm.startDate,
      loanDate: pickupForm.startDate,
      endDate: pickupForm.endDate,
      dueDate: pickupForm.endDate,
      location: pickupForm.location,
      equipment: {
        ...(pickupTarget.equipment || {}),
        Laptop: pickupTarget.assetCode,
        Adapter: pickupForm.adapter,
        Cable: pickupForm.cable,
        Dongle: pickupForm.dongle,
        Keyboard: pickupForm.keyboard,
        Mouse: pickupForm.mouse,
        Monitor: pickupForm.monitor,
        'Ethernet cable': pickupForm.ethernetCable,
      },
      others: pickupForm.others,
      note: pickupForm.note,
    };

    pickupLoan(pickupTarget.id, timestamp, details);
    toast(`Device and accessories picked up for ${pickupTarget.assignee || 'assignee'}`);
    setPickupTarget(null);
  };

  const handleRevertPickup = (loan) => {
    revertPickup(loan.id);
    toast(`Pickup reverted for ${loan.assignee || 'loan'}. Record moved back to Scheduled.`);
  };

  /* ── Return & Archive flow ──────────────────────── */

  // Accepts a single loan or an array of loans
  const handleOpenReturn = (loanOrLoans) => {
    const list = Array.isArray(loanOrLoans) ? loanOrLoans : [loanOrLoans];
    if (!list.length) return;
    setReturnTargets(list);
    const nowTime = nowLocalIso();
    setReturnTime(nowTime);

    if (list.length === 1) {
      const loan = list[0];
      const eq = loan.equipment || {};
      setReturnForm({
        returnDate: nowTime,
        adapter: String(eq.Adapter ?? '1'),
        cable: String(eq.Cable ?? '1'),
        dongle: String(eq.Dongle ?? '0'),
        keyboard: String(eq.Keyboard ?? '0'),
        mouse: String(eq.Mouse ?? '0'),
        monitor: String(eq.Monitor ?? '0'),
        ethernetCable: String(eq['Ethernet cable'] ?? '0'),
        others: loan.others || '',
        note: loan.note || '',
      });
    }
  };

  const updateReturnField = (field, val) => {
    setReturnForm((prev) => ({ ...prev, [field]: val }));
  };

  const handleConfirmReturn = () => {
    if (!returnTargets || !returnTargets.length) return;
    if (returnTargets.length === 1) {
      const loan = returnTargets[0];
      const timestamp = returnForm.returnDate || returnTime || nowLocalIso();
      const details = {
        equipment: {
          ...(loan.equipment || {}),
          Laptop: loan.assetCode,
          Adapter: returnForm.adapter,
          Cable: returnForm.cable,
          Dongle: returnForm.dongle,
          Keyboard: returnForm.keyboard,
          Mouse: returnForm.mouse,
          Monitor: returnForm.monitor,
          'Ethernet cable': returnForm.ethernetCable,
        },
        others: returnForm.others,
        note: returnForm.note,
      };
      returnLoan(loan.id, timestamp, details);
      toast(`Laptop and accessories returned & archived (${loan.assetCode})`);
    } else {
      const timestamp = returnTime || nowLocalIso();
      returnTargets.forEach((loan) => returnLoan(loan.id, timestamp));
      toast(`${returnTargets.length} laptops returned & archived`);
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      returnTargets.forEach((l) => next.delete(l.id));
      return next;
    });
    setReturnTargets(null);
  };

  const handleRevertReturn = (loan) => {
    unarchiveLoan(loan.id);
    toast(`Return reverted for ${loan.assignee || 'loan'}. Record moved back to Loaned.`);
  };

  /* ── Record Deletion flow ───────────────────────── */

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteLoan(deleteTarget.id);
    toast(`Loan record for ${deleteTarget.assignee || 'assignee'} has been deleted.`);
    setDeleteTarget(null);
  };

  /* ── TXT / Excel import ────────────────────────── */

  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const rows = file.name.toLowerCase().endsWith('.xlsx')
        ? await readXlsx(file)
        : parseDelimitedText(await file.text());

      const type = detectFileType(rows);
      if (type === 'equipments') {
        throw new Error('This file contains equipment master records. Please import it on the Assets or Exchange page.');
      }

      const result = parseLoansText(rows, db.assets, db.loans);
      if (!result.loans.length) {
        throw new Error('The file contains no valid loan rows');
      }

      // Match by assetCode + (pickupDate or startDate or knoxId or assignee or active state)
      const isExisting = (inc) =>
        db.loans.some(
          (l) =>
            String(l.assetCode || '').toLowerCase() === inc.assetCode.toLowerCase() &&
            (
              (l.pickupDate && inc.pickupDate && l.pickupDate.slice(0, 10) === inc.pickupDate.slice(0, 10)) ||
              (l.startDate && inc.startDate && l.startDate.slice(0, 10) === inc.startDate.slice(0, 10)) ||
              (l.knoxId && inc.knoxId && l.knoxId.toLowerCase() === inc.knoxId.toLowerCase()) ||
              (l.assignee && inc.assignee && l.assignee.toLowerCase() === inc.assignee.toLowerCase()) ||
              (!l.returnDate && !inc.returnDate)
            ),
        );

      const updatedCount = result.loans.filter(isExisting).length;
      setImportPreview({
        fileName: file.name,
        ...result,
        newCount: result.loans.length - updatedCount,
        updatedCount,
      });
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;
    const syncRes = await mergeImportData({
      assets: importPreview.synthesizedAssets || [],
      loans: importPreview.loans,
    });
    let msg = `Loan import complete: ${importPreview.newCount} added, ${importPreview.updatedCount} updated` +
      (importPreview.synthesizedAssets?.length
        ? `, ${importPreview.synthesizedAssets.length} new laptop${importPreview.synthesizedAssets.length === 1 ? '' : 's'} registered.`
        : '.');
    if (syncRes?.success) {
      msg += ' (Synced to server)';
    }
    toast(msg);
    setImportPreview(null);
  };

  /* ── Export Loans to Excel (1:1 standard format) ─ */

  const handleExportLoans = async () => {
    if (!db.loans.length) {
      toast('No loans to export');
      return;
    }
    const rows = db.loans.map((loan, index) => {
      const asset = db.assets.find((a) => a.code === loan.assetCode) || {};
      const eq = loan.equipment || {};
      return [
        index + 1,
        loan.assignee || loan.borrower || '',
        loan.knoxId || '',
        asset.location || loan.location || '',
        loan.ip || '',
        loan.startDate || loan.loanDate || '',
        loan.pickupDate || loan.loanDate || '',
        loan.endDate || loan.dueDate || '',
        loan.returnDate || loan.returnedDate || '',
        loan.assetCode || '',
        eq.Adapter ?? 1,
        eq.Cable ?? 1,
        eq.Dongle ?? 0,
        eq.Keyboard ?? 0,
        eq.Mouse ?? 0,
        eq.Monitor ?? 0,
        eq['Ethernet cable'] ?? 0,
        loan.others || '',
        loan.note || loan.purpose || '',
      ];
    });

    const workbook = await makeXlsx([LOAN_HEADERS, ...rows]);
    downloadBlob(
      new Blob([workbook], { type: XLSX_MIME }),
      `SPE_IT_Equipment_Loan_List_${todayIso()}.xlsx`,
    );
    toast(`${db.loans.length} loan record${db.loans.length === 1 ? '' : 's'} exported to Excel.`);
  };

  /* ── Inline save ────────────────────────────────── */

  const handleInlineSave = (draft) => {
    const changes = {
      assetCode: draft.assetCode,
      assignee: draft.assignee,
      assigneeType: draft.assigneeType,
      knoxId: draft.knoxId,
      ip: draft.ip,
      location: draft.location,
      startDate: draft.startDate,
      loanDate: draft.startDate || draft.loanDate,
      endDate: draft.endDate,
      dueDate: draft.endDate || draft.dueDate,
      pickupDate: draft.pickupDate,
      returnDate: draft.returnDate,
      returnedDate: draft.returnDate || draft.returnedDate,
      department: draft.department,
      others: draft.others,
      note: draft.note,
      status: draft.status,
      equipment: draft.equipment,
    };

    const assetUpdates = {
      code: draft.assetCode,
      owner: draft.assignee,
      location: draft.location,
    };

    updateLoan(draft.id, changes, assetUpdates);
    toast('Loan updated');
  };

  return (
    <>
      <div className="view-header">
        <div>
          <p className="view-subtitle">
            Track scheduled pickups, device handovers, and return records. Click any row to view details.
          </p>
        </div>
        <div className="view-header-actions">
          {editMode && <span className="edit-mode-indicator">EDIT MODE</span>}
          <button
            className={`button ${editMode ? 'secondary' : 'ghost'}`}
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? '✓ Done' : '✎ Edit'}
          </button>
          <button
            id="loan-import-btn"
            className="button ghost"
            onClick={() => fileRef.current?.click()}
            title="Import SPE_IT_Equipment_Loan_List_Example.txt or XLSX"
          >
            ↑ Import TXT / Excel
          </button>
          <button
            id="loan-export-btn"
            className="button ghost"
            onClick={handleExportLoans}
            title="Export loans to 1:1 Excel spreadsheet"
          >
            ↓ Export Excel
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={`.txt,.tsv,.csv,.xlsx,${XLSX_MIME}`}
            className="hidden-field"
            onChange={handleImportFile}
          />
          <button className="button" onClick={() => setShowCreate(true)}>
            + Schedule laptop
          </button>
        </div>
      </div>

      {/* 4 Categories: Scheduled, Loaned, Overdue, Returned (+ All) */}
      <div className="loan-tabs">
        <button
          className={`loan-tab ${category === 'scheduled' ? 'active' : ''}`}
          onClick={() => setCategory('scheduled')}
          title={hasSearch ? `${filteredScheduledLoans.length} matching of ${scheduledLoans.length} scheduled` : undefined}
        >
          <span className="category-dot scheduled-dot">●</span>
          Scheduled
          <span className="loan-tab-count">
            {hasSearch ? filteredScheduledLoans.length : scheduledLoans.length}
          </span>
        </button>
        <button
          className={`loan-tab ${category === 'loaned' ? 'active' : ''}`}
          onClick={() => setCategory('loaned')}
          title={hasSearch ? `${filteredLoanedLoans.length} matching of ${loanedLoans.length} loaned` : undefined}
        >
          <span className="category-dot loaned-dot">●</span>
          Loaned
          <span className="loan-tab-count">
            {hasSearch ? filteredLoanedLoans.length : loanedLoans.length}
          </span>
        </button>
        <button
          className={`loan-tab ${category === 'overdue' ? 'active overdue-tab' : ''} ${overdueLoans.length > 0 ? 'tab-has-alert' : ''}`}
          onClick={() => setCategory('overdue')}
          title={
            hasSearch
              ? `${filteredOverdueLoans.length} matching of ${overdueLoans.length} overdue`
              : overdueLoans.length > 0
              ? `${overdueLoans.length} overdue loan${overdueLoans.length === 1 ? '' : 's'}`
              : 'No overdue loans'
          }
        >
          <span className="category-dot overdue-dot">●</span>
          Overdue
          <span className={`loan-tab-count ${overdueLoans.length > 0 ? 'overdue-tab-count' : ''}`}>
            {hasSearch ? filteredOverdueLoans.length : overdueLoans.length}
          </span>
        </button>
        <button
          className={`loan-tab ${category === 'returned' ? 'active' : ''}`}
          onClick={() => setCategory('returned')}
          title={hasSearch ? `${filteredReturnedLoans.length} matching of ${returnedLoans.length} returned` : undefined}
        >
          <span className="category-dot returned-dot">●</span>
          Returned
          <span className="loan-tab-count">
            {hasSearch ? filteredReturnedLoans.length : returnedLoans.length}
          </span>
        </button>
        <button
          className={`loan-tab ${category === 'all' ? 'active' : ''}`}
          onClick={() => setCategory('all')}
          title={hasSearch ? `${filteredAllLoans.length} matching of ${db.loans.length} total records` : undefined}
        >
          All records
          <span className="loan-tab-count">
            {hasSearch ? filteredAllLoans.length : db.loans.length}
          </span>
        </button>
      </div>

      <div className="category-description">
        {category === 'scheduled' && (
          <span>📋 <strong>Scheduled pickups:</strong> Laptops awaiting handover. Click <strong>Pickup</strong> to timestamp handover. Click row for loaner details.</span>
        )}
        {category === 'loaned' && (
          <span>🚀 <strong>Active loans:</strong> Laptops currently with employees/travelers. Tick checkboxes and use <strong>Return</strong> or <strong>↶ Revert pickup</strong> above the table. Click column header to sort.</span>
        )}
        {category === 'overdue' && (
          <span>⚠️ <strong>Overdue loans:</strong> End date has passed today and equipment has not been returned. Tick checkboxes to record bulk returns or delete records.</span>
        )}
        {category === 'returned' && (
          <span>📦 <strong>Returned & archived:</strong> Completed laptop loans. Click <strong>↶ Revert</strong> if returned by mistake to move back to Loaned.</span>
        )}
        {category === 'all' && (
          <span>🗂️ <strong>All records:</strong> Complete schedule and loan history with full status management.</span>
        )}
      </div>

      <section className="panel">
        <SearchBar
          id="loan-search-input"
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          searchFieldOptions={LOAN_SEARCH_FIELDS}
          placeholder="Search Knox ID, assignee name, laptop asset #, location, IP address, note..."
        />

        {hasSearch && (
          <div className="loan-search-meta">
            <span>
              Showing <strong>{displayedLoans.length}</strong> of <strong>{totalCategoryCount}</strong> loan{totalCategoryCount === 1 ? '' : 's'}
              {searchField !== 'All fields' ? ` matching in ${searchField}` : ''}
              {` under ${category === 'all' ? 'All records' : category}`}
            </span>
            <button
              type="button"
              className="loan-search-clear-link"
              onClick={() => setSearchTerm('')}
            >
              Clear search
            </button>
          </div>
        )}

        {displayedLoans.length === 0 && hasSearch && filteredAllLoans.length > 0 && (
          <div className="loan-search-cross-category-hint">
            <span>
              💡 No matches in <strong>{category === 'all' ? 'current filter' : category}</strong>, but found{' '}
              <strong>{filteredAllLoans.length}</strong> matching record{filteredAllLoans.length === 1 ? '' : 's'} across other categories:
            </span>
            <div className="cross-category-links">
              {filteredScheduledLoans.length > 0 && category !== 'scheduled' && (
                <button
                  type="button"
                  className="btn-hint-category"
                  onClick={() => setCategory('scheduled')}
                >
                  Scheduled ({filteredScheduledLoans.length})
                </button>
              )}
              {filteredLoanedLoans.length > 0 && category !== 'loaned' && (
                <button
                  type="button"
                  className="btn-hint-category"
                  onClick={() => setCategory('loaned')}
                >
                  Loaned ({filteredLoanedLoans.length})
                </button>
              )}
              {filteredOverdueLoans.length > 0 && category !== 'overdue' && (
                <button
                  type="button"
                  className="btn-hint-category"
                  onClick={() => setCategory('overdue')}
                >
                  Overdue ({filteredOverdueLoans.length})
                </button>
              )}
              {filteredReturnedLoans.length > 0 && category !== 'returned' && (
                <button
                  type="button"
                  className="btn-hint-category"
                  onClick={() => setCategory('returned')}
                >
                  Returned ({filteredReturnedLoans.length})
                </button>
              )}
              {category !== 'all' && (
                <button
                  type="button"
                  className="btn-hint-category"
                  onClick={() => setCategory('all')}
                >
                  All records ({filteredAllLoans.length})
                </button>
              )}
            </div>
          </div>
        )}

        {isSelectableTab && displayedLoans.length > 0 && (
          <div className={`loan-bulk-toolbar ${selectedLoans.length ? 'has-selection' : ''}`}>
            <span className="loan-bulk-toolbar-info">
              {selectedLoans.length
                ? `${selectedLoans.length} of ${displayedLoans.length} selected`
                : 'Select loans with the checkboxes to return, revert or delete them.'}
            </span>
            <div className="loan-bulk-toolbar-actions">
              <button
                id="loan-bulk-return-btn"
                className="button secondary"
                disabled={!selectedLoans.length}
                onClick={() => handleOpenReturn(selectedLoans)}
                title="Record return & archive for selected loans"
              >
                ↙ Return{selectedLoans.length ? ` (${selectedLoans.length})` : ''}
              </button>
              <button
                id="loan-bulk-revert-btn"
                className="button ghost"
                disabled={!selectedLoans.length}
                onClick={handleBulkRevertPickup}
                title="Clear pickup date and move selected loans back to Scheduled"
              >
                ↶ Revert pickup{selectedLoans.length ? ` (${selectedLoans.length})` : ''}
              </button>
              <button
                id="loan-bulk-delete-btn"
                className="button danger"
                disabled={!selectedLoans.length}
                onClick={() => setShowBulkDelete(true)}
                title="Permanently delete selected loan records"
              >
                🗑 Delete{selectedLoans.length ? ` (${selectedLoans.length})` : ''}
              </button>
            </div>
          </div>
        )}
        <LoanTable
          loans={displayedLoans}
          assets={db.assets}
          editMode={editMode}
          onSaveLoan={handleInlineSave}
          onPickupLoan={handleOpenPickup}
          onRevertPickup={handleRevertPickup}
          onReturnLoan={handleOpenReturn}
          onRevertReturn={handleRevertReturn}
          onDeleteLoan={(loan) => setDeleteTarget(loan)}
          onEditFullLoan={(id) => setEditLoanId(id)}
          selectable={isSelectableTab}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          emptyMessage={
            hasSearch ? (
              <div className="loan-search-empty">
                <p>
                  No loans match &ldquo;<strong>{searchTerm}</strong>&rdquo;
                  {searchField !== 'All fields' ? ` in ${searchField}` : ''} under{' '}
                  <strong>{category === 'all' ? 'All records' : category}</strong>.
                </p>
                <button
                  type="button"
                  className="button ghost small-btn"
                  onClick={() => setSearchTerm('')}
                >
                  Clear search
                </button>
              </div>
            ) : undefined
          }
        />
      </section>

      {/* Pickup modal */}
      <Modal open={pickupTarget !== null} size="wide" onClose={() => setPickupTarget(null)}>
        {pickupTarget && (
          <div className="pickup-dialog">
            <div className="modal-header-section">
              <h2>Record device pickup &amp; accessories</h2>
              <p className="modal-intro">
                Review planned schedule vs. actual pickup time, and verify accessories (keyboard, mouse, adapter, etc.) handed over.
              </p>
            </div>

            {/* Device & Assignee Summary Card */}
            <div className="loan-pickup-summary-card">
              <div className="loan-summary-item">
                <span className="summary-label">Assignee</span>
                <strong className="summary-val">{pickupTarget.assignee || 'Unknown'}</strong>
                <span className="summary-sub">({pickupTarget.assigneeType || 'Employee'})</span>
              </div>
              <div className="loan-summary-item">
                <span className="summary-label">Knox ID</span>
                <code className="summary-code">{pickupTarget.knoxId || '—'}</code>
              </div>
              <div className="loan-summary-item">
                <span className="summary-label">Laptop / Asset #</span>
                <strong className="summary-val summary-laptop-badge">{pickupTarget.assetCode}</strong>
              </div>
              <div className="loan-summary-item">
                <span className="summary-label">Location</span>
                <span className="summary-val">{pickupForm.location || 'Head Office'}</span>
              </div>
              {pickupTarget.ip && (
                <div className="loan-summary-item">
                  <span className="summary-label">IP Address</span>
                  <code className="summary-code">{pickupTarget.ip}</code>
                </div>
              )}
            </div>

            <div className="pickup-modal-sections">
              {/* Timing & Schedule Column */}
              <div className="pickup-modal-panel">
                <div className="panel-title-row">
                  <h4>📅 Schedule &amp; Pickup Timing</h4>
                  <span className="panel-badge-info">Planned vs. Actual</span>
                </div>
                <p className="field-hint" style={{ marginTop: '2px', marginBottom: '10px' }}>
                  Sometimes planned schedule and actual pickup date differ. Adjust either below.
                </p>

                <div className="field">
                  <label htmlFor="modal-pickupDate">
                    Actual pickup timestamp <span style={{ color: '#be665a' }}>*</span>
                  </label>
                  <div className="timestamp-input-row">
                    <input
                      id="modal-pickupDate"
                      type="datetime-local"
                      value={pickupForm.pickupDate}
                      onChange={(e) => updatePickupField('pickupDate', e.target.value)}
                    />
                    <button
                      type="button"
                      className="button ghost"
                      style={{ whiteSpace: 'nowrap', padding: '9px 12px' }}
                      onClick={() => updatePickupField('pickupDate', nowLocalIso())}
                      title="Reset to current time"
                    >
                      ◷ Current time
                    </button>
                  </div>
                </div>

                <div className="pickup-dates-row">
                  <div className="field">
                    <label htmlFor="modal-startDate">Planned start date</label>
                    <input
                      id="modal-startDate"
                      type="date"
                      value={pickupForm.startDate}
                      onChange={(e) => updatePickupField('startDate', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="modal-endDate">Planned due / end date</label>
                    <input
                      id="modal-endDate"
                      type="date"
                      value={pickupForm.endDate}
                      onChange={(e) => updatePickupField('endDate', e.target.value)}
                    />
                  </div>
                </div>

                <div className="field" style={{ marginTop: '8px' }}>
                  <label htmlFor="modal-pickupLocation">Pickup / Rental location</label>
                  <input
                    id="modal-pickupLocation"
                    value={pickupForm.location}
                    onChange={(e) => updatePickupField('location', e.target.value)}
                    placeholder="e.g. Head Office, Lab 2, etc."
                  />
                </div>
              </div>

              {/* Equipment Checklist Column */}
              <div className="pickup-modal-panel">
                <div className="panel-title-row">
                  <h4>🎒 Equipment Checklist (Accessories)</h4>
                  <span className="panel-badge-info">Keyboard, Mouse &amp; Cables</span>
                </div>
                <p className="field-hint" style={{ marginTop: '2px', marginBottom: '10px' }}>
                  Verify items handed over. Click quick buttons or type quantities/details.
                </p>

                <div className="equipment-accessory-list">
                  {/* Keyboard - Highlighted */}
                  <div className="accessory-row highlight-row">
                    <div className="accessory-info">
                      <span className="accessory-icon">⌨️</span>
                      <div>
                        <strong>Keyboard</strong>
                        <span className="accessory-desc">External keyboard</span>
                      </div>
                    </div>
                    <div className="accessory-control">
                      <div className="quick-btn-group">
                        <button
                          type="button"
                          className={`qty-btn ${pickupForm.keyboard === '0' || !pickupForm.keyboard ? 'active' : ''}`}
                          onClick={() => updatePickupField('keyboard', '0')}
                        >
                          0
                        </button>
                        <button
                          type="button"
                          className={`qty-btn ${pickupForm.keyboard === '1' ? 'active' : ''}`}
                          onClick={() => updatePickupField('keyboard', '1')}
                        >
                          1
                        </button>
                      </div>
                      <input
                        type="text"
                        className="accessory-input"
                        value={pickupForm.keyboard}
                        onChange={(e) => updatePickupField('keyboard', e.target.value)}
                        placeholder="Qty"
                      />
                    </div>
                  </div>

                  {/* Mouse - Highlighted */}
                  <div className="accessory-row highlight-row">
                    <div className="accessory-info">
                      <span className="accessory-icon">🖱️</span>
                      <div>
                        <strong>Mouse</strong>
                        <span className="accessory-desc">Wireless / wired mouse</span>
                      </div>
                    </div>
                    <div className="accessory-control">
                      <div className="quick-btn-group">
                        <button
                          type="button"
                          className={`qty-btn ${pickupForm.mouse === '0' || !pickupForm.mouse ? 'active' : ''}`}
                          onClick={() => updatePickupField('mouse', '0')}
                        >
                          0
                        </button>
                        <button
                          type="button"
                          className={`qty-btn ${pickupForm.mouse === '1' ? 'active' : ''}`}
                          onClick={() => updatePickupField('mouse', '1')}
                        >
                          1
                        </button>
                      </div>
                      <input
                        type="text"
                        className="accessory-input"
                        value={pickupForm.mouse}
                        onChange={(e) => updatePickupField('mouse', e.target.value)}
                        placeholder="Qty"
                      />
                    </div>
                  </div>

                  {/* Charging Adapter */}
                  <div className="accessory-row">
                    <div className="accessory-info">
                      <span className="accessory-icon">🔌</span>
                      <div>
                        <strong>Charging Adapter</strong>
                        <span className="accessory-desc">Power brick</span>
                      </div>
                    </div>
                    <div className="accessory-control">
                      <div className="quick-btn-group">
                        <button
                          type="button"
                          className={`qty-btn ${pickupForm.adapter === '0' ? 'active' : ''}`}
                          onClick={() => updatePickupField('adapter', '0')}
                        >
                          0
                        </button>
                        <button
                          type="button"
                          className={`qty-btn ${pickupForm.adapter === '1' ? 'active' : ''}`}
                          onClick={() => updatePickupField('adapter', '1')}
                        >
                          1
                        </button>
                      </div>
                      <input
                        type="text"
                        className="accessory-input"
                        value={pickupForm.adapter}
                        onChange={(e) => updatePickupField('adapter', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Charging Cable */}
                  <div className="accessory-row">
                    <div className="accessory-info">
                      <span className="accessory-icon">⚡</span>
                      <div>
                        <strong>Charging Cable</strong>
                        <span className="accessory-desc">AC power cable</span>
                      </div>
                    </div>
                    <div className="accessory-control">
                      <div className="quick-btn-group">
                        <button
                          type="button"
                          className={`qty-btn ${pickupForm.cable === '0' ? 'active' : ''}`}
                          onClick={() => updatePickupField('cable', '0')}
                        >
                          0
                        </button>
                        <button
                          type="button"
                          className={`qty-btn ${pickupForm.cable === '1' ? 'active' : ''}`}
                          onClick={() => updatePickupField('cable', '1')}
                        >
                          1
                        </button>
                      </div>
                      <input
                        type="text"
                        className="accessory-input"
                        value={pickupForm.cable}
                        onChange={(e) => updatePickupField('cable', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Dongle */}
                  <div className="accessory-row">
                    <div className="accessory-info">
                      <span className="accessory-icon">🔄</span>
                      <div>
                        <strong>Dongle / Hub</strong>
                        <span className="accessory-desc">USB-C multi-adapter</span>
                      </div>
                    </div>
                    <div className="accessory-control">
                      <div className="quick-btn-group">
                        <button
                          type="button"
                          className={`qty-btn ${pickupForm.dongle === '0' || !pickupForm.dongle ? 'active' : ''}`}
                          onClick={() => updatePickupField('dongle', '0')}
                        >
                          0
                        </button>
                        <button
                          type="button"
                          className={`qty-btn ${pickupForm.dongle === '1' ? 'active' : ''}`}
                          onClick={() => updatePickupField('dongle', '1')}
                        >
                          1
                        </button>
                      </div>
                      <input
                        type="text"
                        className="accessory-input"
                        value={pickupForm.dongle}
                        onChange={(e) => updatePickupField('dongle', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Monitor */}
                  <div className="accessory-row">
                    <div className="accessory-info">
                      <span className="accessory-icon">🖥️</span>
                      <div>
                        <strong>Monitor</strong>
                        <span className="accessory-desc">Asset tag / count</span>
                      </div>
                    </div>
                    <div className="accessory-control">
                      <input
                        type="text"
                        className="accessory-input accessory-input-wide"
                        value={pickupForm.monitor}
                        onChange={(e) => updatePickupField('monitor', e.target.value)}
                        placeholder="Tag or 0"
                      />
                    </div>
                  </div>

                  {/* Ethernet Cable */}
                  <div className="accessory-row">
                    <div className="accessory-info">
                      <span className="accessory-icon">🌐</span>
                      <div>
                        <strong>Ethernet cable</strong>
                        <span className="accessory-desc">LAN RJ45</span>
                      </div>
                    </div>
                    <div className="accessory-control">
                      <div className="quick-btn-group">
                        <button
                          type="button"
                          className={`qty-btn ${pickupForm.ethernetCable === '0' || !pickupForm.ethernetCable ? 'active' : ''}`}
                          onClick={() => updatePickupField('ethernetCable', '0')}
                        >
                          0
                        </button>
                        <button
                          type="button"
                          className={`qty-btn ${pickupForm.ethernetCable === '1' ? 'active' : ''}`}
                          onClick={() => updatePickupField('ethernetCable', '1')}
                        >
                          1
                        </button>
                      </div>
                      <input
                        type="text"
                        className="accessory-input"
                        value={pickupForm.ethernetCable}
                        onChange={(e) => updatePickupField('ethernetCable', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Others */}
                  <div className="accessory-row">
                    <div className="accessory-info">
                      <span className="accessory-icon">💼</span>
                      <div>
                        <strong>Others</strong>
                        <span className="accessory-desc">Bag, lock, headset, etc.</span>
                      </div>
                    </div>
                    <div className="accessory-control">
                      <input
                        type="text"
                        className="accessory-input accessory-input-wide"
                        value={pickupForm.others}
                        onChange={(e) => updatePickupField('others', e.target.value)}
                        placeholder="e.g. Laptop bag, security lock"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pickup Note / Remarks */}
            <div className="field" style={{ marginTop: '14px' }}>
              <label htmlFor="modal-pickupNote">Pickup notes / remarks</label>
              <textarea
                id="modal-pickupNote"
                rows={2}
                value={pickupForm.note}
                onChange={(e) => updatePickupField('note', e.target.value)}
                placeholder="Optional notes regarding pickup condition, handover observations, or traveler requests..."
              />
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setPickupTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button btn-pickup"
                style={{ padding: '9px 18px', fontWeight: 700 }}
                onClick={handleConfirmPickup}
              >
                ↗ Confirm pickup &amp; handover
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Return & Archive timestamp modal (single or bulk) */}
      <Modal open={returnTargets !== null} size={returnTargets?.length === 1 ? 'wide' : undefined} onClose={() => setReturnTargets(null)}>
        {returnTargets && returnTargets.length === 1 && (
          <div className="return-dialog">
            <div className="modal-header-section">
              <h2>Record return &amp; verify accessories</h2>
              <p className="modal-intro">
                Confirm return of device and verify all accessories (keyboard, mouse, adapter, etc.). Actual return date and checked-in items can be adjusted below.
              </p>
            </div>

            {/* Device & Assignee Summary Card */}
            <div className="loan-pickup-summary-card">
              <div className="loan-summary-item">
                <span className="summary-label">Assignee</span>
                <strong className="summary-val">{returnTargets[0].assignee || 'Unknown'}</strong>
                <span className="summary-sub">({returnTargets[0].assigneeType || 'Employee'})</span>
              </div>
              <div className="loan-summary-item">
                <span className="summary-label">Knox ID</span>
                <code className="summary-code">{returnTargets[0].knoxId || '—'}</code>
              </div>
              <div className="loan-summary-item">
                <span className="summary-label">Laptop / Asset #</span>
                <strong className="summary-val summary-laptop-badge">{returnTargets[0].assetCode}</strong>
              </div>
              <div className="loan-summary-item">
                <span className="summary-label">Picked up on</span>
                <span className="summary-val">{readableLoanDate(returnTargets[0].pickupDate) || '—'}</span>
              </div>
              <div className="loan-summary-item">
                <span className="summary-label">Scheduled Due</span>
                <span className="summary-val">{readableLoanDate(returnTargets[0].endDate || returnTargets[0].dueDate) || '—'}</span>
              </div>
            </div>

            <div className="pickup-modal-sections">
              {/* Return Timing Column */}
              <div className="pickup-modal-panel">
                <div className="panel-title-row">
                  <h4>📦 Return Timing</h4>
                  <span className="panel-badge-info">Actual Check-in</span>
                </div>
                <p className="field-hint" style={{ marginTop: '2px', marginBottom: '10px' }}>
                  Timestamp defaults to current time. Adjust if the equipment was returned earlier or later.
                </p>

                <div className="field">
                  <label htmlFor="modal-returnDate">
                    Actual return timestamp <span style={{ color: '#be665a' }}>*</span>
                  </label>
                  <div className="timestamp-input-row">
                    <input
                      id="modal-returnDate"
                      type="datetime-local"
                      value={returnForm.returnDate}
                      onChange={(e) => updateReturnField('returnDate', e.target.value)}
                    />
                    <button
                      type="button"
                      className="button ghost"
                      style={{ whiteSpace: 'nowrap', padding: '9px 12px' }}
                      onClick={() => updateReturnField('returnDate', nowLocalIso())}
                      title="Reset to current time"
                    >
                      ◷ Current time
                    </button>
                  </div>
                </div>

                <div className="return-status-callout">
                  <span className="callout-icon">ℹ️</span>
                  <div>
                    <strong>Device Check-in to IT Department</strong>
                    <p style={{ margin: '3px 0 0', lineHeight: 1.35 }}>
                      Confirming return will change asset <strong>{returnTargets[0].assetCode}</strong> status back to <strong>Available</strong> in IT department inventory and archive this loan record.
                    </p>
                  </div>
                </div>
              </div>

              {/* Equipment Return Verification Column */}
              <div className="pickup-modal-panel">
                <div className="panel-title-row">
                  <h4>✅ Returned Accessories Checklist</h4>
                  <span className="panel-badge-info">Verify Check-in</span>
                </div>
                <p className="field-hint" style={{ marginTop: '2px', marginBottom: '10px' }}>
                  Verify that keyboard, mouse, and cables were returned. Adjust quantities if any item is retained or missing.
                </p>

                <div className="equipment-accessory-list">
                  {/* Keyboard - Highlighted */}
                  <div className="accessory-row highlight-row">
                    <div className="accessory-info">
                      <span className="accessory-icon">⌨️</span>
                      <div>
                        <strong>Keyboard</strong>
                        <span className="accessory-desc">External keyboard</span>
                      </div>
                    </div>
                    <div className="accessory-control">
                      <div className="quick-btn-group">
                        <button
                          type="button"
                          className={`qty-btn ${returnForm.keyboard === '0' || !returnForm.keyboard ? 'active' : ''}`}
                          onClick={() => updateReturnField('keyboard', '0')}
                          title="0 returned (missing or kept)"
                        >
                          0
                        </button>
                        <button
                          type="button"
                          className={`qty-btn ${returnForm.keyboard === '1' ? 'active' : ''}`}
                          onClick={() => updateReturnField('keyboard', '1')}
                          title="1 returned"
                        >
                          1
                        </button>
                      </div>
                      <input
                        type="text"
                        className="accessory-input"
                        value={returnForm.keyboard}
                        onChange={(e) => updateReturnField('keyboard', e.target.value)}
                        placeholder="Returned qty"
                      />
                    </div>
                  </div>

                  {/* Mouse - Highlighted */}
                  <div className="accessory-row highlight-row">
                    <div className="accessory-info">
                      <span className="accessory-icon">🖱️</span>
                      <div>
                        <strong>Mouse</strong>
                        <span className="accessory-desc">Wireless / wired mouse</span>
                      </div>
                    </div>
                    <div className="accessory-control">
                      <div className="quick-btn-group">
                        <button
                          type="button"
                          className={`qty-btn ${returnForm.mouse === '0' || !returnForm.mouse ? 'active' : ''}`}
                          onClick={() => updateReturnField('mouse', '0')}
                          title="0 returned (missing or kept)"
                        >
                          0
                        </button>
                        <button
                          type="button"
                          className={`qty-btn ${returnForm.mouse === '1' ? 'active' : ''}`}
                          onClick={() => updateReturnField('mouse', '1')}
                          title="1 returned"
                        >
                          1
                        </button>
                      </div>
                      <input
                        type="text"
                        className="accessory-input"
                        value={returnForm.mouse}
                        onChange={(e) => updateReturnField('mouse', e.target.value)}
                        placeholder="Returned qty"
                      />
                    </div>
                  </div>

                  {/* Charging Adapter */}
                  <div className="accessory-row">
                    <div className="accessory-info">
                      <span className="accessory-icon">🔌</span>
                      <div>
                        <strong>Charging Adapter</strong>
                        <span className="accessory-desc">Power brick</span>
                      </div>
                    </div>
                    <div className="accessory-control">
                      <div className="quick-btn-group">
                        <button
                          type="button"
                          className={`qty-btn ${returnForm.adapter === '0' ? 'active' : ''}`}
                          onClick={() => updateReturnField('adapter', '0')}
                        >
                          0
                        </button>
                        <button
                          type="button"
                          className={`qty-btn ${returnForm.adapter === '1' ? 'active' : ''}`}
                          onClick={() => updateReturnField('adapter', '1')}
                        >
                          1
                        </button>
                      </div>
                      <input
                        type="text"
                        className="accessory-input"
                        value={returnForm.adapter}
                        onChange={(e) => updateReturnField('adapter', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Charging Cable */}
                  <div className="accessory-row">
                    <div className="accessory-info">
                      <span className="accessory-icon">⚡</span>
                      <div>
                        <strong>Charging Cable</strong>
                        <span className="accessory-desc">AC power cable</span>
                      </div>
                    </div>
                    <div className="accessory-control">
                      <div className="quick-btn-group">
                        <button
                          type="button"
                          className={`qty-btn ${returnForm.cable === '0' ? 'active' : ''}`}
                          onClick={() => updateReturnField('cable', '0')}
                        >
                          0
                        </button>
                        <button
                          type="button"
                          className={`qty-btn ${returnForm.cable === '1' ? 'active' : ''}`}
                          onClick={() => updateReturnField('cable', '1')}
                        >
                          1
                        </button>
                      </div>
                      <input
                        type="text"
                        className="accessory-input"
                        value={returnForm.cable}
                        onChange={(e) => updateReturnField('cable', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Dongle */}
                  <div className="accessory-row">
                    <div className="accessory-info">
                      <span className="accessory-icon">🔄</span>
                      <div>
                        <strong>Dongle / Hub</strong>
                        <span className="accessory-desc">USB-C multi-adapter</span>
                      </div>
                    </div>
                    <div className="accessory-control">
                      <div className="quick-btn-group">
                        <button
                          type="button"
                          className={`qty-btn ${returnForm.dongle === '0' || !returnForm.dongle ? 'active' : ''}`}
                          onClick={() => updateReturnField('dongle', '0')}
                        >
                          0
                        </button>
                        <button
                          type="button"
                          className={`qty-btn ${returnForm.dongle === '1' ? 'active' : ''}`}
                          onClick={() => updateReturnField('dongle', '1')}
                        >
                          1
                        </button>
                      </div>
                      <input
                        type="text"
                        className="accessory-input"
                        value={returnForm.dongle}
                        onChange={(e) => updateReturnField('dongle', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Monitor */}
                  <div className="accessory-row">
                    <div className="accessory-info">
                      <span className="accessory-icon">🖥️</span>
                      <div>
                        <strong>Monitor</strong>
                        <span className="accessory-desc">Asset tag / count</span>
                      </div>
                    </div>
                    <div className="accessory-control">
                      <input
                        type="text"
                        className="accessory-input accessory-input-wide"
                        value={returnForm.monitor}
                        onChange={(e) => updateReturnField('monitor', e.target.value)}
                        placeholder="Tag or 0"
                      />
                    </div>
                  </div>

                  {/* Ethernet Cable */}
                  <div className="accessory-row">
                    <div className="accessory-info">
                      <span className="accessory-icon">🌐</span>
                      <div>
                        <strong>Ethernet cable</strong>
                        <span className="accessory-desc">LAN RJ45</span>
                      </div>
                    </div>
                    <div className="accessory-control">
                      <div className="quick-btn-group">
                        <button
                          type="button"
                          className={`qty-btn ${returnForm.ethernetCable === '0' || !returnForm.ethernetCable ? 'active' : ''}`}
                          onClick={() => updateReturnField('ethernetCable', '0')}
                        >
                          0
                        </button>
                        <button
                          type="button"
                          className={`qty-btn ${returnForm.ethernetCable === '1' ? 'active' : ''}`}
                          onClick={() => updateReturnField('ethernetCable', '1')}
                        >
                          1
                        </button>
                      </div>
                      <input
                        type="text"
                        className="accessory-input"
                        value={returnForm.ethernetCable}
                        onChange={(e) => updateReturnField('ethernetCable', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Others */}
                  <div className="accessory-row">
                    <div className="accessory-info">
                      <span className="accessory-icon">💼</span>
                      <div>
                        <strong>Others</strong>
                        <span className="accessory-desc">Bag, lock, headset, etc.</span>
                      </div>
                    </div>
                    <div className="accessory-control">
                      <input
                        type="text"
                        className="accessory-input accessory-input-wide"
                        value={returnForm.others}
                        onChange={(e) => updateReturnField('others', e.target.value)}
                        placeholder="e.g. Laptop bag, security lock"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Return Notes / Remarks */}
            <div className="field" style={{ marginTop: '14px' }}>
              <label htmlFor="modal-returnNote">Return condition notes / remarks</label>
              <textarea
                id="modal-returnNote"
                rows={2}
                value={returnForm.note}
                onChange={(e) => updateReturnField('note', e.target.value)}
                placeholder="Optional notes regarding return condition (e.g. Good condition, mouse not returned, damaged adapter, etc.)..."
              />
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setReturnTargets(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button btn-return"
                style={{ padding: '9px 18px', fontWeight: 700 }}
                onClick={handleConfirmReturn}
              >
                ↙ Confirm return &amp; archive
              </button>
            </div>
          </div>
        )}

        {/* Multi-loan bulk return dialog */}
        {returnTargets && returnTargets.length > 1 && (
          <div className="return-dialog">
            <h2>
              Record return &amp; archive
              {` (${returnTargets.length} laptops)`}
            </h2>
            <p className="modal-intro">
              Timestamp defaults to current time. Confirming return will return the laptops to IT department and archive these loan records.
            </p>

            <div className="timestamp-dialog-card">
              <ul className="bulk-delete-list">
                {returnTargets.map((l) => (
                  <li key={l.id}>
                    <strong>{l.assetCode}</strong> <code>{l.knoxId || '—'}</code>
                    <span className="bulk-delete-meta">
                      {' '}— {l.assignee || 'Unknown'}, picked up {readableLoanDate(l.pickupDate) || '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="field">
              <label htmlFor="returnTimeInput">Return timestamp (default: current time)</label>
              <div className="timestamp-input-row">
                <input
                  id="returnTimeInput"
                  type="datetime-local"
                  value={returnTime}
                  onChange={(e) => setReturnTime(e.target.value)}
                />
                <button
                  type="button"
                  className="button ghost"
                  style={{ whiteSpace: 'nowrap', padding: '9px 12px' }}
                  onClick={() => setReturnTime(nowLocalIso())}
                  title="Reset to current time"
                >
                  ◷ Current time
                </button>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setReturnTargets(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button btn-return"
                style={{ padding: '9px 18px', fontWeight: 700 }}
                onClick={handleConfirmReturn}
              >
                Confirm return &amp; archive ({returnTargets.length})
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk Deletion Confirmation Modal (Loaned tab) */}
      <Modal open={showBulkDelete} size="sm" onClose={() => setShowBulkDelete(false)}>
        <div className="delete-dialog">
          <h2>Delete {selectedLoans.length} loan record{selectedLoans.length === 1 ? '' : 's'}</h2>
          <p className="modal-intro">
            Are you sure you want to permanently delete the selected loan record{selectedLoans.length === 1 ? '' : 's'}? This action cannot be undone.
          </p>
          <div className="timestamp-dialog-card">
            <ul className="bulk-delete-list">
              {selectedLoans.map((l) => (
                <li key={l.id}>
                  <strong>{l.assetCode}</strong> <code>{l.knoxId || '—'}</code>
                  <span className="bulk-delete-meta"> — {l.assignee || 'Unknown'}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="form-actions">
            <button type="button" className="button ghost" onClick={() => setShowBulkDelete(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="button danger-btn"
              style={{ background: '#be665a', borderColor: '#be665a', color: 'white' }}
              onClick={handleConfirmBulkDelete}
            >
              Delete permanently
            </button>
          </div>
        </div>
      </Modal>

      {/* TXT / Excel Loan Import Preview Modal */}
      <Modal open={importPreview !== null} size="wide" onClose={() => setImportPreview(null)}>
        {importPreview && (
          <div className="import-preview">
            <h2>Import loans from file</h2>
            <p className="modal-intro">
              <code>{importPreview.fileName}</code> — review the loan records found in the file before applying.
            </p>

            <div className="import-stats">
              <div className="import-stat ok">
                <strong>{importPreview.newCount}</strong>
                <span>new loans to add</span>
              </div>
              <div className={`import-stat ${importPreview.updatedCount > 0 ? 'warn' : 'muted'}`}>
                <strong>{importPreview.updatedCount}</strong>
                <span>existing loans to update</span>
              </div>
              <div className="import-stat muted">
                <strong>{importPreview.synthesizedAssets?.length || 0}</strong>
                <span>unknown laptops to register</span>
              </div>
            </div>

            <div className="table-wrap import-preview-table" style={{ maxHeight: '380px', overflow: 'auto' }}>
              <table style={{ whiteSpace: 'nowrap', fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Name</th>
                    <th>Knox ID</th>
                    <th>Rental Location</th>
                    <th>IP</th>
                    <th>Start Date</th>
                    <th>Pickup Date</th>
                    <th>End Date</th>
                    <th>Return Date</th>
                    <th>Laptop</th>
                    <th>Charging Adapter</th>
                    <th>Charging Cable</th>
                    <th>Dongle</th>
                    <th>Keyboard</th>
                    <th>Mouse</th>
                    <th>Monitor</th>
                    <th>Ethernet cable</th>
                    <th>others</th>
                    <th>Note</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.loans.map((l, idx) => {
                    const eq = l.equipment || {};
                    const isReturned = Boolean(l.returnDate);
                    const statusLabel = isReturned ? 'Returned' : l.pickupDate ? 'Loaned' : 'Scheduled';
                    return (
                      <tr key={l.id || idx}>
                        <td>{l.no || idx + 1}</td>
                        <td><strong>{l.assignee || '—'}</strong></td>
                        <td><code>{l.knoxId || '—'}</code></td>
                        <td>{l.location || '—'}</td>
                        <td><code>{l.ip || '—'}</code></td>
                        <td>{readableLoanDate(l.startDate) || '—'}</td>
                        <td>{readableLoanDate(l.pickupDate) || '—'}</td>
                        <td>{readableLoanDate(l.endDate) || '—'}</td>
                        <td>{readableLoanDate(l.returnDate) || '—'}</td>
                        <td><strong>{l.assetCode}</strong></td>
                        <td>{eq.Adapter ?? '1'}</td>
                        <td>{eq.Cable ?? '1'}</td>
                        <td>{eq.Dongle ?? '0'}</td>
                        <td>{eq.Keyboard ?? '0'}</td>
                        <td>{eq.Mouse ?? '0'}</td>
                        <td>{eq.Monitor ?? '0'}</td>
                        <td>{eq['Ethernet cable'] ?? '0'}</td>
                        <td>{l.others || '—'}</td>
                        <td>{l.note || '—'}</td>
                        <td>
                          <span className={`status ${statusClass(statusLabel)}`}>
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="form-actions">
              <button type="button" className="button ghost" onClick={() => setImportPreview(null)}>
                Cancel
              </button>
              <button id="loan-import-confirm" type="button" className="button" onClick={handleConfirmImport}>
                Import {importPreview.loans.length} loan{importPreview.loans.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Deletion Confirmation Modal */}
      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        {deleteTarget && (
          <div className="delete-dialog">
            <h2>Delete loan record</h2>
            <p className="modal-intro">
              Are you sure you want to permanently delete this loan record? This action cannot be undone.
            </p>

            <div className="timestamp-dialog-card">
              <dl>
                <dt>Assignee:</dt>
                <dd><strong>{deleteTarget.assignee || 'Unknown'}</strong></dd>
                <dt>Knox ID:</dt>
                <dd><code>{deleteTarget.knoxId || '—'}</code></dd>
                <dt>Laptop:</dt>
                <dd>{deleteTarget.assetCode}</dd>
                <dt>Status:</dt>
                <dd>{deleteTarget.returnDate ? 'Returned' : deleteTarget.pickupDate ? 'Loaned' : 'Scheduled'}</dd>
              </dl>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button danger-btn"
                style={{ background: '#be665a', borderColor: '#be665a', color: 'white' }}
                onClick={handleConfirmDelete}
              >
                Delete permanently
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create loan modal */}
      <Modal open={showCreate} size="wide" onClose={() => setShowCreate(false)}>
        <LoanForm
          defaultAssigneeType="Business traveler"
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setCategory('scheduled');
          }}
        />
      </Modal>

      {/* Edit loan modal (fallback / full edit from expanded row) */}
      <Modal open={editLoanId !== null} size="wide" onClose={() => setEditLoanId(null)}>
        {editLoanId && (
          <EditLoanForm loanId={editLoanId} onClose={() => setEditLoanId(null)} />
        )}
      </Modal>
    </>
  );
}
