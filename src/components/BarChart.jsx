export default function BarChart({ items, total }) {
  return (
    <>
      {items.map((item) => (
        <div className="bar-row" key={item.label}>
          <div className="bar-meta">
            <span>{item.label}</span>
            <span>{item.count} asset{item.count === 1 ? '' : 's'}</span>
          </div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${Math.max(12, (item.count / total) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </>
  );
}
