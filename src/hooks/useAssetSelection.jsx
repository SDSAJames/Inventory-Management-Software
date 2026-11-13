import { useState, useCallback } from 'react';

export default function useAssetSelection() {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const handleRangeSelect = useCallback((ids, adding) => setSelectedIds((previous) => {
    const next = new Set(previous);
    for (const id of ids) adding ? next.add(id) : next.delete(id);
    return next;
  }), []);
  const handleToggleSelect = (id) => setSelectedIds((previous) => {
    const next = new Set(previous);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const handleToggleSelectAll = (assets) => setSelectedIds((previous) => {
    const next = new Set(previous);
    const remove = assets.every((asset) => previous.has(asset.id));
    for (const asset of assets) remove ? next.delete(asset.id) : next.add(asset.id);
    return next;
  });
  return { selectedIds, setSelectedIds, handleToggleSelect, handleToggleSelectAll, handleRangeSelect };
}
