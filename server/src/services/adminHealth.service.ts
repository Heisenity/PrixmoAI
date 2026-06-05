import { Queue } from 'bullmq';
import {
  START_BACKGROUND_WORKERS_ON_BOOT,
  START_GENERATION_WORKERS_ON_BOOT,
  isMetaOAuthConfigured,
} from '../config/constants';
import { requireSupabaseAdmin, type AppSupabaseClient } from '../db/supabase';
import { getBullMqConfig, getRedisClient, isRedisConfigured } from '../lib/redis';
import {
  ALL_ADMIN_PERMISSIONS,
  type AdminAccessContext,
  type AdminPermission,
  type AdminRole,
  getPermissionsForRole,
} from '../lib/adminAccess';
import { QUEUE_NAMES, type QueueName } from '../queues/queueNames';
import type {
  AdminGrantInput,
  AdminSafeActionInput,
} from '../schemas/adminHealth.schema';
import {
  deleteRuntimeCacheByPrefix,
  invalidateAnalyticsRuntimeCache,
  invalidateBillingRuntimeCache,
} from './runtimeCache.service';
import { syncAnalyticsForUser } from './analyticsSync.service';
import { refreshAnalyticsLearningForUser } from './analyticsLearning.service';

type JsonRecord = Record<string, unknown>;

const LAST_24_HOURS_ISO = () =>
  new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EVENT_GROUPS = {
  generationFailures: [
    'content_generation_job_failed',
    'content_generation_worker_failed',
    'image_generation_job_failed',
    'image_generation_worker_failed',
    'content_trend_research_failed',
    'image_trend_research_failed',
  ],
  generationCompleted: [
    'content_generation_job_completed',
    'image_generation_job_completed',
  ],
  schedulerFailures: [
    'scheduler_publish_failed',
    'scheduler_publish_worker_failed',
    'scheduler_analytics_sync_enqueue_failed',
  ],
  analyticsFailures: [
    'analytics_sync_job_failed',
    'analytics_sync_worker_failed',
    'analytics_learning_job_failed',
    'analytics_learning_worker_failed',
    'analytics_account_sync_failed',
  ],
  backgroundCompleted: [
    'content_generation_job_completed',
    'image_generation_job_completed',
    'analytics_sync_completed',
    'analytics_learning_completed',
    'scheduler_publish_completed',
  ],
};

const sanitizeForAdmin = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitizeForAdmin);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const output: JsonRecord = {};

  Object.entries(value as JsonRecord).forEach(([key, nextValue]) => {
    if (/token|secret|password|authorization|cookie/i.test(key)) {
      output[key] = '[redacted]';
      return;
    }

    output[key] = sanitizeForAdmin(nextValue);
  });

  return output;
};

const safeCount = async (
  client: AppSupabaseClient,
  table: string,
  apply?: (query: any) => any
) => {
  try {
    let query = client.from(table).select('id', {
      count: 'exact',
      head: true,
    });

    if (apply) {
      query = apply(query);
    }

    const { count, error } = await query;

    if (error) {
      throw error;
    }

    return {
      count: count ?? 0,
      error: null as string | null,
    };
  } catch (error) {
    return {
      count: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const safeRows = async <T = JsonRecord>(
  client: AppSupabaseClient,
  table: string,
  columns = '*',
  apply?: (query: any) => any
): Promise<{ rows: T[]; error: string | null }> => {
  try {
    let query = client.from(table).select(columns);

    if (apply) {
      query = apply(query);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return {
      rows: (data ?? []) as T[],
      error: null,
    };
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const buildQueue = (queueName: QueueName | string) =>
  new Queue(queueName, getBullMqConfig(`prixmoai:admin-health:${queueName}`));

const getQueueSnapshot = async (queueName: QueueName | string) => {
  if (!isRedisConfigured) {
    return {
      queue: queueName,
      status: 'disabled',
      counts: null,
      failedJobs: [],
      error: 'Redis is not configured.',
    };
  }

  const queue = buildQueue(queueName);

  try {
    const [counts, failedJobs] = await Promise.all([
      queue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'failed',
        'completed',
        'paused',
        'prioritized'
      ),
      queue.getJobs(['failed'], 0, 9, false),
    ]);

    return {
      queue: queueName,
      status: 'connected',
      counts,
      failedJobs: failedJobs.map((job) => ({
        id: job.id ?? null,
        name: job.name,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason ?? null,
        timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : null,
        finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        userId:
          job.data && typeof job.data === 'object'
            ? (job.data as JsonRecord).userId ?? null
            : null,
      })),
      error: null,
    };
  } catch (error) {
    return {
      queue: queueName,
      status: 'error',
      counts: null,
      failedJobs: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await queue.close().catch(() => undefined);
  }
};

const getAllQueueSnapshots = async () =>
  Promise.all(Object.values(QUEUE_NAMES).map((queueName) => getQueueSnapshot(queueName)));

const getDatabaseStatus = async (client: AppSupabaseClient) => {
  const probe = await safeCount(client, 'admin_health_events');
  return {
    status: probe.error ? 'error' : 'connected',
    message: probe.error ?? 'Supabase service-role queries are working.',
  };
};

const getRedisStatus = async () => {
  if (!isRedisConfigured) {
    return {
      status: 'disabled',
      message: 'Redis is not configured.',
    };
  }

  try {
    const startedAt = Date.now();
    await getRedisClient().ping();
    return {
      status: 'connected',
      latencyMs: Date.now() - startedAt,
      message: 'Redis is responding.',
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

const getRecentHealthEvents = async (
  client: AppSupabaseClient,
  events?: string[],
  limit = 40
) =>
  safeRows(client, 'admin_health_events', '*', (query) => {
    let nextQuery = query.gte('created_at', LAST_24_HOURS_ISO());

    if (events?.length) {
      nextQuery = nextQuery.in('event', events);
    }

    return nextQuery.order('created_at', { ascending: false }).limit(limit);
  });

const groupEventsByName = (events: JsonRecord[]) => {
  const grouped = new Map<string, number>();

  events.forEach((event) => {
    const eventName = String(event.event ?? 'unknown');
    grouped.set(eventName, (grouped.get(eventName) ?? 0) + 1);
  });

  return [...grouped.entries()]
    .map(([event, count]) => ({ event, count }))
    .sort((left, right) => right.count - left.count);
};

const getAuthUsersById = async (userIds: string[]) => {
  const client = requireSupabaseAdmin();
  const uniqueUserIds = [...new Set(userIds.filter((id) => UUID_PATTERN.test(id)))].slice(0, 25);
  const pairs = await Promise.all(
    uniqueUserIds.map(async (userId) => {
      try {
        const { data, error } = await client.auth.admin.getUserById(userId);

        if (error) {
          throw error;
        }

        return [userId, data.user?.email ?? null] as const;
      } catch {
        return [userId, null] as const;
      }
    })
  );

  return new Map(pairs);
};

const findUserByEmail = async (email: string) => {
  const client = requireSupabaseAdmin();
  const normalizedEmail = email.trim().toLowerCase();

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw error;
    }

    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail
    );

    if (match || data.users.length < 200) {
      return match ?? null;
    }
  }

  return null;
};

const resolveDebugUser = async (query: string) => {
  const trimmed = query.trim();
  const client = requireSupabaseAdmin();

  if (UUID_PATTERN.test(trimmed)) {
    const { data, error } = await client.auth.admin.getUserById(trimmed);

    if (error) {
      throw error;
    }

    return data.user ?? null;
  }

  return findUserByEmail(trimmed);
};

const getUserImpact = async (client: AppSupabaseClient) => {
  const { rows } = await safeRows<JsonRecord>(
    client,
    'admin_health_events',
    'id, event, level, user_id, provider, platform, queue, failure_kind, reviewed_at, created_at',
    (query) =>
      query
        .gte('created_at', LAST_24_HOURS_ISO())
        .not('user_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500)
  );

  const grouped = new Map<
    string,
    {
      userId: string;
      email: string | null;
      issueCount: number;
      latestEvent: string;
      latestLevel: string;
      latestAt: string;
      affectedFeatures: Set<string>;
      reviewedCount: number;
      recovered: boolean;
    }
  >();

  rows.forEach((row) => {
    const userId = String(row.user_id ?? '');

    if (!userId) {
      return;
    }

    const current = grouped.get(userId) ?? {
      userId,
      email: null,
      issueCount: 0,
      latestEvent: String(row.event ?? 'unknown'),
      latestLevel: String(row.level ?? 'info'),
      latestAt: String(row.created_at ?? ''),
      affectedFeatures: new Set<string>(),
      reviewedCount: 0,
      recovered: false,
    };

    current.issueCount += row.level === 'error' || row.level === 'warn' ? 1 : 0;
    current.affectedFeatures.add(
      String(row.queue ?? row.provider ?? row.platform ?? row.event ?? 'system')
    );

    if (row.reviewed_at) {
      current.reviewedCount += 1;
    }

    if (row.level === 'info' && /completed|success|synced/i.test(String(row.event))) {
      current.recovered = true;
    }

    grouped.set(userId, current);
  });

  const userEmailById = await getAuthUsersById([...grouped.keys()]);

  return [...grouped.values()]
    .map((item) => ({
      ...item,
      email: userEmailById.get(item.userId) ?? null,
      affectedFeatures: [...item.affectedFeatures],
    }))
    .sort((left, right) => right.issueCount - left.issueCount)
    .slice(0, 20);
};

export const getAdminAccessSummary = async (
  user: { id: string; email?: string | null },
  access: AdminAccessContext
) => ({
  userId: user.id,
  email: user.email ?? null,
  isAdmin: access.isAdmin,
  isOwner: access.isOwner,
  role: access.role,
  permissions: access.permissions,
  allPermissions: ALL_ADMIN_PERMISSIONS,
});

export const getAdminHealthOverview = async () => {
  const client = requireSupabaseAdmin();
  const [
    database,
    redis,
    queueMonitor,
    generationEvents,
    schedulerEvents,
    analyticsEvents,
    alertEvents,
    schedulerPending,
    schedulerPublished,
    schedulerFailed,
    scheduledItemsFailed,
    scheduledItemsPending,
    socialVerified,
    socialExpired,
    socialRevoked,
    analyticsSyncRows,
    learningRuns,
    recentEvents,
    userImpact,
    lastBackgroundJobs,
  ] = await Promise.all([
    getDatabaseStatus(client),
    getRedisStatus(),
    getAllQueueSnapshots(),
    getRecentHealthEvents(client, EVENT_GROUPS.generationFailures, 80),
    getRecentHealthEvents(client, EVENT_GROUPS.schedulerFailures, 80),
    getRecentHealthEvents(client, EVENT_GROUPS.analyticsFailures, 80),
    getRecentHealthEvents(client, ['failure_spike_detected'], 50),
    safeCount(client, 'scheduled_posts', (query) =>
      query.in('status', ['pending', 'scheduled'])
    ),
    safeCount(client, 'scheduled_posts', (query) => query.eq('status', 'published')),
    safeCount(client, 'scheduled_posts', (query) => query.eq('status', 'failed')),
    safeCount(client, 'scheduled_items', (query) => query.eq('status', 'failed')),
    safeCount(client, 'scheduled_items', (query) =>
      query.in('status', ['pending', 'scheduled', 'publishing'])
    ),
    safeCount(client, 'social_accounts', (query) => query.eq('verification_status', 'verified')),
    safeCount(client, 'social_accounts', (query) => query.eq('verification_status', 'expired')),
    safeCount(client, 'social_accounts', (query) => query.eq('verification_status', 'revoked')),
    safeRows<JsonRecord>(
      client,
      'analytics',
      'id, user_id, platform, recorded_at, created_at',
      (query) => query.gte('created_at', LAST_24_HOURS_ISO()).limit(200)
    ),
    safeRows<JsonRecord>(
      client,
      'analytics_learning_runs',
      'id, user_id, status, posts_analyzed, profiles_updated, error_message, created_at, updated_at',
      (query) => query.gte('created_at', LAST_24_HOURS_ISO()).order('created_at', { ascending: false }).limit(100)
    ),
    safeRows<JsonRecord>(
      client,
      'admin_health_events',
      'id, event, level, user_id, provider, platform, queue, job_id, failure_kind, retryable, reviewed_at, created_at, payload',
      (query) => query.order('created_at', { ascending: false }).limit(80)
    ),
    getUserImpact(client),
    safeRows<JsonRecord>(
      client,
      'admin_health_events',
      'id, event, level, user_id, queue, job_id, provider, created_at',
      (query) =>
        query
          .in('event', EVENT_GROUPS.backgroundCompleted)
          .order('created_at', { ascending: false })
          .limit(10)
    ),
  ]);

  const failedQueueJobs = queueMonitor.flatMap((queue) =>
    (queue.failedJobs ?? []).map((job) => ({
      ...job,
      queue: queue.queue,
    }))
  );
  const learningRows = learningRuns.rows;
  const failedLearningRuns = learningRows.filter((run) => run.status === 'failed');
  const completedLearningRuns = learningRows.filter((run) => run.status === 'completed');
  const learningPostsAnalyzed = learningRows.reduce(
    (total, run) => total + Number(run.posts_analyzed ?? 0),
    0
  );

  return {
    generatedAt: new Date().toISOString(),
    liveSystemStatus: {
      api: {
        status: 'up',
        message: 'Admin health API responded.',
      },
      database,
      redis,
      workers: {
        generationWorkersOnBoot: START_GENERATION_WORKERS_ON_BOOT,
        backgroundWorkersOnBoot: START_BACKGROUND_WORKERS_ON_BOOT,
        metaConfigured: isMetaOAuthConfigured,
        mode: START_BACKGROUND_WORKERS_ON_BOOT || START_GENERATION_WORKERS_ON_BOOT
          ? 'boot'
          : 'on-demand',
      },
      lastSuccessfulBackgroundJob: lastBackgroundJobs.rows[0] ?? null,
    },
    generationHealth: {
      failedEventCount: generationEvents.rows.length,
      failedEventsByType: groupEventsByName(generationEvents.rows),
      failedQueueJobs: failedQueueJobs.filter((job) =>
        String(job.queue).includes('generate')
      ),
      averageGenerationTimeMs: null,
      failedProviderCalls: generationEvents.rows.filter((event) => event.provider).length,
      recentFailures: generationEvents.rows.slice(0, 20),
    },
    schedulerHealth: {
      pendingPosts: schedulerPending.count,
      publishedPosts: schedulerPublished.count,
      failedPosts: schedulerFailed.count,
      pendingItems: scheduledItemsPending.count,
      failedItems: scheduledItemsFailed.count,
      publishFailureEvents: schedulerEvents.rows.length,
      duplicateBlockedJobs: schedulerEvents.rows.filter((event) =>
        /duplicate/i.test(JSON.stringify(event.payload ?? {}))
      ).length,
      expiredAccountErrors: schedulerEvents.rows.filter(
        (event) => event.failure_kind === 'reconnect'
      ).length,
      recentFailures: schedulerEvents.rows.slice(0, 20),
    },
    socialAccountHealth: {
      verified: socialVerified.count,
      expired: socialExpired.count,
      revoked: socialRevoked.count,
      needsReconnect: socialExpired.count + socialRevoked.count,
      recentIssues: [...schedulerEvents.rows, ...analyticsEvents.rows]
        .filter((event) =>
          ['reconnect', 'permission_missing', 'rate_limited'].includes(
            String(event.failure_kind ?? '')
          )
        )
        .slice(0, 20),
    },
    analyticsHealth: {
      syncedRowsLast24h: analyticsSyncRows.rows.length,
      learningRunsLast24h: learningRows.length,
      learningRunsCompleted: completedLearningRuns.length,
      learningRunsFailed: failedLearningRuns.length,
      postsAnalyzedLast24h: learningPostsAnalyzed,
      analyticsFailureEvents: analyticsEvents.rows.length,
      failedMetaInsightCalls: analyticsEvents.rows.filter(
        (event) => event.provider === 'meta'
      ).length,
      staleAnalyticsCache: false,
      recentFailures: analyticsEvents.rows.slice(0, 20),
    },
    queueMonitor,
    failureAlerts: {
      spikeCount: alertEvents.rows.length,
      recentSpikes: alertEvents.rows,
      commonErrors: groupEventsByName(recentEvents.rows.filter((event) => event.level !== 'info')),
    },
    userImpact,
    recentEvents: recentEvents.rows,
  };
};

export const listAdminAccessGrants = async () => {
  const client = requireSupabaseAdmin();
  const { rows, error } = await safeRows<JsonRecord>(
    client,
    'admin_access_grants',
    '*',
    (query) => query.order('created_at', { ascending: false }).limit(100)
  );

  if (error) {
    throw new Error(error);
  }

  return rows;
};

export const upsertAdminAccessGrant = async (
  actorUserId: string,
  input: AdminGrantInput
) => {
  const client = requireSupabaseAdmin();
  const normalizedEmail = input.email.trim().toLowerCase();
  const resolvedUser = await findUserByEmail(normalizedEmail).catch(() => null);
  const role = input.role as Exclude<AdminRole, 'owner'>;
  const permissions = getPermissionsForRole(
    role,
    role === 'custom' ? input.permissions : []
  );

  const { data: existingGrant } = await client
    .from('admin_access_grants')
    .select('id')
    .eq('email', normalizedEmail)
    .is('revoked_at', null)
    .maybeSingle();

  const grantPayload = {
        email: normalizedEmail,
        granted_user_id: resolvedUser?.id ?? null,
        role,
        permissions,
        notes: input.notes ?? null,
        expires_at: input.expiresAt ?? null,
        revoked_at: null,
        revoked_by_user_id: null,
        created_by_user_id: actorUserId,
  };

  const query = existingGrant?.id
    ? client
        .from('admin_access_grants')
        .update(grantPayload)
        .eq('id', existingGrant.id)
    : client.from('admin_access_grants').insert(grantPayload);

  const { data, error } = await query
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to save admin access grant.');
  }

  await logSafeAction(client, {
    actorUserId,
    action: 'admin_access_upsert',
    status: 'completed',
    requestPayload: {
      email: normalizedEmail,
      role,
      permissions,
    },
    resultPayload: data,
  });

  return data;
};

export const revokeAdminAccessGrant = async (
  actorUserId: string,
  grantId: string
) => {
  const client = requireSupabaseAdmin();
  const { data, error } = await client
    .from('admin_access_grants')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by_user_id: actorUserId,
    })
    .eq('id', grantId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to revoke admin access grant.');
  }

  await logSafeAction(client, {
    actorUserId,
    action: 'admin_access_revoke',
    status: 'completed',
    requestPayload: { grantId },
    resultPayload: data,
  });

  return data;
};

type SafeActionLogInput = {
  actorUserId: string;
  targetUserId?: string | null;
  action: string;
  status: 'completed' | 'failed';
  requestPayload: JsonRecord;
  resultPayload?: JsonRecord;
  errorMessage?: string | null;
};

const logSafeAction = async (
  client: AppSupabaseClient,
  input: SafeActionLogInput
) => {
  await client.from('admin_safe_action_logs').insert({
    actor_user_id: input.actorUserId,
    target_user_id: input.targetUserId ?? null,
    action: input.action,
    status: input.status,
    request_payload: sanitizeForAdmin(input.requestPayload) as JsonRecord,
    result_payload: sanitizeForAdmin(input.resultPayload ?? {}) as JsonRecord,
    error_message: input.errorMessage ?? null,
  });
};

export const runAdminSafeAction = async (
  actorUserId: string,
  input: AdminSafeActionInput
) => {
  const client = requireSupabaseAdmin();

  try {
    let result: JsonRecord;

    switch (input.action) {
      case 'refresh_analytics': {
        if (!input.userId) {
          throw new Error('userId is required to refresh analytics.');
        }

        const syncSummary = await syncAnalyticsForUser(client, input.userId);
        const learningSummary = await refreshAnalyticsLearningForUser(
          client,
          input.userId,
          {
            triggerSource: 'admin-safe-action',
          }
        );

        result = {
          syncSummary,
          learningSummary,
        };
        break;
      }
      case 'clear_user_cache': {
        if (!input.userId) {
          throw new Error('userId is required to clear cache.');
        }

        await Promise.all([
          invalidateAnalyticsRuntimeCache(input.userId),
          invalidateBillingRuntimeCache(input.userId),
          deleteRuntimeCacheByPrefix('generate', input.userId),
          deleteRuntimeCacheByPrefix('scheduler', input.userId),
        ]);

        result = {
          cleared: true,
          userId: input.userId,
        };
        break;
      }
      case 'mark_event_reviewed': {
        if (!input.eventId) {
          throw new Error('eventId is required to mark an event reviewed.');
        }

        const { data, error } = await client
          .from('admin_health_events')
          .update({
            reviewed_at: new Date().toISOString(),
            reviewed_by_user_id: actorUserId,
          })
          .eq('id', input.eventId)
          .select('id, event, reviewed_at')
          .single();

        if (error) {
          throw error;
        }

        result = data as JsonRecord;
        break;
      }
      case 'retry_queue_job': {
        if (!input.queue || !input.jobId) {
          throw new Error('queue and jobId are required to retry a queue job.');
        }

        if (!Object.values(QUEUE_NAMES).includes(input.queue as QueueName)) {
          throw new Error('Unknown queue.');
        }

        const queue = buildQueue(input.queue);

        try {
          const job = await queue.getJob(input.jobId);

          if (!job) {
            throw new Error('Queue job was not found.');
          }

          const state = await job.getState();

          if (state !== 'failed') {
            throw new Error(`Only failed jobs can be retried. Current state: ${state}.`);
          }

          await job.retry('failed');
          result = {
            retried: true,
            queue: input.queue,
            jobId: input.jobId,
          };
        } finally {
          await queue.close().catch(() => undefined);
        }
        break;
      }
      default:
        throw new Error('Unsupported safe action.');
    }

    await logSafeAction(client, {
      actorUserId,
      targetUserId: input.userId ?? null,
      action: input.action,
      status: 'completed',
      requestPayload: input as unknown as JsonRecord,
      resultPayload: result,
    });

    return result;
  } catch (error) {
    await logSafeAction(client, {
      actorUserId,
      targetUserId: input.userId ?? null,
      action: input.action,
      status: 'failed',
      requestPayload: input as unknown as JsonRecord,
      errorMessage: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);

    throw error;
  }
};

export const getAdminUserDebugSnapshot = async (query: string) => {
  const client = requireSupabaseAdmin();
  const user = await resolveDebugUser(query);

  if (!user?.id) {
    return null;
  }

  const userId = user.id;
  const [
    profile,
    subscription,
    content,
    images,
    socialAccounts,
    scheduledPosts,
    scheduledItems,
    analytics,
    audienceSnapshots,
    learningProfiles,
    learningRuns,
    healthEvents,
    actionLogs,
  ] = await Promise.all([
    safeRows<JsonRecord>(client, 'brand_profiles', '*', (select) =>
      select.eq('user_id', userId).limit(1)
    ),
    safeRows<JsonRecord>(client, 'subscriptions', '*', (select) =>
      select.eq('user_id', userId).order('created_at', { ascending: false }).limit(5)
    ),
    safeRows<JsonRecord>(
      client,
      'generated_content',
      'id, brand_profile_id, product_name, platform, goal, tone, audience, created_at, updated_at',
      (select) => select.eq('user_id', userId).order('created_at', { ascending: false }).limit(15)
    ),
    safeRows<JsonRecord>(
      client,
      'generated_images',
      'id, content_id, generated_image_url, background_style, prompt, created_at, updated_at',
      (select) => select.eq('user_id', userId).order('created_at', { ascending: false }).limit(15)
    ),
    safeRows<JsonRecord>(
      client,
      'social_accounts',
      'id, platform, account_id, account_name, profile_url, oauth_provider, verification_status, verified_at, token_expires_at, connected_at, created_at, updated_at, metadata',
      (select) => select.eq('user_id', userId).order('updated_at', { ascending: false }).limit(20)
    ),
    safeRows<JsonRecord>(
      client,
      'scheduled_posts',
      'id, social_account_id, content_id, generated_image_id, platform, status, scheduled_for, published_at, external_post_id, publish_attempted_at, last_error, created_at, updated_at',
      (select) => select.eq('user_id', userId).order('updated_at', { ascending: false }).limit(20)
    ),
    safeRows<JsonRecord>(
      client,
      'scheduled_items',
      'id, batch_id, media_asset_id, scheduled_post_id, platform, social_account_id, status, attempt_count, last_error, scheduled_at, created_at, updated_at, metadata',
      (select) => select.eq('user_id', userId).order('updated_at', { ascending: false }).limit(20)
    ),
    safeRows<JsonRecord>(
      client,
      'analytics',
      'id, scheduled_post_id, content_id, platform, reach, impressions, likes, comments, shares, saves, engagement_rate, recorded_at, created_at',
      (select) => select.eq('user_id', userId).order('recorded_at', { ascending: false }).limit(25)
    ),
    safeRows<JsonRecord>(
      client,
      'analytics_audience_snapshots',
      'id, social_account_id, platform, followers, impressions, reach, profile_visits, page_likes, recorded_at, created_at',
      (select) => select.eq('user_id', userId).order('recorded_at', { ascending: false }).limit(20)
    ),
    safeRows<JsonRecord>(
      client,
      'analytics_learning_profiles',
      'id, brand_profile_id, platform, profile_type, summary_text, recommendation_text, metrics, updated_at, last_analyzed_at',
      (select) => select.eq('user_id', userId).order('updated_at', { ascending: false }).limit(10)
    ),
    safeRows<JsonRecord>(
      client,
      'analytics_learning_runs',
      'id, trigger_source, platforms, status, posts_analyzed, profiles_updated, error_message, created_at, updated_at',
      (select) => select.eq('user_id', userId).order('created_at', { ascending: false }).limit(15)
    ),
    safeRows<JsonRecord>(
      client,
      'admin_health_events',
      'id, event, level, provider, platform, queue, job_id, failure_kind, retryable, reviewed_at, created_at, payload',
      (select) => select.eq('user_id', userId).order('created_at', { ascending: false }).limit(40)
    ),
    safeRows<JsonRecord>(
      client,
      'admin_safe_action_logs',
      'id, actor_user_id, action, status, request_payload, result_payload, error_message, created_at',
      (select) => select.eq('target_user_id', userId).order('created_at', { ascending: false }).limit(20)
    ),
  ]);

  return sanitizeForAdmin({
    user: {
      id: user.id,
      email: user.email ?? null,
      createdAt: user.created_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
      appMetadata: user.app_metadata ?? {},
      userMetadata: user.user_metadata ?? {},
    },
    profile: profile.rows[0] ?? null,
    subscriptions: subscription.rows,
    generatedContent: content.rows,
    generatedImages: images.rows,
    socialAccounts: socialAccounts.rows,
    scheduledPosts: scheduledPosts.rows,
    scheduledItems: scheduledItems.rows,
    analytics: analytics.rows,
    audienceSnapshots: audienceSnapshots.rows,
    learningProfiles: learningProfiles.rows,
    learningRuns: learningRuns.rows,
    healthEvents: healthEvents.rows,
    actionLogs: actionLogs.rows,
    queryErrors: {
      profile: profile.error,
      subscriptions: subscription.error,
      generatedContent: content.error,
      generatedImages: images.error,
      socialAccounts: socialAccounts.error,
      scheduledPosts: scheduledPosts.error,
      scheduledItems: scheduledItems.error,
      analytics: analytics.error,
      audienceSnapshots: audienceSnapshots.error,
      learningProfiles: learningProfiles.error,
      learningRuns: learningRuns.error,
      healthEvents: healthEvents.error,
      actionLogs: actionLogs.error,
    },
  });
};
