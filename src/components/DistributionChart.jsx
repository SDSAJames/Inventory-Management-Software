import { useState } from 'react';

const COLORS = ['#1449d6', '#0284c7', '#0f766e', '#7c3aed', '#d97706', '#be185d', '#475569', '#4f46e5'];

function arcPath(start, share) {
  if (share >= 100) return 'M 50 10 A 40 40 0 1 1 50 90 A 40 40 0 1 1 50 10';
  const point = (value) => {
    const angle = (value * 3.6 - 90) * Math.PI / 180;
    return `${50 + 40 * Math.cos(angle)} ${50 + 40 * Math.sin(angle)}`;
  };
  return `M ${point(start)} A 40 40 0 ${share > 50 ? 1 : 0} 1 ${point(start + share)}`;
}

/** Shared category/location diagram with matching segment and legend feedback. */
export default function DistributionChart({ items = [], label = 'Asset mix', emptyMessage = 'No assets to display.' }) {
  const [activeLabel, setActiveLabel] = useState(null);
  const values = items.filter((item) => item.count > 0);
  const total = values.reduce((sum, item) => sum + item.count, 0);
  const active = values.find((item) => item.label === activeLabel);
  if (!total) return <p className="empty">{emptyMessage}</p>;
  const detailId = `${label.toLowerCase().replace(/\W+/g, '-')}-details`;
  const details = (item) => `${item.label}: ${item.count} asset${item.count === 1 ? '' : 's'} (${(item.count / total * 100).toFixed(1)}%)`;
  const interaction = (item) => ({
    onMouseEnter: () => setActiveLabel(item.label),
    onMouseLeave: () => setActiveLabel(null),
    onFocus: () => setActiveLabel(item.label),
    onBlur: () => setActiveLabel(null),
    onClick: () => setActiveLabel(item.label),
  });
  let offset = 0;
  return <div className="location-distribution">
    <svg viewBox="0 0 100 100" className="location-distribution-chart" role="group" aria-label={`${label}: ${values.map((item) => `${item.label}, ${item.count}`).join('; ')}`}>
      {values.map((item, index) => {
        const share = item.count / total * 100;
        const start = offset; offset += share;
        return <path key={item.label} d={arcPath(start, share)} fill="none" stroke={COLORS[index % COLORS.length]}
          className="distribution-segment" strokeWidth={active?.label === item.label ? 17 : 13}
          opacity={active && active.label !== item.label ? 0.35 : 1} tabIndex={0} role="button"
          aria-label={details(item)} aria-describedby={detailId} {...interaction(item)}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActiveLabel(item.label); } }}>
          <title>{details(item)}</title>
        </path>;
      })}
      <text x="50" y="49" textAnchor="middle" className="location-distribution-total">{active?.count ?? total}</text>
      <text x="50" y="61" textAnchor="middle" className="location-distribution-caption">assets</text>
    </svg>
    <div id={detailId} className="distribution-details" role="status" aria-live="polite">
      {active ? <><strong>{active.label}</strong><span>{active.count} asset{active.count === 1 ? '' : 's'} · {(active.count / total * 100).toFixed(1)}%</span></> : <span>Hover or focus a segment or label for details.</span>}
    </div>
    <ul className="location-distribution-legend">{values.map((item, index) => <li key={item.label}>
      <button type="button" className={`distribution-legend-button${active?.label === item.label ? ' active' : ''}`}
        aria-label={details(item)} aria-describedby={detailId} {...interaction(item)}>
        <span className="location-distribution-swatch" style={{ background: COLORS[index % COLORS.length] }} aria-hidden="true" />
        <span className="location-distribution-label">{item.label}</span>
        <strong>{item.count}</strong><small>{(item.count / total * 100).toFixed(1)}%</small>
      </button>
    </li>)}</ul>
  </div>;
}
