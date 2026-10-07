/**
 * txtImport.js
 * Universal offline delimited text parser & processor for TXT files extracted from Excel.
 * Runs 100% offline in-browser without any remote dependencies.
 *
 * Specifically tuned for:
 * 1. Equipment Inventory Master Lists (SPE_Equipments_example.txt)
 *    Columns: Host Name | Serial Number | Status | Issued Knox ID | Issued Date
 * 2. IT Equipment Loan Lists (SPE_IT_Equipment_Loan_List_Example.txt)
 *    Columns: Start Date | Pickup Date | End Date | Return Date | Laptop |
 *             Charging Adapter | Charging Cable | Dongle | Keyboard | Mouse |
 *             Monitor | Ethernet cable | others | Note
 */

import { STATUSES } from './constants.js';
import { todayIso } from './utils.js';
import { createOwnershipEntry } from './assetIntegrity.js';

/* ── 1. Delimited Text Parser ──────────────────────────────── */

/**
 * Parses tab- or comma-delimited text from an exported spreadsheet file.
 * Accurately handles:
 * - Multi-line quoted fields (e.g. "Charging \r\nAdapter")
 * - Escaped double quotes ("")
 * - CRLF (\r\n), LF (\n), CR (\r) line terminators
 * - Strips UTF-8 BOM (\uFEFF)
 * - Auto-detects delimiter (\t vs ,)
 *
 * @param {string} text Raw file text
 * @returns {string[][]} 2D array of string cells
 */
export function parseDelimitedText(text) {
  if (!text) return [];
  const str = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  // Detect delimiter from first non-empty line
  const lines = str.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const firstLine = lines[0] || '';
  const delimiter = firstLine.includes('\t') ? '\t' : (firstLine.includes(',') ? ',' : '\t');

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const nextChar = str[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentCell.replace(/\r?\n/g, ' ').trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentCell.replace(/\r?\n/g, ' ').trim());
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.replace(/\r?\n/g, ' ').trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/* ── 2. Date Normalizer ─────────────────────────────────────── */

/**
 * Normalizes Excel dates (e.g. "10/1/2026", "6/16/2026 11:23", "1/0/1900") to standard ISO strings.
 * Excel null date "1/0/1900" is normalized to empty string "".
 */
export function normalizeTextDate(raw) {
  if (!raw) return '';
  const str = String(raw).trim();
  if (!str || str === '1/0/1900' || str === '0' || str.startsWith('1900-01-00')) {
    return '';
  }

  // Match M/D/YYYY or M/D/YYYY H:mm
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const month = m[1].padStart(2, '0');
    const day = m[2].padStart(2, '0');
    const year = m[3];
    if (m[4] !== undefined) {
      const hours = m[4].padStart(2, '0');
      const mins = m[5].padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${mins}`;
    }
    return `${year}-${month}-${day}`;
  }

  // Standard ISO or valid date string
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(str)) {
    return parsed.toISOString().slice(0, 10);
  }

  return str;
}

/* ── 3. File Type Detection ────────────────────────────────── */

/**
 * Detects whether the parsed rows represent:
 * - 'equipments' (SPE_Equipments_example.txt)
 * - 'loans' (SPE_IT_Equipment_Loan_List_Example.txt)
 * - 'unknown'
 */
export function detectFileType(rows) {
  if (!rows || rows.length < 1) return 'unknown';
  const headers = rows[0].map((h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (headers.includes('hostname') || headers.includes('issuedknoxid')) {
    return 'equipments';
  }
  if (
    headers.includes('laptop') ||
    headers.includes('startdate') ||
    headers.includes('pickupdate') ||
    headers.includes('returndate')
  ) {
    return 'loans';
  }
  return 'unknown';
}

/* ── 4. Parse Equipment Master Records ─────────────────────── */

const STATUS_ALIASES = {
  issued: 'Assigned',
  broken: 'Damaged',
  loaned: 'On loan',
  repair: 'Under repair',
  disposed: 'Retired',
  available: 'Available',
};

function normalizeEquipmentStatus(raw) {
  const val = String(raw || '').trim().toLowerCase();
  if (!val) return 'Available';
  const direct = STATUSES.find((s) => s.toLowerCase() === val);
  return direct || STATUS_ALIASES[val] || 'Available';
}

/**
 * Parses Equipment text rows into structured asset objects.
 */
export function parseEquipmentsText(rows, existingAssets = []) {
  if (!rows || rows.length < 2) {
    throw new Error('Equipment text file contains no data rows');
  }

  const rawHeaders = rows[0];
  const normHeaders = rawHeaders.map((h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''));

  const findIdx = (candidates) => {
    return normHeaders.findIndex((h) => candidates.includes(h));
  };

  const colCode = findIdx(['hostname', 'assetcode', 'code', 'assetnumber', 'host']);
  const colSerial = findIdx(['serialnumber', 'serial', 'sn']);
  const colStatus = findIdx(['status']);
  const colOwner = findIdx(['issuedknoxid', 'knoxid', 'holder', 'currentholder', 'owner']);
  const colIssuedDate = findIdx(['issueddate', 'issuedate', 'date']);
  const colCategory = findIdx(['category', 'type']);
  const colModel = findIdx(['model']);
  const colLocation = findIdx(['location', 'facility']);
  const colDept = findIdx(['department', 'dept']);
  const colNotes = findIdx(['notes', 'note']);

  if (colCode < 0) {
    throw new Error('Equipment file is missing required "Host Name" or "Asset Code" column');
  }

  const existingMap = new Map(
    existingAssets.map((a) => [String(a.code || '').trim().toLowerCase(), a]),
  );

  const parsedAssets = [];
  let addedCount = 0;
  let updatedCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const code = String(row[colCode] || '').trim();
    if (!code) continue;

    const serial = colSerial >= 0 ? String(row[colSerial] || '').trim() : '';
    const rawStatus = colStatus >= 0 ? row[colStatus] : 'Available';
    const status = normalizeEquipmentStatus(rawStatus);
    const owner = colOwner >= 0 ? String(row[colOwner] || '').trim() : '';
    const issuedDate = colIssuedDate >= 0 ? normalizeTextDate(row[colIssuedDate]) : '';
    const category = colCategory >= 0 ? String(row[colCategory] || '').trim() : 'Laptop';
    const model = colModel >= 0 ? String(row[colModel] || '').trim() : '';
    const location = colLocation >= 0 ? String(row[colLocation] || '').trim() : 'Head Office';
    const department = colDept >= 0 ? String(row[colDept] || '').trim() : '';
    const notes = colNotes >= 0 ? String(row[colNotes] || '').trim() : '';

    const existing = existingMap.get(code.toLowerCase());

    if (existing) {
      // Update existing asset
      let ownershipHistory = existing.ownershipHistory || [];
      if (owner && owner !== existing.owner) {
        ownershipHistory = [
          createOwnershipEntry({
            previousOwner: existing.owner || 'None',
            newOwner: owner,
            date: issuedDate || todayIso(),
            reason: 'TXT Import Overwrite',
            notes: `Updated from equipment file. Serial: ${serial || existing.serial}`,
          }),
          ...ownershipHistory,
        ];
      }

      parsedAssets.push({
        ...existing,
        serial: serial || existing.serial,
        status: status || existing.status,
        owner: owner || existing.owner,
        issuedDate: issuedDate || existing.issuedDate || '',
        location: location || existing.location,
        department: department || existing.department,
        notes: notes ? (existing.notes ? `${existing.notes} | ${notes}` : notes) : existing.notes,
        ownershipHistory,
        updated: todayIso(),
      });
      updatedCount++;
    } else {
      // Create new asset
      const initialHistory = owner
        ? [
            createOwnershipEntry({
              previousOwner: 'None',
              newOwner: owner,
              date: issuedDate || todayIso(),
              reason: 'TXT Equipment Import',
              notes: `Registered via equipment file. Serial: ${serial}`,
            }),
          ]
        : [];

      parsedAssets.push({
        id: crypto.randomUUID(),
        code,
        name: 'Laptop',
        category: category || 'Laptop',
        model,
        serial,
        status,
        location,
        owner,
        department,
        issuedDate,
        condition: status === 'Damaged' ? 'Damaged' : 'Good',
        notes,
        ownershipHistory: initialHistory,
        updated: todayIso(),
      });
      addedCount++;
    }
  }

  return {
    assets: parsedAssets,
    addedCount,
    updatedCount,
    totalParsed: parsedAssets.length,
  };
}

/* ── 5. Parse IT Equipment Loan Records ─────────────────────── */

/**
 * Parses IT Equipment Loan text rows into structured loan objects.
 * Automatically enriches missing assignee/owner information by correlating
 * with existing assets where available.
 */
export function parseLoansText(rows, existingAssets = [], existingLoans = []) {
  if (!rows || rows.length < 2) {
    throw new Error('Loan text file contains no data rows');
  }

  const rawHeaders = rows[0];
  const normHeaders = rawHeaders.map((h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''));

  const findIdx = (candidates) => {
    return normHeaders.findIndex((h) => candidates.includes(h));
  };

  const colLaptop = findIdx(['laptop', 'assetcode', 'code', 'laptopnumber']);
  const colStartDate = findIdx(['startdate', 'loandate']);
  const colPickupDate = findIdx(['pickupdate']);
  const colEndDate = findIdx(['enddate', 'duedate']);
  const colReturnDate = findIdx(['returndate', 'returneddate']);
  const colName = findIdx(['name', 'assignee', 'borrower']);
  const colKnoxId = findIdx(['knoxid', 'issuedknoxid']);
  const colLocation = findIdx(['rentallocation', 'location']);
  const colIp = findIdx(['ip', 'ipaddress']);
  const colAdapter = findIdx(['chargingadapter', 'adapter']);
  const colCable = findIdx(['chargingcable', 'cable']);
  const colDongle = findIdx(['dongle']);
  const colKeyboard = findIdx(['keyboard']);
  const colMouse = findIdx(['mouse']);
  const colMonitor = findIdx(['monitor']);
  const colEthernet = findIdx(['ethernetcable', 'ethernet']);
  const colOthers = findIdx(['others', 'other']);
  const colNote = findIdx(['note', 'notes']);

  if (colLaptop < 0) {
    throw new Error('Loan list file is missing required "Laptop" / "Asset Code" column');
  }

  const assetMap = new Map(
    existingAssets.map((a) => [String(a.code || '').trim().toLowerCase(), a]),
  );

  const parsedLoans = [];
  const synthesizedAssets = [];
  let addedCount = 0;
  let updatedCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const assetCode = String(row[colLaptop] || '').trim();
    if (!assetCode) continue;

    const startDate = colStartDate >= 0 ? normalizeTextDate(row[colStartDate]) : '';
    const pickupDate = colPickupDate >= 0 ? normalizeTextDate(row[colPickupDate]) : '';
    const endDate = colEndDate >= 0 ? normalizeTextDate(row[colEndDate]) : '';
    const returnDate = colReturnDate >= 0 ? normalizeTextDate(row[colReturnDate]) : '';

    const associatedAsset = assetMap.get(assetCode.toLowerCase());

    // Resolve Assignee / Name
    let assignee = colName >= 0 ? String(row[colName] || '').trim() : '';
    let knoxId = colKnoxId >= 0 ? String(row[colKnoxId] || '').trim() : '';

    if (!assignee) {
      if (associatedAsset && associatedAsset.owner && associatedAsset.owner !== 'IT department') {
        assignee = associatedAsset.owner;
      } else if (knoxId) {
        assignee = knoxId;
      } else {
        assignee = `User (${assetCode})`;
      }
    }

    if (!knoxId && associatedAsset && associatedAsset.owner && associatedAsset.owner.includes('.')) {
      knoxId = associatedAsset.owner;
    }

    const location = (colLocation >= 0 ? String(row[colLocation] || '').trim() : '') ||
      associatedAsset?.location ||
      'Head Office';

    const ip = colIp >= 0 ? String(row[colIp] || '').trim() : '';

    // Accessories
    const adapter = colAdapter >= 0 ? String(row[colAdapter] || '').trim() : '';
    const cable = colCable >= 0 ? String(row[colCable] || '').trim() : '';
    const dongle = colDongle >= 0 ? String(row[colDongle] || '').trim() : '';
    const keyboard = colKeyboard >= 0 ? String(row[colKeyboard] || '').trim() : '';
    const mouse = colMouse >= 0 ? String(row[colMouse] || '').trim() : '';
    const monitor = colMonitor >= 0 ? String(row[colMonitor] || '').trim() : '';
    const ethernet = colEthernet >= 0 ? String(row[colEthernet] || '').trim() : '';
    const others = colOthers >= 0 ? String(row[colOthers] || '').trim() : '';
    const note = colNote >= 0 ? String(row[colNote] || '').trim() : '';

    // Status logic
    const isReturned = Boolean(returnDate);
    let status = 'Scheduled';
    if (isReturned) {
      status = 'Returned';
    } else if (pickupDate) {
      status = 'Active';
    }

    const loanId = crypto.randomUUID();

    parsedLoans.push({
      id: loanId,
      assetCode,
      assignee,
      assigneeType: 'Business traveler',
      knoxId,
      location,
      ip,
      startDate: startDate || pickupDate || todayIso(),
      pickupDate,
      endDate: endDate || '',
      returnDate,
      loanDate: startDate || pickupDate || todayIso(),
      dueDate: endDate || '',
      returnedDate: returnDate,
      status,
      equipment: {
        Adapter: adapter || '1',
        Cable: cable || '1',
        Dongle: dongle || '0',
        Keyboard: keyboard || '0',
        Mouse: mouse || '0',
        Monitor: monitor || '0',
        'Ethernet cable': ethernet || '0',
      },
      others,
      note,
    });

    addedCount++;

    // If this asset doesn't exist yet in the asset index, synthesize a placeholder asset
    if (!associatedAsset && !synthesizedAssets.some((a) => a.code.toLowerCase() === assetCode.toLowerCase())) {
      synthesizedAssets.push({
        id: crypto.randomUUID(),
        code: assetCode,
        name: 'Laptop',
        category: 'Laptop',
        model: '',
        serial: '',
        status: isReturned ? 'Available' : 'On loan',
        location,
        owner: isReturned ? 'IT department' : assignee,
        department: '',
        condition: 'Good',
        notes: note ? `Imported from loan list: ${note}` : 'Imported from loan list',
        ownershipHistory: [
          createOwnershipEntry({
            previousOwner: 'None',
            newOwner: isReturned ? 'IT department' : assignee,
            date: pickupDate || startDate || todayIso(),
            reason: isReturned ? 'Returned to IT department' : 'Loan Check-out',
          }),
        ],
        updated: todayIso(),
      });
    }
  }

  return {
    loans: parsedLoans,
    synthesizedAssets,
    addedCount,
    updatedCount,
    totalParsed: parsedLoans.length,
  };
}
