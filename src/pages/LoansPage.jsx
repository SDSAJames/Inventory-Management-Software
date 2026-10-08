import { useState, useMemo, useRef, useEffect } from 'react';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { nowLocalIso, readableLoanDate, todayIso, statusClass, isLoanOverdue, getLoanStatus } from '../lib/utils';
import { readXlsx, makeXlsx, downloadBlob } from '../lib/xlsx';
import { parseDelimitedText, parseLoansText, detectFileType } from '../lib/txtImport';
import { LOAN_HEADERS } from '../lib/constants';
import LoanTable from '../components/LoanTable';
import Modal from '../components/Modal';
import LoanForm from '../components/LoanForm';
import EditLoanForm from '../components/EditLoanForm';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export default function LoansPage() {
  const { db, updateLoan, pickupLoan, revertPickup, returnLoan, unarchiveLoan, deleteLoan, mergeImportData } = useDb();
  const toast = useToast();
  const fileRef = useRef(null);

  // 4 Process categories: 'scheduled' | 'loaned' | 'overdue' | 'returned' | 'all'
  const [category, setCategory] = useState('scheduled');
  const [showCreate, setShowCreate] = useState(false);
  const [editLoanId, setEditLoanId] = useState(null);
  const [editMode, setEditMode] = useState(false);

  // Pickup modal state
  const [pickupTarget, setPickupTarget] = useState(null);
  const [pickupTime, setPickupTime] = useState('');

  // Return & Archive modal state (one or many loans)
  const [returnTargets, setReturnTargets] = useState(null);
  const [returnTime, setReturnTime] = useState('');

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

  const displayedLoans = useMemo(() => {
    if (category === 'scheduled') return scheduledLoans;
    if (category === 'loaned') return loanedLoans;
    if (category === 'overdue') return overdueLoans;
    if (category === 'returned') return returnedLoans;
    return db.loans;
  }, [category, scheduledLoans, loanedLoans, overdueLoans, returnedLoans, db.loans]);

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
    setPickupTime(nowLocalIso());
  };

  const handleConfirmPickup = () => {
    if (!pickupTarget) return;
    pickupLoan(pickupTarget.id, pickupTime || nowLocalIso());
    toast(`Laptop picked up for ${pickupTarget.assignee || 'assignee'}`);
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
    setReturnTime(nowLocalIso());
  };

  const handleConfirmReturn = () => {
    if (!returnTargets || !returnTargets.length) return;
    const timestamp = returnTime || nowLocalIso();
    returnTargets.forEach((loan) => returnLoan(loan.id, timestamp));
    if (returnTargets.length === 1) {
      toast(`Laptop returned & archived (${returnTargets[0].assetCode})`);
    } else {
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

  const handleConfirmImport = () => {
    if (!importPreview) return;
    mergeImportData({
      assets: importPreview.synthesizedAssets || [],
      loans: importPreview.loans,
    });
    toast(
      `Loan import complete: ${importPreview.newCount} added, ${importPreview.updatedCount} updated` +
        (importPreview.synthesizedAssets?.length
          ? `, ${importPreview.synthesizedAssets.length} new laptop${importPreview.synthesizedAssets.length === 1 ? '' : 's'} registered.`
          : '.'),
    );
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
        >
          <span className="category-dot scheduled-dot">●</span>
          Scheduled
          <span className="loan-tab-count">{scheduledLoans.length}</span>
        </button>
        <button
          className={`loan-tab ${category === 'loaned' ? 'active' : ''}`}
          onClick={() => setCategory('loaned')}
        >
          <span className="category-dot loaned-dot">●</span>
          Loaned
          <span className="loan-tab-count">{loanedLoans.length}</span>
        </button>
        <button
          className={`loan-tab ${category === 'overdue' ? 'active overdue-tab' : ''} ${overdueLoans.length > 0 ? 'tab-has-alert' : ''}`}
          onClick={() => setCategory('overdue')}
          title={overdueLoans.length > 0 ? `${overdueLoans.length} overdue loan${overdueLoans.length === 1 ? '' : 's'}` : 'No overdue loans'}
        >
          <span className="category-dot overdue-dot">●</span>
          Overdue
          <span className={`loan-tab-count ${overdueLoans.length > 0 ? 'overdue-tab-count' : ''}`}>
            {overdueLoans.length}
          </span>
        </button>
        <button
          className={`loan-tab ${category === 'returned' ? 'active' : ''}`}
          onClick={() => setCategory('returned')}
        >
          <span className="category-dot returned-dot">●</span>
          Returned
          <span className="loan-tab-count">{returnedLoans.length}</span>
        </button>
        <button
          className={`loan-tab ${category === 'all' ? 'active' : ''}`}
          onClick={() => setCategory('all')}
        >
          All records
          <span className="loan-tab-count">{db.loans.length}</span>
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
        />
      </section>

      {/* Pickup timestamp modal */}
      <Modal open={pickupTarget !== null} onClose={() => setPickupTarget(null)}>
        {pickupTarget && (
          <div className="pickup-dialog">
            <h2>Record laptop pickup</h2>
            <p className="modal-intro">
              Timestamp defaults to current time. You can manually adjust the date and time if the pickup occurred at a different time.
            </p>

            <div className="timestamp-dialog-card">
              <dl>
                <dt>Knox ID:</dt>
                <dd><code>{pickupTarget.knoxId || '—'}</code></dd>
                <dt>Assignee:</dt>
                <dd>{pickupTarget.assignee || 'Unknown'} ({pickupTarget.assigneeType || 'Employee'})</dd>
                <dt>Laptop number:</dt>
                <dd>{pickupTarget.assetCode}</dd>
                <dt>Rental location:</dt>
                <dd>{pickupTarget.location || 'Head Office'}</dd>
                {pickupTarget.ip && (
                  <>
                    <dt>Assigned IP:</dt>
                    <dd>{pickupTarget.ip}</dd>
                  </>
                )}
              </dl>
            </div>

            <div className="field">
              <label htmlFor="pickupTimeInput">Pickup timestamp (default: current time)</label>
              <div className="timestamp-input-row">
                <input
                  id="pickupTimeInput"
                  type="datetime-local"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                />
                <button
                  type="button"
                  className="button ghost"
                  style={{ whiteSpace: 'nowrap', padding: '9px 12px' }}
                  onClick={() => setPickupTime(nowLocalIso())}
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
                onClick={() => setPickupTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                onClick={handleConfirmPickup}
              >
                Confirm pickup
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Return & Archive timestamp modal (single or bulk) */}
      <Modal open={returnTargets !== null} onClose={() => setReturnTargets(null)}>
        {returnTargets && (
          <div className="return-dialog">
            <h2>
              Record return &amp; archive
              {returnTargets.length > 1 ? ` (${returnTargets.length} laptops)` : ''}
            </h2>
            <p className="modal-intro">
              Timestamp defaults to current time. Confirming return will return the laptop{returnTargets.length > 1 ? 's' : ''} to IT department and archive {returnTargets.length > 1 ? 'these loan records' : 'this loan record'}.
            </p>

            <div className="timestamp-dialog-card">
              {returnTargets.length === 1 ? (
                <dl>
                  <dt>Knox ID:</dt>
                  <dd><code>{returnTargets[0].knoxId || '—'}</code></dd>
                  <dt>Assignee:</dt>
                  <dd>{returnTargets[0].assignee || 'Unknown'}</dd>
                  <dt>Laptop number:</dt>
                  <dd>{returnTargets[0].assetCode}</dd>
                  <dt>Picked up on:</dt>
                  <dd>{readableLoanDate(returnTargets[0].pickupDate) || '—'}</dd>
                </dl>
              ) : (
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
              )}
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
                className="button"
                onClick={handleConfirmReturn}
              >
                Confirm return &amp; archive{returnTargets.length > 1 ? ` (${returnTargets.length})` : ''}
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
        <LoanForm onClose={() => setShowCreate(false)} />
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
