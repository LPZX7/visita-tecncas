import { useState } from 'react';
import { NavLink } from 'react-router-dom';

const ICONS = {
  dashboard: <><rect x="3" y="3" width="7.5" height="9" rx="2" /><rect x="13.5" y="3" width="7.5" height="5.5" rx="2" /><rect x="13.5" y="11" width="7.5" height="10" rx="2" /><rect x="3" y="14.5" width="7.5" height="6.5" rx="2" /></>,
  requests: <><path d="M8 3h8a2 2 0 012 2v14a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2z" /><path d="M9 8h6M9 12h6M9 16h3" strokeLinecap="round" /></>,
  budgets: <><rect x="2.5" y="6" width="19" height="13" rx="2.5" /><circle cx="12" cy="12.5" r="3" /><path d="M6 6V5a2 2 0 012-2h8a2 2 0 012 2v1" /></>,
  contracts: <><path d="M7 2.5h7l4 4v15H7z" /><path d="M10 11h6M10 15h6M10 7h2" strokeLinecap="round" /></>,
  companies: <><rect x="4" y="2.5" width="16" height="19" rx="1.5" /><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2" strokeLinecap="round" /></>,
  equipments: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="12" cy="12" r="4.5" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2" strokeLinecap="round" /></>,
  parts: <><path d="M12 2.5l8.5 4.9v9.2L12 21.5l-8.5-4.9V7.4L12 2.5z" /><path d="M12 21.5v-9M3.5 7.4L12 12.5l8.5-5.1M7.7 4.9l8.6 5" strokeLinecap="round" /></>,
  rules: <><path d="M4 6h9M17 6h3M4 12h3M9 12h11M4 18h13M19 18h1" strokeLinecap="round" /><circle cx="13" cy="6" r="2" /><circle cx="7" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></>,
  users: <><circle cx="9" cy="8" r="3.4" /><path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6" strokeLinecap="round" /><circle cx="18" cy="7.5" r="2.6" /><path d="M21.5 18.5c0-2.6-2-4.6-4.5-5" strokeLinecap="round" /></>,
  agenda: <><rect x="3" y="4.5" width="18" height="16" rx="3" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" strokeLinecap="round" /></>
};

const ICON_BY_PATH = {
  '/dashboard': 'dashboard',
  '/requests': 'requests',
  '/budgets': 'budgets',
  '/contracts': 'contracts',
  '/companies': 'companies',
  '/equipments': 'equipments',
  '/parts': 'parts',
  '/rules': 'rules',
  '/users': 'users'
};

function Icon({ name }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      {ICONS[name] || ICONS.dashboard}
    </svg>
  );
}

export default function Sidebar({ links, user, onLogout }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === '1');

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  };

  const initials = (user?.nome || '?').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase();
  const roleLabel = { gestor: 'Gestor', analista: 'Analista', tecnico: 'Técnico', cliente: 'Cliente' }[user?.role] || user?.role;

  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="sidebar__brand">
        <img src="/mirontec-logo.jpg" alt="Mirontec" className="sidebar__logo" onError={(e) => { e.target.src = '/mirontec-logo.svg'; }} />
        {!collapsed && (
          <div>
            <span className="sidebar__brand-eyebrow">MIRONTEC</span>
            <strong className="sidebar__brand-title">Operações de Campo</strong>
          </div>
        )}
      </div>

      <nav className="sidebar__nav">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) => `sidebar__link ${isActive ? 'is-active' : ''}`}
            data-tooltip={l.label}
          >
            <Icon name={ICON_BY_PATH[l.to] || 'dashboard'} />
            {!collapsed && <span>{l.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        <button type="button" className="sidebar__collapse-btn" onClick={toggle} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            {collapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
          </svg>
        </button>

        <div className="sidebar__user">
          <span className="sidebar__avatar">{initials}</span>
          {!collapsed && (
            <div className="sidebar__user-info">
              <strong>{user?.nome}</strong>
              <span>{roleLabel}</span>
            </div>
          )}
        </div>

        <button type="button" className="sidebar__logout" onClick={onLogout} data-tooltip="Sair">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <path d="M16 17l5-5-5-5M21 12H9" />
          </svg>
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
}
