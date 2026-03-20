import { ProfileFormPanel } from '../../components/settings/ProfileFormPanel';
import { useBrandProfile } from '../../hooks/useBrandProfile';

export const SettingsPage = () => {
  const { profile, saveProfile } = useBrandProfile();

  return (
    <ProfileFormPanel
      profile={profile}
      heading="Tune the profile your generators read from."
      subheading="You can evolve the brand system here without touching the generation pages."
      submitLabel="Save brand settings"
      onSubmit={async (input) => {
        await saveProfile(input);
      }}
    />
  );
};
