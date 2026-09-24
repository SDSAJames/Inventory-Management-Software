import { useLocation, useNavigate } from 'react-router-dom';
import { useDb } from '../hooks/useDb';

const NAV_ITEMS = [
  { path: '/', icon: '+', label: 'Overview', view: 'overview' },
  { path: '/assets', icon: '#', label: 'Assets', view: 'assets', showCount: true },
  { path: '/loans', icon: '↗', label: 'Loans', view: 'loans' },
  { path: '/directory', icon: '○', label: 'Directory', view: 'directory' },
  { path: '/exchange', icon: '⇄', label: 'Excel exchange', view: 'exchange' },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { db } = useDb();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">SI</div>
        <div>
          <strong>Starplusenergy</strong>
          <span>Asset Index</span>
        </div>
      </div>

      <div className="workspace-label">WORKSPACE</div>

      <nav className="nav-list" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            className={`nav-item${pathname === item.path ? ' active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
            {item.showCount && (
              <span className="nav-count">{db.assets.length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="status-dot" />
        <div>
          <strong>Offline workspace</strong>
          <span>Data stays on this device</span>
        </div>
      </div>
    </aside>
  );
}
