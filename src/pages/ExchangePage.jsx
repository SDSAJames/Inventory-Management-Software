import { useRef } from 'react';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { LOAN_HEADERS } from '../lib/constants';
import { todayIso } from '../lib/utils';
import { makeXlsx, readXlsx, downloadBlob } from '../lib/xlsx';
import { hasImportBackup } from '../lib/db';

export default function ExchangePage() {
  const { db, importDb, revertImport } = useDb();
  const toast = useToast();
  const fileRef = useRef(null);
  const backupExists = hasImportBackup();

  /* ── Export ─────────────────────────────────────────── */

  const handleExport = async () => {
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
    toast('Reference-format .xlsx workbook downloaded');
  };

  /* ── Import ─────────────────────────────────────────── */

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const rows = await readXlsx(file);
      if (rows.length < 2) throw new Error('The workbook has no loan rows');

      const headers = rows[0].map((h) => String(h).trim().toLowerCase());
      const col = (name) => headers.indexOf(name.toLowerCase());
      const assetCodeIdx = col('laptop');
      const assigneeIdx = col('name');

      if (assetCodeIdx < 0 || assigneeIdx < 0) {
        throw new Error('This is not the SPE loan-list format: Laptop and Name are required');
      }

      const importedAssets = [];
      const importedLoans = [];
      const importedEmployees = [];
      const importedLocations = new Set();
      let rejected = 0;

      rows.slice(1).forEach((row) => {
        const code = String(row[assetCodeIdx] || '').trim();
        const assignee = String(row[assigneeIdx] || '').trim();
        if (!code || !assignee) { rejected++; return; }

        const val = (name) => row[col(name)] || '';
        const location = String(val('rental location'));
        const returned = String(val('return date'));

        importedLocations.add(location || 'Unspecified');
        importedEmployees.push({ name: assignee, department: '', position: '' });
        importedAssets.push({
          id: crypto.randomUUID(),
          code,
          name: 'Laptop',
          category: 'Laptop',
          model: '',
          serial: '',
          status: returned ? 'Assigned' : 'On loan',
          location: location || 'Unspecified',
          owner: assignee,
          department: '',
          condition: 'Good',
          notes: String(val('note')),
          updated: todayIso(),
        });
        importedLoans.push({
          id: crypto.randomUUID(),
          assetCode: code,
          knoxId: String(val('knox id')),
          assignee,
          location,
          ip: String(val('ip')),
          startDate: String(val('start date')),
          pickupDate: String(val('pickup date')),
          endDate: String(val('end date')),
          returnDate: returned,
          loanDate: String(val('start date')),
          dueDate: String(val('end date')),
          returnedDate: returned,
          status: returned ? 'Returned' : 'Active',
          equipment: {
            Adapter: val('charging _x000d_\nadapter'),
            Cable: val('charging _x000d_\ncable'),
            Dongle: val('dongle'),
            Keyboard: val('keyboard'),
            Mouse: val('mouse'),
            Monitor: val('monitor'),
            'Ethernet cable': val('ethernet cable'),
          },
          others: String(val('others')),
          note: String(val('note')),
        });
      });

      if (!importedLoans.length) throw new Error('The workbook contains no valid loan rows');

      importDb({
        assets: importedAssets,
        loans: importedLoans,
        employees: importedEmployees.filter((p, i, arr) => arr.findIndex((q) => q.name === p.name) === i),
        departments: [],
        locations: [...importedLocations],
      });

      toast(`Import replaced database: ${importedAssets.length} assets, ${importedLoans.length} loans, ${rejected} rejected`);
    } catch (err) {
      toast(err.message);
    }

    e.target.value = '';
  };

  /* ── Revert ─────────────────────────────────────────── */

  const handleRevert = () => {
    if (revertImport()) {
      toast('Previous database restored');
    } else {
      toast('No import backup is available');
    }
  };

  return (
    <>
      <div className="view-header">
        <div>
          <h2>Excel exchange</h2>
          <p>Import and export the SPE IT equipment loan list format.</p>
        </div>
      </div>

      <div className="exchange-grid">
        <section className="exchange-card">
          <h3>Export loan list</h3>
          <p>Download the current loans in the same XLSX structure as SPE_IT_Equipment_Loan_List_Example.xlsx.</p>
          <button className="button" onClick={handleExport}>↓ Export XLSX loan list</button>
        </section>

        <section className="exchange-card">
          <h3>Replace database from Excel</h3>
          <p>Import the reference workbook as the complete database. Asset numbers such as SPE-1234 come from the Laptop column. Existing data is replaced after a local restore point is saved.</p>
          <div className="drop-zone">
            Choose a local XLSX file
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleImport}
            />
          </div>
        </section>
      </div>

      <div className="notice">
        <strong>Offline data note:</strong> The workbook parser and writer are bundled in this application. No CDN, internet, or online spreadsheet service is required.
      </div>

      <div className="panel import-backup-panel">
        <div>
          <strong>Restore point</strong>
          <p>{backupExists
            ? 'A backup of the database before the last import is available.'
            : 'No import restore point is currently available.'}
          </p>
        </div>
        <button
          className={`button ${backupExists ? 'secondary' : 'ghost'}`}
          disabled={!backupExists}
          onClick={handleRevert}
        >
          ↶ Revert last import
        </button>
      </div>
    </>
  );
}
