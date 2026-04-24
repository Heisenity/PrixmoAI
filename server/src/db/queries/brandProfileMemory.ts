import type { AppSupabaseClient } from '../supabase';
import type { ProfileSaveContext } from '../../types';

type BrandProfileMemoryInsert = {
  userId: string;
  brandProfileId?: string | null;
  saveContext: ProfileSaveContext;
  eventType: 'created' | 'updated' | 'saved';
  changedFields: string[];
  previousSnapshot?: Record<string, unknown> | null;
  currentSnapshot: Record<string, unknown>;
  fieldChanges: Record<string, unknown>;
};

type IndustrySuggestionLogInsert = {
  userId: string;
  brandProfileId?: string | null;
  requestContext: ProfileSaveContext;
  status: 'success' | 'fallback' | 'error';
  provider?: string | null;
  requestPayload: Record<string, unknown>;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
};

type BrandDescriptionSuggestionLogInsert = {
  userId: string;
  brandProfileId?: string | null;
  requestContext: ProfileSaveContext;
  status: 'success' | 'error';
  provider?: string | null;
  requestPayload: Record<string, unknown>;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
};

type UsernameRecommendationLogInsert = {
  userId: string;
  brandProfileId?: string | null;
  requestContext: ProfileSaveContext;
  status: 'success' | 'error';
  desiredUsername: string;
  normalizedUsername: string;
  isAvailable: boolean;
  provider?: string | null;
  requestPayload: Record<string, unknown>;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
};

export const insertBrandProfileMemoryEvent = async (
  client: AppSupabaseClient,
  input: BrandProfileMemoryInsert
) => {
  const { error } = await client.from('brand_profile_memory_events').insert({
    user_id: input.userId,
    brand_profile_id: input.brandProfileId ?? null,
    save_context: input.saveContext,
    event_type: input.eventType,
    changed_fields: input.changedFields,
    previous_snapshot: input.previousSnapshot ?? null,
    current_snapshot: input.currentSnapshot,
    field_changes: input.fieldChanges,
  });

  if (error) {
    throw new Error(error.message || 'Failed to store brand profile memory event');
  }
};

export const insertIndustrySuggestionLog = async (
  client: AppSupabaseClient,
  input: IndustrySuggestionLogInsert
) => {
  const { error } = await client.from('industry_suggestion_logs').insert({
    user_id: input.userId,
    brand_profile_id: input.brandProfileId ?? null,
    request_context: input.requestContext,
    status: input.status,
    provider: input.provider ?? null,
    request_payload: input.requestPayload,
    response_payload: input.responsePayload ?? null,
    error_message: input.errorMessage ?? null,
  });

  if (error) {
    throw new Error(error.message || 'Failed to store industry suggestion log');
  }
};

export const insertBrandDescriptionSuggestionLog = async (
  client: AppSupabaseClient,
  input: BrandDescriptionSuggestionLogInsert
) => {
  const { error } = await client.from('brand_description_suggestion_logs').insert({
    user_id: input.userId,
    brand_profile_id: input.brandProfileId ?? null,
    request_context: input.requestContext,
    status: input.status,
    provider: input.provider ?? null,
    request_payload: input.requestPayload,
    response_payload: input.responsePayload ?? null,
    error_message: input.errorMessage ?? null,
  });

  if (error) {
    throw new Error(
      error.message || 'Failed to store brand description suggestion log'
    );
  }
};

export const insertUsernameRecommendationLog = async (
  client: AppSupabaseClient,
  input: UsernameRecommendationLogInsert
) => {
  const { error } = await client.from('username_recommendation_logs').insert({
    user_id: input.userId,
    brand_profile_id: input.brandProfileId ?? null,
    request_context: input.requestContext,
    status: input.status,
    desired_username: input.desiredUsername,
    normalized_username: input.normalizedUsername,
    is_available: input.isAvailable,
    provider: input.provider ?? null,
    request_payload: input.requestPayload,
    response_payload: input.responsePayload ?? null,
    error_message: input.errorMessage ?? null,
  });

  if (error) {
    throw new Error(error.message || 'Failed to store username recommendation log');
  }
};
