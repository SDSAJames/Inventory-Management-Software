import { useEffect, useRef, useState } from 'react';
import { mergeRecordDraft } from '../lib/recordDraft.js';

export function useRecordDraft({ recordId, record, toDraft, makeBlank, forceFields }) {
  const [draft, setDraft] = useState(() => record ? toDraft(record) : makeBlank());
  const baseline = useRef({ id: recordId, saved: record ? toDraft(record) : null });
  useEffect(() => {
    const nextSaved = record ? toDraft(record) : null;
    const previous = baseline.current;
    if (previous.id !== recordId) {
      setDraft(nextSaved || makeBlank());
    } else if (nextSaved) {
      const force = forceFields?.(previous.saved, nextSaved) || [];
      setDraft((current) => mergeRecordDraft(current, previous.saved, nextSaved, force));
    }
    baseline.current = { id: recordId, saved: nextSaved };
  }, [recordId, record]);
  return [draft, setDraft];
}
