import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from './LoadingSpinner';

export const ProtectedRoute = () => {
  const { session, user, profile, isInitializing } = useAuth();
  const location = useLocation();
  const isProfileComplete = Boolean(profile?.fullName && profile?.phoneNumber);
  const isEmailVerified =
    !user?.email ||
    Boolean(user.email_confirmed_at) ||
    ((user.app_metadata?.provider as string | undefined) ?? 'email') !== 'email';

  if (isInitializing) {
    return (
      <div className="screen-center">
        <LoadingSpinner label="Syncing workspace" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!isEmailVerified) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location.pathname,
          authNotice:
            'Verify your email first, then sign in again to unlock your workspace.',
        }}
      />
    );
  }

  if ((!profile || !isProfileComplete) && location.pathname !== '/onboarding') {
    return (
      <Navigate
        to="/onboarding"
        replace
        state={{
          authNotice:
            'Finish your profile with your name and phone number to unlock the workspace.',
        }}
      />
    );
  }

  return <Outlet />;
};
