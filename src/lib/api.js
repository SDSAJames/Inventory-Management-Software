/**
 * StarPlus Energy Asset Management System (SPE-AMS)
 * Enterprise Backend REST API Client
 */

const BASE_URL = '/api';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const token = typeof window !== 'undefined' ? localStorage.getItem('starplusenergy-token') : null;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    headers,
    credentials: 'include', // Ensures HTTP-only auth cookies are sent
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.error || data.message || `API Error ${response.status}: ${response.statusText}`;
    const error = new Error(errorMsg);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  // ── Health ──
  getHealth: () => request('/health'),

  // ── Auth & Users ──
  auth: {
    login: (credentials) => request('/auth/login', { method: 'POST', body: credentials }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    getMe: () => request('/auth/me'),
    changePassword: (data) => request('/auth/change-password', { method: 'POST', body: data }),
    getUsers: () => request('/auth/users'),
    createUser: (userData) => request('/auth/users', { method: 'POST', body: userData }),
    updateUser: (id, userData) => request(`/auth/users/${id}`, { method: 'PUT', body: userData }),
    deleteUser: (id) => request(`/auth/users/${id}`, { method: 'DELETE' }),
  },

  // ── Assets ──
  assets: {
    getAll: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/assets${q ? `?${q}` : ''}`);
    },
    getById: (id) => request(`/assets/${id}`),
    create: (asset) => request('/assets', { method: 'POST', body: asset }),
    update: (id, changes) => request(`/assets/${id}`, { method: 'PUT', body: changes }),
    transfer: (id, transferData) => request(`/assets/${id}/transfer`, { method: 'POST', body: transferData }),
    batchUpdate: (ids, changes) => request('/assets/batch-update', { method: 'POST', body: { ids, changes } }),
    batchDelete: (ids) => request('/assets/batch-delete', { method: 'POST', body: { ids } }),
    delete: (id) => request(`/assets/${id}`, { method: 'DELETE' }),
    getHistory: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/assets/history/all${q ? `?${q}` : ''}`);
    },
    getCategories: () => request('/assets/categories'),
    reconcile: () => request('/assets/reconcile', { method: 'POST' }),
  },

  // ── Loans ──
  loans: {
    getAll: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/loans${q ? `?${q}` : ''}`);
    },
    getById: (id) => request(`/loans/${id}`),
    create: (loan) => request('/loans', { method: 'POST', body: loan }),
    update: (id, changes) => request(`/loans/${id}`, { method: 'PUT', body: changes }),
    pickup: (id, pickupDate) => request(`/loans/${id}/pickup`, { method: 'POST', body: { pickupDate } }),
    revertPickup: (id) => request(`/loans/${id}/revert-pickup`, { method: 'POST' }),
    returnLoan: (id, returnDate) => request(`/loans/${id}/return`, { method: 'POST', body: { returnDate } }),
    unarchive: (id) => request(`/loans/${id}/unarchive`, { method: 'POST' }),
    batchReturn: (ids, returnDate) => request('/loans/batch-return', { method: 'POST', body: { ids, returnDate } }),
    batchDelete: (ids) => request('/loans/batch-delete', { method: 'POST', body: { ids } }),
    delete: (id) => request(`/loans/${id}`, { method: 'DELETE' }),
    getOverdue: () => request('/loans/overdue'),
    getCalendar: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/loans/calendar${q ? `?${q}` : ''}`);
    },
  },

  // ── Directory (Employees, Departments, Locations, Reasons) ──
  directory: {
    getEmployees: () => request('/directory/employees'),
    createEmployee: (emp) => request('/directory/employees', { method: 'POST', body: emp }),
    updateEmployee: (id, emp) => request(`/directory/employees/${id}`, { method: 'PUT', body: emp }),
    deleteEmployee: (id) => request(`/directory/employees/${id}`, { method: 'DELETE' }),

    getDepartments: () => request('/directory/departments'),
    addDepartment: (name) => request('/directory/departments', { method: 'POST', body: { name } }),
    deleteDepartment: (name) => request(`/directory/departments/${encodeURIComponent(name)}`, { method: 'DELETE' }),

    getLocations: () => request('/directory/locations'),
    addLocation: (name) => request('/directory/locations', { method: 'POST', body: { name } }),
    deleteLocation: (name) => request(`/directory/locations/${encodeURIComponent(name)}`, { method: 'DELETE' }),

    getTransferReasons: () => request('/directory/transfer-reasons'),
    addTransferReason: (reason) => request('/directory/transfer-reasons', { method: 'POST', body: { reason } }),
    deleteTransferReason: (id) => request(`/directory/transfer-reasons/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },

  // ── Statistics & KPIs ──
  stats: {
    getDashboard: () => request('/stats/dashboard'),
    getAuditLogs: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/stats/audit-logs${q ? `?${q}` : ''}`);
    },
  },

  // ── Exchange / Import / Export / Backup ──
  exchange: {
    exportData: () => request('/exchange/export'),
    importData: ({ assets, loans, overwrite = false }) =>
      request('/exchange/import', { method: 'POST', body: { assets, loans, overwrite } }),
    revertData: () => request('/exchange/revert', { method: 'POST' }),
    getBackupStatus: () => request('/exchange/backup-status'),
  },
};
