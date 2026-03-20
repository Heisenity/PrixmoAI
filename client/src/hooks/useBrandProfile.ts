import { useAuth } from './useAuth';

export const useBrandProfile = () => {
  const { profile, saveProfile, refreshProfile, isProfileLoading } = useAuth();

  return {
    profile,
    saveProfile,
    refreshProfile,
    isProfileLoading,
  };
};
