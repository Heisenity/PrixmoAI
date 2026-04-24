import { Navigate, useNavigate } from 'react-router-dom';
import { Sparkles, Users, WandSparkles } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../hooks/useAuth';
import { ProfileFormPanel } from '../../components/settings/ProfileFormPanel';
import { useBrandProfile } from '../../hooks/useBrandProfile';
import { normalizeUsername } from '../../lib/username';

export const OnboardingPage = () => {
  const { profile, saveProfile } = useBrandProfile();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const userMetadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const profileDefaults = {
    brandName: profile?.brandName || '',
    fullName:
      profile?.fullName ||
      (typeof userMetadata.full_name === 'string' ? userMetadata.full_name : '') ||
      (typeof userMetadata.name === 'string' ? userMetadata.name : ''),
    phoneNumber:
      profile?.phoneNumber ||
      (typeof userMetadata.phone_number === 'string'
        ? userMetadata.phone_number
        : '') ||
      (user?.phone ?? ''),
    username:
      profile?.username ||
      normalizeUsername(user?.email ? user.email.split('@')[0] : '') ||
      undefined,
    avatarUrl:
      profile?.avatarUrl ||
      (typeof userMetadata.avatar_url === 'string'
        ? userMetadata.avatar_url
        : '') ||
      (typeof userMetadata.picture === 'string' ? userMetadata.picture : '') ||
      undefined,
    websiteUrl:
      profile?.websiteUrl ||
      (typeof userMetadata.website === 'string' ? userMetadata.website : '') ||
      undefined,
  };

  if (profile?.brandName && profile?.fullName && profile?.phoneNumber && profile?.username) {
    return <Navigate to="/app/generate" replace />;
  }

  return (
    <div
      className="workspace-solo workspace-solo--onboarding"
      data-lenis-prevent
      data-lenis-prevent-wheel
      data-lenis-prevent-touch
    >
      <div className="onboarding-shell__toolbar">
        <div className="onboarding-shell__toolbar-brand">
          <span className="onboarding-shell__toolbar-orb" aria-hidden="true" />
          <div className="onboarding-shell__toolbar-copy">
            <strong>PrixmoAI</strong>
          </div>
        </div>
        <Button
          variant="secondary"
          size="md"
          className="onboarding-shell__toolbar-action"
          onClick={() => {
            void signOut();
          }}
        >
          Log out
        </Button>
      </div>
      <div className="onboarding-shell">
        <Card glow className="onboarding-shell__aside">
          <div className="onboarding-shell__eyebrow-row">
            <p className="section-eyebrow">Brand memory setup</p>
            <span className="onboarding-shell__status">Quick setup</span>
          </div>
          <h1>
            <span>Give PrixmoAI the context it needs</span>
            <span>before you generate.</span>
          </h1>
          <p className="onboarding-shell__copy">
            Save your brand essentials once and PrixmoAI will use them to shape
            content, visuals, scheduling, and analytics from the first session.
          </p>

          <div className="onboarding-shell__highlights">
            <div className="stack-list__item onboarding-shell__highlight-card">
              <span className="onboarding-shell__highlight-icon">
                <WandSparkles size={18} />
              </span>
              <div>
                <strong>Voice and style</strong>
                <span>
                  Shapes how captions, hooks, and calls to action sound across every asset.
                </span>
              </div>
            </div>
            <div className="stack-list__item onboarding-shell__highlight-card">
              <span className="onboarding-shell__highlight-icon">
                <Users size={18} />
              </span>
              <div>
                <strong>Audience fit</strong>
                <span>
                  Keeps positioning, language, and messaging aligned with the people
                  you want to reach.
                </span>
              </div>
            </div>
            <div className="stack-list__item onboarding-shell__highlight-card">
              <span className="onboarding-shell__highlight-icon">
                <Sparkles size={18} />
              </span>
              <div>
                <strong>Industry context</strong>
                <span>
                  Helps PrixmoAI choose sharper copy patterns and stronger visual direction.
                </span>
              </div>
            </div>
          </div>

          <Card className="onboarding-shell__note">
            <strong>Signed in as</strong>
            <p>{user?.email || 'Workspace owner'}</p>
            <span>Saved once, reused across your workspace.</span>
          </Card>
        </Card>

        <div className="onboarding-shell__form">
          <ProfileFormPanel
            profile={profile}
            defaults={profileDefaults}
            saveContext="onboarding"
            heading="Build your brand memory layer."
            submitLabel="Save profile and enter workspace"
            persistProfile={async (input) => {
              await saveProfile(input, { saveContext: 'onboarding' });
            }}
            onSubmit={async (input) => {
              await saveProfile(input, { saveContext: 'onboarding' });
              navigate('/app/generate', { replace: true });
            }}
          />
        </div>
      </div>
    </div>
  );
};
