import { Queue, Worker } from 'bullmq';
import {
  SCHEDULER_MAX_RETRY_ATTEMPTS,
  SCHEDULER_PROCESS_BATCH_SIZE,
  SCHEDULER_PROCESSING_TIMEOUT_MS,
  SCHEDULER_PUBLISH_JOB_CONCURRENCY,
  isMetaOAuthConfigured,
} from '../config/constants';
import {
  claimScheduledPostForProcessing,
  getDueScheduledPosts,
  getScheduledPostById,
  recoverStuckProcessingPosts,
  updateScheduledPost,
} from '../db/queries/scheduledPosts';
import {
  appendScheduledItemLog,
  syncScheduledItemStatusByScheduledPostId,
} from '../db/queries/scheduleBatches';
import {
  getSocialAccountById,
  updateSocialAccount,
} from '../db/queries/socialAccounts';
import {
  isSupabaseAdminConfigured,
  requireSupabaseAdmin,
} from '../db/supabase';
import type { ScheduledPostStatus, SocialAccount } from '../types';
import { enqueueAnalyticsSyncJob } from './analyticsSync.service';
import { normalizeMetaFailureForUser, publishScheduledMetaPost } from './meta.service';
import { getBullMqConfig, isRedisConfigured } from '../lib/redis';
import { QUEUE_NAMES } from '../queues/queueNames';
import { getLowCommandWorkerOptions } from '../queues/workerOptions';
import {
  logFailure,
  logOperationalEvent,
  recordFailureSpikeSignal,
} from '../lib/observability';

type SchedulerPublishJobData = {
  postId: string;
  userId: string;
  scheduledFor: string;
};

type SchedulePublishInput = {
  id: string;
  userId: string;
  scheduledFor: string;
  status: ScheduledPostStatus;
};

type HydrationScheduledPostRow = {
  id: string;
  user_id: string;
  scheduled_for: string;
  status: ScheduledPostStatus;
};

const FAILED_JOB_RETENTION_SECONDS = 60 * 60;
const JOB_TIME_TOLERANCE_MS = 1_000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];

let schedulerPublishQueue: Queue<SchedulerPublishJobData> | null = null;
let schedulerPublishWorker: Worker<SchedulerPublishJobData> | null = null;

const getScheduledPublishJobId = (postId: string) => `scheduled-post-${postId}`;

const getSchedulerPublishQueue = () => {
  if (!schedulerPublishQueue) {
    schedulerPublishQueue = new Queue<SchedulerPublishJobData>(
      QUEUE_NAMES.schedulerPublish,
      getBullMqConfig('prixmoai:queue:scheduler-publish')
    );
  }

  return schedulerPublishQueue;
};

const getPublishJobTargetTimestamp = (
  scheduledFor: string,
  delayMs: number
) => {
  const scheduledAtMs = new Date(scheduledFor).getTime();

  if (Number.isFinite(scheduledAtMs)) {
    return scheduledAtMs;
  }

  return Date.now() + delayMs;
};

const getPublishJobOptions = (postId: string, scheduledFor: string) => {
  const scheduledAtMs = new Date(scheduledFor).getTime();
  const delayMs = Number.isFinite(scheduledAtMs)
    ? Math.max(0, scheduledAtMs - Date.now())
    : 0;

  return {
    jobId: getScheduledPublishJobId(postId),
    delay: delayMs,
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 5_000,
    },
    removeOnComplete: true,
    removeOnFail: {
      age: FAILED_JOB_RETENTION_SECONDS,
      count: 100,
    },
  };
};

const removeExistingScheduledPublishJob = async (postId: string) => {
  const job = await getSchedulerPublishQueue().getJob(getScheduledPublishJobId(postId));

  if (!job) {
    return;
  }

  const state = await job.getState();

  if (
    state === 'waiting' ||
    state === 'delayed' ||
    state === 'prioritized'
  ) {
    await job.remove();
  }
};

const hasMatchingScheduledPublishJob = async (
  postId: string,
  scheduledFor: string
) => {
  const job = await getSchedulerPublishQueue().getJob(getScheduledPublishJobId(postId));

  if (!job) {
    return false;
  }

  const state = await job.getState();

  if (
    state !== 'waiting' &&
    state !== 'delayed' &&
    state !== 'prioritized'
  ) {
    return false;
  }

  const expected = new Date(scheduledFor).getTime();

  if (!Number.isFinite(expected)) {
    return true;
  }

  const actual = getPublishJobTargetTimestamp(
    job.data.scheduledFor,
    typeof job.opts.delay === 'number' ? job.opts.delay : 0
  );

  return Math.abs(actual - expected) <= JOB_TIME_TOLERANCE_MS;
};

const markPostFailure = async (
  postId: string,
  userId: string,
  message: string,
  payloadJson?: Record<string, unknown>,
  options: {
    retryCount?: number;
    retryable?: boolean;
  } = {}
) => {
  const client = requireSupabaseAdmin();
  const now = new Date().toISOString();
  const retryCount = options.retryCount ?? 0;
  const shouldRetry = Boolean(
    options.retryable && retryCount < SCHEDULER_MAX_RETRY_ATTEMPTS
  );
  const nextRetryAt = shouldRetry
    ? new Date(
        Date.now() +
          (RETRY_DELAYS_MS[Math.max(0, retryCount - 1)] ??
            RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1])
      ).toISOString()
    : null;

  await updateScheduledPost(client, userId, postId, {
    status: 'failed',
    publishAttemptedAt: now,
    failedAt: now,
    lastAttemptAt: now,
    nextRetryAt,
    retryCount,
    lastError: message,
    publishedAt: null,
  });

  const syncedItems = await syncScheduledItemStatusByScheduledPostId(client, postId, {
    status: 'failed',
    lastError: message,
  }).catch(() => []);

  logOperationalEvent('post_failed', {
    userId,
    scheduledPostId: postId,
    attemptNumber: retryCount,
    retryable: shouldRetry,
  }, shouldRetry ? 'warn' : 'error');

  await Promise.all(
    syncedItems.map((item) =>
      appendScheduledItemLog(client, {
        scheduledItemId: item.id,
        eventType: 'publish_failed',
        message,
        payloadJson,
      }).catch(() => null)
    )
  );

  if (shouldRetry) {
    logOperationalEvent('post_retry_scheduled', {
      userId,
      scheduledPostId: postId,
      attemptNumber: retryCount,
      nextRetryAt,
    }, 'warn');
  }
};

const revalidateScheduledPublishInput = async (
  post: SchedulePublishInput
): Promise<SchedulePublishInput | null> => {
  if (!isSupabaseAdminConfigured) {
    return post;
  }

  const client = requireSupabaseAdmin();
  const livePost = await getScheduledPostById(client, post.userId, post.id);

  if (!livePost) {
    await removeExistingScheduledPublishJob(post.id);
    logOperationalEvent(
      'scheduler_publish_enqueue_skipped',
      {
        userId: post.userId,
        queue: QUEUE_NAMES.schedulerPublish,
        scheduledPostId: post.id,
        reason: 'post_deleted',
      },
      'warn'
    );
    return null;
  }

  if (!['pending', 'scheduled'].includes(livePost.status)) {
    await removeExistingScheduledPublishJob(livePost.id);
    return null;
  }

  const socialAccount = await getSocialAccountById(
    client,
    livePost.userId,
    livePost.socialAccountId
  );

  if (!socialAccount) {
    await markPostFailure(
      livePost.id,
      livePost.userId,
      'The connected account was removed before this post could publish.',
      { reason: 'social_account_deleted' }
    );
    await removeExistingScheduledPublishJob(livePost.id);
    return null;
  }

  if (
    socialAccount.verificationStatus !== 'verified' ||
    (socialAccount.tokenExpiresAt &&
      new Date(socialAccount.tokenExpiresAt).getTime() <= Date.now())
  ) {
    await markPostFailure(
      livePost.id,
      livePost.userId,
      'Reconnect this account before PrixmoAI can publish this scheduled post.',
      {
        reason: 'social_account_not_publishable',
        verificationStatus: socialAccount.verificationStatus,
      }
    );
    await removeExistingScheduledPublishJob(livePost.id);
    return null;
  }

  return {
    id: livePost.id,
    userId: livePost.userId,
    scheduledFor: livePost.scheduledFor,
    status: livePost.status,
  };
};

const processScheduledPost = async (postId: string, userId: string) => {
  const client = requireSupabaseAdmin();
  const currentPost = await getScheduledPostById(client, userId, postId);

  if (!currentPost || !['scheduled', 'failed'].includes(currentPost.status)) {
    return false;
  }

  const post = await claimScheduledPostForProcessing(
    client,
    currentPost,
    new Date().toISOString(),
    SCHEDULER_MAX_RETRY_ATTEMPTS
  );

  if (!post) {
    return false;
  }

  logOperationalEvent('post_claimed', {
    userId: post.userId,
    scheduledPostId: post.id,
    platform: post.platform,
    attemptNumber: post.retryCount,
  });

  let socialAccount: SocialAccount | null = null;

  try {
    logOperationalEvent('scheduler_publish_started', {
      userId,
      jobId: getScheduledPublishJobId(postId),
      queue: QUEUE_NAMES.schedulerPublish,
      scheduledPostId: postId,
      provider: 'meta',
      attemptNumber: post.retryCount,
    });

    await syncScheduledItemStatusByScheduledPostId(client, post.id, {
      status: 'publishing',
      attemptCount: post.retryCount,
      lastError: null,
    }).catch(() => []);

    socialAccount = await getSocialAccountById(
      client,
      post.userId,
      post.socialAccountId
    );

    if (!socialAccount) {
      await markPostFailure(
        post.id,
        post.userId,
        'The connected account could not be found.',
        undefined,
        { retryCount: post.retryCount, retryable: false }
      );
      return true;
    }

    if (socialAccount.oauthProvider !== 'meta') {
      await markPostFailure(
        post.id,
        post.userId,
        'PrixmoAI can auto-publish only verified Meta accounts right now. Reconnect this account through Meta first.',
        undefined,
        { retryCount: post.retryCount, retryable: false }
      );
      return true;
    }

    const published = await publishScheduledMetaPost(socialAccount, post);

    await updateScheduledPost(client, post.userId, post.id, {
      status: 'published',
      externalPostId: published.externalPostId,
      publishAttemptedAt: published.publishedAt,
      publishedAt: published.publishedAt,
      lastError: null,
      failedAt: null,
      nextRetryAt: null,
      platformResponse: {
        provider: 'meta',
        platform: socialAccount.platform,
        externalPostId: published.externalPostId,
        publishedAt: published.publishedAt,
      },
    });

    const syncedItems = await syncScheduledItemStatusByScheduledPostId(client, post.id, {
      status: 'published',
      attemptCount: post.retryCount,
      lastError: null,
    }).catch(() => []);

    await Promise.all(
      syncedItems.map((item) =>
        appendScheduledItemLog(client, {
          scheduledItemId: item.id,
          eventType: 'published',
          message: 'Scheduled item published successfully.',
          payloadJson: {
            externalPostId: published.externalPostId,
            publishedAt: published.publishedAt,
            attemptNumber: post.retryCount,
          },
        }).catch(() => null)
      )
    );

    logOperationalEvent('scheduler_publish_completed', {
      userId: post.userId,
      jobId: getScheduledPublishJobId(post.id),
      queue: QUEUE_NAMES.schedulerPublish,
      provider: socialAccount.oauthProvider ?? 'meta',
      platform: socialAccount.platform,
      scheduledPostId: post.id,
      socialAccountId: socialAccount.id,
      externalPostId: published.externalPostId,
    });
    logOperationalEvent('post_published', {
      userId: post.userId,
      scheduledPostId: post.id,
      platform: socialAccount.platform,
      attemptNumber: post.retryCount,
      externalPostId: published.externalPostId,
    });

    try {
      await enqueueAnalyticsSyncJob({
        userId: post.userId,
        postIds: [post.id],
        socialAccountIds: [socialAccount.id],
        lookbackDays: 7,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Immediate analytics sync failed after publishing.';
      logFailure('scheduler_analytics_sync_enqueue_failed', error, {
        userId: post.userId,
        jobId: getScheduledPublishJobId(post.id),
        queue: QUEUE_NAMES.analyticsSyncUser,
        scheduledPostId: post.id,
        socialAccountId: socialAccount.id,
      });
      console.error(`[scheduler-publisher] ${message}`);
    }
  } catch (error) {
    const normalized =
      socialAccount?.oauthProvider === 'meta' &&
      (socialAccount.platform === 'instagram' || socialAccount.platform === 'facebook')
        ? normalizeMetaFailureForUser(error, socialAccount.platform)
        : null;
    const message =
      normalized?.message ||
      (error instanceof Error
        ? error.message
        : 'PrixmoAI could not publish that scheduled post.');

    if (socialAccount && normalized?.accountStatus) {
      await updateSocialAccount(client, socialAccount.userId, socialAccount.id, {
        verificationStatus: normalized.accountStatus,
      }).catch((statusError) => {
        logFailure('scheduler_social_account_status_update_failed', statusError, {
          userId: socialAccount?.userId,
          socialAccountId: socialAccount?.id,
          provider: 'meta',
        });
      });
    }

    logFailure('scheduler_publish_failed', error, {
      userId,
      jobId: getScheduledPublishJobId(postId),
      queue: QUEUE_NAMES.schedulerPublish,
      provider: socialAccount?.oauthProvider ?? 'unknown',
      platform: socialAccount?.platform ?? post.platform,
      scheduledPostId: postId,
      socialAccountId: socialAccount?.id ?? post.socialAccountId,
      failureKind: normalized?.kind ?? 'unknown',
      retryable: normalized?.retryable ?? false,
      attemptNumber: post.retryCount,
    });
    recordFailureSpikeSignal('scheduler_publish_failed', {
      userId,
      queue: QUEUE_NAMES.schedulerPublish,
      provider: socialAccount?.oauthProvider ?? 'unknown',
    });

    if (normalized?.kind === 'reconnect' || normalized?.kind === 'permission_missing') {
      recordFailureSpikeSignal('meta_disconnect_or_permission', {
        userId,
        provider: 'meta',
        platform: socialAccount?.platform ?? post.platform,
      }, {
        threshold: 3,
      });
    }

    await markPostFailure(postId, userId, message, {
      failureKind: normalized?.kind ?? 'unknown',
      retryable: normalized?.retryable ?? false,
      provider: socialAccount?.oauthProvider ?? null,
      platform: socialAccount?.platform ?? post.platform,
      attemptNumber: post.retryCount,
    }, {
      retryCount: post.retryCount,
      retryable: normalized?.retryable ?? false,
    });
  }

  return true;
};

export const processDueScheduledPosts = async (
  options: {
    batchSize?: number;
    now?: Date;
  } = {}
) => {
  const startedAt = Date.now();
  const client = requireSupabaseAdmin();
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const batchSize = Math.max(1, Math.min(options.batchSize ?? SCHEDULER_PROCESS_BATCH_SIZE, 20));
  const stuckCutoff = new Date(
    now.getTime() - SCHEDULER_PROCESSING_TIMEOUT_MS
  ).toISOString();

  logOperationalEvent('scheduler_started', {
    batchSize,
    source: 'internal_endpoint',
  });

  const recovered = await recoverStuckProcessingPosts(client, stuckCutoff, nowIso);

  if (recovered > 0) {
    logOperationalEvent('stuck_post_recovered', {
      recovered,
      cutoff: stuckCutoff,
    }, 'warn');
  }

  const posts = await getDueScheduledPosts(
    client,
    batchSize,
    nowIso,
    SCHEDULER_MAX_RETRY_ATTEMPTS
  );
  let claimed = 0;

  for (const post of posts) {
    try {
      if (await processScheduledPost(post.id, post.userId)) {
        claimed += 1;
      }
    } catch (error) {
      logFailure('post_failed', error, {
        userId: post.userId,
        scheduledPostId: post.id,
        platform: post.platform,
      });
    }
  }

  const durationMs = Date.now() - startedAt;
  logOperationalEvent('scheduler_completed', {
    checked: posts.length,
    claimed,
    recovered,
    durationMs,
  });

  return {
    checked: posts.length,
    claimed,
    recovered,
    durationMs,
  };
};

const hydrateScheduledPublishJobs = async () => {
  const client = requireSupabaseAdmin();
  const { data, error } = await client
    .from('scheduled_posts')
    .select('id, user_id, scheduled_for, status')
    .in('status', ['pending', 'scheduled'])
    .order('scheduled_for', { ascending: true });

  if (error) {
    console.error(
      `[scheduler-publisher] ${error.message || 'Failed to hydrate scheduled publish jobs.'}`
    );
    return;
  }

  const scheduledPosts = (data ?? []) as HydrationScheduledPostRow[];

  await Promise.all(
    scheduledPosts.map((post) =>
      scheduleScheduledPostPublish(
        {
          id: post.id,
          userId: post.user_id,
          scheduledFor: post.scheduled_for,
          status: post.status,
        },
        { preserveExistingSchedule: true }
      ).catch((queueError) => {
        console.error(
          `[scheduler-publisher] ${
            queueError instanceof Error
              ? queueError.message
              : `Failed to hydrate scheduled publish job for ${post.id}.`
          }`
        );
      })
    )
  );
};

export const unscheduleScheduledPostPublish = async (postId: string) => {
  if (!isRedisConfigured) {
    return;
  }

  await removeExistingScheduledPublishJob(postId);
};

export const scheduleScheduledPostPublish = async (
  post: SchedulePublishInput,
  options: {
    preserveExistingSchedule?: boolean;
  } = {}
) => {
  if (!isRedisConfigured) {
    return;
  }

  if (!['pending', 'scheduled'].includes(post.status)) {
    await unscheduleScheduledPostPublish(post.id);
    return;
  }

  const revalidatedPost = await revalidateScheduledPublishInput(post);

  if (!revalidatedPost) {
    return;
  }

  if (
    options.preserveExistingSchedule &&
    (await hasMatchingScheduledPublishJob(revalidatedPost.id, revalidatedPost.scheduledFor))
  ) {
    return;
  }

  await removeExistingScheduledPublishJob(revalidatedPost.id);

  await getSchedulerPublishQueue().add(
    'publish',
    {
      postId: revalidatedPost.id,
      userId: revalidatedPost.userId,
      scheduledFor: revalidatedPost.scheduledFor,
    },
    getPublishJobOptions(revalidatedPost.id, revalidatedPost.scheduledFor)
  );

  logOperationalEvent('scheduler_publish_enqueued', {
    userId: revalidatedPost.userId,
    jobId: getScheduledPublishJobId(revalidatedPost.id),
    queue: QUEUE_NAMES.schedulerPublish,
    scheduledPostId: revalidatedPost.id,
  });

  startSchedulerPublisherWorker({ hydrate: false });
};

export const startSchedulerPublisherWorker = (
  options: {
    hydrate?: boolean;
  } = {}
) => {
  if (
    schedulerPublishWorker ||
    !isSupabaseAdminConfigured ||
    !isMetaOAuthConfigured ||
    !isRedisConfigured
  ) {
    return;
  }

  schedulerPublishWorker = new Worker<SchedulerPublishJobData>(
    QUEUE_NAMES.schedulerPublish,
    async (job) => {
      await processScheduledPost(job.data.postId, job.data.userId);
    },
    {
      ...getBullMqConfig('prixmoai:worker:scheduler-publish'),
      ...getLowCommandWorkerOptions(),
      concurrency: SCHEDULER_PUBLISH_JOB_CONCURRENCY,
    }
  );

  schedulerPublishWorker.on('failed', (job, error) => {
    logFailure('scheduler_publish_worker_failed', error, {
      userId: job?.data.userId ?? null,
      jobId: job?.id ?? null,
      queue: QUEUE_NAMES.schedulerPublish,
      scheduledPostId: job?.data.postId ?? null,
    });
    recordFailureSpikeSignal('scheduler_publish_worker_failed', {
      queue: QUEUE_NAMES.schedulerPublish,
    });
  });

  if (options.hydrate !== false) {
    void hydrateScheduledPublishJobs();
  }
  console.log(
    '[scheduler-publisher] Worker started. Waiting for delayed publish jobs.'
  );
};
