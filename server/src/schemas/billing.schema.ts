import { z } from 'zod';

export const createBillingCheckoutSchema = z.object({
  plan: z.enum(['basic', 'pro']),
  totalCount: z.number().int().min(1).max(240).optional(),
  quantity: z.number().int().min(1).max(10).optional(),
  startAt: z.string().datetime().optional(),
  expireBy: z.string().datetime().optional(),
});

export const cancelSubscriptionSchema = z.object({
  cancelAtCycleEnd: z.boolean().optional(),
});

export const syncSubscriptionSchema = z.object({
  subscriptionId: z.string().trim().min(1).optional(),
});

export type CreateBillingCheckoutInput = z.infer<
  typeof createBillingCheckoutSchema
>;
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
export type SyncSubscriptionInput = z.infer<typeof syncSubscriptionSchema>;
