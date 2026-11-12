export const PC_CATEGORIES = ['Laptop', 'MES PC', 'PC'];
export const MONITOR_CATEGORIES = ['Monitor', 'Monitors', 'MES Monitor'];

export function matchesAssetCategory(assetCategory, categoryFilter) {
  if (!categoryFilter) return true;
  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const allowed = Array.isArray(categoryFilter) ? categoryFilter : [categoryFilter];
  return allowed.some((category) => normalize(category) === normalize(assetCategory));
}

export function findAssetByCode(assets = [], code = '') {
  const normalized = String(code).trim().toLowerCase();
  return assets.find((asset) => String(asset.code || '').trim().toLowerCase() === normalized);
}
