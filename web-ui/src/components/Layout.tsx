import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useEventStream } from '../hooks/useEventStream';

const NAV_ITEMS = [
  { to: '/docs', label: 'Docs' },
  { to: '/skills', label: 'Skills' },
  { to: '/agents', label: 'Agents' },
  { to: '/session', label: 'Session' },
  { to: '/workflow', label: 'Workflow' },
];

function ConnectionBadge() {
  const { status } = useEventStream();
  const label =
    status === 'open' ? 'Live' : status === 'connecting' ? 'Connecting…' : status === 'error' ? 'Reconnecting…' : 'Offline';
  return (
    <span className={`connection-badge connection-badge--${status}`} title={`SSE: ${status}`}>
      <span className="connection-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">dotcontext</span>
          <span className="sidebar-subtitle">Web Dashboard</span>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <ConnectionBadge />
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
