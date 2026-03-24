import {
  BarChart3,
  CalendarClock,
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { APP_NAME } from '../../lib/constants';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import { useAnalytics } from '../../hooks/useAnalytics';
import { useBilling } from '../../hooks/useBilling';
import { CurrentPlanBadge } from '../billing/CurrentPlanBadge';

const workspaceLinks = [
  { label: 'Generate', href: '/app/generate', icon: Sparkles },
  { label: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
  { label: 'Analytics', href: '/app/analytics', icon: BarChart3 },
  { label: 'Scheduler', href: '/app/scheduler', icon: CalendarClock },
  { label: 'Billing', href: '/app/billing', icon: CreditCard },
  { label: 'Settings', href: '/app/settings', icon: Settings },
];

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
};

const getProfileAvatar = (avatarUrl: string | null | undefined, fullName?: string | null) => {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={fullName || 'Workspace owner'} />;
  }

  return (fullName || 'P').slice(0, 1);
};

const getUsageSnapshot = (used: number, limit: number | null) => {
  if (limit === null) {
    return {
      used,
      remaining: null,
      percentLeft: null,
    };
  }

  const safeUsed = Math.max(0, used);
  const remaining = Math.max(0, limit - safeUsed);
  const percentLeft = limit > 0 ? Math.max(0, Math.round((remaining / limit) * 100)) : 0;

  return {
    used: safeUsed,
    remaining,
    percentLeft,
  };
};

export const Sidebar = ({ collapsed, onToggleCollapse }: SidebarProps) => {
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const { subscription, catalog, isLoading: isBillingLoading } = useBilling();
  const { overview, isLoading: isAnalyticsLoading } = useAnalytics();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const currentPlan = subscription?.plan ?? catalog?.currentSubscription.plan ?? 'free';
  const monthlyLimit =
    subscription?.monthlyLimit ?? catalog?.currentSubscription.monthlyLimit ?? null;
  const contentUsage = getUsageSnapshot(
    overview?.generation.contentGenerationsThisMonth ?? 0,
    monthlyLimit
  );
  const imageUsage = getUsageSnapshot(
    overview?.generation.imageGenerationsThisMonth ?? 0,
    monthlyLimit
  );
  const isUsageLoading = isBillingLoading || isAnalyticsLoading;
  const usageSummary =
    monthlyLimit === null
      ? 'Unlimited access'
      : isUsageLoading
        ? 'Checking limits…'
        : `Copy ${contentUsage.percentLeft ?? 0}% • Image ${imageUsage.percentLeft ?? 0}% left`;

  useEffect(() => {
    setIsProfileMenuOpen(false);
  }, [location.pathname, collapsed]);

  useEffect(() => {
    if (!isProfileMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isProfileMenuOpen]);

  return (
    <aside className={cn('sidebar', collapsed && 'sidebar--collapsed')}>
      <div className="sidebar__header">
        <div className="sidebar__brand" title={APP_NAME}>
          <span className="topbar__brand-dot" />
          <div className="sidebar__brand-copy">
            <strong>{APP_NAME}</strong>
            <p>Generate-first workspace</p>
          </div>
        </div>
        <button
          type="button"
          className="sidebar__toggle"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <div className="sidebar__center">
        <NavLink
          to="/app/generate"
          className={({ isActive }) =>
            cn('sidebar__focus-link', isActive && 'sidebar__focus-link--active')
          }
          title="Open Generate"
        >
          <Sparkles size={18} />
          <span>Generate</span>
        </NavLink>
      </div>

      <div className="sidebar__footer" ref={profileMenuRef}>
        {isProfileMenuOpen ? (
          <div
            className={cn(
              'sidebar__profile-menu',
              collapsed && 'sidebar__profile-menu--collapsed'
            )}
          >
            <div className="sidebar__profile-menu-header">
              <div className="sidebar__profile-menu-header-row">
                <strong>{profile?.fullName || 'Workspace Owner'}</strong>
                <CurrentPlanBadge plan={currentPlan} className="sidebar__plan-badge" />
              </div>
              <span>{profile?.industry || 'Open workspace options'}</span>
            </div>

            <nav className="sidebar__profile-menu-links" aria-label="Workspace navigation">
              {workspaceLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    className={({ isActive }) =>
                      cn(
                        'sidebar__profile-menu-link',
                        isActive && 'sidebar__profile-menu-link--active'
                      )
                    }
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            <button
              className="sidebar__profile-menu-signout"
              type="button"
              onClick={() => {
                void signOut();
              }}
            >
              <LogOut size={16} />
              <span>Sign out</span>
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className={cn(
            'sidebar__profile-trigger',
            isProfileMenuOpen && 'sidebar__profile-trigger--active'
          )}
          onClick={() => setIsProfileMenuOpen((current) => !current)}
          aria-haspopup="menu"
          aria-expanded={isProfileMenuOpen}
          title={profile?.fullName || 'Workspace owner'}
        >
          <div className="sidebar__avatar">
            {getProfileAvatar(profile?.avatarUrl, profile?.fullName)}
          </div>
          <div className="sidebar__profile-copy">
            <div className="sidebar__profile-title">
              <strong>{profile?.fullName || 'Workspace Owner'}</strong>
            </div>
            <p>{profile?.industry || 'Open workspace options'}</p>
            <div className="sidebar__profile-usage" aria-label="Current usage left">
              <span>{usageSummary}</span>
            </div>
          </div>
          <span className="sidebar__profile-chevron" aria-hidden="true">
            <ChevronDown size={16} />
          </span>
        </button>
      </div>
    </aside>
  );
};
