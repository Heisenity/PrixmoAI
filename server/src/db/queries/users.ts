import type { User } from '@supabase/supabase-js';
import type { CreateSubscriptionInput, PlanType, Subscription } from '../../types';
import { requireSupabaseAdmin } from '../supabase';
import {
  getCurrentSubscriptionByUserId,
  upsertSubscription,
} from './subscriptions';

export const getUserById = async (userId: string): Promise<User | null> => {
  const adminClient = requireSupabaseAdmin();
  const { data, error } = await adminClient.auth.admin.getUserById(userId);

  if (error) {
    throw new Error(error.message || 'Failed to fetch user');
  }

  return data.user;
};

export const updatePlan = async (
  userId: string,
  input: Omit<CreateSubscriptionInput, 'userId'>
): Promise<Subscription> => {
  const adminClient = requireSupabaseAdmin();

  return upsertSubscription(adminClient, {
    userId,
    ...input,
  });
};

export const getCurrentPlan = async (userId: string): Promise<PlanType> => {
  const adminClient = requireSupabaseAdmin();
  const subscription = await getCurrentSubscriptionByUserId(adminClient, userId);

  return subscription?.plan ?? 'free';
};
