import { z } from 'zod';
import { ALL_ADMIN_PERMISSIONS } from '../lib/adminAccess';

const adminPermissionSchema = z.enum(
  ALL_ADMIN_PERMISSIONS as [string, ...string[]]
);

export const adminGrantSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(['admin2', 'support', 'analytics', 'readonly', 'custom']),
  permissions: z.array(adminPermissionSchema).default([]),
  notes: z.string().trim().max(500).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export const adminUserDebugQuerySchema = z.object({
  query: z.string().trim().min(3),
});

export const adminSafeActionSchema = z.object({
  action: z.enum([
    'refresh_analytics',
    'clear_user_cache',
    'mark_event_reviewed',
    'retry_queue_job',
  ]),
  userId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  queue: z.string().trim().optional(),
  jobId: z.string().trim().optional(),
});

export type AdminGrantInput = z.infer<typeof adminGrantSchema>;
export type AdminUserDebugQuery = z.infer<typeof adminUserDebugQuerySchema>;
export type AdminSafeActionInput = z.infer<typeof adminSafeActionSchema>;
