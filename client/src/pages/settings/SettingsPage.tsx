import { ProfileFormPanel } from '../../components/settings/ProfileFormPanel';
import { useBrandProfile } from '../../hooks/useBrandProfile';

export const SettingsPage = () => {
  const { profile, saveProfile } = useBrandProfile();

  return (
    <ProfileFormPanel
      profile={profile}
      heading=""
      subheading=""
      submitLabel="Save brand settings"
      onSubmit={async (input) => {
        await saveProfile(input);
      }}
    />
  );
};
