import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDb } from '../hooks/useDb';
import { APP_VERSION } from '../lib/constants';

const NAV_ITEMS = [
  {
    path: '/',
    label: 'Overview',
    view: 'overview',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>
      </svg>
    ),
  },
  {
    path: '/assets',
    label: 'Assets',
    view: 'assets',
    showCount: true,
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm1.5 1v2.5h13V3a.5.5 0 0 0-.5-.5H2a.5.5 0 0 0-.5.5zm13 3.5h-13V14a.5.5 0 0 0 .5.5h12a.5.5 0 0 0 .5-.5V6.5zM3 8.5h4v1H3v-1zm0 2.5h6v1H3v-1z"/>
      </svg>
    ),
  },
  {
    path: '/loans',
    label: 'Loans',
    view: 'loans',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 8h12M10 4l4 4-4 4"/>
      </svg>
    ),
  },
  {
    path: '/business-travelers',
    label: 'Business Travelers',
    view: 'travelers',
    countKey: 'travelers',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 4.5a1.5 1.5 0 0 1 1.5-1.5h10a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H3a1.5 1.5 0 0 1-1.5-1.5v-8z"/>
        <path d="M5.5 3V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1M1.5 7.5h13"/>
      </svg>
    ),
  },
  {
    path: '/directory',
    label: 'Directory',
    view: 'directory',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0-2.2-2.7-4-6-4s-6 1.8-6 4v1h12v-1zm-1.5 0c-.3-1.4-2.2-2.5-4.5-2.5S4.8 11.6 4.5 13h7z"/>
      </svg>
    ),
  },
  {
    path: '/exchange',
    label: 'Excel Exchange',
    view: 'exchange',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 11l-3-3 3-3M1 8h14M12 5l3 3-3 3"/>
      </svg>
    ),
  },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { db } = useDb();

  const activeTravelersCount = useMemo(() => {
    return (db.loans || []).filter((l) => {
      const isTraveler = (l.assigneeType || 'Business traveler') === 'Business traveler';
      const isOngoing = !l.returnDate && !l.returnedDate && l.status !== 'Returned' && !l.isArchived;
      return isTraveler && isOngoing;
    }).length;
  }, [db.loans]);

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
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.path || (item.path === '/business-travelers' && pathname === '/travelers');
          return (
            <button
              key={item.path}
              className={`nav-item${isActive ? ' active' : ''}`}
              onClick={() => navigate(item.path)}
            >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
            {item.showCount && (
              <span className="nav-count">{db.assets.length}</span>
            )}
            {item.countKey === 'travelers' && activeTravelersCount > 0 && (
              <span className="nav-count">{activeTravelersCount}</span>
            )}
          </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="status-dot" />
        <div>
          <strong>v{APP_VERSION} • Offline workspace</strong>
          <span>Data stays on this device</span>
        </div>
      </div>
    </aside>
  );
}
