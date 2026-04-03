import { randomBytes } from 'crypto';
import { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { getGeneratedContentById } from '../db/queries/content';
import { getGeneratedImageById } from '../db/queries/images';
import {
  appendScheduledItemLog,
  createMediaAsset,
  createScheduleBatch,
  createScheduledItem,
  deleteScheduleBatch,
  getMediaAssetById,
  getScheduleBatchesByUser,
  getScheduleBatchById,
  getScheduleBatchDetail,
  getScheduledItemById,
  getScheduledItemsByBatch,
  getScheduledItemsByUser,
  syncScheduledItemStatusByScheduledPostId,
  updateScheduleBatch,
  updateScheduledItem,
} from '../db/queries/scheduleBatches';
import {
  SCHEDULED_POST_ACTION_BLOCKED_REASON,
  createScheduledPost,
  deleteScheduledPost,
  getScheduledPostById,
  getScheduledPostsByUser,
  updateScheduledPost,
  updateScheduledPostStatus,
} from '../db/queries/scheduledPosts';
import {
  createOAuthConnectionSession,
  deleteOAuthConnectionSession,
  getOAuthConnectionSessionById,
} from '../db/queries/oauthConnectionSessions';
import {
  createSocialAccount,
  deleteSocialAccount,
  getSocialAccountById,
  getSocialAccountCountByUser,
  getSocialAccountByUserAndPlatformAndAccountId,
  getSocialAccountsByUser,
  upsertSocialAccountByUniqueKey,
  updateSocialAccount,
} from '../db/queries/socialAccounts';
import { getFeatureLimit } from '../db/queries/subscriptions';
import { requireSupabaseAdmin, requireUserClient } from '../db/supabase';
import {
  CLIENT_APP_URL,
  FEATURE_KEYS,
  isMetaFacebookOAuthConfigured,
  isMetaInstagramOAuthConfigured,
  META_FACEBOOK_REDIRECT_URI,
  META_INSTAGRAM_REDIRECT_URI,
  META_OAUTH_STATE_TTL_MS,
  SUPABASE_SOURCE_IMAGE_BUCKET,
} from '../config/constants';
import type {
  CreateMediaAssetInput,
  MediaAsset,
  CreateSocialAccountInput,
  ScheduleBatchStatus,
  SchedulerMediaType,
  SocialPlatform,
} from '../types';
import type {
  AddBatchItemsBody,
  CreateMediaAssetBody,
  CreateScheduleBatchBody,
  CreateScheduledPostBody,
  CreateScheduledItemBody,
  CreateSocialAccountBody,
  FinalizeMetaFacebookPagesBody,
  ListScheduleBatchesQuery,
  ListScheduledItemsQuery,
  StartMetaOAuthBody,
  UpdateScheduledItemBody,
  UpdateScheduledPostBody,
  UpdateScheduledPostStatusBody,
  UpdateSocialAccountBody,
} from '../schemas/scheduler.schema';
import {
  buildFacebookNoPagesMessage,
  buildMetaOAuthUrl,
  createSignedMetaOAuthState,
  exchangeMetaAuthorizationCode,
  getMetaOAuthFacebookPageSelectionRedirectUrl,
  getMetaOAuthErrorRedirectUrl,
  getMetaOAuthSuccessRedirectUrl,
  readSignedMetaOAuthState,
  verifyClaimedMetaAccount,
} from '../services/meta.service';
import { importExternalSourceImage } from '../services/storage.service';

type AuthenticatedRequest<
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = Request<Params, ResBody, ReqBody, ReqQuery> & {
  user?: User;
  accessToken?: string;
};

const parsePositiveInt = (value: unknown, fallback: number): number => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const RESERVED_PROFILE_SEGMENTS = new Set([
  'p',
  'reel',
  'reels',
  'stories',
  'explore',
  'watch',
  'groups',
  'marketplace',
  'events',
  'home',
  'search',
  'i',
  'intent',
  'share',
  'hashtag',
]);
const SCHEDULE_MIN_BUFFER_MS = 5_000;
const SCHEDULE_TIME_VALIDATION_MESSAGE = 'Scheduled time must be in the future';
const INSTAGRAM_FEED_MIN_RATIO = 0.8;
const INSTAGRAM_FEED_MAX_RATIO = 1.91;
const INSTAGRAM_REELS_TARGET_RATIO = 9 / 16;
const INSTAGRAM_REELS_TOLERANCE = 0.08;

type MetaInstagramAccountRecord = {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
};

type MetaPageRecord = {
  id: string;
  name: string;
  link?: string;
  access_token?: string;
  instagram_business_account?: MetaInstagramAccountRecord | null;
  connected_instagram_account?: MetaInstagramAccountRecord | null;
};

type PendingFacebookPageSelectionPayload = {
  metaUser: {
    id: string;
    name?: string | null;
  };
  longLivedUserToken: string;
  tokenExpiresAt: string | null;
  pages: MetaPageRecord[];
};

type PendingFacebookPageCandidate = {
  pageId: string;
  accountId: string;
  accountName: string;
  profileUrl: string | null;
  alreadyConnected: boolean;
  linkedInstagramUsername: string | null;
};

type MetaOAuthPopupResult =
  | {
      status: 'success';
      message: string;
    }
  | {
      status: 'error';
      message: string;
    }
  | {
      status: 'select_facebook_pages';
      message: string;
      selectionId: string;
    };

const META_OAUTH_POPUP_MESSAGE_TYPE = 'prixmoai:meta-oauth';

const SCHEDULER_ACTIONABLE_STATUSES = new Set(['pending', 'scheduled']);

const coerceProfileValue = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const ensureScheduledPostCanBeEdited = (
  post: Pick<
    import('../types').ScheduledPost,
    'status' | 'canEdit' | 'actionBlockedReason'
  >
) => {
  if (!SCHEDULER_ACTIONABLE_STATUSES.has(post.status)) {
    throw new Error('Only pending or scheduled posts can be edited.');
  }

  if (!post.canEdit) {
    throw new Error(post.actionBlockedReason || SCHEDULED_POST_ACTION_BLOCKED_REASON);
  }
};

const ensureScheduledPostCanBeCancelled = (
  post: Pick<
    import('../types').ScheduledPost,
    'status' | 'canCancel' | 'actionBlockedReason'
  >
) => {
  if (!SCHEDULER_ACTIONABLE_STATUSES.has(post.status)) {
    throw new Error('Only pending or scheduled posts can be cancelled.');
  }

  if (!post.canCancel) {
    throw new Error(post.actionBlockedReason || SCHEDULED_POST_ACTION_BLOCKED_REASON);
  }
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const readMetaInstagramAccountFromPage = (page: MetaPageRecord) =>
  page.instagram_business_account ?? page.connected_instagram_account ?? null;

const readPendingFacebookPageSelectionPayload = (
  value: Record<string, unknown>
): PendingFacebookPageSelectionPayload | null => {
  const payload = toRecord(value);
  const metaUser = toRecord(payload.metaUser);
  const longLivedUserToken = readString(payload.longLivedUserToken);
  const metaUserId = readString(metaUser.id);
  const pages = Array.isArray(payload.pages)
    ? payload.pages.filter(
        (entry): entry is MetaPageRecord =>
          Boolean(toRecord(entry).id) && Boolean(toRecord(entry).name)
      )
    : [];

  if (!longLivedUserToken || !metaUserId || !pages.length) {
    return null;
  }

  return {
    metaUser: {
      id: metaUserId,
      name: readString(metaUser.name),
    },
    longLivedUserToken,
    tokenExpiresAt: readString(payload.tokenExpiresAt),
    pages,
  };
};

const loadPendingFacebookPageCandidates = async (
  client: ReturnType<typeof requireUserClient>,
  userId: string,
  pages: MetaPageRecord[]
): Promise<PendingFacebookPageCandidate[]> =>
  Promise.all(
    pages
      .filter((page) => Boolean(page.access_token))
      .map(async (page) => {
        const accountId = extractFacebookPageIdentifier(page.link, page.id);
        const existingAccount = await getSocialAccountByUserAndPlatformAndAccountId(
          client,
          userId,
          'facebook',
          accountId
        );
        const linkedInstagramAccount = readMetaInstagramAccountFromPage(page);

        return {
          pageId: page.id,
          accountId,
          accountName: page.name,
          profileUrl: coerceProfileValue(page.link) ?? null,
          alreadyConnected: Boolean(existingAccount),
          linkedInstagramUsername: linkedInstagramAccount?.username ?? null,
        };
      })
  );

const extractFacebookPageIdentifier = (link?: string | null, fallbackId?: string) => {
  if (link) {
    try {
      const url = new URL(link);
      const firstSegment = url.pathname.split('/').filter(Boolean)[0];
      const queryId = url.searchParams.get('id');
      const candidate = firstSegment || queryId;

      if (candidate) {
        return normalizeAccountId('facebook', candidate);
      }
    } catch {
      // Ignore malformed URLs from provider metadata and fall back to page ID.
    }
  }

  if (fallbackId) {
    return normalizeAccountId('facebook', fallbackId);
  }

  throw new Error('Meta did not return a usable Facebook Page identifier.');
};

const buildFacebookSocialAccountFromMetaPage = (
  page: MetaPageRecord,
  userToken: string,
  tokenExpiresAt: string | null,
  metaUser?: { id?: string; name?: string | null }
): CreateSocialAccountInput => {
  const accountId = extractFacebookPageIdentifier(page.link, page.id);
  const profileUrl = coerceProfileValue(page.link) ?? null;

  return {
    platform: 'facebook',
    accountId,
    accountName: page.name,
    profileUrl,
    oauthProvider: 'meta',
    verificationStatus: 'verified',
    verifiedAt: new Date().toISOString(),
    accessToken: page.access_token ?? null,
    refreshToken: userToken,
    tokenExpiresAt,
    metadata: {
      connectionSource: 'meta_oauth',
      oauthApp: 'facebook',
      metaUserId: metaUser?.id ?? null,
      metaUserName: metaUser?.name ?? null,
      metaPageId: page.id,
      metaPageName: page.name,
      profileUrl,
      verificationClaim: {
        accountId: accountId,
        profileUrl,
      },
    },
  };
};

const toDisplayLabel = (platform: SocialPlatform, accountId: string) => {
  const normalized = accountId.trim();

  if (platform === 'instagram' || platform === 'x') {
    return normalized.startsWith('@') ? normalized : `@${normalized}`;
  }

  if (/^\d+$/.test(normalized)) {
    return normalized;
  }

  return normalized
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
};

const normalizeAccountId = (platform: SocialPlatform, value: string) => {
  const trimmed = value.trim().replace(/^@+/, '');
  const normalized = /^(instagram|linkedin|x)$/.test(platform)
    ? trimmed.toLowerCase()
    : trimmed;

  if (!normalized) {
    throw new Error('Add a valid profile ID');
  }

  return normalized;
};

const parseSocialProfileUrl = (platform: SocialPlatform, profileUrl: string) => {
  let parsed: URL;

  try {
    parsed = new URL(profileUrl);
  } catch {
    throw new Error('Please enter a valid profile URL');
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  const primarySegment = pathSegments[0]?.toLowerCase() ?? '';

  const failForPlatform = () => {
    throw new Error(`Use a valid ${platform} profile URL`);
  };

  if (platform === 'instagram') {
    if (host !== 'instagram.com' || !primarySegment || RESERVED_PROFILE_SEGMENTS.has(primarySegment)) {
      failForPlatform();
    }

    const accountId = normalizeAccountId(platform, primarySegment);
    return { accountId, accountName: toDisplayLabel(platform, accountId), profileUrl: parsed.toString() };
  }

  if (platform === 'facebook') {
    const isFacebookHost = ['facebook.com', 'fb.com', 'm.facebook.com'].includes(host);
    if (!isFacebookHost) {
      failForPlatform();
    }

    const profileIdFromQuery =
      primarySegment === 'profile.php' ? parsed.searchParams.get('id') : null;
    const rawIdentifier = profileIdFromQuery ?? primarySegment;

    if (!rawIdentifier || RESERVED_PROFILE_SEGMENTS.has(rawIdentifier.toLowerCase())) {
      failForPlatform();
    }

    const accountId = normalizeAccountId(platform, rawIdentifier);
    return { accountId, accountName: toDisplayLabel(platform, accountId), profileUrl: parsed.toString() };
  }

  if (platform === 'linkedin') {
    if (host !== 'linkedin.com') {
      failForPlatform();
    }

    const entityType = primarySegment;
    const slug = pathSegments[1];

    if (!['in', 'company', 'school'].includes(entityType) || !slug) {
      failForPlatform();
    }

    const accountId = normalizeAccountId(platform, slug);
    return { accountId, accountName: toDisplayLabel(platform, accountId), profileUrl: parsed.toString() };
  }

  const isXHost = host === 'x.com' || host === 'twitter.com';
  if (!isXHost || !primarySegment || RESERVED_PROFILE_SEGMENTS.has(primarySegment)) {
    failForPlatform();
  }

  const accountId = normalizeAccountId(platform, primarySegment);
  return { accountId, accountName: toDisplayLabel(platform, accountId), profileUrl: parsed.toString() };
};

const resolveSocialAccountInput = (
  input: {
    platform: SocialPlatform;
    accountId?: string;
    profileUrl?: string;
    metadata?: Record<string, unknown>;
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenExpiresAt?: string | null;
  }
): CreateSocialAccountInput => {
  const profileUrl = coerceProfileValue(input.profileUrl);
  const providedAccountId = coerceProfileValue(input.accountId);

  if (profileUrl) {
    const resolved = parseSocialProfileUrl(input.platform, profileUrl);

    return {
      platform: input.platform,
      accountId: resolved.accountId,
      accountName: resolved.accountName,
      profileUrl: resolved.profileUrl,
      accessToken: input.accessToken ?? null,
      refreshToken: input.refreshToken ?? null,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      metadata: {
        ...(input.metadata ?? {}),
        profileUrl: resolved.profileUrl,
        connectionSource: 'profile_url',
      },
    };
  }

  if (!providedAccountId) {
    throw new Error('Add a profile URL or a profile ID');
  }

  const accountId = normalizeAccountId(input.platform, providedAccountId);

  return {
    platform: input.platform,
    accountId,
    accountName: toDisplayLabel(input.platform, accountId),
    profileUrl: null,
    accessToken: input.accessToken ?? null,
    refreshToken: input.refreshToken ?? null,
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    metadata: {
      ...(input.metadata ?? {}),
      connectionSource: 'profile_id',
    },
  };
};

const ensureMetaScheduledPostCanPublish = (
  platform: string | null | undefined,
  socialAccount: Awaited<ReturnType<typeof getSocialAccountById>>,
  mediaUrl: string | null,
  mediaType: SchedulerMediaType | null
) => {
  if (!socialAccount || socialAccount.oauthProvider !== 'meta') {
    return;
  }

  if (socialAccount.verificationStatus !== 'verified') {
    throw new Error('Reconnect this Meta account before queueing live publishing.');
  }

  if (platform === 'instagram' && (!mediaUrl || !mediaType)) {
    throw new Error(
      'Instagram scheduled posts need media before PrixmoAI can publish them.'
    );
  }
};

const ensureScheduledPostHasMedia = (
  mediaUrl: string | null,
  mediaType: SchedulerMediaType | null
) => {
  if (!mediaUrl || !mediaType) {
    throw new Error('Add image or video media before scheduling this post.');
  }
};

const readRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readInstagramPreparationWarning = (mediaAsset: MediaAsset) => {
  const metadata = readRecord(mediaAsset.metadata);
  const instagramPreparation = readRecord(metadata.instagramPreparation);
  const warning = instagramPreparation.warning;

  return typeof warning === 'string' && warning.trim() ? warning : null;
};

const isInstagramVideoAspectRatioSupported = (ratio: number) =>
  (ratio >= INSTAGRAM_FEED_MIN_RATIO && ratio <= INSTAGRAM_FEED_MAX_RATIO) ||
  Math.abs(ratio - INSTAGRAM_REELS_TARGET_RATIO) <= INSTAGRAM_REELS_TOLERANCE;

const ensureInstagramMediaAssetReady = (mediaAsset: MediaAsset) => {
  if (!mediaAsset.width || !mediaAsset.height) {
    return;
  }

  const ratio = mediaAsset.width / mediaAsset.height;

  if (mediaAsset.mediaType === 'image') {
    if (ratio >= INSTAGRAM_FEED_MIN_RATIO && ratio <= INSTAGRAM_FEED_MAX_RATIO) {
      return;
    }

    const metadata = readRecord(mediaAsset.metadata);
    const instagramPreparation = readRecord(metadata.instagramPreparation);

    if (instagramPreparation.status === 'adjusted') {
      return;
    }

    throw new Error(
      'This image aspect ratio is not supported by Instagram yet. PrixmoAI needs to auto-adjust it before scheduling.'
    );
  }

  if (mediaAsset.mediaType === 'video' && !isInstagramVideoAspectRatioSupported(ratio)) {
    throw new Error(
      readInstagramPreparationWarning(mediaAsset) ||
        'This Instagram video needs a supported aspect ratio before it can be scheduled.'
    );
  }
};

const ensureFutureDate = (isoDate: string, fieldName = 'scheduledFor') => {
  const parsed = new Date(isoDate);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${fieldName} value`);
  }

  if (parsed.getTime() <= Date.now() + SCHEDULE_MIN_BUFFER_MS) {
    throw new Error(SCHEDULE_TIME_VALIDATION_MESSAGE);
  }
};

const serializeForInlineScript = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

const isManagedSchedulerMediaUrl = (value: string) =>
  value.includes(`/storage/v1/object/public/${SUPABASE_SOURCE_IMAGE_BUCKET}/`);

const inferManagedMediaTypeFromUrl = (
  value: string
): SchedulerMediaType | null => {
  const normalized = value.toLowerCase();

  if (
    normalized.includes('.mp4') ||
    normalized.includes('.mov') ||
    normalized.includes('video/')
  ) {
    return 'video';
  }

  if (
    normalized.includes('.jpg') ||
    normalized.includes('.jpeg') ||
    normalized.includes('.png') ||
    normalized.includes('.webp') ||
    normalized.includes('image/')
  ) {
    return 'image';
  }

  return null;
};

const resolveSchedulerMediaUrl = async (
  userId: string,
  mediaUrl: string | null | undefined,
  mediaType?: SchedulerMediaType | null
) => {
  const normalized = coerceProfileValue(mediaUrl);

  if (!normalized) {
    return {
      mediaUrl: null,
      mediaType: null,
    };
  }

  if (isManagedSchedulerMediaUrl(normalized)) {
    return {
      mediaUrl: normalized,
      mediaType: mediaType ?? inferManagedMediaTypeFromUrl(normalized),
    };
  }

  const imported = await importExternalSourceImage(userId, normalized);
  return {
    mediaUrl: imported.publicUrl,
    mediaType: imported.mediaType,
  };
};

const buildMetaOAuthPopupCsp = (nonce: string) =>
  [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "img-src 'none'",
    "font-src 'none'",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

const applyMetaOAuthPopupHeaders = (res: Response, nonce: string) => {
  // This callback page needs an inline script to post the OAuth result back to
  // the opener, and it must not opt into COOP isolation or the popup/opener
  // bridge breaks across the ngrok-to-localhost origin boundary.
  res.set({
    'Cache-Control': 'no-store, max-age=0',
    'Content-Security-Policy': buildMetaOAuthPopupCsp(nonce),
    'Cross-Origin-Embedder-Policy': 'unsafe-none',
    'Cross-Origin-Opener-Policy': 'unsafe-none',
    Pragma: 'no-cache',
  });
};

const buildMetaOAuthPopupHtml = (
  payload: MetaOAuthPopupResult,
  fallbackRedirectUrl: string,
  nonce: string
) => {
  const targetOrigin = new URL(CLIENT_APP_URL).origin;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PrixmoAI Connection</title>
    <style nonce="${nonce}">
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b1018;
        color: #f5f7fb;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .panel {
        width: min(420px, calc(100vw - 48px));
        padding: 28px 24px;
        border-radius: 24px;
        background: rgba(18, 24, 36, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35);
        text-align: center;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 22px;
      }
      p {
        margin: 0;
        line-height: 1.6;
        color: rgba(232, 237, 248, 0.78);
      }
      a {
        color: #93c5fd;
      }
    </style>
  </head>
  <body>
    <div class="panel">
      <h1>Returning to PrixmoAI…</h1>
      <p>You can close this window if it does not close automatically.</p>
    </div>
    <script nonce="${nonce}">
      (function () {
        var payload = ${serializeForInlineScript({
          type: META_OAUTH_POPUP_MESSAGE_TYPE,
          result: payload,
          ...payload,
        })};
        var fallbackRedirectUrl = ${serializeForInlineScript(fallbackRedirectUrl)};
        var targetOrigin = ${serializeForInlineScript(targetOrigin)};

        if (window.opener && typeof window.opener.postMessage === 'function') {
          window.opener.postMessage(payload, targetOrigin);
          window.setTimeout(function () {
            try {
              window.close();
            } catch (error) {
              // Ignore close failures and fall back to redirect below.
            }
          }, 40);
          window.setTimeout(function () {
            if (!window.closed) {
              window.location.replace(fallbackRedirectUrl);
            }
          }, 300);
          return;
        }

        window.location.replace(fallbackRedirectUrl);
      })();
    </script>
  </body>
</html>`;
};

const respondWithMetaOAuthResult = (
  res: Response,
  responseMode: 'popup' | 'redirect' | undefined,
  payload: MetaOAuthPopupResult
) => {
  const fallbackRedirectUrl =
    payload.status === 'error'
      ? getMetaOAuthErrorRedirectUrl(payload.message)
      : payload.status === 'select_facebook_pages'
        ? getMetaOAuthFacebookPageSelectionRedirectUrl(
            payload.selectionId,
            payload.message
          )
        : getMetaOAuthSuccessRedirectUrl(payload.message);

  if (responseMode === 'popup') {
    const nonce = randomBytes(16).toString('base64');

    applyMetaOAuthPopupHeaders(res, nonce);

    return res
      .status(200)
      .type('html')
      .send(buildMetaOAuthPopupHtml(payload, fallbackRedirectUrl, nonce));
  }

  return res.redirect(302, fallbackRedirectUrl);
};

const resolveScheduledPostDefaults = async (
  client: ReturnType<typeof requireUserClient>,
  userId: string,
  input: {
    socialAccountId: string;
    contentId?: string | null;
    generatedImageId?: string | null;
    platform?: string | null;
    caption?: string | null;
    mediaUrl?: string | null;
    mediaType?: SchedulerMediaType | null;
  }
): Promise<{
  socialAccount: NonNullable<Awaited<ReturnType<typeof getSocialAccountById>>>;
  content: Awaited<ReturnType<typeof getGeneratedContentById>>;
  image: Awaited<ReturnType<typeof getGeneratedImageById>>;
  platform: string | null;
  caption: string | null;
  mediaUrl: string | null;
  mediaType: SchedulerMediaType | null;
}> => {
  const socialAccount = await getSocialAccountById(
    client,
    userId,
    input.socialAccountId
  );

  if (!socialAccount) {
    throw new Error('Social account not found');
  }

  const content = input.contentId
    ? await getGeneratedContentById(client, userId, input.contentId)
    : null;

  if (input.contentId && !content) {
    throw new Error('Generated content item not found');
  }

  const image = input.generatedImageId
    ? await getGeneratedImageById(client, userId, input.generatedImageId)
    : null;

  if (input.generatedImageId && !image) {
    throw new Error('Generated image item not found');
  }

  const resolvedMedia =
    input.mediaUrl === undefined
      ? {
          mediaUrl: image?.generatedImageUrl ?? null,
          mediaType: (image?.generatedImageUrl ? 'image' : null) as SchedulerMediaType | null,
        }
      : await resolveSchedulerMediaUrl(userId, input.mediaUrl, input.mediaType);

  return {
    socialAccount,
    content,
    image,
    platform: input.platform ?? socialAccount.platform,
    caption:
      input.caption === undefined
        ? content?.captions?.[0]?.mainCopy ?? null
        : input.caption,
    mediaUrl: resolvedMedia.mediaUrl,
    mediaType: resolvedMedia.mediaType,
  };
};

const deriveScheduleBatchStatus = (
  statuses: string[],
  currentStatus?: ScheduleBatchStatus
): ScheduleBatchStatus => {
  if (!statuses.length) {
    return currentStatus ?? 'draft';
  }

  const nonCancelled = statuses.filter((status) => status !== 'cancelled');

  if (!nonCancelled.length) {
    return 'failed';
  }

  if (nonCancelled.every((status) => status === 'published')) {
    return 'completed';
  }

  if (nonCancelled.every((status) => status === 'failed')) {
    return 'failed';
  }

  if (
    nonCancelled.some((status) => status === 'published') &&
    nonCancelled.some((status) => status !== 'published')
  ) {
    return 'partial';
  }

  if (
    nonCancelled.some((status) =>
      ['scheduled', 'pending', 'publishing'].includes(status)
    )
  ) {
    if (
      currentStatus === 'draft' &&
      nonCancelled.every((status) => status === 'pending')
    ) {
      return 'draft';
    }

    return 'queued';
  }

  return currentStatus ?? 'draft';
};

const syncBatchStatusFromItems = async (
  client: ReturnType<typeof requireUserClient>,
  userId: string,
  batchId: string
) => {
  const detail = await getScheduleBatchDetail(client, userId, batchId);

  if (!detail) {
    return null;
  }

  const nextStatus = deriveScheduleBatchStatus(
    detail.items.map((item) => item.status),
    detail.batch.status
  );

  if (nextStatus !== detail.batch.status) {
    return await updateScheduleBatch(client, userId, batchId, {
      status: nextStatus,
    });
  }

  return detail.batch;
};

const assertNoDuplicateScheduledItems = (
  items: Array<{
    mediaAssetId: string;
    socialAccountId: string;
    scheduledAt: string;
  }>
) => {
  const seen = new Set<string>();

  for (const item of items) {
    const key = `${item.mediaAssetId}:${item.socialAccountId}:${item.scheduledAt}`;

    if (seen.has(key)) {
      throw new Error(
        'Duplicate schedule conflict detected. Remove the identical platform and time slot before submitting.'
      );
    }

    seen.add(key);
  }
};

export const createConnectedSocialAccount = async (
  req: AuthenticatedRequest<{}, unknown, CreateSocialAccountBody>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const [accountLimit, connectedAccounts] = await Promise.all([
      getFeatureLimit(
        client,
        req.user.id,
        FEATURE_KEYS.socialAccountConnection
      ),
      getSocialAccountCountByUser(client, req.user.id),
    ]);

    if (accountLimit !== null && connectedAccounts >= accountLimit) {
      const message =
        accountLimit === 0
          ? 'Social account connections are not included in your current plan'
          : `Your current plan allows ${accountLimit} connected social account${accountLimit === 1 ? '' : 's'}. Upgrade to connect more.`;

      return res.status(403).json({
        status: 'fail',
        message,
        data: {
          connectedAccounts,
          accountLimit,
        },
      });
    }

    const account = await createSocialAccount(
      client,
      req.user.id,
      resolveSocialAccountInput(req.body)
    );

    return res.status(201).json({
      status: 'success',
      message: 'Social account connected successfully',
      data: account,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to connect social account';

    const duplicateAccount =
      /social_accounts_user_id_platform_account_id_key|duplicate key/i.test(message);

    const statusCode =
      duplicateAccount ||
      /valid .*profile url|profile id|profile url|platform/i.test(message)
        ? duplicateAccount
          ? 409
          : 400
        : 500;

    return res.status(statusCode).json({
      status: statusCode === 500 ? 'error' : 'fail',
      message:
        duplicateAccount
          ? 'That social profile is already connected.'
          : message,
    });
  }
};

export const startMetaOAuth = async (
  req: AuthenticatedRequest<{}, unknown, StartMetaOAuthBody>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  const isConfigured =
    req.body.platform === 'instagram'
      ? isMetaInstagramOAuthConfigured
      : isMetaFacebookOAuthConfigured;

  if (!isConfigured) {
    return res.status(503).json({
      status: 'error',
      message:
        'Meta OAuth is not configured yet. Add the Meta credentials on the server first.',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const hasExplicitClaim = Boolean(
      coerceProfileValue(req.body.accountId) || coerceProfileValue(req.body.profileUrl)
    );
    const resolved = hasExplicitClaim
      ? resolveSocialAccountInput(req.body)
      : {
          platform: req.body.platform,
          accountId: '',
          profileUrl: null,
        };
    const [accountLimit, connectedAccounts, existingAccount] = await Promise.all([
      getFeatureLimit(
        client,
        req.user.id,
        FEATURE_KEYS.socialAccountConnection
      ),
      getSocialAccountCountByUser(client, req.user.id),
      hasExplicitClaim
        ? getSocialAccountByUserAndPlatformAndAccountId(
            client,
            req.user.id,
            resolved.platform,
            resolved.accountId
          )
        : Promise.resolve(null),
    ]);

    if (
      !existingAccount &&
      accountLimit !== null &&
      connectedAccounts >= accountLimit
    ) {
      const message =
        accountLimit === 0
          ? 'Social account connections are not included in your current plan'
          : `Your current plan allows ${accountLimit} connected social account${accountLimit === 1 ? '' : 's'}. Upgrade to connect more.`;

      return res.status(403).json({
        status: 'fail',
        message,
        data: {
          connectedAccounts,
          accountLimit,
        },
      });
    }

    const authUrl = buildMetaOAuthUrl(
      createSignedMetaOAuthState({
        userId: req.user.id,
        platform: req.body.platform,
        accountId: resolved.accountId,
        profileUrl: resolved.profileUrl ?? null,
        responseMode: 'popup',
      })
    );

    return res.status(200).json({
      status: 'success',
      data: {
        authUrl,
        // The popup posts back from the server callback origin, not the app origin.
        popupOrigin: new URL(
          req.body.platform === 'instagram'
            ? META_INSTAGRAM_REDIRECT_URI
            : META_FACEBOOK_REDIRECT_URI
        ).origin,
      },
    });
  } catch (error) {
    return res.status(400).json({
      status: 'fail',
      message:
        error instanceof Error
          ? error.message
          : 'Unable to start Meta account verification',
    });
  }
};

export const handleMetaOAuthCallback = async (
  req: Request<{}, unknown, unknown, Record<string, string | undefined>>,
  res: Response
) => {
  let claim:
    | ReturnType<typeof readSignedMetaOAuthState>
    | null = null;

  if (req.query.state) {
    try {
      claim = readSignedMetaOAuthState(req.query.state);
    } catch {
      claim = null;
    }
  }

  const errorParam = req.query.error_description || req.query.error_message;

  if (errorParam) {
    return respondWithMetaOAuthResult(res, claim?.responseMode, {
      status: 'error',
      message: errorParam,
    });
  }

  if (!req.query.code || !req.query.state) {
    return respondWithMetaOAuthResult(res, claim?.responseMode, {
      status: 'error',
      message:
        'Meta did not return the verification code. Start the connection again.',
    });
  }

  try {
    claim = claim ?? readSignedMetaOAuthState(req.query.state);
    const client = requireSupabaseAdmin();
    const hasExplicitClaim = Boolean(
      claim.accountId.trim() || claim.profileUrl?.trim()
    );
    const existingAccount = hasExplicitClaim
      ? await getSocialAccountByUserAndPlatformAndAccountId(
          client,
          claim.userId,
          claim.platform,
          claim.accountId
        )
      : null;

    if (!existingAccount) {
      const [accountLimit, connectedAccounts] = await Promise.all([
        getFeatureLimit(
          client,
          claim.userId,
          FEATURE_KEYS.socialAccountConnection
        ),
        getSocialAccountCountByUser(client, claim.userId),
      ]);

      if (accountLimit !== null && connectedAccounts >= accountLimit) {
        const message =
          accountLimit === 0
            ? 'Social account connections are not included in your current plan'
            : `Your current plan allows ${accountLimit} connected social account${accountLimit === 1 ? '' : 's'}. Upgrade to connect more.`;

        return respondWithMetaOAuthResult(
          res,
          claim.responseMode,
          {
            status: 'error',
            message,
          }
        );
      }
    }

    const exchange = await exchangeMetaAuthorizationCode(
      req.query.code,
      claim.platform
    );

    if (!hasExplicitClaim && claim.platform === 'facebook') {
      if (exchange.platform !== 'facebook') {
        return respondWithMetaOAuthResult(
          res,
          claim.responseMode,
          {
            status: 'error',
            message: 'Facebook verification returned the wrong Meta response.',
          }
        );
      }

      const connectablePages = exchange.pages.filter((page) => page.access_token);

      if (!connectablePages.length) {
        return respondWithMetaOAuthResult(
          res,
          claim.responseMode,
          {
            status: 'error',
            message: buildFacebookNoPagesMessage(exchange.debug),
          }
        );
      }

      if (connectablePages.length === 1) {
        const page = connectablePages[0] as MetaPageRecord;
        const accountInput = buildFacebookSocialAccountFromMetaPage(
          page,
          exchange.longLivedUserToken,
          exchange.tokenExpiresAt,
          exchange.metaUser
        );
        const existingPage = await getSocialAccountByUserAndPlatformAndAccountId(
          client,
          claim.userId,
          'facebook',
          accountInput.accountId
        );

        if (!existingPage) {
          const [accountLimit, connectedAccounts] = await Promise.all([
            getFeatureLimit(
              client,
              claim.userId,
              FEATURE_KEYS.socialAccountConnection
            ),
            getSocialAccountCountByUser(client, claim.userId),
          ]);

          if (accountLimit !== null && connectedAccounts >= accountLimit) {
            const message =
              accountLimit === 0
                ? 'Social account connections are not included in your current plan'
                : `Your current plan allows ${accountLimit} connected social account${accountLimit === 1 ? '' : 's'}. Upgrade to connect more.`;

            return respondWithMetaOAuthResult(
              res,
              claim.responseMode,
              {
                status: 'error',
                message,
              }
            );
          }
        }

        await upsertSocialAccountByUniqueKey(
          client,
          claim.userId,
          accountInput
        );

        return respondWithMetaOAuthResult(
          res,
          claim.responseMode,
          {
            status: 'success',
            message: 'Facebook Page connected.',
          }
        );
      }

      const session = await createOAuthConnectionSession(client, claim.userId, {
        provider: 'meta',
        platform: 'facebook',
        selectionType: 'facebook_pages',
        expiresAt: new Date(Date.now() + META_OAUTH_STATE_TTL_MS).toISOString(),
        payload: {
          metaUser: {
            id: exchange.metaUser.id,
            name: exchange.metaUser.name ?? null,
          },
          longLivedUserToken: exchange.longLivedUserToken,
          tokenExpiresAt: exchange.tokenExpiresAt,
          pages: connectablePages,
        },
      });

      return respondWithMetaOAuthResult(
        res,
        claim.responseMode,
        {
          status: 'select_facebook_pages',
          selectionId: session.id,
          message: 'Choose the Facebook Page you want to connect.',
        }
      );
    }

    const verified = verifyClaimedMetaAccount({
      claim,
      exchange,
    });

    await upsertSocialAccountByUniqueKey(client, claim.userId, verified.socialAccount);

    return respondWithMetaOAuthResult(
      res,
      claim.responseMode,
      {
        status: 'success',
        message:
          claim.platform === 'instagram'
            ? 'Instagram account connected.'
            : 'Facebook Page connected.',
      }
    );
  } catch (error) {
    return respondWithMetaOAuthResult(
      res,
      claim?.responseMode,
      {
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Meta verification failed. Start the connection again.',
      }
    );
  }
};

export const listPendingMetaFacebookPages = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const session = await getOAuthConnectionSessionById(
      client,
      req.user.id,
      req.params.id
    );

    if (!session) {
      return res.status(404).json({
        status: 'fail',
        message: 'That Facebook page selection has expired. Start the connection again.',
      });
    }

    const payload = readPendingFacebookPageSelectionPayload(session.payload);

    if (!payload) {
      await deleteOAuthConnectionSession(client, req.user.id, session.id);
      return res.status(404).json({
        status: 'fail',
        message: 'That Facebook page selection is no longer available. Start again.',
      });
    }

    const pages = await loadPendingFacebookPageCandidates(
      client,
      req.user.id,
      payload.pages
    );

    return res.status(200).json({
      status: 'success',
      data: {
        selectionId: session.id,
        expiresAt: session.expiresAt,
        pages,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to load Facebook Pages',
    });
  }
};

export const finalizePendingMetaFacebookPages = async (
  req: AuthenticatedRequest<{}, unknown, FinalizeMetaFacebookPagesBody>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const userId = req.user.id;
    const client = requireUserClient(req.accessToken);
    const session = await getOAuthConnectionSessionById(
      client,
      userId,
      req.body.selectionId
    );

    if (!session) {
      return res.status(404).json({
        status: 'fail',
        message: 'That Facebook page selection has expired. Start the connection again.',
      });
    }

    const payload = readPendingFacebookPageSelectionPayload(session.payload);

    if (!payload) {
      await deleteOAuthConnectionSession(client, userId, session.id);
      return res.status(404).json({
        status: 'fail',
        message: 'That Facebook page selection is no longer available. Start again.',
      });
    }

    const requestedPageIds = [...new Set(req.body.pageIds.map((pageId) => pageId.trim()))];
    const pagesById = new Map(
      payload.pages
        .filter((page) => page.access_token)
        .map((page) => [page.id, page])
    );

    const pagesToConnect = requestedPageIds.map((pageId) => {
      const page = pagesById.get(pageId);

      if (!page) {
        throw new Error('One of the selected Facebook Pages is no longer available.');
      }

      return page;
    });

    const accountInputs = pagesToConnect.map((page) =>
      buildFacebookSocialAccountFromMetaPage(
        page,
        payload.longLivedUserToken,
        payload.tokenExpiresAt,
        payload.metaUser
      )
    );

    const existingAccounts = await Promise.all(
      accountInputs.map((input) =>
        getSocialAccountByUserAndPlatformAndAccountId(
          client,
          userId,
          input.platform,
          input.accountId
        )
      )
    );

    const newConnections = existingAccounts.filter((account) => !account).length;

    if (newConnections > 0) {
      const [accountLimit, connectedAccounts] = await Promise.all([
        getFeatureLimit(
          client,
          userId,
          FEATURE_KEYS.socialAccountConnection
        ),
        getSocialAccountCountByUser(client, userId),
      ]);

      const remainingSlots =
        accountLimit === null
          ? Number.POSITIVE_INFINITY
          : Math.max(accountLimit - connectedAccounts, 0);

      if (newConnections > remainingSlots) {
        const message =
          accountLimit === 0
            ? 'Social account connections are not included in your current plan'
            : `Your current plan allows ${accountLimit} connected social account${accountLimit === 1 ? '' : 's'}. Upgrade to connect more.`;

        return res.status(403).json({
          status: 'fail',
          message,
        });
      }
    }

    const connectedAccounts = await Promise.all(
      accountInputs.map((input) =>
        upsertSocialAccountByUniqueKey(client, userId, input)
      )
    );

    await deleteOAuthConnectionSession(client, userId, session.id);

    return res.status(200).json({
      status: 'success',
      message:
        connectedAccounts.length === 1
          ? 'Facebook Page connected.'
          : `${connectedAccounts.length} Facebook Pages connected.`,
      data: {
        connectedAccounts,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to connect the selected Facebook Pages';

    return res.status(
      /selected facebook pages|selection/i.test(message) ? 400 : 500
    ).json({
      status:
        /selected facebook pages|selection/i.test(message) ? 'fail' : 'error',
      message,
    });
  }
};

export const listConnectedSocialAccounts = async (
  req: AuthenticatedRequest<
    {},
    unknown,
    unknown,
    { page?: string; limit?: string }
  >,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const accounts = await getSocialAccountsByUser(client, req.user.id, {
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 20),
    });

    return res.status(200).json({
      status: 'success',
      data: accounts,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch social accounts',
    });
  }
};

export const updateConnectedSocialAccount = async (
  req: AuthenticatedRequest<{ id: string }, unknown, UpdateSocialAccountBody>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const existingAccount = await getSocialAccountById(
      client,
      req.user.id,
      req.params.id
    );

    if (!existingAccount) {
      return res.status(404).json({
        status: 'fail',
        message: 'Social account not found',
      });
    }

    const account = await updateSocialAccount(
      client,
      req.user.id,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      status: 'success',
      message: 'Social account updated successfully',
      data: account,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to update social account',
    });
  }
};

export const removeConnectedSocialAccount = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const existingAccount = await getSocialAccountById(
      client,
      req.user.id,
      req.params.id
    );

    if (!existingAccount) {
      return res.status(404).json({
        status: 'fail',
        message: 'Social account not found',
      });
    }

    await deleteSocialAccount(client, req.user.id, req.params.id);

    return res.status(200).json({
      status: 'success',
      message: 'Social account removed successfully',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to remove social account',
    });
  }
};

export const createSchedulerMediaAsset = async (
  req: AuthenticatedRequest<{}, unknown, CreateMediaAssetBody>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);

    if (req.body.contentId) {
      const content = await getGeneratedContentById(client, req.user.id, req.body.contentId);

      if (!content) {
        return res.status(404).json({
          status: 'fail',
          message: 'Generated content item not found',
        });
      }
    }

    if (req.body.generatedImageId) {
      const image = await getGeneratedImageById(
        client,
        req.user.id,
        req.body.generatedImageId
      );

      if (!image) {
        return res.status(404).json({
          status: 'fail',
          message: 'Generated image item not found',
        });
      }
    }

    const asset = await createMediaAsset(client, req.user.id, req.body as CreateMediaAssetInput);

    return res.status(201).json({
      status: 'success',
      message: 'Media asset created successfully',
      data: asset,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to create media asset',
    });
  }
};

export const createScheduleBatchDraft = async (
  req: AuthenticatedRequest<{}, unknown, CreateScheduleBatchBody>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const batch = await createScheduleBatch(client, req.user.id, {
      batchName: req.body.batchName ?? null,
      status: req.body.status ?? 'draft',
    });

    return res.status(201).json({
      status: 'success',
      message: 'Schedule batch created successfully',
      data: batch,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to create schedule batch',
    });
  }
};

export const getScheduleBatch = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const detail = await getScheduleBatchDetail(client, req.user.id, req.params.id);

    if (!detail) {
      return res.status(404).json({
        status: 'fail',
        message: 'Schedule batch not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: detail,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to fetch schedule batch',
    });
  }
};

export const deleteScheduleBatchDraft = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const batch = await getScheduleBatchById(client, req.user.id, req.params.id);

    if (!batch) {
      return res.status(404).json({
        status: 'fail',
        message: 'Schedule batch not found',
      });
    }

    await deleteScheduleBatch(client, req.user.id, req.params.id);

    return res.status(200).json({
      status: 'success',
      message: 'Draft deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to delete schedule batch',
    });
  }
};

export const listScheduleBatches = async (
  req: AuthenticatedRequest<{}, unknown, unknown, ListScheduleBatchesQuery>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const result = await getScheduleBatchesByUser(client, req.user.id, {
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 24),
      status: req.query.status ?? null,
    });

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to fetch schedule batches',
    });
  }
};

export const addScheduleBatchItems = async (
  req: AuthenticatedRequest<{ id: string }, unknown, AddBatchItemsBody>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    assertNoDuplicateScheduledItems(req.body.items);

    const client = requireUserClient(req.accessToken);
    const batch = await getScheduleBatchById(client, req.user.id, req.params.id);

    if (!batch) {
      return res.status(404).json({
        status: 'fail',
        message: 'Schedule batch not found',
      });
    }

    const existingItems = await getScheduledItemsByBatch(client, req.user.id, req.params.id);
    assertNoDuplicateScheduledItems([
      ...existingItems.map((item) => ({
        mediaAssetId: item.mediaAssetId,
        socialAccountId: item.socialAccountId,
        scheduledAt: item.scheduledAt,
      })),
      ...req.body.items.map((item) => ({
        mediaAssetId: item.mediaAssetId,
        socialAccountId: item.socialAccountId,
        scheduledAt: item.scheduledAt,
      })),
    ]);

    const createdItems = [];

    for (const item of req.body.items) {
      ensureFutureDate(item.scheduledAt, 'scheduledAt');

      const [mediaAsset, socialAccount] = await Promise.all([
        getMediaAssetById(client, req.user.id, item.mediaAssetId),
        getSocialAccountById(client, req.user.id, item.socialAccountId),
      ]);

      if (!mediaAsset) {
        throw new Error('Media asset not found');
      }

      if (!socialAccount) {
        throw new Error('Social account not found');
      }

      if (socialAccount.platform === 'instagram') {
        ensureInstagramMediaAssetReady(mediaAsset);
      }

      createdItems.push(
        await createScheduledItem(client, req.user.id, req.params.id, {
          mediaAssetId: item.mediaAssetId,
          socialAccountId: item.socialAccountId,
          platform: item.platform,
          accountId: item.accountId,
          caption: item.caption ?? null,
          scheduledAt: item.scheduledAt,
          status: item.status ?? 'pending',
        })
      );
    }

    await syncBatchStatusFromItems(client, req.user.id, req.params.id);

    return res.status(201).json({
      status: 'success',
      message: 'Scheduled items added successfully',
      data: createdItems,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to add scheduled items';

    return res.status(
      message.includes('not found') ||
        message === SCHEDULE_TIME_VALIDATION_MESSAGE ||
        message.includes('Duplicate schedule conflict') ||
        message.includes('supported')
        ? 400
        : 500
    ).json({
      status:
        message.includes('not found') ||
        message === SCHEDULE_TIME_VALIDATION_MESSAGE ||
        message.includes('Duplicate schedule conflict') ||
        message.includes('supported')
          ? 'fail'
          : 'error',
      message,
    });
  }
};

export const submitScheduleBatch = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const detail = await getScheduleBatchDetail(client, req.user.id, req.params.id);

    if (!detail) {
      return res.status(404).json({
        status: 'fail',
        message: 'Schedule batch not found',
      });
    }

    if (!detail.items.length) {
      return res.status(400).json({
        status: 'fail',
        message: 'Add at least one scheduled item before submitting the batch.',
      });
    }

    const mirroredItems = [];

    for (const item of detail.items) {
      if (item.status === 'cancelled' || item.scheduledPostId) {
        continue;
      }

      ensureFutureDate(item.scheduledAt, 'scheduledAt');

      const socialAccount = item.socialAccount ??
        (await getSocialAccountById(client, req.user.id, item.socialAccountId));
      const mediaAsset = item.mediaAsset ??
        (await getMediaAssetById(client, req.user.id, item.mediaAssetId));

      if (!socialAccount || !mediaAsset) {
        throw new Error('Scheduled item is missing its linked media or social account.');
      }

      if (socialAccount.platform === 'instagram') {
        ensureInstagramMediaAssetReady(mediaAsset);
      }

      ensureMetaScheduledPostCanPublish(
        item.platform,
        socialAccount,
        mediaAsset.storageUrl,
        mediaAsset.mediaType
      );
      ensureScheduledPostHasMedia(mediaAsset.storageUrl, mediaAsset.mediaType);

      const scheduledPost = await createScheduledPost(client, req.user.id, {
        socialAccountId: item.socialAccountId,
        contentId: mediaAsset.contentId,
        generatedImageId: mediaAsset.generatedImageId,
        platform: item.platform,
        caption: item.caption,
        mediaUrl: mediaAsset.storageUrl,
        mediaType: mediaAsset.mediaType,
        scheduledFor: item.scheduledAt,
        status: 'scheduled',
      });

      const updatedItem = await updateScheduledItem(client, req.user.id, item.id, {
        scheduledPostId: scheduledPost.id,
        status: 'scheduled',
        lastError: null,
      });

      await appendScheduledItemLog(client, {
        scheduledItemId: updatedItem.id,
        eventType: 'submitted',
        message: 'Scheduled item mirrored into the publishing queue.',
        payloadJson: {
          scheduledPostId: scheduledPost.id,
        },
      });

      mirroredItems.push(updatedItem);
    }

    const batch = await updateScheduleBatch(client, req.user.id, req.params.id, {
      status: 'queued',
    });

    return res.status(200).json({
      status: 'success',
      message: 'Schedule batch submitted successfully',
      data: {
        batch,
        items: mirroredItems,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to submit schedule batch';

    return res.status(
      message === SCHEDULE_TIME_VALIDATION_MESSAGE ||
      message.includes('missing') ||
      message.includes('supported')
        ? 400
        : 500
    ).json({
      status:
        message === SCHEDULE_TIME_VALIDATION_MESSAGE ||
        message.includes('missing') ||
        message.includes('supported')
          ? 'fail'
          : 'error',
      message,
    });
  }
};

export const listScheduleItems = async (
  req: AuthenticatedRequest<{}, unknown, unknown, ListScheduledItemsQuery>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const items = await getScheduledItemsByUser(client, req.user.id, {
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 50),
      status: req.query.status ?? null,
    });

    return res.status(200).json({
      status: 'success',
      data: items,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to fetch scheduled items',
    });
  }
};

export const updateScheduleItemRecord = async (
  req: AuthenticatedRequest<{ id: string }, unknown, UpdateScheduledItemBody>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const existingItem = await getScheduledItemById(client, req.user.id, req.params.id);

    if (!existingItem) {
      return res.status(404).json({
        status: 'fail',
        message: 'Scheduled item not found',
      });
    }

    if (req.body.scheduledAt) {
      ensureFutureDate(req.body.scheduledAt, 'scheduledAt');
    }

    const updatedItem = await updateScheduledItem(client, req.user.id, req.params.id, {
      mediaAssetId: req.body.mediaAssetId,
      socialAccountId: req.body.socialAccountId,
      platform: req.body.platform,
      accountId: req.body.accountId,
      caption: req.body.caption,
      scheduledAt: req.body.scheduledAt,
      status: req.body.status,
    });

    if (existingItem.scheduledPostId) {
      const mediaAsset = await getMediaAssetById(
        client,
        req.user.id,
        updatedItem.mediaAssetId
      );

      if (!mediaAsset) {
        throw new Error('Media asset not found');
      }

      await updateScheduledPost(client, req.user.id, existingItem.scheduledPostId, {
        socialAccountId: updatedItem.socialAccountId,
        contentId: mediaAsset.contentId,
        generatedImageId: mediaAsset.generatedImageId,
        platform: updatedItem.platform,
        caption: updatedItem.caption,
        mediaUrl: mediaAsset.storageUrl,
        mediaType: mediaAsset.mediaType,
        scheduledFor: updatedItem.scheduledAt,
        status:
          updatedItem.status === 'cancelled'
            ? 'cancelled'
            : updatedItem.status === 'published' || updatedItem.status === 'failed'
              ? updatedItem.status
              : 'scheduled',
      });
    }

    await syncBatchStatusFromItems(client, req.user.id, updatedItem.batchId);

    return res.status(200).json({
      status: 'success',
      message: 'Scheduled item updated successfully',
      data: updatedItem,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update scheduled item';

    return res.status(message === SCHEDULE_TIME_VALIDATION_MESSAGE ? 400 : 500).json({
      status: message === SCHEDULE_TIME_VALIDATION_MESSAGE ? 'fail' : 'error',
      message,
    });
  }
};

export const cancelScheduleItemRecord = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const existingItem = await getScheduledItemById(client, req.user.id, req.params.id);

    if (!existingItem) {
      return res.status(404).json({
        status: 'fail',
        message: 'Scheduled item not found',
      });
    }

    if (existingItem.scheduledPostId) {
      const scheduledPost = await getScheduledPostById(
        client,
        req.user.id,
        existingItem.scheduledPostId
      );

      if (scheduledPost && ['pending', 'scheduled'].includes(scheduledPost.status)) {
        await updateScheduledPostStatus(
          client,
          req.user.id,
          scheduledPost.id,
          'cancelled',
          null
        );
      }
    }

    const updatedItem = await updateScheduledItem(client, req.user.id, req.params.id, {
      status: 'cancelled',
      lastError: null,
    });

    await appendScheduledItemLog(client, {
      scheduledItemId: updatedItem.id,
      eventType: 'cancelled',
      message: 'Scheduled item cancelled.',
    });
    await syncBatchStatusFromItems(client, req.user.id, updatedItem.batchId);

    return res.status(200).json({
      status: 'success',
      message: 'Scheduled item cancelled successfully',
      data: updatedItem,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to cancel scheduled item',
    });
  }
};

export const createPostSchedule = async (
  req: AuthenticatedRequest<{}, unknown, CreateScheduledPostBody>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    ensureFutureDate(req.body.scheduledFor);

    const client = requireUserClient(req.accessToken);
    const resolved = await resolveScheduledPostDefaults(client, req.user.id, {
      socialAccountId: req.body.socialAccountId,
      contentId: req.body.contentId ?? null,
      generatedImageId: req.body.generatedImageId ?? null,
      platform: req.body.platform ?? null,
      caption: req.body.caption ?? null,
      mediaUrl: req.body.mediaUrl ?? null,
      mediaType: req.body.mediaType ?? null,
    });

    ensureMetaScheduledPostCanPublish(
      resolved.platform,
      resolved.socialAccount,
      resolved.mediaUrl,
      resolved.mediaType
    );
    ensureScheduledPostHasMedia(resolved.mediaUrl, resolved.mediaType);

    const scheduledPost = await createScheduledPost(client, req.user.id, {
      socialAccountId: req.body.socialAccountId,
      contentId: req.body.contentId ?? null,
      generatedImageId: req.body.generatedImageId ?? null,
      platform: resolved.platform,
      caption: resolved.caption,
      mediaUrl: resolved.mediaUrl,
      mediaType: resolved.mediaType,
      scheduledFor: req.body.scheduledFor,
      status: req.body.status ?? 'scheduled',
    });

    return res.status(201).json({
      status: 'success',
      message: 'Post scheduled successfully',
      data: scheduledPost,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create scheduled post';
    const isValidationFailure =
      message.includes('not found') ||
      message === SCHEDULE_TIME_VALIDATION_MESSAGE ||
      message === 'Invalid media URL' ||
      message === 'No preview available for this link' ||
      message === 'Add image or video media before scheduling this post.' ||
      message.includes('supported') ||
      message.includes('must be 50MB') ||
      message.includes('must be 6MB');

    return res.status(
      isValidationFailure
        ? 400
        : message.includes('download media')
          ? 502
        : 500
    ).json({
      status: isValidationFailure ? 'fail' : 'error',
      message,
    });
  }
};

export const listScheduledPosts = async (
  req: AuthenticatedRequest<
    {},
    unknown,
    unknown,
    { page?: string; limit?: string }
  >,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const scheduledPosts = await getScheduledPostsByUser(client, req.user.id, {
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 20),
    });

    return res.status(200).json({
      status: 'success',
      data: scheduledPosts,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch scheduled posts',
    });
  }
};

export const updatePostSchedule = async (
  req: AuthenticatedRequest<{ id: string }, unknown, UpdateScheduledPostBody>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const existingPost = await getScheduledPostById(
      client,
      req.user.id,
      req.params.id
    );

    if (!existingPost) {
      return res.status(404).json({
        status: 'fail',
        message: 'Scheduled post not found',
      });
    }

    if (req.body.scheduledFor) {
      ensureFutureDate(req.body.scheduledFor);
    }

    ensureScheduledPostCanBeEdited(existingPost);

    const resolved = await resolveScheduledPostDefaults(client, req.user.id, {
      socialAccountId: req.body.socialAccountId ?? existingPost.socialAccountId,
      contentId:
        req.body.contentId === undefined ? existingPost.contentId : req.body.contentId,
      generatedImageId:
        req.body.generatedImageId === undefined
          ? existingPost.generatedImageId
          : req.body.generatedImageId,
      platform: req.body.platform === undefined ? existingPost.platform : req.body.platform,
      caption: req.body.caption === undefined ? existingPost.caption : req.body.caption,
      mediaUrl: req.body.mediaUrl === undefined ? existingPost.mediaUrl : req.body.mediaUrl,
      mediaType:
        req.body.mediaType === undefined ? existingPost.mediaType : req.body.mediaType,
    });

    ensureMetaScheduledPostCanPublish(
      resolved.platform,
      resolved.socialAccount,
      resolved.mediaUrl,
      resolved.mediaType
    );

    const updatedPost = await updateScheduledPost(
      client,
      req.user.id,
      req.params.id,
      {
        socialAccountId: req.body.socialAccountId ?? existingPost.socialAccountId,
        contentId:
          req.body.contentId === undefined ? existingPost.contentId : req.body.contentId,
        generatedImageId:
          req.body.generatedImageId === undefined
            ? existingPost.generatedImageId
            : req.body.generatedImageId,
        platform: resolved.platform,
        caption: resolved.caption,
        mediaUrl: resolved.mediaUrl,
        mediaType: resolved.mediaType,
        scheduledFor: req.body.scheduledFor ?? existingPost.scheduledFor,
        status: req.body.status ?? existingPost.status,
      }
    );

    await syncScheduledItemStatusByScheduledPostId(client, updatedPost.id, {
      status:
        updatedPost.status === 'published' || updatedPost.status === 'failed'
          ? updatedPost.status
          : updatedPost.status === 'cancelled'
            ? 'cancelled'
            : 'scheduled',
      lastError: updatedPost.lastError,
    }).catch(() => null);

    return res.status(200).json({
      status: 'success',
      message: 'Scheduled post updated successfully',
      data: updatedPost,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update scheduled post';
    const isValidationFailure =
      message.includes('not found') ||
      message === SCHEDULE_TIME_VALIDATION_MESSAGE ||
      message.includes('can be edited') ||
      message === 'Invalid media URL' ||
      message === 'No preview available for this link' ||
      message.includes('supported') ||
      message.includes('must be 50MB') ||
      message.includes('must be 6MB');
    const isBufferFailure = message === SCHEDULED_POST_ACTION_BLOCKED_REASON;

    return res.status(
      isValidationFailure
        ? 400
        : isBufferFailure
          ? 409
        : message.includes('download media')
          ? 502
        : 500
    ).json({
      status: isValidationFailure || isBufferFailure ? 'fail' : 'error',
      message,
    });
  }
};

export const updatePostScheduleStatus = async (
  req: AuthenticatedRequest<
    { id: string },
    unknown,
    UpdateScheduledPostStatusBody
  >,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const existingPost = await getScheduledPostById(
      client,
      req.user.id,
      req.params.id
    );

    if (!existingPost) {
      return res.status(404).json({
        status: 'fail',
        message: 'Scheduled post not found',
      });
    }

    if (req.body.status === 'cancelled') {
      ensureScheduledPostCanBeCancelled(existingPost);
    }

    const publishedAt =
      req.body.status === 'published'
        ? req.body.publishedAt ?? new Date().toISOString()
        : req.body.publishedAt ?? null;

    const updatedPost = await updateScheduledPostStatus(
      client,
      req.user.id,
      req.params.id,
      req.body.status,
      publishedAt
    );

    const syncedItems = await syncScheduledItemStatusByScheduledPostId(
      client,
      updatedPost.id,
      {
        status:
          req.body.status === 'scheduled' || req.body.status === 'pending'
            ? 'scheduled'
            : req.body.status === 'cancelled'
              ? 'cancelled'
              : req.body.status,
        lastError: updatedPost.lastError,
      }
    ).catch(() => []);

    if (syncedItems.length) {
      await Promise.all(
        syncedItems.map((item) =>
          syncBatchStatusFromItems(client, req.user!.id, item.batchId).catch(() => null)
        )
      );
    }

    return res.status(200).json({
      status: 'success',
      message: 'Scheduled post status updated successfully',
      data: updatedPost,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to update scheduled post status';
    const isActionFailure =
      message === SCHEDULED_POST_ACTION_BLOCKED_REASON ||
      message.includes('can be cancelled');

    return res.status(isActionFailure ? 409 : 500).json({
      status: isActionFailure ? 'fail' : 'error',
      message,
    });
  }
};

export const cancelPostSchedule = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const existingPost = await getScheduledPostById(
      client,
      req.user.id,
      req.params.id
    );

    if (!existingPost) {
      return res.status(404).json({
        status: 'fail',
        message: 'Scheduled post not found',
      });
    }

    ensureScheduledPostCanBeCancelled(existingPost);

    const updatedPost = await updateScheduledPostStatus(
      client,
      req.user.id,
      req.params.id,
      'cancelled',
      null
    );

    const syncedItems = await syncScheduledItemStatusByScheduledPostId(
      client,
      updatedPost.id,
      {
        status: 'cancelled',
        lastError: null,
      }
    ).catch(() => []);

    if (syncedItems.length) {
      await Promise.all(
        syncedItems.map((item) =>
          syncBatchStatusFromItems(client, req.user!.id, item.batchId).catch(() => null)
        )
      );
    }

    return res.status(200).json({
      status: 'success',
      message: 'Scheduled post cancelled successfully',
      data: updatedPost,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to cancel scheduled post';

    return res.status(
      message === SCHEDULED_POST_ACTION_BLOCKED_REASON ||
        message.includes('can be cancelled')
        ? 409
        : 500
    ).json({
      status:
        message === SCHEDULED_POST_ACTION_BLOCKED_REASON ||
        message.includes('can be cancelled')
          ? 'fail'
          : 'error',
      message,
    });
  }
};

export const deletePostSchedule = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const existingPost = await getScheduledPostById(
      client,
      req.user.id,
      req.params.id
    );

    if (!existingPost) {
      return res.status(404).json({
        status: 'fail',
        message: 'Scheduled post not found',
      });
    }

    await deleteScheduledPost(client, req.user.id, req.params.id);

    return res.status(200).json({
      status: 'success',
      message: 'Scheduled post deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to delete scheduled post',
    });
  }
};
