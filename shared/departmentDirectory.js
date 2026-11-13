/** Directory names plus departments already saved on assets, custody records or people. */
export function departmentDirectoryNames(database = {}) {
  const names = new Map();
  for (const value of [
    ...(database.departments || []).map((entry) => entry?.name ?? entry),
    ...['assets', 'loans', 'employees'].flatMap((table) => (database[table] || []).map((row) => row.department)),
  ]) {
    const name = String(value ?? '').trim();
    if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
}

export function matchesDepartment(record, name) {
  return String(record.department ?? '').trim().toLowerCase() === String(name ?? '').trim().toLowerCase();
}
