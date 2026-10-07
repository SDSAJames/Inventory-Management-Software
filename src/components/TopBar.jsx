import { useLocation } from 'react-router-dom';

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
  '/directory': {
    eyebrow: 'ORGANIZATION DIRECTORY',
    title: 'Personnel & Locations',
  },
  '/exchange': {
    eyebrow: 'DATA INTEGRATION & BACKUP',
    title: 'Excel Data Exchange',
  },
};

export default function TopBar() {
  const { pathname } = useLocation();
  const current = PAGE_META[pathname] ?? {
    eyebrow: 'ASSET OPERATIONS',
    title: 'Asset Management',
  };

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{current.eyebrow}</p>
        <h1>{current.title}</h1>
      </div>
      <div className="top-actions">
        <div className="offline-pill" title="Local browser IndexedDB storage active (100% offline compatible)">
          <span className="status-indicator-dot" />
          <span>Offline Ready</span>
        </div>
        <div className="profile-chip" title="IT Department Workspace">
          <span className="profile-chip-name">IT Admin</span>
          <div className="avatar">IT</div>
        </div>
      </div>
    </header>
  );
}
