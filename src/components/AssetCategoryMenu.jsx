export default function AssetCategoryMenu({ categories, total, selected, onChange }) {
  return <nav className="asset-category-menu" aria-label="Asset categories">
    <button type="button" className={`loan-tab${selected === null ? ' active' : ''}`}
      aria-pressed={selected === null} onClick={() => onChange(null)}>
      All <span className="loan-tab-count">{total}</span>
    </button>
    {categories.map(({ key, name, count }) => <button type="button" key={key}
      className={`loan-tab${selected === key ? ' active' : ''}`} aria-pressed={selected === key}
      onClick={() => onChange(key)}>
      {name} <span className="loan-tab-count">{count}</span>
    </button>)}
  </nav>;
}
