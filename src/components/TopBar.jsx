import { todayLabel, greetingTitle } from '../lib/utils';
import { useLocation } from 'react-router-dom';

const PAGE_TITLES = {
  '/': null,       // overview uses greeting
  '/assets': 'Asset register',
  '/loans': 'Loans & returns',
  '/directory': 'People and places',
  '/exchange': 'Excel exchange',
};

export default function TopBar() {
  const { pathname } = useLocation();
  const title = PAGE_TITLES[pathname] ?? greetingTitle();

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{pathname === '/' ? todayLabel() : 'ASSET OPERATIONS'}</p>
        <h1>{title}</h1>
      </div>
      <div className="top-actions">
        <button className="avatar">JM</button>
      </div>
    </header>
  );
}
