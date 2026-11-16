const COLORS = ['#1449d6', '#0284c7', '#0f766e', '#7c3aed', '#d97706', '#be185d', '#475569', '#4f46e5'];

export default function LocationDistribution({ items = [] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (!total) return <p className="empty">No assets to display by location.</p>;
  let offset = 0;
  return <div className="location-distribution">
    <svg viewBox="0 0 100 100" className="location-distribution-chart" role="img" aria-label={`Asset locations: ${items.map((item) => `${item.label}, ${item.count}`).join('; ')}`}>
      {items.map((item, index) => {
        const share = item.count / total * 100;
        const start = offset; offset += share;
        return <circle key={item.label} cx="50" cy="50" r="40" pathLength="100" fill="none" stroke={COLORS[index % COLORS.length]}
          strokeWidth="13" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start} transform="rotate(-90 50 50)">
          <title>{item.label}: {item.count} ({share.toFixed(1)}%)</title>
        </circle>;
      })}
      <text x="50" y="49" textAnchor="middle" className="location-distribution-total">{total}</text>
      <text x="50" y="61" textAnchor="middle" className="location-distribution-caption">assets</text>
    </svg>
    <ul className="location-distribution-legend">{items.map((item, index) => <li key={item.label}>
      <span className="location-distribution-swatch" style={{ background: COLORS[index % COLORS.length] }} aria-hidden="true" />
      <span className="location-distribution-label">{item.label}</span>
      <strong>{item.count}</strong><small>{(item.count / total * 100).toFixed(1)}%</small>
    </li>)}</ul>
  </div>;
}
