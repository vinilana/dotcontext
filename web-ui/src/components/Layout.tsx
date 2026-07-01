import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useEventStream } from '../hooks/useEventStream';
import { IconAgents, IconDocs, IconSession, IconSkills, IconWorkflow } from './icons';

const NAV_ITEMS = [
  { to: '/docs', label: 'Docs', icon: IconDocs },
  { to: '/skills', label: 'Skills', icon: IconSkills },
  { to: '/agents', label: 'Agents', icon: IconAgents },
  { to: '/session', label: 'Session', icon: IconSession },
  { to: '/workflow', label: 'Workflow', icon: IconWorkflow },
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
          <span className="sidebar-title">
            <span className="sidebar-title-mark">dc</span>
            dotcontext
          </span>
          <span className="sidebar-subtitle">Web Dashboard</span>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}
            >
              <item.icon size={16} />
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
