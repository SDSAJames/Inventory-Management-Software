export default function StatCard({ label, value, note, variant, onClick, active }) {
  return (
    <div
      className={`stat-card${variant ? ` ${variant}` : ''}${onClick ? ' clickable' : ''}${active ? ' active' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-note">{note}</span>
    </div>
  );
}
