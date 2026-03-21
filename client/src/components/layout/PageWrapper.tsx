import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Button } from '../ui/button';
import { useAuth } from '../../hooks/useAuth';

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
    title: 'Stage publishing before the social connections go live.',
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
  const { signOut } = useAuth();
  const meta = pageMeta[location.pathname] ?? pageMeta['/app/dashboard'];
  const authNotice = (location.state as { authNotice?: string } | null)?.authNotice;

  return (
    <div className="workspace-shell">
      <Sidebar />
      <div className="workspace-shell__main">
        <header className="workspace-header">
          <p className="section-eyebrow">{meta.eyebrow}</p>
          <div className="workspace-header__row">
            <div>
              <h1>{meta.title}</h1>
              <p>{meta.subtitle}</p>
            </div>
            <Button
              variant="secondary"
              size="md"
              className="workspace-header__action"
              onClick={() => {
                void signOut();
              }}
            >
              Log out
            </Button>
          </div>
        </header>
        <main className="workspace-content">
          {authNotice ? <div className="message workspace-content__notice">{authNotice}</div> : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
};
