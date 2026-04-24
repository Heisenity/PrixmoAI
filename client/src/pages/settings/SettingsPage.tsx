import { ProfileFormPanel } from '../../components/settings/ProfileFormPanel';
import { useBrandProfile } from '../../hooks/useBrandProfile';

export const SettingsPage = () => {
  const { profile, saveProfile } = useBrandProfile();

  return (
    <ProfileFormPanel
      profile={profile}
      saveContext="settings"
      heading="Update your brand profile."
      subheading="Keep your market, website, visual identity, and brand colors current."
      submitLabel="Save brand settings"
      persistProfile={async (input) => {
        await saveProfile(input, { saveContext: 'settings' });
      }}
      onSubmit={async (input) => {
        await saveProfile(input, { saveContext: 'settings' });
      }}
    />
  );
};
