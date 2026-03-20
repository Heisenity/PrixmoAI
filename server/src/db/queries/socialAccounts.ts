import type {
  CreateSocialAccountInput,
  PaginatedResult,
  SocialAccount,
  UpdateSocialAccountInput,
} from '../../types';
import type { AppSupabaseClient } from '../supabase';

type SocialAccountRow = {
  id: string;
  user_id: string;
  platform: string;
  account_id: string;
  account_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  metadata: Record<string, unknown> | null;
  connected_at: string;
  created_at: string;
  updated_at: string;
};

type PaginationOptions = {
  page?: number;
  limit?: number;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const compactObject = <T extends Record<string, unknown>>(value: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const normalizePage = (page?: number) =>
  Number.isFinite(page) && page && page > 0 ? page : DEFAULT_PAGE;

const normalizeLimit = (limit?: number) =>
  Number.isFinite(limit) && limit && limit > 0 ? limit : DEFAULT_LIMIT;

const toSocialAccount = (row: SocialAccountRow): SocialAccount => ({
  id: row.id,
  userId: row.user_id,
  platform: row.platform,
  accountId: row.account_id,
  accountName: row.account_name,
  accessToken: row.access_token,
  refreshToken: row.refresh_token,
  tokenExpiresAt: row.token_expires_at,
  metadata: toRecord(row.metadata),
  connectedAt: row.connected_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createSocialAccount = async (
  client: AppSupabaseClient,
  userId: string,
  input: CreateSocialAccountInput
): Promise<SocialAccount> => {
  const { data, error } = await client
    .from('social_accounts')
    .insert({
      user_id: userId,
      platform: input.platform,
      account_id: input.accountId,
      account_name: input.accountName ?? null,
      access_token: input.accessToken ?? null,
      refresh_token: input.refreshToken ?? null,
      token_expires_at: input.tokenExpiresAt ?? null,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create social account');
  }

  return toSocialAccount(data as SocialAccountRow);
};

export const getSocialAccountsByUser = async (
  client: AppSupabaseClient,
  userId: string,
  options: PaginationOptions = {}
): Promise<PaginatedResult<SocialAccount>> => {
  const page = normalizePage(options.page);
  const limit = normalizeLimit(options.limit);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await client
    .from('social_accounts')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('connected_at', { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message || 'Failed to fetch social accounts');
  }

  const total = count ?? 0;

  return {
    items: (data ?? []).map((row) => toSocialAccount(row as SocialAccountRow)),
    page,
    limit,
    total,
    totalPages: total > 0 ? Math.ceil(total / limit) : 0,
  };
};

export const getSocialAccountById = async (
  client: AppSupabaseClient,
  userId: string,
  accountId: string
): Promise<SocialAccount | null> => {
  const { data, error } = await client
    .from('social_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch social account');
  }

  return data ? toSocialAccount(data as SocialAccountRow) : null;
};

export const updateSocialAccount = async (
  client: AppSupabaseClient,
  userId: string,
  accountId: string,
  input: UpdateSocialAccountInput
): Promise<SocialAccount> => {
  const payload = compactObject({
    platform: input.platform,
    account_id: input.accountId,
    account_name: input.accountName,
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
    token_expires_at: input.tokenExpiresAt,
    metadata: input.metadata,
  });

  const { data, error } = await client
    .from('social_accounts')
    .update(payload)
    .eq('id', accountId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update social account');
  }

  return toSocialAccount(data as SocialAccountRow);
};

export const deleteSocialAccount = async (
  client: AppSupabaseClient,
  userId: string,
  accountId: string
): Promise<void> => {
  const { error } = await client
    .from('social_accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message || 'Failed to delete social account');
  }
};
