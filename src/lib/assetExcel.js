/**
 * Asset register <-> Excel mapping.
 * Compatible with the SPE_Equipments equipment register layout.
 * Extra register columns are appended on export and picked up again on import,
 * so an exported file can be re-imported without losing information.
 */

import { todayIso } from './utils.js';
import { DEFAULT_ASSET_HEADERS, equipmentColumnIndexes, equipmentExportValue, equipmentFieldForHeader, normalizeEquipmentStatus } from './equipmentSchema.js';
import { cleanSpreadsheetCell as clean, excelSerialDate } from './spreadsheetValues.js';
import { getAssetLocation } from '../../shared/assetRules.js';
import { normalizeAssetDate } from '../../shared/assetDates.js';

export { DEFAULT_ASSET_HEADERS } from './equipmentSchema.js';
export const ASSET_EXPORT_HEADERS = DEFAULT_ASSET_HEADERS;

/* ── Value helpers ──────────────────────────────────── */

/** Excel serial (e.g. 46296) or date-like text -> YYYY-MM-DD. */
function normalizeDate(raw) {
  const value = normalizeAssetDate(clean(raw));
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const serialDate = excelSerialDate(value, { maximum: 80000, round: true });
  if (serialDate) return serialDate.toISOString().slice(0, 10);
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

  const rawHeaders = rows[headerRowIndex].map(clean);
  const index = equipmentColumnIndexes(rawHeaders);

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
    const status = normalizeEquipmentStatus(get('status'));
    const existing = existingMap.get(key);
    const parsedAsset = {
      code,
      name: get('name') || code,
      category,
      model: get('model'),
      serial: get('serial'),
      status,
      location: getAssetLocation(status, get('location'), existing?.location),
      owner: get('owner'),
      issuedName: index.issuedName >= 0 ? get('issuedName') : get('owner') === existing?.owner ? existing?.issuedName || '' : '',
      department: get('department'),
      notes: get('notes'),
      purchaseDate: normalizeDate(get('purchaseDate')),
      warrantyExpirationDate: normalizeDate(get('warrantyExpirationDate')) || existing?.warrantyExpirationDate || '',
      issuedDate: normalizeDate(get('issuedDate')),
      updated: todayIso(),
    };

    if (existingMap.has(key)) {
      duplicates.push({
        id: existing.id,
        ...parsedAsset,
        // preserve original existing values if blank in import
        name: parsedAsset.name || existing.name,
        category: parsedAsset.category || existing.category,
        location: parsedAsset.location,
        purchaseDate: parsedAsset.purchaseDate || existing.purchaseDate || '',
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
 * Defaults to the SPE equipment register columns.
 * If custom headers from an imported file are provided, uses those exact columns.
 */
export function assetsToRows(assets, headers = DEFAULT_ASSET_HEADERS, { appendOptionalColumns = true } = {}) {
  const activeHeaders = [...(Array.isArray(headers) && headers.length > 0 ? headers : DEFAULT_ASSET_HEADERS)];
  if (appendOptionalColumns && assets.some((asset) => asset.issuedName) && !activeHeaders.some((header) => equipmentFieldForHeader(header) === 'issuedName')) activeHeaders.push('Issued Name');
  if (appendOptionalColumns && assets.some((asset) => asset.warrantyExpirationDate) && !activeHeaders.some((header) => equipmentFieldForHeader(header) === 'warrantyExpirationDate')) activeHeaders.push('Warranty Expiration Date');
  return [
    activeHeaders,
    ...assets.map((asset) => activeHeaders.map((header) => equipmentExportValue(asset, header))),
  ];
}
