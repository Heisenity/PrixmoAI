"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSchedulerPublisherWorker = exports.scheduleScheduledPostPublish = exports.unscheduleScheduledPostPublish = void 0;
const bullmq_1 = require("bullmq");
const constants_1 = require("../config/constants");
const scheduledPosts_1 = require("../db/queries/scheduledPosts");
const scheduleBatches_1 = require("../db/queries/scheduleBatches");
const socialAccounts_1 = require("../db/queries/socialAccounts");
const supabase_1 = require("../db/supabase");
const analyticsSync_service_1 = require("./analyticsSync.service");
const meta_service_1 = require("./meta.service");
const redis_1 = require("../lib/redis");
const queueNames_1 = require("../queues/queueNames");
const workerOptions_1 = require("../queues/workerOptions");
const FAILED_JOB_RETENTION_SECONDS = 60 * 60;
const JOB_TIME_TOLERANCE_MS = 1000;
let schedulerPublishQueue = null;
let schedulerPublishWorker = null;
const getScheduledPublishJobId = (postId) => `scheduled-post-${postId}`;
const getSchedulerPublishQueue = () => {
    if (!schedulerPublishQueue) {
        schedulerPublishQueue = new bullmq_1.Queue(queueNames_1.QUEUE_NAMES.schedulerPublish, (0, redis_1.getBullMqConfig)('prixmoai:queue:scheduler-publish'));
    }
    return schedulerPublishQueue;
};
const getPublishJobTargetTimestamp = (scheduledFor, delayMs) => {
    const scheduledAtMs = new Date(scheduledFor).getTime();
    if (Number.isFinite(scheduledAtMs)) {
        return scheduledAtMs;
    }
    return Date.now() + delayMs;
};
const getPublishJobOptions = (postId, scheduledFor) => {
    const scheduledAtMs = new Date(scheduledFor).getTime();
    const delayMs = Number.isFinite(scheduledAtMs)
        ? Math.max(0, scheduledAtMs - Date.now())
        : 0;
    return {
        jobId: getScheduledPublishJobId(postId),
        delay: delayMs,
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: {
            age: FAILED_JOB_RETENTION_SECONDS,
            count: 100,
        },
    };
};
const removeExistingScheduledPublishJob = async (postId) => {
    const job = await getSchedulerPublishQueue().getJob(getScheduledPublishJobId(postId));
    if (!job) {
        return;
    }
    const state = await job.getState();
    if (state === 'waiting' ||
        state === 'delayed' ||
        state === 'prioritized') {
        await job.remove();
    }
};
const hasMatchingScheduledPublishJob = async (postId, scheduledFor) => {
    const job = await getSchedulerPublishQueue().getJob(getScheduledPublishJobId(postId));
    if (!job) {
        return false;
    }
    const state = await job.getState();
    if (state !== 'waiting' &&
        state !== 'delayed' &&
        state !== 'prioritized') {
        return false;
    }
    const expected = new Date(scheduledFor).getTime();
    if (!Number.isFinite(expected)) {
        return true;
    }
    const actual = getPublishJobTargetTimestamp(job.data.scheduledFor, typeof job.opts.delay === 'number' ? job.opts.delay : 0);
    return Math.abs(actual - expected) <= JOB_TIME_TOLERANCE_MS;
};
const markPostFailure = async (postId, userId, message) => {
    const client = (0, supabase_1.requireSupabaseAdmin)();
    await (0, scheduledPosts_1.updateScheduledPost)(client, userId, postId, {
        status: 'failed',
        publishAttemptedAt: new Date().toISOString(),
        lastError: message,
        publishedAt: null,
    });
    const syncedItems = await (0, scheduleBatches_1.syncScheduledItemStatusByScheduledPostId)(client, postId, {
        status: 'failed',
        lastError: message,
    }).catch(() => []);
    await Promise.all(syncedItems.map((item) => (0, scheduleBatches_1.appendScheduledItemLog)(client, {
        scheduledItemId: item.id,
        eventType: 'publish_failed',
        message,
    }).catch(() => null)));
};
const processScheduledPost = async (postId, userId) => {
    const client = (0, supabase_1.requireSupabaseAdmin)();
    const post = await (0, scheduledPosts_1.getScheduledPostById)(client, userId, postId);
    if (!post || !['pending', 'scheduled'].includes(post.status)) {
        return;
    }
    try {
        await (0, scheduleBatches_1.syncScheduledItemStatusByScheduledPostId)(client, post.id, {
            status: 'publishing',
            attemptCount: post.publishAttemptedAt ? 1 : 1,
            lastError: null,
        }).catch(() => []);
        const socialAccount = await (0, socialAccounts_1.getSocialAccountById)(client, post.userId, post.socialAccountId);
        if (!socialAccount) {
            await markPostFailure(post.id, post.userId, 'The connected account could not be found.');
            return;
        }
        if (socialAccount.oauthProvider !== 'meta') {
            await markPostFailure(post.id, post.userId, 'PrixmoAI can auto-publish only verified Meta accounts right now. Reconnect this account through Meta first.');
            return;
        }
        const published = await (0, meta_service_1.publishScheduledMetaPost)(socialAccount, post);
        await (0, scheduledPosts_1.updateScheduledPost)(client, post.userId, post.id, {
            status: 'published',
            externalPostId: published.externalPostId,
            publishAttemptedAt: published.publishedAt,
            publishedAt: published.publishedAt,
            lastError: null,
        });
        const syncedItems = await (0, scheduleBatches_1.syncScheduledItemStatusByScheduledPostId)(client, post.id, {
            status: 'published',
            attemptCount: 1,
            lastError: null,
        }).catch(() => []);
        await Promise.all(syncedItems.map((item) => (0, scheduleBatches_1.appendScheduledItemLog)(client, {
            scheduledItemId: item.id,
            eventType: 'published',
            message: 'Scheduled item published successfully.',
            payloadJson: {
                externalPostId: published.externalPostId,
                publishedAt: published.publishedAt,
            },
        }).catch(() => null)));
        try {
            await (0, analyticsSync_service_1.enqueueAnalyticsSyncJob)({
                userId: post.userId,
                postIds: [post.id],
                socialAccountIds: [socialAccount.id],
                lookbackDays: 7,
            });
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : 'Immediate analytics sync failed after publishing.';
            console.error(`[scheduler-publisher] ${message}`);
        }
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : 'PrixmoAI could not publish that scheduled post.';
        await markPostFailure(postId, userId, message);
    }
};
const hydrateScheduledPublishJobs = async () => {
    const client = (0, supabase_1.requireSupabaseAdmin)();
    const { data, error } = await client
        .from('scheduled_posts')
        .select('id, user_id, scheduled_for, status')
        .in('status', ['pending', 'scheduled'])
        .order('scheduled_for', { ascending: true });
    if (error) {
        console.error(`[scheduler-publisher] ${error.message || 'Failed to hydrate scheduled publish jobs.'}`);
        return;
    }
    const scheduledPosts = (data ?? []);
    await Promise.all(scheduledPosts.map((post) => (0, exports.scheduleScheduledPostPublish)({
        id: post.id,
        userId: post.user_id,
        scheduledFor: post.scheduled_for,
        status: post.status,
    }, { preserveExistingSchedule: true }).catch((queueError) => {
        console.error(`[scheduler-publisher] ${queueError instanceof Error
            ? queueError.message
            : `Failed to hydrate scheduled publish job for ${post.id}.`}`);
    })));
};
const unscheduleScheduledPostPublish = async (postId) => {
    if (!redis_1.isRedisConfigured) {
        return;
    }
    await removeExistingScheduledPublishJob(postId);
};
exports.unscheduleScheduledPostPublish = unscheduleScheduledPostPublish;
const scheduleScheduledPostPublish = async (post, options = {}) => {
    if (!redis_1.isRedisConfigured) {
        return;
    }
    if (!['pending', 'scheduled'].includes(post.status)) {
        await (0, exports.unscheduleScheduledPostPublish)(post.id);
        return;
    }
    if (options.preserveExistingSchedule &&
        (await hasMatchingScheduledPublishJob(post.id, post.scheduledFor))) {
        return;
    }
    await removeExistingScheduledPublishJob(post.id);
    await getSchedulerPublishQueue().add('publish', {
        postId: post.id,
        userId: post.userId,
        scheduledFor: post.scheduledFor,
    }, getPublishJobOptions(post.id, post.scheduledFor));
    (0, exports.startSchedulerPublisherWorker)({ hydrate: false });
};
exports.scheduleScheduledPostPublish = scheduleScheduledPostPublish;
const startSchedulerPublisherWorker = (options = {}) => {
    if (schedulerPublishWorker ||
        !supabase_1.isSupabaseAdminConfigured ||
        !constants_1.isMetaOAuthConfigured ||
        !redis_1.isRedisConfigured) {
        return;
    }
    schedulerPublishWorker = new bullmq_1.Worker(queueNames_1.QUEUE_NAMES.schedulerPublish, async (job) => {
        await processScheduledPost(job.data.postId, job.data.userId);
    }, {
        ...(0, redis_1.getBullMqConfig)('prixmoai:worker:scheduler-publish'),
        ...(0, workerOptions_1.getLowCommandWorkerOptions)(),
        concurrency: constants_1.SCHEDULER_PUBLISH_JOB_CONCURRENCY,
    });
    if (options.hydrate !== false) {
        void hydrateScheduledPublishJobs();
    }
    console.log('[scheduler-publisher] Worker started. Waiting for delayed publish jobs.');
};
exports.startSchedulerPublisherWorker = startSchedulerPublisherWorker;
