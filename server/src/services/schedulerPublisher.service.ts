import {
  SCHEDULER_PUBLISHER_BATCH_SIZE,
  SCHEDULER_PUBLISHER_POLL_MS,
  isMetaOAuthConfigured,
} from '../config/constants';
import {
  getDueScheduledPosts,
  getScheduledPostById,
  updateScheduledPost,
} from '../db/queries/scheduledPosts';
import { getSocialAccountById } from '../db/queries/socialAccounts';
import {
  isSupabaseAdminConfigured,
  requireSupabaseAdmin,
} from '../db/supabase';
import { syncAnalyticsForUser } from './analyticsSync.service';
import { publishScheduledMetaPost } from './meta.service';

const processingPostIds = new Set<string>();
let pollHandle: NodeJS.Timeout | null = null;
let isTickRunning = false;

const markPostFailure = async (
  postId: string,
  userId: string,
  message: string
) => {
  const client = requireSupabaseAdmin();

  await updateScheduledPost(client, userId, postId, {
    status: 'failed',
    publishAttemptedAt: new Date().toISOString(),
    lastError: message,
    publishedAt: null,
  });
};

const processScheduledPost = async (postId: string, userId: string) => {
  const client = requireSupabaseAdmin();
  const post = await getScheduledPostById(client, userId, postId);

  if (!post || !['pending', 'scheduled'].includes(post.status)) {
    return;
  }

  try {
    const socialAccount = await getSocialAccountById(
      client,
      post.userId,
      post.socialAccountId
    );

    if (!socialAccount) {
      await markPostFailure(post.id, post.userId, 'The connected account could not be found.');
      return;
    }

    if (socialAccount.oauthProvider !== 'meta') {
      await markPostFailure(
        post.id,
        post.userId,
        'PrixmoAI can auto-publish only verified Meta accounts right now. Reconnect this account through Meta first.'
      );
      return;
    }

    const published = await publishScheduledMetaPost(socialAccount, post);

    await updateScheduledPost(client, post.userId, post.id, {
      status: 'published',
      externalPostId: published.externalPostId,
      publishAttemptedAt: published.publishedAt,
      publishedAt: published.publishedAt,
      lastError: null,
    });

    try {
      await syncAnalyticsForUser(client, post.userId, {
        postIds: [post.id],
        socialAccountIds: [socialAccount.id],
        lookbackDays: 7,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Immediate analytics sync failed after publishing.';
      console.error(`[scheduler-publisher] ${message}`);
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'PrixmoAI could not publish that scheduled post.';

    await markPostFailure(postId, userId, message);
  }
};

const tickSchedulerPublisher = async () => {
  if (isTickRunning || !isSupabaseAdminConfigured) {
    return;
  }

  isTickRunning = true;

  try {
    const client = requireSupabaseAdmin();
    const duePosts = await getDueScheduledPosts(client, SCHEDULER_PUBLISHER_BATCH_SIZE);

    for (const post of duePosts) {
      if (processingPostIds.has(post.id)) {
        continue;
      }

      processingPostIds.add(post.id);

      void processScheduledPost(post.id, post.userId).finally(() => {
        processingPostIds.delete(post.id);
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Scheduler publisher tick failed.';
    console.error(`[scheduler-publisher] ${message}`);
  } finally {
    isTickRunning = false;
  }
};

export const startSchedulerPublisherWorker = () => {
  if (pollHandle) {
    return;
  }

  if (!isSupabaseAdminConfigured) {
    console.warn(
      '[scheduler-publisher] Worker is disabled because SUPABASE_SERVICE_ROLE_KEY is missing.'
    );
    return;
  }

  if (!isMetaOAuthConfigured) {
    console.warn(
      '[scheduler-publisher] Worker is waiting for Meta OAuth credentials before it can publish posts.'
    );
    return;
  }

  pollHandle = setInterval(() => {
    void tickSchedulerPublisher();
  }, SCHEDULER_PUBLISHER_POLL_MS);

  void tickSchedulerPublisher();
  console.log(
    `[scheduler-publisher] Worker started. Polling every ${SCHEDULER_PUBLISHER_POLL_MS}ms.`
  );
};
