import packageMetadata from '../../package.json' with { type: 'json' };

export const APP_VERSION = packageMetadata.version;
export const STORAGE_KEY = 'starplusenergy-asset-index-v1';
export const IMPORT_BACKUP_KEY = 'starplusenergy-last-import-backup-v1';

export const STATUSES = ['Available', 'Assigned', 'On loan', 'Damaged', 'Under repair', 'Retired'];

export const LOAN_HEADERS = [
  'Index', 'Name', 'Knox ID', 'Business Traveler', 'Location', 'IP',
  'Start Date', 'Pickup Date', 'End Date', 'Return Date',
  'Laptop',
  'Charging Adapter', 'Charging Cable',
  'Dongle', 'Keyboard', 'Mouse', 'Monitor', 'Ethernet Cable',
  'Others', 'Note',
];

export const IP_PREFIX = '105.101.';

export const DEFAULT_TRANSFER_REASONS = [
  'Reassigned to new staff',
  'New Hire onboarding',
  'Department Transfer',
  'Temporary Handover',
  'Permanent Allocation',
  'Returned to IT department',
  'Repaired & Reassigned',
];

export const TRANSFER_REASONS_KEY = 'starplusenergy-transfer-reasons-v1';
