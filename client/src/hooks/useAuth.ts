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
import {
  readBrowserCache,
  removeBrowserCache,
  writeBrowserCache,
} from '../lib/browserCache';
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
  verifySignupOtp: (email: string, token: string) => Promise<void>;
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
const AUTH_PROFILE_CACHE_KEY_PREFIX = 'prixmoai.auth.profile';

const buildAuthProfileCacheKey = (userId: string) =>
  `${AUTH_PROFILE_CACHE_KEY_PREFIX}:${userId}`;

const isUnverifiedEmailAuthUser = (currentUser: User | null | undefined) => {
  if (!currentUser) {
    return false;
  }

  const provider = ((currentUser.app_metadata?.provider as string | undefined) ?? 'email')
    .trim()
    .toLowerCase();

  return Boolean(currentUser.email) && provider === 'email' && !currentUser.email_confirmed_at;
};

const readCachedProfile = (userId: string) =>
  readBrowserCache<BrandProfile | null>(buildAuthProfileCacheKey(userId))?.value ??
  null;

const writeCachedProfile = (profile: BrandProfile | null, userId?: string | null) => {
  if (!userId) {
    return;
  }

  writeBrowserCache(buildAuthProfileCacheKey(userId), profile);
};

const removeCachedProfile = (userId?: string | null) => {
  if (!userId) {
    return;
  }

  removeBrowserCache(buildAuthProfileCacheKey(userId));
};

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

  const resetAuthState = (userId?: string | null) => {
    removeCachedProfile(userId);
    startTransition(() => {
      setSession(null);
      setUser(null);
    });
    setProfile(null);
  };

  const clearUnverifiedSession = async (
    supabaseClient: NonNullable<typeof supabase>,
    currentSession: Session | null | undefined
  ) => {
    resetAuthState(currentSession?.user?.id);
    setIsProfileLoading(false);
    setIsInitializing(false);

    try {
      await supabaseClient.auth.signOut();
    } catch {
      // If the local session is already gone, the app state above is still enough.
    }
  };

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
    writeCachedProfile(response.profile, response.profile.userId);
    return response.profile;
  };

  const hydrateProfile = async (
    accessToken: string | null,
    currentUser: User | null = null,
    options: {
      finishInitializing?: boolean;
      preserveCachedProfileOnError?: boolean;
    } = {}
  ) => {
    const finishInitializing = options.finishInitializing ?? true;

    if (!accessToken) {
      setProfile(null);
      setIsProfileLoading(false);
      if (finishInitializing) {
        setIsInitializing(false);
      }
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
        writeCachedProfile(nextProfile, currentUser?.id);
      }
    } catch {
      if (!options.preserveCachedProfileOnError) {
        setProfile(null);
      }
    } finally {
      setIsProfileLoading(false);
      if (finishInitializing) {
        setIsInitializing(false);
      }
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

      if (isUnverifiedEmailAuthUser(initialSession?.user ?? null)) {
        await clearUnverifiedSession(supabaseClient, initialSession);
        return;
      }

      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      const cachedProfile = initialSession?.user?.id
        ? readCachedProfile(initialSession.user.id)
        : null;

      if (cachedProfile) {
        setProfile(cachedProfile);
        setIsInitializing(false);
        void hydrateProfile(
          initialSession?.access_token ?? null,
          initialSession?.user ?? null,
          {
            finishInitializing: false,
            preserveCachedProfileOnError: true,
          }
        );
      } else {
        await hydrateProfile(
          initialSession?.access_token ?? null,
          initialSession?.user ?? null
        );
      }
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      if (isUnverifiedEmailAuthUser(nextSession?.user ?? null)) {
        void clearUnverifiedSession(supabaseClient, nextSession);
        return;
      }

      startTransition(() => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
      });

      const cachedProfile = nextSession?.user?.id
        ? readCachedProfile(nextSession.user.id)
        : null;

      if (cachedProfile) {
        setProfile(cachedProfile);
      }

      void hydrateProfile(
        nextSession?.access_token ?? null,
        nextSession?.user ?? null,
        {
          preserveCachedProfileOnError: Boolean(cachedProfile),
        }
      );
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (isUnverifiedEmailAuthUser(data.user ?? data.session?.user ?? null)) {
      await supabase.auth.signOut();
      throw new Error('Verify your email with the signup code first, then come back and sign in.');
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
      email: email.trim().toLowerCase(),
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

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: 'email',
    });

    if (error) {
      throw new Error(error.message);
    }

    if (isUnverifiedEmailAuthUser(data.user ?? data.session?.user ?? null)) {
      await supabase.auth.signOut();
      throw new Error('This email still needs signup verification before it can unlock the workspace.');
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

    const normalizedEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
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

    if (data.session && isUnverifiedEmailAuthUser(data.user ?? data.session.user ?? null)) {
      await supabase.auth.signOut();
    }

    return {
      requiresEmailConfirmation: true,
    };
  };

  const verifySignupOtp = async (email: string, token: string) => {
    if (!supabase) {
      throw new Error('Supabase client env is missing on the frontend.');
    }

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: 'signup',
    });

    if (error) {
      throw new Error(error.message);
    }

    if (isUnverifiedEmailAuthUser(data.user ?? data.session?.user ?? null)) {
      await supabase.auth.signOut();
      throw new Error('That code did not finish email verification. Request a fresh code and try again.');
    }
  };

  const resendSignupConfirmation = async (email: string) => {
    if (!supabase) {
      throw new Error('Supabase client env is missing on the frontend.');
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
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

    removeCachedProfile(user?.id);
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
    verifySignupOtp,
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
