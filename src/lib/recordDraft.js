const equal = (left, right) => Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);

/** Refresh untouched fields while retaining values edited since the last saved baseline. */
export function mergeRecordDraft(draft, previousSaved, nextSaved, forceFields = []) {
  const forced = new Set(forceFields);
  let merged = draft;
  for (const key of new Set([...Object.keys(previousSaved || {}), ...Object.keys(nextSaved || {})])) {
    if (!forced.has(key) && !equal(draft[key], previousSaved?.[key])) continue;
    const next = nextSaved?.[key];
    if (equal(draft[key], next)) continue;
    if (merged === draft) merged = { ...draft };
    merged[key] = next;
  }
  return merged;
}
