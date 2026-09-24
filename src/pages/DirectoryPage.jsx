import { useDb } from '../hooks/useDb';

export default function DirectoryPage() {
  const { db } = useDb();

  return (
    <>
      <div className="view-header">
        <div>
          <h2>Directory</h2>
          <p>Departments and locations used by the asset register.</p>
        </div>
      </div>

      <div className="directory-columns">
        <section className="panel">
          <h3>Departments</h3>
          <ul className="directory-list">
            {db.departments.map((dept) => (
              <li key={dept}>{dept}</li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h3>Locations</h3>
          <ul className="directory-list">
            {db.locations.map((loc) => (
              <li key={loc}>
                {loc}
                <small>{db.assets.filter((a) => a.location === loc).length} assets</small>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
