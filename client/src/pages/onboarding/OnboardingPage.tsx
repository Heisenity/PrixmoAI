import { Navigate, useNavigate } from 'react-router-dom';
import { ProfileFormPanel } from '../../components/settings/ProfileFormPanel';
import { useBrandProfile } from '../../hooks/useBrandProfile';

export const OnboardingPage = () => {
  const { profile, saveProfile } = useBrandProfile();
  const navigate = useNavigate();

  if (profile) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return (
    <div className="workspace-solo">
      <ProfileFormPanel
        profile={profile}
        heading="Set the memory layer before you generate."
        subheading="This profile becomes the durable context behind captions, images, scheduler defaults, and analytics."
        submitLabel="Save profile and enter workspace"
        onSubmit={async (input) => {
          await saveProfile(input);
          navigate('/app/dashboard', { replace: true });
        }}
      />
    </div>
  );
};
