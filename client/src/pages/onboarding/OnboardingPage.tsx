import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../hooks/useAuth';
import { ProfileFormPanel } from '../../components/settings/ProfileFormPanel';
import { useBrandProfile } from '../../hooks/useBrandProfile';

export const OnboardingPage = () => {
  const { profile, saveProfile } = useBrandProfile();
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const userMetadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const authNotice = (location.state as { authNotice?: string } | null)?.authNotice;
  const profileDefaults = {
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
      (user?.email ? user.email.split('@')[0] : '') ||
      undefined,
  };

  if (profile?.fullName && profile?.phoneNumber) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return (
    <div className="workspace-solo workspace-solo--onboarding">
      <div className="onboarding-shell__toolbar">
        <Button
          variant="secondary"
          size="md"
          onClick={() => {
            void signOut();
          }}
        >
          Log out
        </Button>
      </div>
      <div className="onboarding-shell">
        <Card className="onboarding-shell__aside">
          {authNotice ? <div className="message">{authNotice}</div> : null}
          <p className="section-eyebrow">Brand memory setup</p>
          <h1>Teach PrixmoAI how your brand should sound before you generate.</h1>
          <p className="onboarding-shell__copy">
            This profile becomes the default context behind captions, product visuals,
            scheduler suggestions, and analytics summaries.
          </p>

          <div className="onboarding-shell__highlights">
            <div className="stack-list__item">
              <strong>Brand voice</strong>
              <span>Shapes how captions, hooks, and calls to action are written.</span>
            </div>
            <div className="stack-list__item">
              <strong>Audience</strong>
              <span>Changes the positioning, tone, and relevance of every generated asset.</span>
            </div>
            <div className="stack-list__item">
              <strong>Industry context</strong>
              <span>Helps the system choose better copy patterns and visual framing.</span>
            </div>
          </div>

          <Card className="onboarding-shell__note">
            <strong>Signed in as</strong>
            <p>{user?.email || 'Workspace owner'}</p>
          </Card>
        </Card>

        <div className="onboarding-shell__form">
          <ProfileFormPanel
            profile={profile}
            defaults={profileDefaults}
            heading="Set the memory layer before you generate."
            subheading="Add the brand owner name and phone number first, then PrixmoAI can personalize generation, scheduling, and analytics from the very first session."
            submitLabel="Save profile and enter workspace"
            onSubmit={async (input) => {
              await saveProfile(input);
              navigate('/app/dashboard', { replace: true });
            }}
          />
        </div>
      </div>
    </div>
  );
};
