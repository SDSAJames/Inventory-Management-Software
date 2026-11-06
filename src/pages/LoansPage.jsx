import LoanReturnForm from '../components/LoanReturnForm';
import LoanSummary from '../components/LoanSummary';
import { createLoanReturnForm, buildLoanReturnDetails } from '../lib/loanForms';
import TimestampField from '../components/TimestampField';
import EquipmentRequestFields from '../components/EquipmentRequestFields';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDb } from '../hooks/useDb';
import { buildLoanEquipment, buildReturnedEquipment, equipmentQuantitiesToForm, updateLoanFormField, getReturnStatus, getLoanEndDate } from "../lib/loanEquipment";
import { useToast } from '../hooks/useToast';
import { nowLocalIso, readableLoanDate, todayIso, statusClass } from '../lib/utils';
import { parseDelimitedText, parseLoansText, detectFileType } from '../lib/txtImport';
import { findLoanMatchIndex } from '../../shared/loanIdentity.js';
import { LOAN_HEADERS, XLSX_MIME } from '../lib/constants';

import { loansToRows } from '../lib/loanExcel';
import LoanTable from '../components/LoanTable';
import SearchBar from '../components/SearchBar';
import Modal from '../components/Modal';
import LoanForm from '../components/LoanForm';
import EditLoanForm from '../components/EditLoanForm';
import { LOAN_SEARCH_FIELDS, groupLoans, filterLoanGroups, getLoanGroup } from '../lib/loanSelectors.js';
import { DEFAULT_LOCATION } from '../../shared/referenceData.js';
import { readableTransferNote } from '../lib/transferNotes';
import AssetAutocomplete from '../components/AssetAutocomplete';
import { PC_CATEGORIES } from '../lib/assetCategories';
import LoanTransferForm from '../components/LoanTransferForm';
import LoanDirectoryFields from '../components/LoanDirectoryFields';
import EquipmentAccessoryList from '../components/EquipmentAccessoryList';

export default function LoansPage() {
  const { db, updateLoan, pickupLoan, setLoanReadyForPickup, revertPickup, returnLoan, unarchiveLoan, deleteLoan, mergeImportData } = useDb();
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
  const [transferTarget, setTransferTarget] = useState(null);
  const [editLoanId, setEditLoanId] = useState(null);
  const [editMode, setEditMode] = useState(false);

  // Pickup modal state
  const [pickupTarget, setPickupTarget] = useState(null);
  const [pickupForm, setPickupForm] = useState({
    pickupDate: '',
    startDate: '',
    endDate: '',
    location: '',
    ...equipmentQuantitiesToForm(),
    others: '',
    note: '',
  });

  // Return & Archive modal state (one or many loans)
  const [returnTargets, setReturnTargets] = useState(null);
  const [returnTime, setReturnTime] = useState('');
  const [returnForm, setReturnForm] = useState({
    returnDate: '',
    ...equipmentQuantitiesToForm({}, { Adapter: 1, Cable: 1 }),
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

  const loanGroups = useMemo(() => groupLoans(db.loans), [db.loans]);
  const {
    scheduled: scheduledLoans, assigned: assignedLoans, loaned: loanedLoans, overdue: overdueLoans,
    returned: returnedLoans, unreturned: unreturnedLoans,
  } = loanGroups;
  const filteredGroups = useMemo(
    () => filterLoanGroups(loanGroups, searchTerm, searchField),
    [loanGroups, searchTerm, searchField],
  );
  const {
    scheduled: filteredScheduledLoans, assigned: filteredAssignedLoans, loaned: filteredLoanedLoans,
    overdue: filteredOverdueLoans, returned: filteredReturnedLoans,
    unreturned: filteredUnreturnedLoans, all: filteredAllLoans,
  } = filteredGroups;
  const hasSearch = Boolean(searchTerm && searchTerm.trim());
  const displayedLoans = getLoanGroup(filteredGroups, category);
  const totalCategoryCount = getLoanGroup(loanGroups, category).length;

  /* ── Selection & Bulk operations (Loaned & Overdue tabs) ── */

  const isSelectableTab = category === 'assigned' || category === 'loaned' || category === 'overdue';

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
    toast(`${count} custody record${count === 1 ? '' : 's'} deleted.`);
    setSelectedIds(new Set());
    setShowBulkDelete(false);
  };

  /* ── Pickup flow ────────────────────────────────── */

  const handleOpenPickup = (loan) => {
    setPickupTarget(loan);
    const eq = loan.equipment || {};
    setPickupForm({
      pickupDate: nowLocalIso(),
      assetCode: loan.assetCode || eq.Laptop || '',
      requestPc: Boolean(eq.RequestedPC || loan.assetCode),
      requestMonitor: Boolean(eq.RequestedMonitor || eq.Monitor),
      startDate: (loan.startDate || loan.loanDate || todayIso()).slice(0, 10),
      endDate: getLoanEndDate(loan).slice(0, 10),
      location: loan.location || DEFAULT_LOCATION,
      department: loan.department || '',
      ...equipmentQuantitiesToForm(eq, { Adapter: eq.RequestedPC || loan.assetCode ? 1 : 0, Cable: eq.RequestedPC || loan.assetCode ? 1 : 0 }),
      others: loan.others || '',
      note: readableTransferNote(loan.note || loan.purpose || ''),
    });
  };

  const updatePickupField = (field, val) => {
    setPickupForm((prev) => updateLoanFormField(prev, field, val));
  };

  const handleConfirmPickup = async () => {
    if (!pickupTarget) return;
    const timestamp = pickupForm.pickupDate || nowLocalIso();
    if (pickupForm.requestPc && !pickupForm.assetCode.trim()) return toast('Select the PC being picked up');
    if (pickupForm.requestMonitor && (!pickupForm.monitor || pickupForm.monitor === '0')) return toast('Select the monitor being picked up');
    const details = {
      assetCode: pickupForm.assetCode.trim(),
      startDate: pickupForm.startDate,
      loanDate: pickupForm.startDate,
      endDate: pickupForm.endDate,
      dueDate: pickupForm.endDate,
      location: pickupForm.location,
      department: pickupForm.department,
      equipment: {
        ...(pickupTarget.equipment || {}),
        ...buildLoanEquipment(pickupForm, pickupForm.assetCode.trim()),
        RequestedPC: pickupForm.requestPc,
        RequestedMonitor: pickupForm.requestMonitor,
      },
      others: pickupForm.others,
      note: pickupForm.note,
    };

    try { await pickupLoan(pickupTarget.id, timestamp, details); } catch (error) { toast(error.message || 'Could not record pickup'); return; }
    toast(`Device and accessories picked up for ${pickupTarget.assignee || 'assignee'}`);
    setPickupTarget(null);
  };

  const handleRevertPickup = (loan) => {
    revertPickup(loan.id);
    toast(`Pickup reverted for ${loan.assignee || 'loan'}. Record moved back to Scheduled.`);
  };

  const handleToggleReady = (loan) => {
    const ready = !loan.readyForPickup;
    setLoanReadyForPickup(loan.id, ready);
    toast(ready ? `${loan.assetCode} is marked ready for pickup` : `${loan.assetCode} is no longer marked ready`);
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
      setReturnForm(createLoanReturnForm(loan, nowTime));
    } else {
      setReturnForm((prev) => ({
        ...prev,
        bulkLaptopCodes: Object.fromEntries(list.map((loan) => [
          loan.id,
          loan.returnedEquipment?.Laptop ?? loan.assetCode ?? loan.equipment?.Laptop ?? '',
        ])),
      }));
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
      const { details, missingItems } = buildLoanReturnDetails(loan, returnForm);
      returnLoan(loan.id, timestamp, details);
      toast(missingItems.length ? `Return recorded with missing items: ${missingItems.join(', ')}` : `Laptop and accessories returned & archived (${loan.assetCode})`);
    } else {
      const timestamp = returnTime || nowLocalIso();
      returnTargets.forEach((loan) => {
        const returnedLaptopCode = String(returnForm.bulkLaptopCodes?.[loan.id] || '').trim();
        const equipment = loan.equipment || {};
        const returnedEquipment = buildReturnedEquipment({
          ...equipmentQuantitiesToForm(loan.returnedEquipment || equipment),
          returnedLaptopCode,
          others: loan.returnedEquipment?.Others ?? loan.others ?? '',
        });
        const issuedEquipment = { ...equipment, Laptop: loan.assetCode || equipment.Laptop || '' };
        returnLoan(loan.id, timestamp, {
          returnedEquipment,
          returnedAssetCode: returnedLaptopCode,
          returnStatus: getReturnStatus(issuedEquipment, returnedEquipment),
          note: loan.note || '',
        });
      });
      toast(`${returnTargets.length} return records processed`);
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
    toast(`Return reverted for ${loan.assignee || 'record'}. Record moved back to its Assigned or Loans tab.`);
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
      let rows;
      if (file.name.toLowerCase().endsWith('.xlsx')) {
        const { readXlsx } = await import('../lib/xlsx');
        rows = await readXlsx(file);
      } else {
        rows = parseDelimitedText(await file.text());
      }

      const type = detectFileType(rows);
      if (type === 'equipments') {
        throw new Error('This file contains equipment master records. Please import it on the Assets or Exchange page.');
      }

      const result = parseLoansText(rows, db.assets, db.loans);
      if (!result.loans.length) {
        throw new Error('The file contains no valid loan rows');
      }

      const isExisting = (inc) => findLoanMatchIndex(db.loans, inc) >= 0;

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
    const rows = loansToRows(db.loans, db.assets);

    const { makeXlsx, downloadBlob } = await import('../lib/xlsx');
    const workbook = await makeXlsx([LOAN_HEADERS, ...rows]);
    downloadBlob(
      new Blob([workbook], { type: XLSX_MIME }),
      `SPE_IT_Equipment_Loan_List_${todayIso()}.xlsx`,
    );
    toast(`${db.loans.length} custody record${db.loans.length === 1 ? '' : 's'} exported to Excel.`);
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
      endDate: getLoanEndDate(draft),
      dueDate: getLoanEndDate(draft),
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
      {transferTarget && <Modal open onClose={() => setTransferTarget(null)}><LoanTransferForm loan={transferTarget} onClose={() => setTransferTarget(null)} /></Modal>}
      <div className="view-header">
        <div>
          <p className="view-subtitle">
            Manage employee laptop assignments and business-traveler equipment checkouts together, with shared pickup schedules, handovers, and returns. Click any row to view details.
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
            + Schedule pickup
          </button>
        </div>
      </div>

      {/* Loan lifecycle tabs, including outstanding equipment returns */}
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
          className={`loan-tab ${category === 'assigned' ? 'active' : ''}`}
          onClick={() => setCategory('assigned')}
          title={hasSearch ? `${filteredAssignedLoans.length} matching of ${assignedLoans.length} employee assignments` : undefined}
        >
          <span className="category-dot loaned-dot">●</span>
          Assigned
          <span className="loan-tab-count">
            {hasSearch ? filteredAssignedLoans.length : assignedLoans.length}
          </span>
        </button>
        <button
          className={`loan-tab ${category === 'loaned' ? 'active' : ''}`}
          onClick={() => setCategory('loaned')}
          title={hasSearch ? `${filteredLoanedLoans.length} matching of ${loanedLoans.length} business-traveler loans` : undefined}
        >
          <span className="category-dot loaned-dot">●</span>
          Loans
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
          className={`loan-tab ${category === 'unreturned' ? 'active overdue-tab' : ''} ${unreturnedLoans.length > 0 ? 'tab-has-alert' : ''}`}
          onClick={() => setCategory('unreturned')}
          title={hasSearch ? `${filteredUnreturnedLoans.length} matching of ${unreturnedLoans.length} partial returns` : `${unreturnedLoans.length} partial return${unreturnedLoans.length === 1 ? '' : 's'} with equipment outstanding`}
        >
          <span className="category-dot overdue-dot">●</span>
          Unreturned
          <span className={`loan-tab-count ${unreturnedLoans.length > 0 ? 'overdue-tab-count' : ''}`}>
            {hasSearch ? filteredUnreturnedLoans.length : unreturnedLoans.length}
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
          <span>📋 <strong>Scheduled pickups:</strong> Employee assignments and business-traveler equipment awaiting handover. Click <strong>Pickup</strong> to timestamp handover. Click row for recipient details.</span>
        )}
        {category === 'assigned' && (
          <span><strong>Employee assignments:</strong> Picked-up equipment assigned to employees. Tick checkboxes and use <strong>Return</strong> or <strong>↶ Revert pickup</strong> above the table.</span>
        )}
        {category === 'loaned' && (
          <span><strong>Business-traveler loans:</strong> Equipment checked out to business travelers. Tick checkboxes and use <strong>Return</strong> or <strong>↶ Revert pickup</strong> above the table.</span>
        )}
        {category === 'overdue' && (
          <span>⚠️ <strong>Overdue loans:</strong> End date has passed today and equipment has not been returned. Tick checkboxes to record bulk returns or delete records.</span>
        )}
        {category === 'returned' && (
          <span>📦 <strong>Returned & archived:</strong> Completed assignments and loans. Click <strong>↶ Revert</strong> if returned by mistake to move back to Active.</span>
        )}
        {category === 'unreturned' && (
          <span>⚠️ <strong>Equipment outstanding:</strong> Returned records with accessories still missing. Expand a row to see which items were not returned.</span>
        )}
        {category === 'all' && (
          <span>🗂️ <strong>All records:</strong> Complete assignment, loan, and pickup history with full status management.</span>
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
          placeholder="Search Knox ID, assignee name, PC asset #, location, IP address, note..."
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
              {filteredAssignedLoans.length > 0 && category !== 'assigned' && (
                <button
                  type="button"
                  className="btn-hint-category"
                  onClick={() => setCategory('assigned')}
                >
                  Assigned ({filteredAssignedLoans.length})
                </button>
              )}
              {filteredLoanedLoans.length > 0 && category !== 'loaned' && (
                <button
                  type="button"
                  className="btn-hint-category"
                  onClick={() => setCategory('loaned')}
                >
                  Loans ({filteredLoanedLoans.length})
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
              {filteredUnreturnedLoans.length > 0 && category !== 'unreturned' && (
                <button
                  type="button"
                  className="btn-hint-category"
                  onClick={() => setCategory('unreturned')}
                >
                  Unreturned ({filteredUnreturnedLoans.length})
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
                title="Permanently delete selected custody records"
              >
                🗑 Delete{selectedLoans.length ? ` (${selectedLoans.length})` : ''}
              </button>
            </div>
          </div>
        )}
        <LoanTable
          scheduled={category === 'scheduled'}
          showPickupReadiness={category === 'scheduled' || category === 'all'}
          hideReturnDate={category === 'overdue'}
          showLocation={category === 'all'}
          onTransferLoan={setTransferTarget}
          loans={displayedLoans}
          assets={db.assets}
          editMode={editMode}
          onSaveLoan={handleInlineSave}
          onPickupLoan={handleOpenPickup}
          onToggleReady={handleToggleReady}
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
            ) : category === 'unreturned' ? 'No equipment is currently marked as unreturned.' : undefined
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
            <LoanSummary loan={{ ...pickupTarget, assetCode: pickupForm.assetCode }} location={pickupForm.location} />

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



                <TimestampField id="modal-pickupDate" label="Actual pickup timestamp" value={pickupForm.pickupDate} onChange={(value) => updatePickupField('pickupDate', value)} required />

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
                  <LoanDirectoryFields form={pickupForm} onChange={updatePickupField} locations={db.locations} departments={db.departments} idPrefix="pickup-" />
                </div>
              </div>

              {/* Equipment Checklist Column */}
              <div className="pickup-modal-panel">
                <div className="panel-title-row">
                  <h4>Equipment handed over</h4>

                </div>
                <p className="field-hint" style={{ marginTop: '2px', marginBottom: '10px' }}>
                  Select the devices and record the accessories included in this pickup.
                </p>

                <EquipmentRequestFields form={pickupForm} onChange={updatePickupField} />
                <EquipmentAccessoryList pcField="assetCode" form={pickupForm} onChange={updatePickupField} idPrefix="pickup-accessory-" monitorSearch />
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
          <LoanReturnForm loan={returnTargets[0]} form={returnForm} onChange={updateReturnField} onConfirm={handleConfirmReturn} onClose={() => setReturnTargets(null)} />
        )}

        {/* Multi-loan bulk return dialog */}
        {returnTargets && returnTargets.length > 1 && (
          <div className="return-dialog">
            <h2>
              Record return &amp; archive
              {` (${returnTargets.length} laptops)`}
            </h2>
            <p className="modal-intro">
              Confirm the laptop received for each record. Clear an asset number if the laptop was not returned, or select a different laptop if it was substituted.
            </p>

            <div className="timestamp-dialog-card">
              <ul className="bulk-delete-list">
                {returnTargets.map((l) => (
                  <li key={l.id}>
                    <strong>{l.assetCode}</strong> <code>{l.knoxId || '—'}</code>
                    <span className="bulk-delete-meta">
                      {' '}— {l.assignee || 'Unknown'}, picked up {readableLoanDate(l.pickupDate) || '—'}
                    </span>
                    <div className="field" style={{ marginTop: '8px' }}>
                      <label htmlFor={`bulk-return-laptop-${l.id}`}>Laptop returned (asset number)</label>
                      <AssetAutocomplete
                        id={`bulk-return-laptop-${l.id}`}
                        categoryFilter={PC_CATEGORIES}
                        allowCustom
                        value={returnForm.bulkLaptopCodes?.[l.id] || ''}
                        onChange={(value) => setReturnForm((prev) => ({
                          ...prev,
                          bulkLaptopCodes: { ...(prev.bulkLaptopCodes || {}), [l.id]: value },
                        }))}
                        placeholder="Select returned laptop, or clear if missing"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <TimestampField id="returnTimeInput" label="Return timestamp" value={returnTime} onChange={setReturnTime} />

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
          <h2>Delete {selectedLoans.length} custody record{selectedLoans.length === 1 ? '' : 's'}</h2>
          <p className="modal-intro">
            Are you sure you want to permanently delete the selected custody record{selectedLoans.length === 1 ? '' : 's'}? This action cannot be undone.
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
              <code>{importPreview.fileName}</code> — review the custody records found in the file before applying.
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
                        <td>{readableLoanDate(getLoanEndDate(l)) || '—'}</td>
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
            <h2>Delete custody record</h2>
            <p className="modal-intro">
              Are you sure you want to permanently delete this custody record? This action cannot be undone.
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
      <Modal open={showCreate} size="wide" className="loan-entry-modal" onClose={() => setShowCreate(false)}>
        <LoanForm
          defaultAssigneeType="Business traveler"
          onClose={() => setShowCreate(false)}
          onSuccess={(loan) => {
            setCategory(loan.pickupDate ? 'loaned' : 'scheduled');
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
