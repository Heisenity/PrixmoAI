import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';

const WORKSPACE_SIDEBAR_STORAGE_KEY = 'prixmoai.workspace.sidebarCollapsed';

const readStoredSidebarState = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(WORKSPACE_SIDEBAR_STORAGE_KEY) === 'true';
};

const pageMeta: Record<string, { eyebrow: string; title: string; subtitle: string }> = {
  '/app/dashboard': {
    eyebrow: 'Command center',
    title: 'See the whole creative system at once.',
    subtitle:
      'Track generation, scheduling, and performance in one graphite workspace.',
  },
  '/app/generate': {
    eyebrow: 'Creative lab',
    title: 'Generate copy and visuals without losing brand memory.',
    subtitle:
      'Build captions, images, and reusable assets with a minimal interaction flow.',
  },
  '/app/analytics': {
    eyebrow: 'Signal layer',
    title: 'Read what is working, not just what was posted.',
    subtitle:
      'Surface performance, volume, and weekly movement without dashboard clutter.',
  },
  '/app/scheduler': {
    eyebrow: 'Release control',
    title: 'Creation shouldn’t wait for connection',
    subtitle:
      'Connect accounts, line up media, and manage post states from one queue.',
  },
  '/app/billing': {
    eyebrow: 'Plan control',
    title: 'Keep subscription logic ready for launch.',
    subtitle:
      'Free, Basic, and Pro are already wired so pricing can snap in later.',
  },
  '/app/settings': {
    eyebrow: 'Memory settings',
    title: 'Tune the profile the model writes against.',
    subtitle:
      'Industry, audience, and brand voice live here and shape every generation.',
  },
};

export const PageWrapper = () => {
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    readStoredSidebarState
  );
  const meta = pageMeta[location.pathname] ?? pageMeta['/app/dashboard'];
  const authNotice = (location.state as { authNotice?: string } | null)?.authNotice;
  const isGenerateRoute = location.pathname === '/app/generate';
  const isAnalyticsRoute = location.pathname === '/app/analytics';
  const showWorkspaceHeader = !isGenerateRoute && !isAnalyticsRoute;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      WORKSPACE_SIDEBAR_STORAGE_KEY,
      isSidebarCollapsed ? 'true' : 'false'
    );
  }, [isSidebarCollapsed]);

  return (
    <div
      className={`workspace-shell ${
        isSidebarCollapsed ? 'workspace-shell--sidebar-collapsed' : ''
      } ${
        isGenerateRoute ? 'workspace-shell--generate-only' : ''
      }`}
    >
      {!isGenerateRoute ? (
        <Sidebar
          collapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((current) => !current)}
        />
      ) : null}
      <div
        className={`workspace-shell__main ${
          isGenerateRoute ? 'workspace-shell__main--generate' : ''
        }`}
      >
        {showWorkspaceHeader ? (
          <header className="workspace-header">
            <p className="section-eyebrow">{meta.eyebrow}</p>
            <div className="workspace-header__row">
              <div>
                <h1>{meta.title}</h1>
                <p>{meta.subtitle}</p>
              </div>
            </div>
          </header>
        ) : null}
        <main
          className={`workspace-content ${
            isGenerateRoute ? 'workspace-content--generate' : ''
          }`}
          data-lenis-prevent
          data-lenis-prevent-wheel
          data-lenis-prevent-touch
        >
          {authNotice ? <div className="message workspace-content__notice">{authNotice}</div> : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
};
