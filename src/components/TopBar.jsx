import { useLocation } from 'react-router-dom';
import { APP_VERSION } from '../lib/constants';
import { useAuth } from '../hooks/useAuth';

const PAGE_META = {
  '/': {
    eyebrow: 'STARPLUS ENERGY • INVENTORY PORTAL',
    title: 'Operations Dashboard',
  },
  '/assets': {
    eyebrow: 'HARDWARE & EQUIPMENT REGISTER',
    title: 'Asset Register',
  },
  '/loans': {
    eyebrow: 'DEVICE LOANS & CUSTODY MANAGEMENT',
    title: 'Loans & Custody',
  },
  '/business-travelers': {
    eyebrow: 'FIELD DEPLOYMENTS & MOBILE WORKFORCE',
    title: 'Business Travelers',
  },
  '/travelers': {
    eyebrow: 'FIELD DEPLOYMENTS & MOBILE WORKFORCE',
    title: 'Business Travelers',
  },
  '/directory': {
    eyebrow: 'ORGANIZATION DIRECTORY',
    title: 'Personnel & Locations',
  },
  '/exchange': {
    eyebrow: 'DATA INTEGRATION & BACKUP',
    title: 'Data Exchange',
  },
  '/patch-history': {
    eyebrow: 'SYSTEM RELEASES & CHANGELOG',
    title: 'Patch History & Release Notes',
  },
  '/changelog': {
    eyebrow: 'SYSTEM RELEASES & CHANGELOG',
    title: 'Patch History & Release Notes',
  },
};

export default function TopBar({ onOpenPatchHistory }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const current = PAGE_META[pathname] ?? {
    eyebrow: 'ASSET OPERATIONS',
    title: 'Asset Management',
  };

  const displayName = user?.fullName || user?.username || 'IT Admin';
  const role = user?.role || 'OPERATOR';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'IT';

  return (
    <header className="topbar">
      <div className="topbar-title-wrap">
        <h1>{current.title}</h1>
        <span className="topbar-tag">{current.eyebrow}</span>
      </div>
      <div className="top-actions">
        <button
          type="button"
          className="version-pill clickable"
          onClick={onOpenPatchHistory}
          title={`StarPlus Energy Asset Management System v${APP_VERSION} • Click to view patch notes`}
          aria-label={`Version ${APP_VERSION}, view patch history`}
        >
          <span className="version-pill-icon">📋</span>
          v{APP_VERSION}
          <span className="version-pill-sub">Patch Notes</span>
        </button>
        <div className="offline-pill" title="Local browser storage active (100% offline compatible)">
          <span className="status-indicator-dot" />
          <span>Offline</span>
        </div>
        <div className="topbar-user-control">
          <div className="profile-chip" title={`Authenticated as ${displayName} (${role})`}>
            <span className="profile-chip-name">
              {displayName}
              <span className="profile-chip-role">{role}</span>
            </span>
            <div className="avatar">{initials}</div>
          </div>
          <button
            type="button"
            className="topbar-lock-btn"
            onClick={logout}
            title="Lock terminal and sign out"
            aria-label="Sign out"
          >
            <span>🔒</span>
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
