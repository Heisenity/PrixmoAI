"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePostSchedule = exports.updatePostScheduleStatus = exports.updatePostSchedule = exports.listScheduledPosts = exports.createPostSchedule = exports.removeConnectedSocialAccount = exports.updateConnectedSocialAccount = exports.listConnectedSocialAccounts = exports.finalizePendingMetaFacebookPages = exports.listPendingMetaFacebookPages = exports.handleMetaOAuthCallback = exports.startMetaOAuth = exports.createConnectedSocialAccount = void 0;
const content_1 = require("../db/queries/content");
const images_1 = require("../db/queries/images");
const scheduledPosts_1 = require("../db/queries/scheduledPosts");
const oauthConnectionSessions_1 = require("../db/queries/oauthConnectionSessions");
const socialAccounts_1 = require("../db/queries/socialAccounts");
const subscriptions_1 = require("../db/queries/subscriptions");
const supabase_1 = require("../db/supabase");
const constants_1 = require("../config/constants");
const meta_service_1 = require("../services/meta.service");
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
const META_OAUTH_POPUP_MESSAGE_TYPE = 'prixmoai:meta-oauth';
const coerceProfileValue = (value) => {
    const normalized = value?.trim();
    return normalized ? normalized : null;
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
const ensureMetaScheduledPostCanPublish = (platform, socialAccount, mediaUrl) => {
    if (!socialAccount || socialAccount.oauthProvider !== 'meta') {
        return;
    }
    if (socialAccount.verificationStatus !== 'verified') {
        throw new Error('Reconnect this Meta account before queueing live publishing.');
    }
    if (platform === 'instagram' && !mediaUrl) {
        throw new Error('Instagram scheduled posts need an image before PrixmoAI can publish them.');
    }
};
const ensureFutureDate = (isoDate, fieldName = 'scheduledFor') => {
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Invalid ${fieldName} value`);
    }
    if (parsed.getTime() <= Date.now()) {
        throw new Error(`${fieldName} must be a future date`);
    }
};
const buildMetaOAuthPopupHtml = (payload, fallbackRedirectUrl) => {
    const targetOrigin = new URL(constants_1.CLIENT_APP_URL).origin;
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PrixmoAI Connection</title>
    <style>
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
    <script>
      (function () {
        var payload = ${JSON.stringify({
        type: META_OAUTH_POPUP_MESSAGE_TYPE,
        result: payload,
        ...payload,
    })};
        var fallbackRedirectUrl = ${JSON.stringify(fallbackRedirectUrl)};
        var targetOrigin = ${JSON.stringify(targetOrigin)};

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
        return res
            .status(200)
            .type('html')
            .send(buildMetaOAuthPopupHtml(payload, fallbackRedirectUrl));
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
    return {
        socialAccount,
        content,
        image,
        platform: input.platform ?? socialAccount.platform,
        caption: input.caption === undefined
            ? content?.captions?.[0]?.mainCopy ?? null
            : input.caption,
        mediaUrl: input.mediaUrl === undefined
            ? image?.generatedImageUrl ?? null
            : input.mediaUrl,
    };
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
                popupOrigin: new URL(constants_1.META_REDIRECT_URI).origin,
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
                    message: 'Meta did not return any Facebook Pages for this login. Make sure you manage at least one Page.',
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
        });
        ensureMetaScheduledPostCanPublish(resolved.platform, resolved.socialAccount, resolved.mediaUrl);
        const scheduledPost = await (0, scheduledPosts_1.createScheduledPost)(client, req.user.id, {
            socialAccountId: req.body.socialAccountId,
            contentId: req.body.contentId ?? null,
            generatedImageId: req.body.generatedImageId ?? null,
            platform: resolved.platform,
            caption: resolved.caption,
            mediaUrl: resolved.mediaUrl,
            scheduledFor: req.body.scheduledFor,
            status: req.body.status ?? 'scheduled',
        });
        return res.status(201).json({
            status: 'success',
            message: 'Post scheduled successfully',
            data: scheduledPost,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create scheduled post';
        return res.status(message.includes('not found') || message.includes('must be a future')
            ? 400
            : 500).json({
            status: message.includes('not found') || message.includes('must be a future')
                ? 'fail'
                : 'error',
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
        const resolved = await resolveScheduledPostDefaults(client, req.user.id, {
            socialAccountId: req.body.socialAccountId ?? existingPost.socialAccountId,
            contentId: req.body.contentId === undefined ? existingPost.contentId : req.body.contentId,
            generatedImageId: req.body.generatedImageId === undefined
                ? existingPost.generatedImageId
                : req.body.generatedImageId,
            platform: req.body.platform === undefined ? existingPost.platform : req.body.platform,
            caption: req.body.caption === undefined ? existingPost.caption : req.body.caption,
            mediaUrl: req.body.mediaUrl === undefined ? existingPost.mediaUrl : req.body.mediaUrl,
        });
        ensureMetaScheduledPostCanPublish(resolved.platform, resolved.socialAccount, resolved.mediaUrl);
        const updatedPost = await (0, scheduledPosts_1.updateScheduledPost)(client, req.user.id, req.params.id, {
            socialAccountId: req.body.socialAccountId ?? existingPost.socialAccountId,
            contentId: req.body.contentId === undefined ? existingPost.contentId : req.body.contentId,
            generatedImageId: req.body.generatedImageId === undefined
                ? existingPost.generatedImageId
                : req.body.generatedImageId,
            platform: resolved.platform,
            caption: resolved.caption,
            mediaUrl: resolved.mediaUrl,
            scheduledFor: req.body.scheduledFor ?? existingPost.scheduledFor,
            status: req.body.status ?? existingPost.status,
        });
        return res.status(200).json({
            status: 'success',
            message: 'Scheduled post updated successfully',
            data: updatedPost,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update scheduled post';
        return res.status(message.includes('not found') || message.includes('must be a future')
            ? 400
            : 500).json({
            status: message.includes('not found') || message.includes('must be a future')
                ? 'fail'
                : 'error',
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
        const publishedAt = req.body.status === 'published'
            ? req.body.publishedAt ?? new Date().toISOString()
            : req.body.publishedAt ?? null;
        const updatedPost = await (0, scheduledPosts_1.updateScheduledPostStatus)(client, req.user.id, req.params.id, req.body.status, publishedAt);
        return res.status(200).json({
            status: 'success',
            message: 'Scheduled post status updated successfully',
            data: updatedPost,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to update scheduled post status',
        });
    }
};
exports.updatePostScheduleStatus = updatePostScheduleStatus;
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
