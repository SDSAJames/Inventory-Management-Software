/**
 * Asset register <-> Excel mapping.
 * Compatible with the SPE_Equipments_example.xlsx layout:
 *   Host Name | Serial Number | Status | Issued Knox ID | Issued Date
 * Extra register columns are appended on export and picked up again on import,
 * so an exported file can be re-imported without losing information.
 */

import { STATUSES } from './constants';
import { todayIso } from './utils';

/* ── Column definitions ─────────────────────────────── */

// field -> accepted header names (case-insensitive). First entry is used on export.
const COLUMNS = [
  ['code', ['Host Name', 'Asset code', 'Code', 'Asset number']],
  ['serial', ['Serial Number', 'Serial', 'S/N']],
  ['status', ['Status']],
  ['owner', ['Issued Knox ID', 'Knox ID', 'Holder', 'Current holder', 'Owner']],
  ['issuedDate', ['Issued Date', 'Issue date']],
  ['name', ['Asset Name', 'Name']],
  ['category', ['Category']],
  ['model', ['Model']],
  ['location', ['Location']],
  ['department', ['Department']],
  ['notes', ['Notes', 'Note']],
  ['updated', ['Updated', 'Last updated']],
];

export const DEFAULT_ASSET_HEADERS = [
  'Host Name',
  'Serial Number',
  'Status',
  'Issued Knox ID',
  'Issued Date',
];

export const ASSET_EXPORT_HEADERS = DEFAULT_ASSET_HEADERS;

// Spreadsheet vocabulary -> register statuses
const STATUS_ALIASES = {
  issued: 'Assigned',
  broken: 'Damaged',
  loaned: 'On loan',
  repair: 'Under repair',
  disposed: 'Retired',
};

/* ── Value helpers ──────────────────────────────────── */

const clean = (v) => String(v ?? '').replace(/_x000D_/gi, '').trim();

function normalizeStatus(raw) {
  const value = clean(raw).toLowerCase();
  if (!value) return 'Available';
  const direct = STATUSES.find((s) => s.toLowerCase() === value);
  return direct || STATUS_ALIASES[value] || 'Available';
}

function exportStatus(status) {
  if (status === 'Assigned') return 'Issued';
  if (status === 'Damaged') return 'Broken';
  if (status === 'On loan') return 'Loaned';
  if (status === 'Under repair') return 'Repair';
  if (status === 'Retired') return 'Disposed';
  return status || 'Available';
}

/** Excel serial (e.g. 46296) or date-like text -> YYYY-MM-DD. */
function normalizeDate(raw) {
  const value = clean(raw);
  if (!value) return '';
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 20000 && numeric < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(numeric) * 86400000).toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(value)) {
    const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }
  return value;
}

/* ── Import ─────────────────────────────────────────── */

/**
 * Parse sheet rows into new and duplicate assets.
 * @returns {{ added: object[], duplicates: object[], invalid: number, importedHeaders: string[] }}
 */
export function parseAssetRows(rows, existingAssets) {
  const headerRowIndex = rows.findIndex((r) => r && r.some((c) => clean(c)));
  if (headerRowIndex < 0) throw new Error('The workbook is empty');

  const rawHeaders = rows[headerRowIndex].map((h) => clean(h)).filter(Boolean);
  const headers = rawHeaders.map((h) => h.toLowerCase());
  const index = {};
  COLUMNS.forEach(([field, names]) => {
    index[field] = headers.findIndex((h) => names.some((n) => n.toLowerCase() === h));
  });

  if (index.code < 0) {
    throw new Error('Missing "Host Name" (asset code) column — check the workbook format');
  }

  const existingMap = new Map(existingAssets.map((a) => [clean(a.code).toLowerCase(), a]));
  const added = [];
  const duplicates = [];
  const seenInFile = new Set();
  let invalid = 0;

  rows.slice(headerRowIndex + 1).forEach((row) => {
    if (!row || !row.some((c) => clean(c))) return; // blank line
    const get = (field) => (index[field] >= 0 ? clean(row[index[field]]) : '');

    const code = get('code');
    if (!code) { invalid++; return; }
    const key = code.toLowerCase();

    // If duplicate within the file itself, skip subsequent rows
    if (seenInFile.has(key)) return;
    seenInFile.add(key);

    const category = get('category') || 'Laptop';
    const parsedAsset = {
      code,
      name: get('name') || category,
      category,
      model: get('model'),
      serial: get('serial'),
      status: normalizeStatus(get('status')),
      location: get('location'),
      owner: get('owner'),
      department: get('department'),
      notes: get('notes'),
      issuedDate: normalizeDate(get('issuedDate')),
      updated: todayIso(),
    };

    if (existingMap.has(key)) {
      const existing = existingMap.get(key);
      duplicates.push({
        id: existing.id,
        ...parsedAsset,
        // preserve original existing values if blank in import
        name: parsedAsset.name || existing.name,
        category: parsedAsset.category || existing.category,
        location: parsedAsset.location || existing.location,
        existingRecord: existing,
      });
    } else {
      added.push({
        id: crypto.randomUUID(),
        ...parsedAsset,
      });
    }
  });

  return { added, duplicates, invalid, importedHeaders: rawHeaders };
}

/* ── Export ─────────────────────────────────────────── */

/**
 * Format assets into tabular rows with columns matching the imported Excel format.
 * Defaults to the 5 standard columns: Host Name | Serial Number | Status | Issued Knox ID | Issued Date.
 * If custom headers from an imported file are provided, uses those exact columns.
 */
export function assetsToRows(assets, headers = DEFAULT_ASSET_HEADERS) {
  const activeHeaders = Array.isArray(headers) && headers.length > 0 ? headers : DEFAULT_ASSET_HEADERS;

  const getFieldValue = (asset, headerName) => {
    const h = clean(headerName).toLowerCase();
    if (['host name', 'asset code', 'code', 'asset number'].includes(h)) {
      return asset.code || '';
    }
    if (['serial number', 'serial', 's/n'].includes(h)) {
      return asset.serial || '';
    }
    if (['status'].includes(h)) {
      return exportStatus(asset.status);
    }
    if (['issued knox id', 'knox id', 'holder', 'current holder', 'owner'].includes(h)) {
      return asset.owner || '';
    }
    if (['issued date', 'issue date'].includes(h)) {
      return asset.issuedDate || asset.updated || '';
    }
    if (['asset name', 'name'].includes(h)) {
      return asset.name || '';
    }
    if (['category'].includes(h)) {
      return asset.category || '';
    }
    if (['model'].includes(h)) {
      return asset.model || '';
    }
    if (['location'].includes(h)) {
      return asset.location || '';
    }
    if (['department'].includes(h)) {
      return asset.department || '';
    }
    if (['notes', 'note'].includes(h)) {
      return asset.notes || '';
    }
    if (['updated', 'last updated', 'modification date'].includes(h)) {
      return asset.updated || '';
    }
    return asset[headerName] ?? '';
  };

  return [
    activeHeaders,
    ...assets.map((asset) => activeHeaders.map((header) => getFieldValue(asset, header))),
  ];
}
