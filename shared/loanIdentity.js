import { pcAssetCode } from './pcReferences.js';

const FIELDS = {
  assetCode: ['assetCode', 'asset_code'],
  knoxId: ['knoxId', 'knox_id'],
  assignee: ['assignee'],
  startDate: ['startDate', 'start_date'],
  pickupDate: ['pickupDate', 'pickup_date'],
  returnDate: ['returnDate', 'return_date', 'returnedDate', 'returned_date'],
  status: ['status'],
  department: ['department'],
  location: ['location'],
  ip: ['ip'],
  endDate: ['endDate', 'end_date'],
  equipment: ['equipment', 'equipment_json'],
  returnedEquipment: ['returnedEquipment', 'returned_equipment_json'],
  returnStatus: ['returnStatus', 'return_status'],
  readyForPickup: ['readyForPickup', 'ready_for_pickup'],
  others: ['others'],
  note: ['note'],
  purpose: ['purpose'],
  assigneeType: ['assigneeType', 'assignee_type'],
  isArchived: ['isArchived', 'is_archived'],
};

function fieldValue(record, names) {
  let emptyValue = '';
  for (const name of names) {
    if (record?.[name] === undefined || record[name] === null) continue;
    const value = record[name];
    if (String(value).trim() !== '') return value;
    emptyValue = value;
  }
  return emptyValue;
}

function normalizedText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizedDate(value) {
  return String(value ?? '').trim().slice(0, 10);
}

function parseJsonValue(value) {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

/**
 * Build conservative identity keys for a loan record. Asset plus Knox ID/name
 * and a start/pickup/return date distinguishes loans while allowing a scheduled
 * row to match its later picked-up or imported returned version.
 */
export function loanIdentityKeys(loan) {
  const parties = loanPartyKeys(loan);
  const dates = loanIdentityDates(loan);
  const returnDate = normalizedDate(fieldValue(loan, FIELDS.returnDate));
  const anchors = dates.map((date) => `date:${date}`);
  if (returnDate) anchors.push(`return:${returnDate}`);
  if (!anchors.length) anchors.push(`undated:${normalizedText(fieldValue(loan, FIELDS.status))}`);
  return parties.flatMap((party) => anchors.map((anchor) => `${party}|${anchor}`));
}

function loanIdentityDates(loan) {
  return [...new Set([
    fieldValue(loan, FIELDS.startDate),
    fieldValue(loan, FIELDS.pickupDate),
  ].map(normalizedDate).filter(Boolean))];
}

function loanPartyKeys(loan) {
  const equipment = parseJsonValue(fieldValue(loan, FIELDS.equipment));
  const asset = normalizedText(pcAssetCode(fieldValue(loan, FIELDS.assetCode) || equipment?.Laptop)) || 'no-asset';
  const people = [
    ['knox', normalizedText(fieldValue(loan, FIELDS.knoxId))],
    ['name', normalizedText(fieldValue(loan, FIELDS.assignee))],
  ].filter(([, value]) => value);
  return people.map(([type, person]) => `${asset}|${type}:${person}`);
}

export function loanRecordsMatch(left, right) {
  const leftId = String(left?.id || '').trim();
  const rightId = String(right?.id || '').trim();
  if (leftId && rightId && leftId === rightId) return true;

  const leftKeys = new Set(loanIdentityKeys(left));
  return loanIdentityKeys(right).some((key) => leftKeys.has(key));
}

export function findLoanMatchIndex(loans, candidate) {
  const id = String(candidate?.id || '').trim();
  if (id) {
    const idIndex = loans.findIndex((loan) => String(loan?.id || '').trim() === id);
    if (idIndex >= 0) return idIndex;
  }
  const strictIndex = loans.findIndex((loan) => loanRecordsMatch(loan, candidate));
  if (strictIndex >= 0) return strictIndex;

  // If one side lacks both start and pickup dates, fall back only when there
  // is a single matching asset/person record. This avoids merging separate
  // dated loans while allowing undated imports to update a lone existing row.
  const candidateIsUndated = loanIdentityDates(candidate).length === 0;
  const partyKeys = new Set(loanPartyKeys(candidate));
  const fallbackIndexes = [];
  loans.forEach((loan, index) => {
    const loanIsUndated = loanIdentityDates(loan).length === 0;
    if (candidateIsUndated === loanIsUndated) return;
    if (loanPartyKeys(loan).some((key) => partyKeys.has(key))) fallbackIndexes.push(index);
  });
  return fallbackIndexes.length === 1 ? fallbackIndexes[0] : -1;
}

/** Remove only semantic clones, ignoring database IDs and creation timestamps. */
export function deduplicateLoanRecords(loans = []) {
  const seen = new Set();
  return loans.filter((loan) => {
    const values = Object.entries(FIELDS).map(([key, aliases]) => {
      let value = fieldValue(loan, aliases);
      if (key === 'assetCode') {
        const equipment = parseJsonValue(fieldValue(loan, FIELDS.equipment));
        value = value || equipment?.Laptop || '';
      } else if (key === 'equipment' || key === 'returnedEquipment') {
        value = canonicalize(parseJsonValue(value));
      } else if (key === 'readyForPickup' || key === 'isArchived') {
        value = Boolean(value);
      }
      return [key, value ?? ''];
    });
    const signature = JSON.stringify(values);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}
