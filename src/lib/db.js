import { STORAGE_KEY, IMPORT_BACKUP_KEY } from './constants';
import { seed } from '../data/seed';

export function loadDb() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(seed);
  } catch {
    return structuredClone(seed);
  }
}

export function saveDb(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function hasImportBackup() {
  return Boolean(localStorage.getItem(IMPORT_BACKUP_KEY));
}

export function saveImportBackup(db) {
  localStorage.setItem(IMPORT_BACKUP_KEY, JSON.stringify(db));
}

export function loadImportBackup() {
  try {
    const raw = localStorage.getItem(IMPORT_BACKUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearImportBackup() {
  localStorage.removeItem(IMPORT_BACKUP_KEY);
}
