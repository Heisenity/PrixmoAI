import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAuthRedirectUrl = process.env.SUPABASE_AUTH_REDIRECT_URL;
const clientAppUrl = process.env.CLIENT_APP_URL;

export type AppSupabaseClient = SupabaseClient;

const clientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
};

export const isSupabaseAuthConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const isSupabaseAdminConfigured = Boolean(
  supabaseUrl && supabaseServiceRoleKey
);
export const isSupabaseRedirectConfigured = Boolean(
  supabaseAuthRedirectUrl && clientAppUrl
);

if (!isSupabaseAuthConfigured) {
  console.warn(
    'Supabase auth client is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in server/.env.'
  );
}

if (!isSupabaseAdminConfigured) {
  console.warn(
    'Supabase admin client is not configured. Set SUPABASE_SERVICE_ROLE_KEY in server/.env for server-side queries and webhooks.'
  );
}

if (!isSupabaseRedirectConfigured) {
  console.warn(
    'Supabase redirect URLs are not fully configured. Set SUPABASE_AUTH_REDIRECT_URL and CLIENT_APP_URL in server/.env.'
  );
}

export const supabaseAuth =
  isSupabaseAuthConfigured && supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, clientOptions)
    : null;

export const supabaseAdmin =
  isSupabaseAdminConfigured && supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, clientOptions)
    : null;

export const createUserClient = (
  accessToken: string
): AppSupabaseClient | null => {
  if (!isSupabaseAuthConfigured || !supabaseUrl || !supabaseAnonKey || !accessToken) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    ...clientOptions,
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
};

export const createSessionUserClient = async (
  accessToken: string,
  refreshToken?: string
): Promise<AppSupabaseClient | null> => {
  if (!isSupabaseAuthConfigured || !supabaseUrl || !supabaseAnonKey || !accessToken) {
    return null;
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, clientOptions);

  if (!refreshToken) {
    return client;
  }

  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    throw error;
  }

  return client;
};

export const requireUserClient = (accessToken?: string): AppSupabaseClient => {
  const client = accessToken ? createUserClient(accessToken) : null;

  if (!client) {
    throw new Error(
      'Supabase user client is not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY, and send a valid bearer token.'
    );
  }

  return client;
};

export const requireSessionUserClient = async (
  accessToken?: string,
  refreshToken?: string
): Promise<AppSupabaseClient> => {
  const client =
    accessToken && refreshToken !== undefined
      ? await createSessionUserClient(accessToken, refreshToken)
      : null;

  if (!client) {
    throw new Error(
      'Supabase session client is not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY, and send a valid session.'
    );
  }

  return client;
};

const isAllowedRedirect = (value?: string) => {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' ||
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1'
    );
  } catch {
    return false;
  }
};

export const getSupabaseAuthRedirectUrl = () => {
  if (!isAllowedRedirect(supabaseAuthRedirectUrl)) {
    throw new Error(
      'SUPABASE_AUTH_REDIRECT_URL must be a secure URL or localhost during development.'
    );
  }

  return supabaseAuthRedirectUrl as string;
};

export const getClientAppUrl = () => {
  if (!isAllowedRedirect(clientAppUrl)) {
    throw new Error(
      'CLIENT_APP_URL must be a secure URL or localhost during development.'
    );
  }

  return clientAppUrl as string;
};

export const requireSupabaseAdmin = (): AppSupabaseClient => {
  if (!supabaseAdmin) {
    throw new Error(
      'Supabase admin client is not configured. Set SUPABASE_SERVICE_ROLE_KEY in server/.env.'
    );
  }

  return supabaseAdmin;
};
