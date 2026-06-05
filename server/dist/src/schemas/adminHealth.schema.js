"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminSafeActionSchema = exports.adminUserDebugQuerySchema = exports.adminGrantSchema = void 0;
const zod_1 = require("zod");
const adminAccess_1 = require("../lib/adminAccess");
const adminPermissionSchema = zod_1.z.enum(adminAccess_1.ALL_ADMIN_PERMISSIONS);
exports.adminGrantSchema = zod_1.z.object({
    email: zod_1.z.string().trim().email(),
    role: zod_1.z.enum(['admin2', 'support', 'analytics', 'readonly', 'custom']),
    permissions: zod_1.z.array(adminPermissionSchema).default([]),
    notes: zod_1.z.string().trim().max(500).optional().nullable(),
    expiresAt: zod_1.z.string().datetime().optional().nullable(),
});
exports.adminUserDebugQuerySchema = zod_1.z.object({
    query: zod_1.z.string().trim().min(3),
});
exports.adminSafeActionSchema = zod_1.z.object({
    action: zod_1.z.enum([
        'refresh_analytics',
        'clear_user_cache',
        'mark_event_reviewed',
        'retry_queue_job',
    ]),
    userId: zod_1.z.string().uuid().optional(),
    eventId: zod_1.z.string().uuid().optional(),
    queue: zod_1.z.string().trim().optional(),
    jobId: zod_1.z.string().trim().optional(),
});
