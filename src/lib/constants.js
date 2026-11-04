import packageMetadata from '../../package.json' with { type: 'json' };

export const APP_VERSION = packageMetadata.version;
export const CUSTODY_PAGE_TITLE = 'Assignments & Pickups';
export const STORAGE_KEY = 'starplusenergy-asset-index-v1';
export const IMPORT_BACKUP_KEY = 'starplusenergy-last-import-backup-v1';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export { DEFAULT_ASSET_STATUSES as STATUSES, DEFAULT_TRANSFER_REASONS } from '../../shared/referenceData.js';

export const LOAN_HEADERS = [
  'Index', 'Name', 'Knox ID', 'Business Traveler', 'Location', 'IP',
  'Start Date', 'Pickup Date', 'End Date', 'Return Date',
  'Laptop',
  'Charging Adapter', 'Charging Cable',
  'Dongle', 'Keyboard', 'Mouse', 'Monitor', 'Ethernet Cable',
  'Others', 'Note',
];

export const IP_PREFIX = '105.101.';

export const TRANSFER_REASONS_KEY = 'starplusenergy-transfer-reasons-v1';
