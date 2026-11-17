/** Trim only outer whitespace; spaces within a directory name are meaningful. */
export function trimDirectoryValue(value) {
  return String(value ?? '').trim();
}

/** Preserve omitted fields in partial updates and avoid changing the caller's record. */
export function trimDirectoryFields(record) {
  if (!record) return record;
  let result = record;
  for (const key of ['location', 'department']) {
    if (typeof record[key] !== 'string') continue;
    const value = trimDirectoryValue(record[key]);
    if (value !== record[key]) {
      if (result === record) result = { ...record };
      result[key] = value;
    }
  }
  return result;
}
