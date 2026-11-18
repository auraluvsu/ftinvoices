import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router';
import { useAppData } from './appData';
import { ExportMenu } from './components/ExportMenu';
import { ThemeToggle } from './components/ThemeToggle';
import { AccountMenu } from './components/AccountMenu';
import { ClientSwitcher } from './components/ClientSwitcher';
import { RecurringDueBanner } from './components/RecurringDueBanner';

const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/receipts', label: 'Receipts' },
];

export function Layout() {
  const { receipts, exportList } = useAppData();

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <Link to="/" className="brand">
            <span className="logo" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4" />
              </svg>
            </span>
            <h1>Bookkeeping</h1>
          </Link>
          <ClientSwitcher />
          <nav className="nav" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="topbar-actions">
          <ThemeToggle />
          <ExportMenu
            label="Export all"
            disabled={!receipts.length}
            onExport={(fmt) => exportList(receipts, fmt, 'receipts')}
          />
          <AccountMenu />
        </div>
      </header>

      <RecurringDueBanner />
      <Outlet />
      <ScrollRestoration />
    </div>
  );
}
