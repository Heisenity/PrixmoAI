import type { BrandProfile, BrandProfileInput } from '../../types';
import type { AppSupabaseClient } from '../supabase';

type BrandProfileRow = {
  id: string;
  user_id: string;
  brand_name: string | null;
  full_name: string;
  phone_number: string | null;
  username: string | null;
  avatar_url: string | null;
  industry: string | null;
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
  industry: row.industry,
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
    username: input.username ?? null,
    avatar_url: input.avatarUrl ?? null,
    industry: input.industry ?? null,
    target_audience: input.targetAudience ?? null,
    brand_voice: input.brandVoice ?? null,
    description: input.description ?? null,
  });

const toBrandProfileUpdatePayload = (input: Partial<BrandProfileInput>) =>
  compactObject({
    brand_name: input.brandName,
    full_name: input.fullName,
    phone_number: input.phoneNumber,
    username: input.username,
    avatar_url: input.avatarUrl,
    industry: input.industry,
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
