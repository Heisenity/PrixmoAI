import type { BrandProfile, BrandProfileInput } from '../../types';
import type { AppSupabaseClient } from '../supabase';
import { normalizeUsername } from '../../lib/username';

type BrandProfileRow = {
  id: string;
  user_id: string;
  brand_name: string | null;
  full_name: string;
  phone_number: string | null;
  username: string | null;
  avatar_url: string | null;
  country: string | null;
  language: string | null;
  website_url: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  industry: string | null;
  primary_industry: string | null;
  secondary_industries: string[] | null;
  target_audience: string | null;
  brand_voice: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

const compactObject = <T extends Record<string, unknown>>(value: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;

const toBrandProfile = (row: BrandProfileRow): BrandProfile => ({
  id: row.id,
  userId: row.user_id,
  brandName: row.brand_name,
  fullName: row.full_name,
  phoneNumber: row.phone_number,
  username: row.username,
  avatarUrl: row.avatar_url,
  country: row.country,
  language: row.language,
  websiteUrl: row.website_url,
  logoUrl: row.logo_url,
  primaryColor: row.primary_color,
  secondaryColor: row.secondary_color,
  accentColor: row.accent_color,
  industry: row.industry,
  primaryIndustry: row.primary_industry,
  secondaryIndustries: row.secondary_industries ?? [],
  targetAudience: row.target_audience,
  brandVoice: row.brand_voice,
  description: row.description,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toBrandProfilePayload = (userId: string, input: BrandProfileInput) =>
  compactObject({
    user_id: userId,
    brand_name: input.brandName,
    full_name: input.fullName,
    phone_number: input.phoneNumber ?? null,
    username: input.username ? normalizeUsername(input.username) : null,
    avatar_url: input.avatarUrl ?? null,
    country: input.country ?? null,
    language: input.language ?? null,
    website_url: input.websiteUrl ?? null,
    logo_url: input.logoUrl ?? null,
    primary_color: input.primaryColor ?? null,
    secondary_color: input.secondaryColor ?? null,
    accent_color: input.accentColor ?? null,
    industry: input.industry ?? null,
    primary_industry: input.primaryIndustry ?? null,
    secondary_industries: input.secondaryIndustries ?? [],
    target_audience: input.targetAudience ?? null,
    brand_voice: input.brandVoice ?? null,
    description: input.description ?? null,
  });

const toBrandProfileUpdatePayload = (input: Partial<BrandProfileInput>) =>
  compactObject({
    brand_name: input.brandName,
    full_name: input.fullName,
    phone_number: input.phoneNumber,
    username:
      input.username === undefined
        ? undefined
        : normalizeUsername(input.username ?? '') || null,
    avatar_url: input.avatarUrl,
    country: input.country,
    language: input.language,
    website_url: input.websiteUrl,
    logo_url: input.logoUrl,
    primary_color: input.primaryColor,
    secondary_color: input.secondaryColor,
    accent_color: input.accentColor,
    industry: input.industry,
    primary_industry: input.primaryIndustry,
    secondary_industries: input.secondaryIndustries,
    target_audience: input.targetAudience,
    brand_voice: input.brandVoice,
    description: input.description,
  });

export const createBrandProfile = async (
  client: AppSupabaseClient,
  userId: string,
  input: BrandProfileInput
): Promise<BrandProfile> => {
  const { data, error } = await client
    .from('brand_profiles')
    .insert(toBrandProfilePayload(userId, input))
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create brand profile');
  }

  return toBrandProfile(data as BrandProfileRow);
};

export const upsertBrandProfile = async (
  client: AppSupabaseClient,
  userId: string,
  input: BrandProfileInput
): Promise<BrandProfile> => {
  const { data, error } = await client
    .from('brand_profiles')
    .upsert(toBrandProfilePayload(userId, input), { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to save brand profile');
  }

  return toBrandProfile(data as BrandProfileRow);
};

export const getBrandProfileByUserId = async (
  client: AppSupabaseClient,
  userId: string
): Promise<BrandProfile | null> => {
  const { data, error } = await client
    .from('brand_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch brand profile');
  }

  return data ? toBrandProfile(data as BrandProfileRow) : null;
};

export const updateBrandProfile = async (
  client: AppSupabaseClient,
  userId: string,
  input: Partial<BrandProfileInput>
): Promise<BrandProfile> => {
  const payload = toBrandProfileUpdatePayload(input);

  if (Object.keys(payload).length === 0) {
    const existingProfile = await getBrandProfileByUserId(client, userId);

    if (!existingProfile) {
      throw new Error('Brand profile not found');
    }

    return existingProfile;
  }

  const { data, error } = await client
    .from('brand_profiles')
    .update(payload)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update brand profile');
  }

  return toBrandProfile(data as BrandProfileRow);
};

export const getBrandProfileOwnerByUsername = async (
  client: AppSupabaseClient,
  username: string
): Promise<{ userId: string; username: string } | null> => {
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedUsername) {
    return null;
  }

  const { data, error } = await client
    .from('brand_profiles')
    .select('user_id, username')
    .eq('username', normalizedUsername)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to check username availability');
  }

  if (!data?.username) {
    return null;
  }

  return {
    userId: data.user_id as string,
    username: data.username as string,
  };
};

export const listTakenUsernames = async (
  client: AppSupabaseClient,
  usernames: string[]
): Promise<Set<string>> => {
  const normalizedUsernames = Array.from(
    new Set(usernames.map((entry) => normalizeUsername(entry)).filter(Boolean))
  );

  if (!normalizedUsernames.length) {
    return new Set();
  }

  const { data, error } = await client
    .from('brand_profiles')
    .select('username')
    .in('username', normalizedUsernames);

  if (error) {
    throw new Error(error.message || 'Failed to load existing usernames');
  }

  return new Set(
    ((data ?? []) as Array<{ username: string | null }>)
      .map((entry) => entry.username)
      .filter((entry): entry is string => Boolean(entry))
  );
};
