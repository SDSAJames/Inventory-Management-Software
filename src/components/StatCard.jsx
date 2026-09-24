export default function StatCard({ label, value, note, variant }) {
  return (
    <div className={`stat-card${variant ? ` ${variant}` : ''}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-note">{note}</span>
    </div>
  );
}
