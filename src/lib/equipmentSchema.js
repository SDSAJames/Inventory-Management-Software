import { STATUSES } from './constants.js';
import { cleanSpreadsheetCell, createHeaderLookup, normalizeSpreadsheetHeader } from './spreadsheetValues.js';

/** Canonical equipment fields and accepted legacy spreadsheet column names. */
export const EQUIPMENT_COLUMNS = [
  ['code', ['Asset number', 'Host Name', 'Asset code', 'Code', 'Host']],
  ['serial', ['Serial Number', 'Serial', 'S/N']],
  ['status', ['Status']],
  ['owner', ['Issued Knox ID', 'Knox ID', 'Holder', 'Current holder', 'Owner']],
  ['issuedName', ['Issued Name']],
  ['issuedDate', ['Issued Date', 'Issue date', 'Date']],
  ['name', ['Asset Name', 'Name']],
  ['category', ['Category', 'Asset Type', 'Type']],
  ['purchaseDate', ['Purchase Date', 'Date Purchased']],
  ['warrantyExpirationDate', ['Warranty Expiration Date', 'Warranty Expiry Date', 'Warranty End Date', 'Warranty Expiration']],
  ['model', ['Model']],
  ['location', ['Location', 'Facility']],
  ['department', ['Department', 'Dept']],
  ['notes', ['Notes', 'Note']],
  ['updated', ['Updated', 'Last updated', 'Modification date']],
];

export const DEFAULT_ASSET_HEADERS = [
  'Asset Number', 'Asset Type', 'Serial Number', 'Purchase Date', 'Status',
  'Issued Knox ID', 'Issued Date', 'Department', 'Location', 'Notes',
];

export const MES_ASSET_HEADERS = [
  'Asset Number', 'Asset Type', 'Serial Number', 'Purchase Date', 'Status',
  'Issued Knox ID', 'Issued Name', 'Issued Date', 'Department', 'Location', 'Notes',
];
export function isMesEquipment(asset) {
  return /^mes(?:\s|$)/i.test(String(asset.category || '').trim()) || /^mes(?:pc|m)?[-_]/i.test(String(asset.code || '').trim());
}

const STATUS_ALIASES = new Map([
  ['issued', 'Assigned'], ['broken', 'Damaged'], ['loaned', 'On loan'],
  ['repair', 'Under repair'], ['disposed', 'Retired'],
]);
const EXPORT_STATUSES = new Map([
  ['Assigned', 'Issued'], ['Damaged', 'Broken'], ['On loan', 'Loaned'],
  ['Under repair', 'Repair'], ['Retired', 'Disposed'],
]);
const FIELDS_BY_HEADER = new Map(EQUIPMENT_COLUMNS.flatMap(([field, aliases]) =>
  aliases.map((alias) => [normalizeSpreadsheetHeader(alias), field]),
));

export function equipmentColumnIndexes(headers) {
  const findColumn = createHeaderLookup(headers);
  return Object.fromEntries(EQUIPMENT_COLUMNS.map(([field, aliases]) => [field, findColumn(aliases)]));
}

export function normalizeEquipmentStatus(raw) {
  const value = cleanSpreadsheetCell(raw).toLowerCase();
  return STATUSES.find((status) => status.toLowerCase() === value) || STATUS_ALIASES.get(value) || 'Available';
}

export function equipmentFieldForHeader(header) {
  return FIELDS_BY_HEADER.get(normalizeSpreadsheetHeader(header));
}

export function equipmentExportValue(asset, header) {
  const field = equipmentFieldForHeader(header);
  if (!field) return asset[header] ?? '';
  if (field === 'status') return EXPORT_STATUSES.get(asset.status) || asset.status || 'Available';
  return asset[field] || '';
}
