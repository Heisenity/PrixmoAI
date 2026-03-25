import {
  createElement,
  createContext,
  startTransition,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { apiRequest } from '../lib/axios';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { AuthMeResponse, BrandProfile, SaveProfileInput } from '../types';

type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
  phoneNumber: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: BrandProfile | null;
  token: string | null;
  isConfigured: boolean;
  isInitializing: boolean;
  isProfileLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  requestEmailOtpSignIn: (email: string) => Promise<void>;
  verifyEmailOtpSignIn: (email: string, token: string) => Promise<void>;
  signUp: (
    input: SignUpInput
  ) => Promise<{ requiresEmailConfirmation: boolean }>;
  resendSignupConfirmation: (email: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  verifyPasswordResetOtp: (email: string, token: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signInWithOAuth: (provider: 'google' | 'github' | 'facebook') => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  saveProfile: (input: SaveProfileInput) => Promise<BrandProfile>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const readMetadataString = (
  metadata: Record<string, unknown>,
  keys: string[]
) => {
  for (const key of keys) {
    const value = metadata[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const getAuthProfileDefaults = (currentUser: User | null) => {
  const metadata =
    currentUser && currentUser.user_metadata && typeof currentUser.user_metadata === 'object'
      ? (currentUser.user_metadata as Record<string, unknown>)
      : {};

  return {
    fullName: readMetadataString(metadata, [
      'full_name',
      'name',
      'user_name',
      'preferred_username',
    ]),
    phoneNumber:
      readMetadataString(metadata, ['phone_number', 'phone']) ||
      currentUser?.phone ||
      null,
    avatarUrl: readMetadataString(metadata, [
      'avatar_url',
      'picture',
      'picture_url',
      'profile_image_url',
    ]),
  };
};

const useAuthBootstrap = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  const persistProfile = async (
    accessToken: string,
    input: SaveProfileInput
  ) => {
    const response = await apiRequest<{ profile: BrandProfile }>(
      '/api/auth/profile',
      {
        method: 'POST',
        token: accessToken,
        body: input,
      }
    );

    setProfile(response.profile);
    return response.profile;
  };

  const hydrateProfile = async (
    accessToken: string | null,
    currentUser: User | null = null
  ) => {
    if (!accessToken) {
      setProfile(null);
      setIsProfileLoading(false);
      setIsInitializing(false);
      return;
    }

    setIsProfileLoading(true);

    try {
      const response = await apiRequest<AuthMeResponse>('/api/auth/me', {
        token: accessToken,
      });
      const nextProfile = response.profile;
      const provider = currentUser?.app_metadata?.provider;
      const authDefaults = getAuthProfileDefaults(currentUser);
      const shouldSyncSocialAvatar =
        provider &&
        provider !== 'email' &&
        authDefaults.avatarUrl &&
        nextProfile?.brandName &&
        nextProfile?.fullName &&
        nextProfile?.phoneNumber &&
        nextProfile.avatarUrl !== authDefaults.avatarUrl;

      if (shouldSyncSocialAvatar) {
        const syncedProfile = await persistProfile(accessToken, {
          brandName: nextProfile.brandName!,
          fullName: nextProfile.fullName,
          ...(nextProfile.phoneNumber ? { phoneNumber: nextProfile.phoneNumber } : {}),
          ...(nextProfile.username ? { username: nextProfile.username } : {}),
          ...(authDefaults.avatarUrl ? { avatarUrl: authDefaults.avatarUrl } : {}),
          ...(nextProfile.industry ? { industry: nextProfile.industry } : {}),
          ...(nextProfile.targetAudience
            ? { targetAudience: nextProfile.targetAudience }
            : {}),
          ...(nextProfile.brandVoice ? { brandVoice: nextProfile.brandVoice } : {}),
          ...(nextProfile.description ? { description: nextProfile.description } : {}),
        });

        setProfile(syncedProfile);
      } else {
        setProfile(nextProfile);
      }
    } catch {
      setProfile(null);
    } finally {
      setIsProfileLoading(false);
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    if (!supabase) {
      setIsInitializing(false);
      return;
    }

    const supabaseClient = supabase;
    let isMounted = true;

    const bootstrap = async () => {
      const {
        data: { session: initialSession },
      } = await supabaseClient.auth.getSession();

      if (!isMounted) {
        return;
      }

      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      await hydrateProfile(
        initialSession?.access_token ?? null,
        initialSession?.user ?? null
      );
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      startTransition(() => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
      });

      void hydrateProfile(nextSession?.access_token ?? null, nextSession?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    if (session) {
      throw new Error("You're already signed in. Open your workspace or log out first.");
    }

    if (!supabase) {
      throw new Error('Supabase client env is missing on the frontend.');
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message);
    }
  };

  const requestEmailOtpSignIn = async (email: string) => {
    if (session) {
      throw new Error("You're already signed in. Open your workspace or log out first.");
    }

    if (!supabase) {
      throw new Error('Supabase client env is missing on the frontend.');
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });

    if (error) {
      throw new Error(error.message);
    }
  };

  const verifyEmailOtpSignIn = async (email: string, token: string) => {
    if (!supabase) {
      throw new Error('Supabase client env is missing on the frontend.');
    }

    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (error) {
      throw new Error(error.message);
    }
  };

  const signUp = async ({
    email,
    password,
    fullName,
    phoneNumber,
  }: SignUpInput) => {
    if (session) {
      throw new Error("You're already signed in. Open your workspace or log out first.");
    }

    if (!supabase) {
      throw new Error('Supabase client env is missing on the frontend.');
    }

    const trimmedFullName = fullName.trim();
    const trimmedPhoneNumber = phoneNumber.trim();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo:
          typeof window === 'undefined'
            ? undefined
            : `${window.location.origin}/login`,
        data: {
          full_name: trimmedFullName,
          name: trimmedFullName,
          phone_number: trimmedPhoneNumber,
        },
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      requiresEmailConfirmation: !data.session,
    };
  };

  const resendSignupConfirmation = async (email: string) => {
    if (!supabase) {
      throw new Error('Supabase client env is missing on the frontend.');
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo:
          typeof window === 'undefined'
            ? undefined
            : `${window.location.origin}/login`,
      },
    });

    if (error) {
      throw new Error(error.message);
    }
  };

  const requestPasswordReset = async (email: string) => {
    if (!supabase) {
      throw new Error('Supabase client env is missing on the frontend.');
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo:
        typeof window === 'undefined'
          ? undefined
          : `${window.location.origin}/reset-password`,
    });

    if (error) {
      throw new Error(error.message);
    }
  };

  const verifyPasswordResetOtp = async (email: string, token: string) => {
    if (!supabase) {
      throw new Error('Supabase client env is missing on the frontend.');
    }

    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'recovery',
    });

    if (error) {
      throw new Error(error.message);
    }
  };

  const updatePassword = async (password: string) => {
    if (!supabase) {
      throw new Error('Supabase client env is missing on the frontend.');
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      throw new Error(error.message);
    }
  };

  const signInWithOAuth = async (provider: 'google' | 'github' | 'facebook') => {
    if (session) {
      throw new Error("You're already signed in. Open your workspace or log out first.");
    }

    if (!supabase) {
      throw new Error('Supabase client env is missing on the frontend.');
    }

    const redirectTo =
      typeof window === 'undefined'
        ? undefined
        : `${window.location.origin}/app/generate`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: redirectTo ? { redirectTo } : undefined,
    });

    if (error) {
      throw new Error(error.message);
    }
  };

  const signOut = async () => {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new Error(error.message);
    }
  };

  const refreshProfile = async () => {
    await hydrateProfile(session?.access_token ?? null);
  };

  const saveProfile = async (input: SaveProfileInput) => {
    if (!session?.access_token) {
      throw new Error('Please sign in again to continue.');
    }

    return persistProfile(session.access_token, input);
  };

  return {
    session,
    user,
    profile,
    token: session?.access_token ?? null,
    isConfigured: isSupabaseConfigured,
    isInitializing,
    isProfileLoading,
    signIn,
    requestEmailOtpSignIn,
    verifyEmailOtpSignIn,
    signUp,
    resendSignupConfirmation,
    requestPasswordReset,
    verifyPasswordResetOtp,
    updatePassword,
    signInWithOAuth,
    signOut,
    refreshProfile,
    saveProfile,
  } satisfies AuthContextValue;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const value = useAuthBootstrap();

  return createElement(AuthContext.Provider, { value }, children);
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
};
