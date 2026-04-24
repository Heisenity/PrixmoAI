"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePostSchedule = exports.cancelPostSchedule = exports.updatePostScheduleStatus = exports.updatePostSchedule = exports.listScheduledPosts = exports.createPostSchedule = exports.cancelScheduleItemRecord = exports.updateScheduleItemRecord = exports.listScheduleItems = exports.submitScheduleBatch = exports.addScheduleBatchItems = exports.listScheduleBatches = exports.deleteScheduleBatchDraft = exports.getScheduleBatch = exports.createScheduleBatchDraft = exports.createSchedulerMediaAsset = exports.removeConnectedSocialAccount = exports.updateConnectedSocialAccount = exports.listConnectedSocialAccounts = exports.finalizePendingMetaFacebookPages = exports.listPendingMetaFacebookPages = exports.handleMetaOAuthCallback = exports.startMetaOAuth = exports.createConnectedSocialAccount = void 0;
const crypto_1 = require("crypto");
const content_1 = require("../db/queries/content");
const images_1 = require("../db/queries/images");
const scheduleBatches_1 = require("../db/queries/scheduleBatches");
const scheduledPosts_1 = require("../db/queries/scheduledPosts");
const oauthConnectionSessions_1 = require("../db/queries/oauthConnectionSessions");
const socialAccounts_1 = require("../db/queries/socialAccounts");
const subscriptions_1 = require("../db/queries/subscriptions");
const supabase_1 = require("../db/supabase");
const constants_1 = require("../config/constants");
const meta_service_1 = require("../services/meta.service");
const schedulerPublisher_service_1 = require("../services/schedulerPublisher.service");
const storage_service_1 = require("../services/storage.service");
const parsePositiveInt = (value, fallback) => {
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
const SCHEDULE_MIN_BUFFER_MS = 5000;
const SCHEDULE_TIME_VALIDATION_MESSAGE = 'Scheduled time must be in the future';
const INSTAGRAM_FEED_MIN_RATIO = 0.8;
const INSTAGRAM_FEED_MAX_RATIO = 1.91;
const INSTAGRAM_REELS_TARGET_RATIO = 9 / 16;
const INSTAGRAM_REELS_TOLERANCE = 0.08;
const META_OAUTH_POPUP_MESSAGE_TYPE = 'prixmoai:meta-oauth';
const SCHEDULER_ACTIONABLE_STATUSES = new Set(['pending', 'scheduled']);
const coerceProfileValue = (value) => {
    const normalized = value?.trim();
    return normalized ? normalized : null;
};
const ensureScheduledPostCanBeEdited = (post) => {
    if (!SCHEDULER_ACTIONABLE_STATUSES.has(post.status)) {
        throw new Error('Only pending or scheduled posts can be edited.');
    }
    if (!post.canEdit) {
        throw new Error(post.actionBlockedReason || scheduledPosts_1.SCHEDULED_POST_ACTION_BLOCKED_REASON);
    }
};
const ensureScheduledPostCanBeCancelled = (post) => {
    if (!SCHEDULER_ACTIONABLE_STATUSES.has(post.status)) {
        throw new Error('Only pending or scheduled posts can be cancelled.');
    }
    if (!post.canCancel) {
        throw new Error(post.actionBlockedReason || scheduledPosts_1.SCHEDULED_POST_ACTION_BLOCKED_REASON);
    }
};
const toRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
const readString = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const readMetaInstagramAccountFromPage = (page) => page.instagram_business_account ?? page.connected_instagram_account ?? null;
const readPendingFacebookPageSelectionPayload = (value) => {
    const payload = toRecord(value);
    const metaUser = toRecord(payload.metaUser);
    const longLivedUserToken = readString(payload.longLivedUserToken);
    const metaUserId = readString(metaUser.id);
    const pages = Array.isArray(payload.pages)
        ? payload.pages.filter((entry) => Boolean(toRecord(entry).id) && Boolean(toRecord(entry).name))
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
const loadPendingFacebookPageCandidates = async (client, userId, pages) => Promise.all(pages
    .filter((page) => Boolean(page.access_token))
    .map(async (page) => {
    const accountId = extractFacebookPageIdentifier(page.link, page.id);
    const existingAccount = await (0, socialAccounts_1.getSocialAccountByUserAndPlatformAndAccountId)(client, userId, 'facebook', accountId);
    const linkedInstagramAccount = readMetaInstagramAccountFromPage(page);
    return {
        pageId: page.id,
        accountId,
        accountName: page.name,
        profileUrl: coerceProfileValue(page.link) ?? null,
        alreadyConnected: Boolean(existingAccount),
        linkedInstagramUsername: linkedInstagramAccount?.username ?? null,
    };
}));
const extractFacebookPageIdentifier = (link, fallbackId) => {
    if (link) {
        try {
            const url = new URL(link);
            const firstSegment = url.pathname.split('/').filter(Boolean)[0];
            const queryId = url.searchParams.get('id');
            const candidate = firstSegment || queryId;
            if (candidate) {
                return normalizeAccountId('facebook', candidate);
            }
        }
        catch {
            // Ignore malformed URLs from provider metadata and fall back to page ID.
        }
    }
    if (fallbackId) {
        return normalizeAccountId('facebook', fallbackId);
    }
    throw new Error('Meta did not return a usable Facebook Page identifier.');
};
const buildFacebookSocialAccountFromMetaPage = (page, userToken, tokenExpiresAt, metaUser) => {
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
const toDisplayLabel = (platform, accountId) => {
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
const normalizeAccountId = (platform, value) => {
    const trimmed = value.trim().replace(/^@+/, '');
    const normalized = /^(instagram|linkedin|x)$/.test(platform)
        ? trimmed.toLowerCase()
        : trimmed;
    if (!normalized) {
        throw new Error('Add a valid profile ID');
    }
    return normalized;
};
const parseSocialProfileUrl = (platform, profileUrl) => {
    let parsed;
    try {
        parsed = new URL(profileUrl);
    }
    catch {
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
        const profileIdFromQuery = primarySegment === 'profile.php' ? parsed.searchParams.get('id') : null;
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
const resolveSocialAccountInput = (input) => {
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
const ensureMetaScheduledPostCanPublish = (platform, socialAccount, mediaUrl, mediaType) => {
    if (!socialAccount || socialAccount.oauthProvider !== 'meta') {
        return;
    }
    if (socialAccount.verificationStatus !== 'verified') {
        throw new Error('Reconnect this Meta account before queueing live publishing.');
    }
    if (platform === 'instagram' && (!mediaUrl || !mediaType)) {
        throw new Error('Instagram scheduled posts need media before PrixmoAI can publish them.');
    }
};
const ensureScheduledPostHasMedia = (mediaUrl, mediaType) => {
    if (!mediaUrl || !mediaType) {
        throw new Error('Add image or video media before scheduling this post.');
    }
};
const readRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
const readInstagramPreparationWarning = (mediaAsset) => {
    const metadata = readRecord(mediaAsset.metadata);
    const instagramPreparation = readRecord(metadata.instagramPreparation);
    const warning = instagramPreparation.warning;
    return typeof warning === 'string' && warning.trim() ? warning : null;
};
const isInstagramVideoAspectRatioSupported = (ratio) => (ratio >= INSTAGRAM_FEED_MIN_RATIO && ratio <= INSTAGRAM_FEED_MAX_RATIO) ||
    Math.abs(ratio - INSTAGRAM_REELS_TARGET_RATIO) <= INSTAGRAM_REELS_TOLERANCE;
const ensureInstagramMediaAssetReady = (mediaAsset) => {
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
        throw new Error('This image aspect ratio is not supported by Instagram yet. PrixmoAI needs to auto-adjust it before scheduling.');
    }
    if (mediaAsset.mediaType === 'video' && !isInstagramVideoAspectRatioSupported(ratio)) {
        throw new Error(readInstagramPreparationWarning(mediaAsset) ||
            'This Instagram video needs a supported aspect ratio before it can be scheduled.');
    }
};
const ensureFutureDate = (isoDate, fieldName = 'scheduledFor') => {
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Invalid ${fieldName} value`);
    }
    if (parsed.getTime() <= Date.now() + SCHEDULE_MIN_BUFFER_MS) {
        throw new Error(SCHEDULE_TIME_VALIDATION_MESSAGE);
    }
};
const serializeForInlineScript = (value) => JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
const isManagedSchedulerMediaUrl = (value) => value.includes(`/storage/v1/object/public/${constants_1.SUPABASE_SOURCE_IMAGE_BUCKET}/`);
const inferManagedMediaTypeFromUrl = (value) => {
    const normalized = value.toLowerCase();
    if (normalized.includes('.mp4') ||
        normalized.includes('.mov') ||
        normalized.includes('video/')) {
        return 'video';
    }
    if (normalized.includes('.jpg') ||
        normalized.includes('.jpeg') ||
        normalized.includes('.png') ||
        normalized.includes('.webp') ||
        normalized.includes('image/')) {
        return 'image';
    }
    return null;
};
const resolveSchedulerMediaUrl = async (userId, mediaUrl, mediaType) => {
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
    const imported = await (0, storage_service_1.importExternalSourceImage)(userId, normalized);
    return {
        mediaUrl: imported.publicUrl,
        mediaType: imported.mediaType,
    };
};
const buildMetaOAuthPopupCsp = (nonce) => [
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
const applyMetaOAuthPopupHeaders = (res, nonce) => {
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
const buildMetaOAuthPopupHtml = (payload, fallbackRedirectUrl, nonce) => {
    const targetOrigin = new URL(constants_1.CLIENT_APP_URL).origin;
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
const respondWithMetaOAuthResult = (res, responseMode, payload) => {
    const fallbackRedirectUrl = payload.status === 'error'
        ? (0, meta_service_1.getMetaOAuthErrorRedirectUrl)(payload.message)
        : payload.status === 'select_facebook_pages'
            ? (0, meta_service_1.getMetaOAuthFacebookPageSelectionRedirectUrl)(payload.selectionId, payload.message)
            : (0, meta_service_1.getMetaOAuthSuccessRedirectUrl)(payload.message);
    if (responseMode === 'popup') {
        const nonce = (0, crypto_1.randomBytes)(16).toString('base64');
        applyMetaOAuthPopupHeaders(res, nonce);
        return res
            .status(200)
            .type('html')
            .send(buildMetaOAuthPopupHtml(payload, fallbackRedirectUrl, nonce));
    }
    return res.redirect(302, fallbackRedirectUrl);
};
const resolveScheduledPostDefaults = async (client, userId, input) => {
    const socialAccount = await (0, socialAccounts_1.getSocialAccountById)(client, userId, input.socialAccountId);
    if (!socialAccount) {
        throw new Error('Social account not found');
    }
    const content = input.contentId
        ? await (0, content_1.getGeneratedContentById)(client, userId, input.contentId)
        : null;
    if (input.contentId && !content) {
        throw new Error('Generated content item not found');
    }
    const image = input.generatedImageId
        ? await (0, images_1.getGeneratedImageById)(client, userId, input.generatedImageId)
        : null;
    if (input.generatedImageId && !image) {
        throw new Error('Generated image item not found');
    }
    const resolvedMedia = input.mediaUrl === undefined
        ? {
            mediaUrl: image?.generatedImageUrl ?? null,
            mediaType: (image?.generatedImageUrl ? 'image' : null),
        }
        : await resolveSchedulerMediaUrl(userId, input.mediaUrl, input.mediaType);
    return {
        socialAccount,
        content,
        image,
        platform: input.platform ?? socialAccount.platform,
        caption: input.caption === undefined
            ? content?.captions?.[0]?.mainCopy ?? null
            : input.caption,
        mediaUrl: resolvedMedia.mediaUrl,
        mediaType: resolvedMedia.mediaType,
    };
};
const deriveScheduleBatchStatus = (statuses, currentStatus) => {
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
    if (nonCancelled.some((status) => status === 'published') &&
        nonCancelled.some((status) => status !== 'published')) {
        return 'partial';
    }
    if (nonCancelled.some((status) => ['scheduled', 'pending', 'publishing'].includes(status))) {
        if (currentStatus === 'draft' &&
            nonCancelled.every((status) => status === 'pending')) {
            return 'draft';
        }
        return 'queued';
    }
    return currentStatus ?? 'draft';
};
const syncBatchStatusFromItems = async (client, userId, batchId) => {
    const detail = await (0, scheduleBatches_1.getScheduleBatchDetail)(client, userId, batchId);
    if (!detail) {
        return null;
    }
    const nextStatus = deriveScheduleBatchStatus(detail.items.map((item) => item.status), detail.batch.status);
    if (nextStatus !== detail.batch.status) {
        return await (0, scheduleBatches_1.updateScheduleBatch)(client, userId, batchId, {
            status: nextStatus,
        });
    }
    return detail.batch;
};
const assertNoDuplicateScheduledItems = (items) => {
    const seen = new Set();
    for (const item of items) {
        const key = `${item.mediaAssetId}:${item.socialAccountId}:${item.scheduledAt}`;
        if (seen.has(key)) {
            throw new Error('Duplicate schedule conflict detected. Remove the identical platform and time slot before submitting.');
        }
        seen.add(key);
    }
};
const createConnectedSocialAccount = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const [accountLimit, connectedAccounts] = await Promise.all([
            (0, subscriptions_1.getFeatureLimit)(client, req.user.id, constants_1.FEATURE_KEYS.socialAccountConnection),
            (0, socialAccounts_1.getSocialAccountCountByUser)(client, req.user.id),
        ]);
        if (accountLimit !== null && connectedAccounts >= accountLimit) {
            const message = accountLimit === 0
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
        const account = await (0, socialAccounts_1.createSocialAccount)(client, req.user.id, resolveSocialAccountInput(req.body));
        return res.status(201).json({
            status: 'success',
            message: 'Social account connected successfully',
            data: account,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to connect social account';
        const duplicateAccount = /social_accounts_user_id_platform_account_id_key|duplicate key/i.test(message);
        const statusCode = duplicateAccount ||
            /valid .*profile url|profile id|profile url|platform/i.test(message)
            ? duplicateAccount
                ? 409
                : 400
            : 500;
        return res.status(statusCode).json({
            status: statusCode === 500 ? 'error' : 'fail',
            message: duplicateAccount
                ? 'That social profile is already connected.'
                : message,
        });
    }
};
exports.createConnectedSocialAccount = createConnectedSocialAccount;
const startMetaOAuth = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    const isConfigured = req.body.platform === 'instagram'
        ? constants_1.isMetaInstagramOAuthConfigured
        : constants_1.isMetaFacebookOAuthConfigured;
    if (!isConfigured) {
        return res.status(503).json({
            status: 'error',
            message: 'Meta OAuth is not configured yet. Add the Meta credentials on the server first.',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const hasExplicitClaim = Boolean(coerceProfileValue(req.body.accountId) || coerceProfileValue(req.body.profileUrl));
        const resolved = hasExplicitClaim
            ? resolveSocialAccountInput(req.body)
            : {
                platform: req.body.platform,
                accountId: '',
                profileUrl: null,
            };
        const [accountLimit, connectedAccounts, existingAccount] = await Promise.all([
            (0, subscriptions_1.getFeatureLimit)(client, req.user.id, constants_1.FEATURE_KEYS.socialAccountConnection),
            (0, socialAccounts_1.getSocialAccountCountByUser)(client, req.user.id),
            hasExplicitClaim
                ? (0, socialAccounts_1.getSocialAccountByUserAndPlatformAndAccountId)(client, req.user.id, resolved.platform, resolved.accountId)
                : Promise.resolve(null),
        ]);
        if (!existingAccount &&
            accountLimit !== null &&
            connectedAccounts >= accountLimit) {
            const message = accountLimit === 0
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
        const authUrl = (0, meta_service_1.buildMetaOAuthUrl)((0, meta_service_1.createSignedMetaOAuthState)({
            userId: req.user.id,
            platform: req.body.platform,
            accountId: resolved.accountId,
            profileUrl: resolved.profileUrl ?? null,
            responseMode: 'popup',
        }));
        return res.status(200).json({
            status: 'success',
            data: {
                authUrl,
                // The popup posts back from the server callback origin, not the app origin.
                popupOrigin: new URL(req.body.platform === 'instagram'
                    ? constants_1.META_INSTAGRAM_REDIRECT_URI
                    : constants_1.META_FACEBOOK_REDIRECT_URI).origin,
            },
        });
    }
    catch (error) {
        return res.status(400).json({
            status: 'fail',
            message: error instanceof Error
                ? error.message
                : 'Unable to start Meta account verification',
        });
    }
};
exports.startMetaOAuth = startMetaOAuth;
const handleMetaOAuthCallback = async (req, res) => {
    let claim = null;
    if (req.query.state) {
        try {
            claim = (0, meta_service_1.readSignedMetaOAuthState)(req.query.state);
        }
        catch {
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
            message: 'Meta did not return the verification code. Start the connection again.',
        });
    }
    try {
        claim = claim ?? (0, meta_service_1.readSignedMetaOAuthState)(req.query.state);
        const client = (0, supabase_1.requireSupabaseAdmin)();
        const hasExplicitClaim = Boolean(claim.accountId.trim() || claim.profileUrl?.trim());
        const existingAccount = hasExplicitClaim
            ? await (0, socialAccounts_1.getSocialAccountByUserAndPlatformAndAccountId)(client, claim.userId, claim.platform, claim.accountId)
            : null;
        if (!existingAccount) {
            const [accountLimit, connectedAccounts] = await Promise.all([
                (0, subscriptions_1.getFeatureLimit)(client, claim.userId, constants_1.FEATURE_KEYS.socialAccountConnection),
                (0, socialAccounts_1.getSocialAccountCountByUser)(client, claim.userId),
            ]);
            if (accountLimit !== null && connectedAccounts >= accountLimit) {
                const message = accountLimit === 0
                    ? 'Social account connections are not included in your current plan'
                    : `Your current plan allows ${accountLimit} connected social account${accountLimit === 1 ? '' : 's'}. Upgrade to connect more.`;
                return respondWithMetaOAuthResult(res, claim.responseMode, {
                    status: 'error',
                    message,
                });
            }
        }
        const exchange = await (0, meta_service_1.exchangeMetaAuthorizationCode)(req.query.code, claim.platform);
        if (!hasExplicitClaim && claim.platform === 'facebook') {
            if (exchange.platform !== 'facebook') {
                return respondWithMetaOAuthResult(res, claim.responseMode, {
                    status: 'error',
                    message: 'Facebook verification returned the wrong Meta response.',
                });
            }
            const connectablePages = exchange.pages.filter((page) => page.access_token);
            if (!connectablePages.length) {
                return respondWithMetaOAuthResult(res, claim.responseMode, {
                    status: 'error',
                    message: (0, meta_service_1.buildFacebookNoPagesMessage)(exchange.debug),
                });
            }
            if (connectablePages.length === 1) {
                const page = connectablePages[0];
                const accountInput = buildFacebookSocialAccountFromMetaPage(page, exchange.longLivedUserToken, exchange.tokenExpiresAt, exchange.metaUser);
                const existingPage = await (0, socialAccounts_1.getSocialAccountByUserAndPlatformAndAccountId)(client, claim.userId, 'facebook', accountInput.accountId);
                if (!existingPage) {
                    const [accountLimit, connectedAccounts] = await Promise.all([
                        (0, subscriptions_1.getFeatureLimit)(client, claim.userId, constants_1.FEATURE_KEYS.socialAccountConnection),
                        (0, socialAccounts_1.getSocialAccountCountByUser)(client, claim.userId),
                    ]);
                    if (accountLimit !== null && connectedAccounts >= accountLimit) {
                        const message = accountLimit === 0
                            ? 'Social account connections are not included in your current plan'
                            : `Your current plan allows ${accountLimit} connected social account${accountLimit === 1 ? '' : 's'}. Upgrade to connect more.`;
                        return respondWithMetaOAuthResult(res, claim.responseMode, {
                            status: 'error',
                            message,
                        });
                    }
                }
                await (0, socialAccounts_1.upsertSocialAccountByUniqueKey)(client, claim.userId, accountInput);
                return respondWithMetaOAuthResult(res, claim.responseMode, {
                    status: 'success',
                    message: 'Facebook Page connected.',
                });
            }
            const session = await (0, oauthConnectionSessions_1.createOAuthConnectionSession)(client, claim.userId, {
                provider: 'meta',
                platform: 'facebook',
                selectionType: 'facebook_pages',
                expiresAt: new Date(Date.now() + constants_1.META_OAUTH_STATE_TTL_MS).toISOString(),
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
            return respondWithMetaOAuthResult(res, claim.responseMode, {
                status: 'select_facebook_pages',
                selectionId: session.id,
                message: 'Choose the Facebook Page you want to connect.',
            });
        }
        const verified = (0, meta_service_1.verifyClaimedMetaAccount)({
            claim,
            exchange,
        });
        await (0, socialAccounts_1.upsertSocialAccountByUniqueKey)(client, claim.userId, verified.socialAccount);
        return respondWithMetaOAuthResult(res, claim.responseMode, {
            status: 'success',
            message: claim.platform === 'instagram'
                ? 'Instagram account connected.'
                : 'Facebook Page connected.',
        });
    }
    catch (error) {
        return respondWithMetaOAuthResult(res, claim?.responseMode, {
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Meta verification failed. Start the connection again.',
        });
    }
};
exports.handleMetaOAuthCallback = handleMetaOAuthCallback;
const listPendingMetaFacebookPages = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const session = await (0, oauthConnectionSessions_1.getOAuthConnectionSessionById)(client, req.user.id, req.params.id);
        if (!session) {
            return res.status(404).json({
                status: 'fail',
                message: 'That Facebook page selection has expired. Start the connection again.',
            });
        }
        const payload = readPendingFacebookPageSelectionPayload(session.payload);
        if (!payload) {
            await (0, oauthConnectionSessions_1.deleteOAuthConnectionSession)(client, req.user.id, session.id);
            return res.status(404).json({
                status: 'fail',
                message: 'That Facebook page selection is no longer available. Start again.',
            });
        }
        const pages = await loadPendingFacebookPageCandidates(client, req.user.id, payload.pages);
        return res.status(200).json({
            status: 'success',
            data: {
                selectionId: session.id,
                expiresAt: session.expiresAt,
                pages,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to load Facebook Pages',
        });
    }
};
exports.listPendingMetaFacebookPages = listPendingMetaFacebookPages;
const finalizePendingMetaFacebookPages = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const userId = req.user.id;
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const session = await (0, oauthConnectionSessions_1.getOAuthConnectionSessionById)(client, userId, req.body.selectionId);
        if (!session) {
            return res.status(404).json({
                status: 'fail',
                message: 'That Facebook page selection has expired. Start the connection again.',
            });
        }
        const payload = readPendingFacebookPageSelectionPayload(session.payload);
        if (!payload) {
            await (0, oauthConnectionSessions_1.deleteOAuthConnectionSession)(client, userId, session.id);
            return res.status(404).json({
                status: 'fail',
                message: 'That Facebook page selection is no longer available. Start again.',
            });
        }
        const requestedPageIds = [...new Set(req.body.pageIds.map((pageId) => pageId.trim()))];
        const pagesById = new Map(payload.pages
            .filter((page) => page.access_token)
            .map((page) => [page.id, page]));
        const pagesToConnect = requestedPageIds.map((pageId) => {
            const page = pagesById.get(pageId);
            if (!page) {
                throw new Error('One of the selected Facebook Pages is no longer available.');
            }
            return page;
        });
        const accountInputs = pagesToConnect.map((page) => buildFacebookSocialAccountFromMetaPage(page, payload.longLivedUserToken, payload.tokenExpiresAt, payload.metaUser));
        const existingAccounts = await Promise.all(accountInputs.map((input) => (0, socialAccounts_1.getSocialAccountByUserAndPlatformAndAccountId)(client, userId, input.platform, input.accountId)));
        const newConnections = existingAccounts.filter((account) => !account).length;
        if (newConnections > 0) {
            const [accountLimit, connectedAccounts] = await Promise.all([
                (0, subscriptions_1.getFeatureLimit)(client, userId, constants_1.FEATURE_KEYS.socialAccountConnection),
                (0, socialAccounts_1.getSocialAccountCountByUser)(client, userId),
            ]);
            const remainingSlots = accountLimit === null
                ? Number.POSITIVE_INFINITY
                : Math.max(accountLimit - connectedAccounts, 0);
            if (newConnections > remainingSlots) {
                const message = accountLimit === 0
                    ? 'Social account connections are not included in your current plan'
                    : `Your current plan allows ${accountLimit} connected social account${accountLimit === 1 ? '' : 's'}. Upgrade to connect more.`;
                return res.status(403).json({
                    status: 'fail',
                    message,
                });
            }
        }
        const connectedAccounts = await Promise.all(accountInputs.map((input) => (0, socialAccounts_1.upsertSocialAccountByUniqueKey)(client, userId, input)));
        await (0, oauthConnectionSessions_1.deleteOAuthConnectionSession)(client, userId, session.id);
        return res.status(200).json({
            status: 'success',
            message: connectedAccounts.length === 1
                ? 'Facebook Page connected.'
                : `${connectedAccounts.length} Facebook Pages connected.`,
            data: {
                connectedAccounts,
            },
        });
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : 'Failed to connect the selected Facebook Pages';
        return res.status(/selected facebook pages|selection/i.test(message) ? 400 : 500).json({
            status: /selected facebook pages|selection/i.test(message) ? 'fail' : 'error',
            message,
        });
    }
};
exports.finalizePendingMetaFacebookPages = finalizePendingMetaFacebookPages;
const listConnectedSocialAccounts = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const accounts = await (0, socialAccounts_1.getSocialAccountsByUser)(client, req.user.id, {
            page: parsePositiveInt(req.query.page, 1),
            limit: parsePositiveInt(req.query.limit, 20),
        });
        return res.status(200).json({
            status: 'success',
            data: accounts,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to fetch social accounts',
        });
    }
};
exports.listConnectedSocialAccounts = listConnectedSocialAccounts;
const updateConnectedSocialAccount = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingAccount = await (0, socialAccounts_1.getSocialAccountById)(client, req.user.id, req.params.id);
        if (!existingAccount) {
            return res.status(404).json({
                status: 'fail',
                message: 'Social account not found',
            });
        }
        const account = await (0, socialAccounts_1.updateSocialAccount)(client, req.user.id, req.params.id, req.body);
        return res.status(200).json({
            status: 'success',
            message: 'Social account updated successfully',
            data: account,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to update social account',
        });
    }
};
exports.updateConnectedSocialAccount = updateConnectedSocialAccount;
const removeConnectedSocialAccount = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingAccount = await (0, socialAccounts_1.getSocialAccountById)(client, req.user.id, req.params.id);
        if (!existingAccount) {
            return res.status(404).json({
                status: 'fail',
                message: 'Social account not found',
            });
        }
        await (0, socialAccounts_1.deleteSocialAccount)(client, req.user.id, req.params.id);
        return res.status(200).json({
            status: 'success',
            message: 'Social account removed successfully',
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to remove social account',
        });
    }
};
exports.removeConnectedSocialAccount = removeConnectedSocialAccount;
const createSchedulerMediaAsset = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        if (req.body.contentId) {
            const content = await (0, content_1.getGeneratedContentById)(client, req.user.id, req.body.contentId);
            if (!content) {
                return res.status(404).json({
                    status: 'fail',
                    message: 'Generated content item not found',
                });
            }
        }
        if (req.body.generatedImageId) {
            const image = await (0, images_1.getGeneratedImageById)(client, req.user.id, req.body.generatedImageId);
            if (!image) {
                return res.status(404).json({
                    status: 'fail',
                    message: 'Generated image item not found',
                });
            }
        }
        const asset = await (0, scheduleBatches_1.createMediaAsset)(client, req.user.id, req.body);
        return res.status(201).json({
            status: 'success',
            message: 'Media asset created successfully',
            data: asset,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to create media asset',
        });
    }
};
exports.createSchedulerMediaAsset = createSchedulerMediaAsset;
const createScheduleBatchDraft = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const batch = await (0, scheduleBatches_1.createScheduleBatch)(client, req.user.id, {
            batchName: req.body.batchName ?? null,
            status: req.body.status ?? 'draft',
        });
        return res.status(201).json({
            status: 'success',
            message: 'Schedule batch created successfully',
            data: batch,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to create schedule batch',
        });
    }
};
exports.createScheduleBatchDraft = createScheduleBatchDraft;
const getScheduleBatch = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const detail = await (0, scheduleBatches_1.getScheduleBatchDetail)(client, req.user.id, req.params.id);
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
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to fetch schedule batch',
        });
    }
};
exports.getScheduleBatch = getScheduleBatch;
const deleteScheduleBatchDraft = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const batch = await (0, scheduleBatches_1.getScheduleBatchById)(client, req.user.id, req.params.id);
        if (!batch) {
            return res.status(404).json({
                status: 'fail',
                message: 'Schedule batch not found',
            });
        }
        await (0, scheduleBatches_1.deleteScheduleBatch)(client, req.user.id, req.params.id);
        return res.status(200).json({
            status: 'success',
            message: 'Draft deleted successfully',
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to delete schedule batch',
        });
    }
};
exports.deleteScheduleBatchDraft = deleteScheduleBatchDraft;
const listScheduleBatches = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const result = await (0, scheduleBatches_1.getScheduleBatchesByUser)(client, req.user.id, {
            page: parsePositiveInt(req.query.page, 1),
            limit: parsePositiveInt(req.query.limit, 24),
            status: req.query.status ?? null,
        });
        return res.status(200).json({
            status: 'success',
            data: result,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to fetch schedule batches',
        });
    }
};
exports.listScheduleBatches = listScheduleBatches;
const addScheduleBatchItems = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        assertNoDuplicateScheduledItems(req.body.items);
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const batch = await (0, scheduleBatches_1.getScheduleBatchById)(client, req.user.id, req.params.id);
        if (!batch) {
            return res.status(404).json({
                status: 'fail',
                message: 'Schedule batch not found',
            });
        }
        const existingItems = await (0, scheduleBatches_1.getScheduledItemsByBatch)(client, req.user.id, req.params.id);
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
                (0, scheduleBatches_1.getMediaAssetById)(client, req.user.id, item.mediaAssetId),
                (0, socialAccounts_1.getSocialAccountById)(client, req.user.id, item.socialAccountId),
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
            createdItems.push(await (0, scheduleBatches_1.createScheduledItem)(client, req.user.id, req.params.id, {
                mediaAssetId: item.mediaAssetId,
                socialAccountId: item.socialAccountId,
                platform: item.platform,
                accountId: item.accountId,
                caption: item.caption ?? null,
                scheduledAt: item.scheduledAt,
                status: item.status ?? 'pending',
            }));
        }
        await syncBatchStatusFromItems(client, req.user.id, req.params.id);
        return res.status(201).json({
            status: 'success',
            message: 'Scheduled items added successfully',
            data: createdItems,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to add scheduled items';
        return res.status(message.includes('not found') ||
            message === SCHEDULE_TIME_VALIDATION_MESSAGE ||
            message.includes('Duplicate schedule conflict') ||
            message.includes('supported')
            ? 400
            : 500).json({
            status: message.includes('not found') ||
                message === SCHEDULE_TIME_VALIDATION_MESSAGE ||
                message.includes('Duplicate schedule conflict') ||
                message.includes('supported')
                ? 'fail'
                : 'error',
            message,
        });
    }
};
exports.addScheduleBatchItems = addScheduleBatchItems;
const submitScheduleBatch = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const detail = await (0, scheduleBatches_1.getScheduleBatchDetail)(client, req.user.id, req.params.id);
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
                (await (0, socialAccounts_1.getSocialAccountById)(client, req.user.id, item.socialAccountId));
            const mediaAsset = item.mediaAsset ??
                (await (0, scheduleBatches_1.getMediaAssetById)(client, req.user.id, item.mediaAssetId));
            if (!socialAccount || !mediaAsset) {
                throw new Error('Scheduled item is missing its linked media or social account.');
            }
            if (socialAccount.platform === 'instagram') {
                ensureInstagramMediaAssetReady(mediaAsset);
            }
            ensureMetaScheduledPostCanPublish(item.platform, socialAccount, mediaAsset.storageUrl, mediaAsset.mediaType);
            ensureScheduledPostHasMedia(mediaAsset.storageUrl, mediaAsset.mediaType);
            const scheduledPost = await (0, scheduledPosts_1.createScheduledPost)(client, req.user.id, {
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
            await (0, schedulerPublisher_service_1.scheduleScheduledPostPublish)({
                id: scheduledPost.id,
                userId: scheduledPost.userId,
                scheduledFor: scheduledPost.scheduledFor,
                status: scheduledPost.status,
            });
            const updatedItem = await (0, scheduleBatches_1.updateScheduledItem)(client, req.user.id, item.id, {
                scheduledPostId: scheduledPost.id,
                status: 'scheduled',
                lastError: null,
            });
            await (0, scheduleBatches_1.appendScheduledItemLog)(client, {
                scheduledItemId: updatedItem.id,
                eventType: 'submitted',
                message: 'Scheduled item mirrored into the publishing queue.',
                payloadJson: {
                    scheduledPostId: scheduledPost.id,
                },
            });
            mirroredItems.push(updatedItem);
        }
        const batch = await (0, scheduleBatches_1.updateScheduleBatch)(client, req.user.id, req.params.id, {
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to submit schedule batch';
        return res.status(message === SCHEDULE_TIME_VALIDATION_MESSAGE ||
            message.includes('missing') ||
            message.includes('supported')
            ? 400
            : 500).json({
            status: message === SCHEDULE_TIME_VALIDATION_MESSAGE ||
                message.includes('missing') ||
                message.includes('supported')
                ? 'fail'
                : 'error',
            message,
        });
    }
};
exports.submitScheduleBatch = submitScheduleBatch;
const listScheduleItems = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const items = await (0, scheduleBatches_1.getScheduledItemsByUser)(client, req.user.id, {
            page: parsePositiveInt(req.query.page, 1),
            limit: parsePositiveInt(req.query.limit, 50),
            status: req.query.status ?? null,
        });
        return res.status(200).json({
            status: 'success',
            data: items,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to fetch scheduled items',
        });
    }
};
exports.listScheduleItems = listScheduleItems;
const updateScheduleItemRecord = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingItem = await (0, scheduleBatches_1.getScheduledItemById)(client, req.user.id, req.params.id);
        if (!existingItem) {
            return res.status(404).json({
                status: 'fail',
                message: 'Scheduled item not found',
            });
        }
        if (req.body.scheduledAt) {
            ensureFutureDate(req.body.scheduledAt, 'scheduledAt');
        }
        const updatedItem = await (0, scheduleBatches_1.updateScheduledItem)(client, req.user.id, req.params.id, {
            mediaAssetId: req.body.mediaAssetId,
            socialAccountId: req.body.socialAccountId,
            platform: req.body.platform,
            accountId: req.body.accountId,
            caption: req.body.caption,
            scheduledAt: req.body.scheduledAt,
            status: req.body.status,
        });
        if (existingItem.scheduledPostId) {
            const mediaAsset = await (0, scheduleBatches_1.getMediaAssetById)(client, req.user.id, updatedItem.mediaAssetId);
            if (!mediaAsset) {
                throw new Error('Media asset not found');
            }
            const updatedPost = await (0, scheduledPosts_1.updateScheduledPost)(client, req.user.id, existingItem.scheduledPostId, {
                socialAccountId: updatedItem.socialAccountId,
                contentId: mediaAsset.contentId,
                generatedImageId: mediaAsset.generatedImageId,
                platform: updatedItem.platform,
                caption: updatedItem.caption,
                mediaUrl: mediaAsset.storageUrl,
                mediaType: mediaAsset.mediaType,
                scheduledFor: updatedItem.scheduledAt,
                status: updatedItem.status === 'cancelled'
                    ? 'cancelled'
                    : updatedItem.status === 'published' || updatedItem.status === 'failed'
                        ? updatedItem.status
                        : 'scheduled',
            });
            if (updatedPost.status === 'cancelled') {
                await (0, schedulerPublisher_service_1.unscheduleScheduledPostPublish)(updatedPost.id);
            }
            else {
                await (0, schedulerPublisher_service_1.scheduleScheduledPostPublish)({
                    id: updatedPost.id,
                    userId: updatedPost.userId,
                    scheduledFor: updatedPost.scheduledFor,
                    status: updatedPost.status,
                });
            }
        }
        await syncBatchStatusFromItems(client, req.user.id, updatedItem.batchId);
        return res.status(200).json({
            status: 'success',
            message: 'Scheduled item updated successfully',
            data: updatedItem,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update scheduled item';
        return res.status(message === SCHEDULE_TIME_VALIDATION_MESSAGE ? 400 : 500).json({
            status: message === SCHEDULE_TIME_VALIDATION_MESSAGE ? 'fail' : 'error',
            message,
        });
    }
};
exports.updateScheduleItemRecord = updateScheduleItemRecord;
const cancelScheduleItemRecord = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingItem = await (0, scheduleBatches_1.getScheduledItemById)(client, req.user.id, req.params.id);
        if (!existingItem) {
            return res.status(404).json({
                status: 'fail',
                message: 'Scheduled item not found',
            });
        }
        if (existingItem.scheduledPostId) {
            const scheduledPost = await (0, scheduledPosts_1.getScheduledPostById)(client, req.user.id, existingItem.scheduledPostId);
            if (scheduledPost && ['pending', 'scheduled'].includes(scheduledPost.status)) {
                const updatedPost = await (0, scheduledPosts_1.updateScheduledPostStatus)(client, req.user.id, scheduledPost.id, 'cancelled', null);
                await (0, schedulerPublisher_service_1.unscheduleScheduledPostPublish)(updatedPost.id);
            }
        }
        const updatedItem = await (0, scheduleBatches_1.updateScheduledItem)(client, req.user.id, req.params.id, {
            status: 'cancelled',
            lastError: null,
        });
        await (0, scheduleBatches_1.appendScheduledItemLog)(client, {
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
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to cancel scheduled item',
        });
    }
};
exports.cancelScheduleItemRecord = cancelScheduleItemRecord;
const createPostSchedule = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        ensureFutureDate(req.body.scheduledFor);
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const resolved = await resolveScheduledPostDefaults(client, req.user.id, {
            socialAccountId: req.body.socialAccountId,
            contentId: req.body.contentId ?? null,
            generatedImageId: req.body.generatedImageId ?? null,
            platform: req.body.platform ?? null,
            caption: req.body.caption ?? null,
            mediaUrl: req.body.mediaUrl ?? null,
            mediaType: req.body.mediaType ?? null,
        });
        ensureMetaScheduledPostCanPublish(resolved.platform, resolved.socialAccount, resolved.mediaUrl, resolved.mediaType);
        ensureScheduledPostHasMedia(resolved.mediaUrl, resolved.mediaType);
        const scheduledPost = await (0, scheduledPosts_1.createScheduledPost)(client, req.user.id, {
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
        await (0, schedulerPublisher_service_1.scheduleScheduledPostPublish)({
            id: scheduledPost.id,
            userId: scheduledPost.userId,
            scheduledFor: scheduledPost.scheduledFor,
            status: scheduledPost.status,
        });
        return res.status(201).json({
            status: 'success',
            message: 'Post scheduled successfully',
            data: scheduledPost,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create scheduled post';
        const isValidationFailure = message.includes('not found') ||
            message === SCHEDULE_TIME_VALIDATION_MESSAGE ||
            message === 'Invalid media URL' ||
            message === 'No preview available for this link' ||
            message === 'Add image or video media before scheduling this post.' ||
            message.includes('supported') ||
            message.includes('must be 50MB') ||
            message.includes('must be 6MB');
        return res.status(isValidationFailure
            ? 400
            : message.includes('download media')
                ? 502
                : 500).json({
            status: isValidationFailure ? 'fail' : 'error',
            message,
        });
    }
};
exports.createPostSchedule = createPostSchedule;
const listScheduledPosts = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const scheduledPosts = await (0, scheduledPosts_1.getScheduledPostsByUser)(client, req.user.id, {
            page: parsePositiveInt(req.query.page, 1),
            limit: parsePositiveInt(req.query.limit, 20),
        });
        return res.status(200).json({
            status: 'success',
            data: scheduledPosts,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to fetch scheduled posts',
        });
    }
};
exports.listScheduledPosts = listScheduledPosts;
const updatePostSchedule = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingPost = await (0, scheduledPosts_1.getScheduledPostById)(client, req.user.id, req.params.id);
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
            contentId: req.body.contentId === undefined ? existingPost.contentId : req.body.contentId,
            generatedImageId: req.body.generatedImageId === undefined
                ? existingPost.generatedImageId
                : req.body.generatedImageId,
            platform: req.body.platform === undefined ? existingPost.platform : req.body.platform,
            caption: req.body.caption === undefined ? existingPost.caption : req.body.caption,
            mediaUrl: req.body.mediaUrl === undefined ? existingPost.mediaUrl : req.body.mediaUrl,
            mediaType: req.body.mediaType === undefined ? existingPost.mediaType : req.body.mediaType,
        });
        ensureMetaScheduledPostCanPublish(resolved.platform, resolved.socialAccount, resolved.mediaUrl, resolved.mediaType);
        const updatedPost = await (0, scheduledPosts_1.updateScheduledPost)(client, req.user.id, req.params.id, {
            socialAccountId: req.body.socialAccountId ?? existingPost.socialAccountId,
            contentId: req.body.contentId === undefined ? existingPost.contentId : req.body.contentId,
            generatedImageId: req.body.generatedImageId === undefined
                ? existingPost.generatedImageId
                : req.body.generatedImageId,
            platform: resolved.platform,
            caption: resolved.caption,
            mediaUrl: resolved.mediaUrl,
            mediaType: resolved.mediaType,
            scheduledFor: req.body.scheduledFor ?? existingPost.scheduledFor,
            status: req.body.status ?? existingPost.status,
        });
        if (updatedPost.status === 'cancelled') {
            await (0, schedulerPublisher_service_1.unscheduleScheduledPostPublish)(updatedPost.id);
        }
        else {
            await (0, schedulerPublisher_service_1.scheduleScheduledPostPublish)({
                id: updatedPost.id,
                userId: updatedPost.userId,
                scheduledFor: updatedPost.scheduledFor,
                status: updatedPost.status,
            });
        }
        await (0, scheduleBatches_1.syncScheduledItemStatusByScheduledPostId)(client, updatedPost.id, {
            status: updatedPost.status === 'published' || updatedPost.status === 'failed'
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update scheduled post';
        const isValidationFailure = message.includes('not found') ||
            message === SCHEDULE_TIME_VALIDATION_MESSAGE ||
            message.includes('can be edited') ||
            message === 'Invalid media URL' ||
            message === 'No preview available for this link' ||
            message.includes('supported') ||
            message.includes('must be 50MB') ||
            message.includes('must be 6MB');
        const isBufferFailure = message === scheduledPosts_1.SCHEDULED_POST_ACTION_BLOCKED_REASON;
        return res.status(isValidationFailure
            ? 400
            : isBufferFailure
                ? 409
                : message.includes('download media')
                    ? 502
                    : 500).json({
            status: isValidationFailure || isBufferFailure ? 'fail' : 'error',
            message,
        });
    }
};
exports.updatePostSchedule = updatePostSchedule;
const updatePostScheduleStatus = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingPost = await (0, scheduledPosts_1.getScheduledPostById)(client, req.user.id, req.params.id);
        if (!existingPost) {
            return res.status(404).json({
                status: 'fail',
                message: 'Scheduled post not found',
            });
        }
        if (req.body.status === 'cancelled') {
            ensureScheduledPostCanBeCancelled(existingPost);
        }
        const publishedAt = req.body.status === 'published'
            ? req.body.publishedAt ?? new Date().toISOString()
            : req.body.publishedAt ?? null;
        const updatedPost = await (0, scheduledPosts_1.updateScheduledPostStatus)(client, req.user.id, req.params.id, req.body.status, publishedAt);
        if (updatedPost.status === 'cancelled' ||
            updatedPost.status === 'published' ||
            updatedPost.status === 'failed') {
            await (0, schedulerPublisher_service_1.unscheduleScheduledPostPublish)(updatedPost.id);
        }
        else {
            await (0, schedulerPublisher_service_1.scheduleScheduledPostPublish)({
                id: updatedPost.id,
                userId: updatedPost.userId,
                scheduledFor: updatedPost.scheduledFor,
                status: updatedPost.status,
            });
        }
        const syncedItems = await (0, scheduleBatches_1.syncScheduledItemStatusByScheduledPostId)(client, updatedPost.id, {
            status: req.body.status === 'scheduled' || req.body.status === 'pending'
                ? 'scheduled'
                : req.body.status === 'cancelled'
                    ? 'cancelled'
                    : req.body.status,
            lastError: updatedPost.lastError,
        }).catch(() => []);
        if (syncedItems.length) {
            await Promise.all(syncedItems.map((item) => syncBatchStatusFromItems(client, req.user.id, item.batchId).catch(() => null)));
        }
        return res.status(200).json({
            status: 'success',
            message: 'Scheduled post status updated successfully',
            data: updatedPost,
        });
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : 'Failed to update scheduled post status';
        const isActionFailure = message === scheduledPosts_1.SCHEDULED_POST_ACTION_BLOCKED_REASON ||
            message.includes('can be cancelled');
        return res.status(isActionFailure ? 409 : 500).json({
            status: isActionFailure ? 'fail' : 'error',
            message,
        });
    }
};
exports.updatePostScheduleStatus = updatePostScheduleStatus;
const cancelPostSchedule = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingPost = await (0, scheduledPosts_1.getScheduledPostById)(client, req.user.id, req.params.id);
        if (!existingPost) {
            return res.status(404).json({
                status: 'fail',
                message: 'Scheduled post not found',
            });
        }
        ensureScheduledPostCanBeCancelled(existingPost);
        const updatedPost = await (0, scheduledPosts_1.updateScheduledPostStatus)(client, req.user.id, req.params.id, 'cancelled', null);
        await (0, schedulerPublisher_service_1.unscheduleScheduledPostPublish)(updatedPost.id);
        const syncedItems = await (0, scheduleBatches_1.syncScheduledItemStatusByScheduledPostId)(client, updatedPost.id, {
            status: 'cancelled',
            lastError: null,
        }).catch(() => []);
        if (syncedItems.length) {
            await Promise.all(syncedItems.map((item) => syncBatchStatusFromItems(client, req.user.id, item.batchId).catch(() => null)));
        }
        return res.status(200).json({
            status: 'success',
            message: 'Scheduled post cancelled successfully',
            data: updatedPost,
        });
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : 'Failed to cancel scheduled post';
        return res.status(message === scheduledPosts_1.SCHEDULED_POST_ACTION_BLOCKED_REASON ||
            message.includes('can be cancelled')
            ? 409
            : 500).json({
            status: message === scheduledPosts_1.SCHEDULED_POST_ACTION_BLOCKED_REASON ||
                message.includes('can be cancelled')
                ? 'fail'
                : 'error',
            message,
        });
    }
};
exports.cancelPostSchedule = cancelPostSchedule;
const deletePostSchedule = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingPost = await (0, scheduledPosts_1.getScheduledPostById)(client, req.user.id, req.params.id);
        if (!existingPost) {
            return res.status(404).json({
                status: 'fail',
                message: 'Scheduled post not found',
            });
        }
        await (0, scheduledPosts_1.deleteScheduledPost)(client, req.user.id, req.params.id);
        await (0, schedulerPublisher_service_1.unscheduleScheduledPostPublish)(req.params.id);
        return res.status(200).json({
            status: 'success',
            message: 'Scheduled post deleted successfully',
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to delete scheduled post',
        });
    }
};
exports.deletePostSchedule = deletePostSchedule;
