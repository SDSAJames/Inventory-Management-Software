import UndoSavedChange from './UndoSavedChange';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { CUSTODY_PAGE_TITLE } from '../lib/constants';

const PAGE_META = {
  '/': {
    eyebrow: 'STARPLUS ENERGY • INVENTORY PORTAL',
    title: 'Operations Dashboard',
  },
  '/assets': {
    eyebrow: 'HARDWARE & EQUIPMENT REGISTER',
    title: 'Asset Register',
  },
  '/mes': {
    eyebrow: 'MANUFACTURING EQUIPMENT REGISTER',
    title: 'MES',
  },
  '/loans': {
    eyebrow: 'EMPLOYEE ASSIGNMENTS & TRAVELER PICKUP SCHEDULE',
    title: CUSTODY_PAGE_TITLE,
  },
  '/calendar': {
    eyebrow: 'EQUIPMENT CHECKOUT & RETURN SCHEDULE',
    title: 'In & Out Calendar',
  },
  '/in-out-calendar': {
    eyebrow: 'EQUIPMENT CHECKOUT & RETURN SCHEDULE',
    title: 'In & Out Calendar',
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
    eyebrow: 'REFERENCE LISTS & ORGANIZATION DATA',
    title: 'Asset & Organization Directory',
  },
  '/exchange': {
    eyebrow: 'IMPORT & EXPORT',
    title: 'Data Exchange',
  },
  '/backups': { eyebrow: 'ADMINISTRATION', title: 'Backup & Restore' },
  '/users': { eyebrow: 'ADMINISTRATION', title: 'User Management' },
  '/profile': { eyebrow: 'MY ACCOUNT', title: 'My Account' },
  '/patch-history': {
    eyebrow: 'SYSTEM RELEASES & CHANGELOG',
    title: 'Patch History & Release Notes',
  },
  '/changelog': {
    eyebrow: 'SYSTEM RELEASES & CHANGELOG',
    title: 'Patch History & Release Notes',
  },
};

export default function TopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const current = PAGE_META[pathname] ?? {
    eyebrow: 'ASSET OPERATIONS',
    title: 'Asset Management',
  };

  const displayName = user?.fullName || user?.username || 'IT Staff';
  const role = user?.role || 'OPERATOR';
  const title = user?.title || role;
  const knoxId = user?.knoxId || user?.username || '';
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
        <UndoSavedChange />
        <div className="topbar-user-control">
          <button type="button" className="profile-chip" onClick={() => navigate('/profile')} aria-label="Edit my profile" title={`Edit profile for ${displayName} (${knoxId})`}>
            <span className="profile-chip-name">
              {displayName}
              <span className="profile-chip-role">{title}</span>
            </span>
            <span className="avatar">{initials}</span>
          </button>
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
