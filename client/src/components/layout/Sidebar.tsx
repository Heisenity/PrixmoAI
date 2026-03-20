import { Sparkles, Workflow, LayoutDashboard, BarChart3, CalendarClock, CreditCard, Settings } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { APP_NAME } from '../../lib/constants';
import { useAuth } from '../../hooks/useAuth';

const navIcons = {
  '/app/dashboard': LayoutDashboard,
  '/app/generate': Sparkles,
  '/app/analytics': BarChart3,
  '/app/scheduler': CalendarClock,
  '/app/billing': CreditCard,
  '/app/settings': Settings,
} as const;

const navItems = [
  { label: 'Dashboard', href: '/app/dashboard' },
  { label: 'Generate', href: '/app/generate' },
  { label: 'Analytics', href: '/app/analytics' },
  { label: 'Scheduler', href: '/app/scheduler' },
  { label: 'Billing', href: '/app/billing' },
  { label: 'Settings', href: '/app/settings' },
];

export const Sidebar = () => {
  const { profile, signOut } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="topbar__brand-dot" />
        <div>
          <strong>{APP_NAME}</strong>
          <p>Memory-led social workspace</p>
        </div>
      </div>

      <nav className="sidebar__nav">
        {navItems.map((item) => {
          const Icon = navIcons[item.href as keyof typeof navIcons] ?? Workflow;

          return (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
              }
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__profile">
          <div className="sidebar__avatar">
            {(profile?.fullName || 'P').slice(0, 1)}
          </div>
          <div>
            <strong>{profile?.fullName || 'Workspace Owner'}</strong>
            <p>{profile?.industry || 'Configure your brand system'}</p>
          </div>
        </div>
        <button className="sidebar__signout" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </aside>
  );
};
