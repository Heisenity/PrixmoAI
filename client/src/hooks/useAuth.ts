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

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: BrandProfile | null;
  token: string | null;
  isConfigured: boolean;
  isInitializing: boolean;
  isProfileLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithOAuth: (provider: 'google' | 'github' | 'facebook') => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  saveProfile: (input: SaveProfileInput) => Promise<BrandProfile>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const useAuthBootstrap = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  const hydrateProfile = async (accessToken: string | null) => {
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
      setProfile(response.profile);
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
      await hydrateProfile(initialSession?.access_token ?? null);
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

      void hydrateProfile(nextSession?.access_token ?? null);
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

  const signUp = async (email: string, password: string) => {
    if (session) {
      throw new Error("You're already signed in. Open your workspace or log out first.");
    }

    if (!supabase) {
      throw new Error('Supabase client env is missing on the frontend.');
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

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
        : `${window.location.origin}/app/dashboard`;

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

    const response = await apiRequest<{ profile: BrandProfile }>(
      '/api/auth/profile',
      {
        method: 'POST',
        token: session.access_token,
        body: input,
      }
    );

    setProfile(response.profile);
    return response.profile;
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
    signUp,
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
