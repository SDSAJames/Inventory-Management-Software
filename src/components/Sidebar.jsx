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
        <div className="brand-mark" title="StarPlus Energy">
          <svg
            className="brand-logo-svg"
            viewBox="0 0 29 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="StarPlus Energy Logo"
          >
            <path
              d="M28.8537 6.30267L17.7469 0V12.9163L28.8537 19.2189V6.30267ZM12.7844 0L0 7.25467V23.0679L16.0691 32.1867V48L28.8537 40.7452V24.9319L12.7844 15.8133V0ZM0 41.6973L11.1066 48V35.0837L0 28.7811V41.6973Z"
              fill="#1449d6"
            />
          </svg>
        </div>
        <div>
          <strong>STARPLUS ENERGY</strong>
          <span>Asset Management</span>
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
