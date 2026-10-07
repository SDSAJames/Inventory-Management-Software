import { useState, useRef } from 'react';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { LOAN_HEADERS } from '../lib/constants';
import { DEFAULT_ASSET_HEADERS, assetsToRows } from '../lib/assetExcel';
import { todayIso } from '../lib/utils';
import { makeXlsx, readXlsx, downloadBlob } from '../lib/xlsx';
import { parseDelimitedText, detectFileType, parseEquipmentsText, parseLoansText } from '../lib/txtImport';
import Modal from '../components/Modal';

export default function ExchangePage() {
  const { db, importDb, mergeImportData, revertImport, hasBackup } = useDb();
  const toast = useToast();

  const fileRefEquipments = useRef(null);
  const fileRefLoans = useRef(null);
  const fileRefMulti = useRef(null);

  const [isDragging, setIsDragging] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [importMode, setImportMode] = useState('merge'); // 'merge' | 'replace'
  const [activeTab, setActiveTab] = useState('equipments'); // 'equipments' | 'loans'

  /* ── 1. Export Handlers (Exact 1:1 Excel .xlsx Format) ─── */

  const handleExportLoans = async () => {
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
      new Blob([workbook], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `SPE_IT_Equipment_Loan_List_${todayIso()}.xlsx`,
    );
    toast('Reference-format .xlsx loan list exported');
  };

  const handleExportEquipments = async () => {
    const rows = assetsToRows(db.assets, DEFAULT_ASSET_HEADERS);
    const workbook = await makeXlsx(rows);
    downloadBlob(
      new Blob([workbook], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `SPE_Equipments_${todayIso()}.xlsx`,
    );
    toast(`${db.assets.length} equipment assets exported to .xlsx`);
  };

  /* ── 2. TXT File Processing ────────────────────────────── */

  const processFiles = async (fileList) => {
    if (!fileList || !fileList.length) return;
    const files = Array.from(fileList);

    try {
      let parsedEquipments = null;
      let parsedLoans = null;
      const fileNames = [];

      for (const file of files) {
        fileNames.push(file.name);
        let rows;

        if (file.name.toLowerCase().endsWith('.xlsx')) {
          rows = await readXlsx(file);
        } else {
          const text = await file.text();
          rows = parseDelimitedText(text);
        }

        const type = detectFileType(rows);

        if (type === 'equipments') {
          parsedEquipments = parseEquipmentsText(rows, db.assets);
        } else if (type === 'loans') {
          const refAssets = parsedEquipments ? [...parsedEquipments.assets, ...db.assets] : db.assets;
          parsedLoans = parseLoansText(rows, refAssets, db.loans);
        } else {
          // Fallback detection
          if (rows[0]?.some((h) => String(h).toLowerCase().includes('laptop') || String(h).toLowerCase().includes('pickup'))) {
            const refAssets = parsedEquipments ? [...parsedEquipments.assets, ...db.assets] : db.assets;
            parsedLoans = parseLoansText(rows, refAssets, db.loans);
          } else if (rows[0]?.some((h) => String(h).toLowerCase().includes('host') || String(h).toLowerCase().includes('serial'))) {
            parsedEquipments = parseEquipmentsText(rows, db.assets);
          } else {
            throw new Error(`Unrecognized file structure in "${file.name}". Expected SPE_Equipments_example.txt or SPE_IT_Equipment_Loan_List_Example.txt format.`);
          }
        }
      }

      setPreviewData({
        fileNames,
        equipments: parsedEquipments,
        loans: parsedLoans,
      });

      setImportMode('merge');
      setActiveTab(parsedEquipments ? 'equipments' : 'loans');
      setShowPreview(true);
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
  };

  const handleFileInput = (e) => {
    const files = e.target.files;
    processFiles(files);
    e.target.value = '';
  };

  /* ── 3. Drag and Drop Handlers ─────────────────────────── */

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  /* ── 4. Apply Import ───────────────────────────────────── */

  const handleConfirmImport = () => {
    if (!previewData) return;
    const { equipments, loans } = previewData;

    const assetsToApply = equipments ? equipments.assets : [];
    const loansToApply = loans ? loans.loans : [];
    const synthesized = loans ? (loans.synthesizedAssets || []) : [];

    // Merge synthesized placeholder assets if any were created
    const combinedIncomingAssets = [...assetsToApply];
    synthesized.forEach((sa) => {
      if (!combinedIncomingAssets.some((a) => a.code.toLowerCase() === sa.code.toLowerCase())) {
        combinedIncomingAssets.push(sa);
      }
    });

    if (importMode === 'merge') {
      mergeImportData({
        assets: combinedIncomingAssets,
        loans: loansToApply,
      });
      toast(`Import complete: ${combinedIncomingAssets.length} assets and ${loansToApply.length} loans synced.`);
    } else {
      // Full database replacement
      const nextAssets = combinedIncomingAssets.length ? combinedIncomingAssets : db.assets;
      const nextLoans = loansToApply.length ? loansToApply : db.loans;
      importDb({
        assets: nextAssets,
        loans: nextLoans,
        employees: db.employees,
        departments: db.departments,
        locations: db.locations,
      });
      toast(`Database replaced: ${nextAssets.length} assets and ${nextLoans.length} loans.`);
    }

    setShowPreview(false);
    setPreviewData(null);
  };

  /* ── 5. Revert Import ──────────────────────────────────── */

  const handleRevert = () => {
    if (revertImport()) {
      toast('Previous database restored successfully');
    } else {
      toast('No import backup point is available');
    }
  };

  const backupAvailable = typeof hasBackup === 'function' ? hasBackup() : false;

  return (
    <>
      <div className="view-header">
        <div>
          <p className="view-subtitle">
            Import TXT files extracted from Excel (Equipments register & Loan list) and export reference-format Excel (.xlsx) workbooks.
          </p>
        </div>
      </div>

      {/* ── 1. Import Section (Primary: TXT files extracted from Excel) ── */}
      <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', color: 'var(--blue-dark)' }}>
        Import TXT Data (Extracted from Excel)
      </h3>

      <div className="exchange-grid" style={{ marginBottom: '28px' }}>
        {/* Card A: Equipments Register (.txt) */}
        <section className="exchange-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '18px' }}>💻</span>
            <h3 style={{ margin: 0 }}>Equipment Register (.txt)</h3>
          </div>
          <p>
            Import <code>SPE_Equipments_example.txt</code> extracted from Excel with columns:
            <br />
            <code>Host Name</code> • <code>Serial Number</code> • <code>Status</code> • <code>Issued Knox ID</code> • <code>Issued Date</code>
          </p>
          <div className="exchange-card-actions">
            <button
              className="button"
              onClick={() => fileRefEquipments.current?.click()}
            >
              Choose Equipment .txt
            </button>
            <input
              ref={fileRefEquipments}
              type="file"
              accept=".txt,.tsv,.csv,.xlsx"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
          </div>
        </section>

        {/* Card B: Loan List (.txt) */}
        <section className="exchange-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '18px' }}>📋</span>
            <h3 style={{ margin: 0 }}>IT Equipment Loan List (.txt)</h3>
          </div>
          <p>
            Import <code>SPE_IT_Equipment_Loan_List_Example.txt</code> extracted from Excel with columns:
            <br />
            <code>Start Date</code> • <code>Pickup Date</code> • <code>Return Date</code> • <code>Laptop</code> • Accessories • <code>Note</code>
          </p>
          <div className="exchange-card-actions">
            <button
              className="button"
              onClick={() => fileRefLoans.current?.click()}
            >
              Choose Loan List .txt
            </button>
            <input
              ref={fileRefLoans}
              type="file"
              accept=".txt,.tsv,.csv,.xlsx"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
          </div>
        </section>

        {/* Card C: Multi-File / Drag & Drop Target */}
        <section
          className={`exchange-card${isDragging ? ' dragover' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            borderStyle: 'dashed',
            borderColor: isDragging ? 'var(--blue)' : '#cbd5e1',
            background: isDragging ? '#eff6ff' : '#f8fafc',
            cursor: 'pointer',
          }}
          onClick={() => fileRefMulti.current?.click()}
        >
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: '26px', marginBottom: '6px' }}>📥</div>
            <strong style={{ display: 'block', fontSize: '13px', color: 'var(--blue-dark)', marginBottom: '4px' }}>
              Batch Import (Drop .txt file or multiple files)
            </strong>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
              Drag & drop one or both TXT files here, or click to browse
            </span>
          </div>
          <input
            ref={fileRefMulti}
            type="file"
            multiple
            accept=".txt,.tsv,.csv,.xlsx"
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />
        </section>
      </div>

      {/* ── 2. Export Section (Preserved: Exact 1:1 Excel .xlsx Format) ── */}
      <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', color: 'var(--blue-dark)' }}>
        Export to Excel Workbooks (.xlsx)
      </h3>

      <div className="exchange-grid" style={{ marginBottom: '24px' }}>
        <section className="exchange-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '18px' }}>📊</span>
            <h3 style={{ margin: 0 }}>Export Loan List (Excel .xlsx)</h3>
          </div>
          <p>
            Downloads the complete loan register in exact 1:1 parity with <code>SPE_IT_Equipment_Loan_List_Example.xlsx</code> (all 19 standard columns).
          </p>
          <div className="exchange-card-actions">
            <button className="button secondary" onClick={handleExportLoans}>
              ↓ Export XLSX Loan List
            </button>
          </div>
        </section>

        <section className="exchange-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '18px' }}>💻</span>
            <h3 style={{ margin: 0 }}>Export Equipment Inventory (Excel .xlsx)</h3>
          </div>
          <p>
            Downloads the active master inventory in <code>SPE_Equipments_example.xlsx</code> format (Host Name, Serial, Status, Issued Knox ID, Issued Date).
          </p>
          <div className="exchange-card-actions">
            <button className="button secondary" onClick={handleExportEquipments}>
              ↓ Export XLSX Equipments
            </button>
          </div>
        </section>
      </div>

      {/* ── 3. Offline Guarantee & Restore Point ────────────── */}
      <div className="notice" style={{ marginBottom: '20px' }}>
        <strong>100% Offline Processing:</strong> All delimited text parsing and OpenXML generation run completely inside your local browser. Zero telemetry or external network calls are performed.
      </div>

      <div className="panel import-backup-panel">
        <div>
          <strong>Database Restore Point</strong>
          <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
            {backupAvailable
              ? 'A safe snapshot was preserved before your last import. You can roll back anytime.'
              : 'No import restore point is currently cached.'}
          </p>
        </div>
        <button
          className={`button ${backupAvailable ? 'secondary' : 'ghost'}`}
          disabled={!backupAvailable}
          onClick={handleRevert}
        >
          ↶ Revert last import
        </button>
      </div>

      {/* ── 4. Import Preview Modal ─────────────────────────── */}
      <Modal open={showPreview} size="wide" onClose={() => setShowPreview(false)}>
        {previewData && (
          <div>
            <h2>Preview TXT File Import</h2>
            <p className="modal-intro">
              Review extracted records from <strong>{previewData.fileNames.join(', ')}</strong> before applying them to your offline database.
            </p>

            {/* Format summary pill cluster */}
            <div className="preview-summary-box">
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px' }}>Files Read:</span>
                  <strong>{previewData.fileNames.join(', ')}</strong>
                </div>
                {previewData.equipments && (
                  <div>
                    <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px' }}>Equipment Register:</span>
                    <strong style={{ color: 'var(--blue)' }}>
                      {previewData.equipments.totalParsed} assets found
                    </strong>
                    <span style={{ fontSize: '10px', color: 'var(--muted)', marginLeft: '4px' }}>
                      ({previewData.equipments.addedCount} new, {previewData.equipments.updatedCount} updates)
                    </span>
                  </div>
                )}
                {previewData.loans && (
                  <div>
                    <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px' }}>IT Loan List:</span>
                    <strong style={{ color: 'var(--blue)' }}>
                      {previewData.loans.totalParsed} loans found
                    </strong>
                  </div>
                )}
              </div>
            </div>

            {/* Preview Tabs */}
            {previewData.equipments && previewData.loans && (
              <div className="loan-tabs" style={{ marginBottom: '14px' }}>
                <button
                  className={`loan-tab ${activeTab === 'equipments' ? 'active' : ''}`}
                  onClick={() => setActiveTab('equipments')}
                >
                  Equipment Assets ({previewData.equipments.totalParsed})
                </button>
                <button
                  className={`loan-tab ${activeTab === 'loans' ? 'active' : ''}`}
                  onClick={() => setActiveTab('loans')}
                >
                  Loan Records ({previewData.loans.totalParsed})
                </button>
              </div>
            )}

            {/* Table Preview */}
            <div className="table-wrap" style={{ maxHeight: '280px', overflow: 'auto', marginBottom: '16px', border: '1px solid var(--line)', borderRadius: '6px' }}>
              {activeTab === 'equipments' && previewData.equipments ? (
                <table className="loan-table" style={{ fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th>Host Name</th>
                      <th>Serial Number</th>
                      <th>Status</th>
                      <th>Issued Knox ID</th>
                      <th>Issued Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.equipments.assets.map((a, i) => (
                      <tr key={i}>
                        <td><strong>{a.code}</strong></td>
                        <td><code>{a.serial || '—'}</code></td>
                        <td>
                          <span className={`status status-${a.status.toLowerCase().replace(/\s+/g, '-')}`}>
                            {a.status}
                          </span>
                        </td>
                        <td>{a.owner || '—'}</td>
                        <td>{a.issuedDate || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : previewData.loans ? (
                <table className="loan-table" style={{ fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th>Laptop</th>
                      <th>Borrower / Knox ID</th>
                      <th>Pickup Date</th>
                      <th>Return Date</th>
                      <th>Status</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.loans.loans.map((l, i) => (
                      <tr key={i}>
                        <td><strong>{l.assetCode}</strong></td>
                        <td>{l.assignee} {l.knoxId ? `(${l.knoxId})` : ''}</td>
                        <td>{l.pickupDate || l.startDate || '—'}</td>
                        <td>{l.returnDate || '—'}</td>
                        <td>
                          <span className={`status ${l.status === 'Active' ? 'status-warning' : l.status === 'Returned' ? 'status-archived' : 'status-available'}`}>
                            {l.status}
                          </span>
                        </td>
                        <td>{l.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>

            {/* Import Mode Options */}
            <div className="preview-mode-select">
              <label className="preview-mode-option">
                <input
                  type="radio"
                  name="importMode"
                  value="merge"
                  checked={importMode === 'merge'}
                  onChange={() => setImportMode('merge')}
                />
                <div>
                  <strong>Merge & Sync with existing records (Recommended)</strong>
                  <div style={{ color: 'var(--muted)', fontSize: '11px' }}>
                    Updates matching assets and loans while preserving all existing inventory and historical ownership entries.
                  </div>
                </div>
              </label>

              <label className="preview-mode-option" style={{ marginLeft: '16px' }}>
                <input
                  type="radio"
                  name="importMode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                />
                <div>
                  <strong>Full Database Replacement</strong>
                  <div style={{ color: 'var(--muted)', fontSize: '11px' }}>
                    Replaces current database with the imported records (a restore point is automatically saved first).
                  </div>
                </div>
              </label>
            </div>

            <div className="form-actions" style={{ marginTop: '18px' }}>
              <button
                type="button"
                className="button ghost"
                onClick={() => setShowPreview(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                onClick={handleConfirmImport}
              >
                Confirm & Apply Import
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
