"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSchedulerPublisherWorker = void 0;
const constants_1 = require("../config/constants");
const scheduledPosts_1 = require("../db/queries/scheduledPosts");
const socialAccounts_1 = require("../db/queries/socialAccounts");
const supabase_1 = require("../db/supabase");
const meta_service_1 = require("./meta.service");
const processingPostIds = new Set();
let pollHandle = null;
let isTickRunning = false;
const markPostFailure = async (postId, userId, message) => {
    const client = (0, supabase_1.requireSupabaseAdmin)();
    await (0, scheduledPosts_1.updateScheduledPost)(client, userId, postId, {
        status: 'failed',
        publishAttemptedAt: new Date().toISOString(),
        lastError: message,
        publishedAt: null,
    });
};
const processScheduledPost = async (postId, userId) => {
    const client = (0, supabase_1.requireSupabaseAdmin)();
    const post = await (0, scheduledPosts_1.getScheduledPostById)(client, userId, postId);
    if (!post || !['pending', 'scheduled'].includes(post.status)) {
        return;
    }
    try {
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
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : 'PrixmoAI could not publish that scheduled post.';
        await markPostFailure(postId, userId, message);
    }
};
const tickSchedulerPublisher = async () => {
    if (isTickRunning || !supabase_1.isSupabaseAdminConfigured) {
        return;
    }
    isTickRunning = true;
    try {
        const client = (0, supabase_1.requireSupabaseAdmin)();
        const duePosts = await (0, scheduledPosts_1.getDueScheduledPosts)(client, constants_1.SCHEDULER_PUBLISHER_BATCH_SIZE);
        for (const post of duePosts) {
            if (processingPostIds.has(post.id)) {
                continue;
            }
            processingPostIds.add(post.id);
            void processScheduledPost(post.id, post.userId).finally(() => {
                processingPostIds.delete(post.id);
            });
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Scheduler publisher tick failed.';
        console.error(`[scheduler-publisher] ${message}`);
    }
    finally {
        isTickRunning = false;
    }
};
const startSchedulerPublisherWorker = () => {
    if (pollHandle) {
        return;
    }
    if (!supabase_1.isSupabaseAdminConfigured) {
        console.warn('[scheduler-publisher] Worker is disabled because SUPABASE_SERVICE_ROLE_KEY is missing.');
        return;
    }
    if (!constants_1.isMetaOAuthConfigured) {
        console.warn('[scheduler-publisher] Worker is waiting for Meta OAuth credentials before it can publish posts.');
        return;
    }
    pollHandle = setInterval(() => {
        void tickSchedulerPublisher();
    }, constants_1.SCHEDULER_PUBLISHER_POLL_MS);
    void tickSchedulerPublisher();
    console.log(`[scheduler-publisher] Worker started. Polling every ${constants_1.SCHEDULER_PUBLISHER_POLL_MS}ms.`);
};
exports.startSchedulerPublisherWorker = startSchedulerPublisherWorker;
