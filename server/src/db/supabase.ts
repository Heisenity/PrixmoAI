import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type AppSupabaseClient = SupabaseClient;

const clientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
};

export const isSupabaseAuthConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const isSupabaseAdminConfigured = Boolean(
  supabaseUrl && supabaseServiceRoleKey
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

export const requireUserClient = (accessToken?: string): AppSupabaseClient => {
  const client = accessToken ? createUserClient(accessToken) : null;

  if (!client) {
    throw new Error(
      'Supabase user client is not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY, and send a valid bearer token.'
    );
  }

  return client;
};

export const requireSupabaseAdmin = (): AppSupabaseClient => {
  if (!supabaseAdmin) {
    throw new Error(
      'Supabase admin client is not configured. Set SUPABASE_SERVICE_ROLE_KEY in server/.env.'
    );
  }

  return supabaseAdmin;
};
