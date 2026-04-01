import type { AppSupabaseClient } from '../supabase';

type OAuthConnectionSessionRow = {
  id: string;
  user_id: string;
  provider: 'meta';
  platform: 'facebook';
  selection_type: 'facebook_pages';
  payload: Record<string, unknown> | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type OAuthConnectionSession = {
  id: string;
  userId: string;
  provider: 'meta';
  platform: 'facebook';
  selectionType: 'facebook_pages';
  payload: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toOAuthConnectionSession = (
  row: OAuthConnectionSessionRow
): OAuthConnectionSession => ({
  id: row.id,
  userId: row.user_id,
  provider: row.provider,
  platform: row.platform,
  selectionType: row.selection_type,
  payload: toRecord(row.payload),
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createOAuthConnectionSession = async (
  client: AppSupabaseClient,
  userId: string,
  input: {
    provider: 'meta';
    platform: 'facebook';
    selectionType: 'facebook_pages';
    payload: Record<string, unknown>;
    expiresAt: string;
  }
): Promise<OAuthConnectionSession> => {
  const { data, error } = await client
    .from('oauth_connection_sessions')
    .insert({
      user_id: userId,
      provider: input.provider,
      platform: input.platform,
      selection_type: input.selectionType,
      payload: input.payload,
      expires_at: input.expiresAt,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create OAuth connection session');
  }

  return toOAuthConnectionSession(data as OAuthConnectionSessionRow);
};

export const getOAuthConnectionSessionById = async (
  client: AppSupabaseClient,
  userId: string,
  sessionId: string
): Promise<OAuthConnectionSession | null> => {
  const { data, error } = await client
    .from('oauth_connection_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch OAuth connection session');
  }

  if (!data) {
    return null;
  }

  const session = toOAuthConnectionSession(data as OAuthConnectionSessionRow);

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await deleteOAuthConnectionSession(client, userId, sessionId);
    return null;
  }

  return session;
};

export const deleteOAuthConnectionSession = async (
  client: AppSupabaseClient,
  userId: string,
  sessionId: string
) => {
  const { error } = await client
    .from('oauth_connection_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message || 'Failed to delete OAuth connection session');
  }
};
