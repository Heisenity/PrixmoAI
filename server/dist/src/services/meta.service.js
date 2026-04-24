"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMetaOAuthFacebookPageSelectionRedirectUrl = exports.getMetaOAuthErrorRedirectUrl = exports.getMetaOAuthSuccessRedirectUrl = exports.publishScheduledMetaPost = exports.verifyClaimedMetaAccount = exports.exchangeMetaAuthorizationCode = exports.buildMetaOAuthUrl = exports.readSignedMetaOAuthState = exports.createSignedMetaOAuthState = exports.buildFacebookNoPagesMessage = void 0;
const crypto_1 = require("crypto");
const constants_1 = require("../config/constants");
const META_AUTH_URL = `https://www.facebook.com/${constants_1.META_GRAPH_VERSION}/dialog/oauth`;
const META_GRAPH_URL = `https://graph.facebook.com/${constants_1.META_GRAPH_VERSION}`;
const INSTAGRAM_CONSENT_URL = 'https://www.instagram.com/consent/';
const INSTAGRAM_AUTH_URL = 'https://www.instagram.com/oauth/authorize';
const INSTAGRAM_GRAPH_URL = 'https://graph.instagram.com';
const INSTAGRAM_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const DEV_FACEBOOK_TEST_SCOPES = [
    'pages_manage_metadata',
    'business_management',
];
const normalizeHandle = (value) => value.trim().toLowerCase().replace(/^@+/, '');
const normalizeLooseText = (value) => value.trim().toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9]+/g, '');
const readRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
const wait = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
const uniqueStrings = (values) => [
    ...new Set(values
        .filter((value) => Boolean(value?.trim()))
        .map((value) => value.trim())),
];
const getFacebookOAuthScopes = () => uniqueStrings([
    ...constants_1.META_FACEBOOK_OAUTH_SCOPES,
    ...(constants_1.META_OAUTH_DEBUG ? DEV_FACEBOOK_TEST_SCOPES : []),
]);
const countConnectablePages = (pages) => pages.filter((page) => Boolean(page.access_token)).length;
const summarizeMetaPages = (pages) => pages.map((page) => ({
    id: page.id,
    name: page.name,
    hasAccessToken: Boolean(page.access_token),
    tasks: Array.isArray(page.tasks)
        ? page.tasks.filter((task) => typeof task === 'string')
        : [],
}));
const mergeMetaPages = (primaryPages, secondaryPages) => {
    const pagesById = new Map();
    for (const page of primaryPages) {
        pagesById.set(page.id, {
            ...page,
            tasks: Array.isArray(page.tasks) ? [...page.tasks] : [],
        });
    }
    for (const page of secondaryPages) {
        const existing = pagesById.get(page.id);
        if (!existing) {
            pagesById.set(page.id, {
                ...page,
                tasks: Array.isArray(page.tasks) ? [...page.tasks] : [],
            });
            continue;
        }
        pagesById.set(page.id, {
            ...page,
            ...existing,
            link: existing.link ?? page.link,
            access_token: existing.access_token ?? page.access_token,
            tasks: uniqueStrings([...(existing.tasks ?? []), ...(page.tasks ?? [])]),
            instagram_business_account: existing.instagram_business_account ?? page.instagram_business_account ?? null,
            connected_instagram_account: existing.connected_instagram_account ??
                page.connected_instagram_account ??
                null,
        });
    }
    return [...pagesById.values()];
};
const logMetaOAuthDebug = (stage, payload) => {
    if (!constants_1.META_OAUTH_DEBUG) {
        return;
    }
    console.log(`[meta-oauth] ${stage} ${JSON.stringify(payload)}`);
};
const buildFacebookNoPagesMessage = (debug) => {
    if (!debug) {
        return ('Meta did not return any Facebook Pages for this login. Reconnect and use ' +
            'Edit access to enable the Page for this app. If the app is still in ' +
            'development mode, the Facebook profile you use must be added to the app Roles.');
    }
    const grantedScopes = new Set(debug.grantedScopes);
    const missingScopes = getFacebookOAuthScopes().filter((scope) => !grantedScopes.has(scope));
    if (missingScopes.length) {
        return (`Meta did not grant the required Page permissions (${missingScopes.join(', ')}). ` +
            'Reconnect and approve full Page access for the app.');
    }
    if (debug.pages.length) {
        return ('Meta returned Facebook Pages, but none included a usable Page access token. ' +
            'Reconnect and use Edit access to enable the Page for this app.');
    }
    if (debug.granularPageTargetIds.length === 0 && grantedScopes.has('pages_show_list')) {
        return ('Meta granted Page-list access, but no specific Pages were selected for this app. ' +
            'Reconnect, click Edit access, and choose the Page you want to connect.');
    }
    return ('Meta did not return any Facebook Pages for this login. Reconnect and use ' +
        'Edit access to enable the Page for this app. If the app is still in ' +
        'development mode, the Facebook profile you use must be added to the app Roles.');
};
exports.buildFacebookNoPagesMessage = buildFacebookNoPagesMessage;
const getDirectInstagramOAuthScopes = () => constants_1.META_INSTAGRAM_OAUTH_SCOPES.map((scope) => {
    if (scope === 'instagram_basic') {
        return 'instagram_business_basic';
    }
    if (scope === 'instagram_content_publish') {
        return 'instagram_business_content_publish';
    }
    if (scope === 'instagram_manage_comments') {
        return 'instagram_business_manage_comments';
    }
    if (scope === 'instagram_manage_insights') {
        return 'instagram_business_manage_insights';
    }
    return scope;
});
const getInstagramConsentScopes = () => uniqueStrings(getDirectInstagramOAuthScopes());
const getInstagramLoginClientId = () => constants_1.META_INSTAGRAM_APP_ID;
const getInstagramLoginClientSecret = () => constants_1.META_INSTAGRAM_APP_SECRET;
const getMetaOAuthRedirectUri = (platform) => platform === 'instagram'
    ? constants_1.META_INSTAGRAM_REDIRECT_URI
    : constants_1.META_FACEBOOK_REDIRECT_URI;
const toProfileUrl = (platform, accountId, fallback) => {
    if (fallback?.trim()) {
        return fallback.trim();
    }
    if (platform === 'instagram') {
        return `https://instagram.com/${accountId}`;
    }
    return null;
};
const ensureMetaOAuthConfigured = (platform) => {
    const configured = platform === 'instagram'
        ? constants_1.isMetaInstagramOAuthConfigured
        : platform === 'facebook'
            ? constants_1.isMetaFacebookOAuthConfigured
            : constants_1.isMetaOAuthConfigured;
    if (!configured) {
        throw new Error('Meta OAuth is not configured yet. Add the Meta app credentials on the server first.');
    }
};
const createStateSignature = (payloadSegment) => (0, crypto_1.createHmac)('sha256', constants_1.META_OAUTH_STATE_SECRET)
    .update(payloadSegment)
    .digest('base64url');
const toBase64UrlJson = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const fromBase64UrlJson = (value) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
const buildMetaOAuthRedirectUrl = (status, message, extraParams = {}) => {
    const redirectUrl = new URL('/app/scheduler', constants_1.CLIENT_APP_URL);
    redirectUrl.searchParams.set('meta_oauth', status);
    if (message) {
        redirectUrl.searchParams.set('message', message);
    }
    for (const [key, value] of Object.entries(extraParams)) {
        redirectUrl.searchParams.set(key, value);
    }
    return redirectUrl.toString();
};
const extractFacebookLinkIdentifier = (link) => {
    if (!link) {
        return null;
    }
    try {
        const url = new URL(link);
        const firstSegment = url.pathname.split('/').filter(Boolean)[0];
        return firstSegment ? normalizeHandle(firstSegment) : null;
    }
    catch {
        return null;
    }
};
const readMetaInstagramAccount = (page) => page.instagram_business_account ?? page.connected_instagram_account ?? null;
const getMetaVerificationErrorMessage = (platform) => platform === 'instagram'
    ? 'Meta could not verify that Instagram professional account. Make sure the handle belongs to the Instagram business account connected to your Meta Page.'
    : 'Meta could not verify that Facebook Page. Make sure the page is available in the Meta account you connected.';
const getMetaPublishingErrorMessage = (platform, metadata) => {
    if (platform === 'instagram' && !metadata.metaInstagramAccountId) {
        return 'This Meta connection is missing the Instagram business account mapping.';
    }
    if (!metadata.metaPageId) {
        return 'This Meta connection is missing the Facebook Page mapping.';
    }
    return 'This Meta connection cannot publish yet. Reconnect the account and try again.';
};
const compareInstagramClaim = (claim, account) => {
    const candidates = new Set([normalizeHandle(claim.accountId)]);
    if (claim.profileUrl) {
        try {
            const pathSegment = new URL(claim.profileUrl).pathname.split('/').filter(Boolean)[0];
            if (pathSegment) {
                candidates.add(normalizeHandle(pathSegment));
            }
        }
        catch {
            // Ignore malformed URLs here; they were already validated before OAuth start.
        }
    }
    if (account.username) {
        const username = normalizeHandle(account.username);
        if (candidates.has(username)) {
            return true;
        }
    }
    return candidates.has(normalizeHandle(account.id));
};
const compareFacebookClaim = (claim, page) => {
    const candidates = new Set([
        normalizeHandle(claim.accountId),
        normalizeLooseText(claim.accountId),
    ]);
    const linkIdentifier = extractFacebookLinkIdentifier(page.link);
    if (claim.profileUrl) {
        try {
            const claimedUrl = new URL(claim.profileUrl);
            const claimedSegment = claimedUrl.pathname.split('/').filter(Boolean)[0] ||
                claimedUrl.searchParams.get('id') ||
                '';
            if (claimedSegment) {
                candidates.add(normalizeHandle(claimedSegment));
                candidates.add(normalizeLooseText(claimedSegment));
            }
        }
        catch {
            // Ignore malformed URLs here; they were already validated before OAuth start.
        }
    }
    const pageCandidates = new Set([
        normalizeHandle(page.id),
        normalizeLooseText(page.id),
        normalizeLooseText(page.name),
    ]);
    if (linkIdentifier) {
        pageCandidates.add(normalizeHandle(linkIdentifier));
        pageCandidates.add(normalizeLooseText(linkIdentifier));
    }
    for (const candidate of candidates) {
        if (pageCandidates.has(candidate)) {
            return true;
        }
    }
    return false;
};
const metaGraphFetch = async (path, params, init) => {
    const url = new URL(path.startsWith('http') ? path : `${META_GRAPH_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') {
            continue;
        }
        url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => ({})));
    const errorPayload = payload;
    if (!response.ok || errorPayload.error?.message) {
        const message = errorPayload.error?.message || 'Meta API request failed.';
        throw new Error(message);
    }
    return payload;
};
const instagramGraphFetch = async (path, params, init) => {
    const url = new URL(path.startsWith('http') ? path : `${INSTAGRAM_GRAPH_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') {
            continue;
        }
        url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => ({})));
    const errorPayload = payload;
    if (!response.ok || errorPayload.error?.message) {
        const message = errorPayload.error?.message || 'Instagram API request failed.';
        throw new Error(message);
    }
    return payload;
};
const exchangeCodeForShortLivedUserToken = async (code) => metaGraphFetch('/oauth/access_token', {
    client_id: constants_1.META_FACEBOOK_APP_ID,
    client_secret: constants_1.META_FACEBOOK_APP_SECRET,
    redirect_uri: getMetaOAuthRedirectUri('facebook'),
    code,
});
const exchangeInstagramCodeForShortLivedUserToken = async (code) => {
    const body = new URLSearchParams({
        client_id: getInstagramLoginClientId(),
        client_secret: getInstagramLoginClientSecret(),
        grant_type: 'authorization_code',
        redirect_uri: getMetaOAuthRedirectUri('instagram'),
        code,
    });
    const response = await fetch(INSTAGRAM_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    });
    const payload = (await response.json().catch(() => ({})));
    const errorPayload = payload;
    if (!response.ok || errorPayload.error?.message) {
        throw new Error(errorPayload.error?.message ||
            'Instagram could not complete the business login token exchange.');
    }
    return payload;
};
const exchangeForLongLivedUserToken = async (shortLivedToken) => metaGraphFetch('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: constants_1.META_FACEBOOK_APP_ID,
    client_secret: constants_1.META_FACEBOOK_APP_SECRET,
    fb_exchange_token: shortLivedToken,
});
const exchangeInstagramForLongLivedUserToken = async (shortLivedToken, clientSecret = getInstagramLoginClientSecret()) => instagramGraphFetch('/access_token', {
    grant_type: 'ig_exchange_token',
    client_secret: clientSecret,
    access_token: shortLivedToken,
});
const fetchMetaUserProfile = async (accessToken) => metaGraphFetch('/me', {
    access_token: accessToken,
    fields: 'id,name',
});
const fetchMetaPages = async (accessToken) => metaGraphFetch('/me/accounts', {
    access_token: accessToken,
    fields: [
        'id',
        'name',
        'link',
        'access_token',
        'tasks',
        'instagram_business_account{id,username,name,profile_picture_url}',
        'connected_instagram_account{id,username,name,profile_picture_url}',
    ].join(','),
    limit: 100,
});
const debugMetaUserToken = async (accessToken) => metaGraphFetch('/debug_token', {
    input_token: accessToken,
    access_token: `${constants_1.META_FACEBOOK_APP_ID}|${constants_1.META_FACEBOOK_APP_SECRET}`,
});
const fetchInstagramBusinessProfile = async (accessToken, userId) => {
    const readProfile = async (path) => instagramGraphFetch(path, {
        access_token: accessToken,
        fields: 'user_id,username,name,profile_picture_url',
    });
    let profile;
    try {
        profile = await readProfile('/me');
    }
    catch (error) {
        if (!userId) {
            throw error;
        }
        profile = await readProfile(`/${userId}`);
    }
    const id = profile.user_id ?? profile.id;
    if (id === undefined || id === null) {
        throw new Error('Instagram did not return the professional account ID for this login.');
    }
    return {
        id: String(id),
        username: profile.username,
        name: profile.name,
        profile_picture_url: profile.profile_picture_url,
    };
};
const createFacebookPagePost = async (pageId, accessToken, caption, mediaUrl, mediaType) => {
    if (!mediaUrl) {
        const feedResponse = await metaGraphFetch(`/${pageId}/feed`, {
            access_token: accessToken,
            message: caption || 'Published via PrixmoAI',
        });
        return feedResponse.id;
    }
    if (mediaType === 'video') {
        const videoResponse = await metaGraphFetch(`/${pageId}/videos`, {
            access_token: accessToken,
            file_url: mediaUrl,
            description: caption || undefined,
        }, {
            method: 'POST',
        });
        return videoResponse.id;
    }
    const photoResponse = await metaGraphFetch(`/${pageId}/photos`, {
        access_token: accessToken,
        url: mediaUrl,
        caption: caption || undefined,
    }, {
        method: 'POST',
    });
    return photoResponse.post_id || photoResponse.id;
};
const pollInstagramContainerUntilReady = async (creationId, accessToken) => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const status = await metaGraphFetch(`/${creationId}`, {
            access_token: accessToken,
            fields: 'status_code,status',
        });
        if (status.status_code === 'FINISHED') {
            return;
        }
        if (status.status_code === 'ERROR') {
            throw new Error('Meta could not finish preparing the Instagram media container.');
        }
        await wait(4000);
    }
    throw new Error('Meta took too long to prepare the Instagram media container.');
};
const pollInstagramBusinessContainerUntilReady = async (creationId, accessToken) => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const status = await instagramGraphFetch(`/${creationId}`, {
            access_token: accessToken,
            fields: 'status_code,status',
        });
        if (status.status_code === 'FINISHED') {
            return;
        }
        if (status.status_code === 'ERROR') {
            throw new Error('Instagram could not finish preparing the media container.');
        }
        await wait(4000);
    }
    throw new Error('Instagram took too long to prepare the media container.');
};
const publishInstagramImage = async (instagramAccountId, accessToken, caption, mediaUrl) => {
    if (!mediaUrl) {
        throw new Error('Instagram publishing requires an image. Add media to the scheduled post first.');
    }
    const container = await metaGraphFetch(`/${instagramAccountId}/media`, {
        access_token: accessToken,
        image_url: mediaUrl,
        caption: caption || undefined,
    }, {
        method: 'POST',
    });
    await pollInstagramContainerUntilReady(container.id, accessToken);
    const publishResponse = await metaGraphFetch(`/${instagramAccountId}/media_publish`, {
        access_token: accessToken,
        creation_id: container.id,
    }, {
        method: 'POST',
    });
    return publishResponse.id;
};
const publishInstagramVideo = async (instagramAccountId, accessToken, caption, mediaUrl) => {
    if (!mediaUrl) {
        throw new Error('Instagram publishing requires a video. Add media to the scheduled post first.');
    }
    const container = await metaGraphFetch(`/${instagramAccountId}/media`, {
        access_token: accessToken,
        media_type: 'REELS',
        video_url: mediaUrl,
        share_to_feed: true,
        caption: caption || undefined,
    }, {
        method: 'POST',
    });
    await pollInstagramContainerUntilReady(container.id, accessToken);
    const publishResponse = await metaGraphFetch(`/${instagramAccountId}/media_publish`, {
        access_token: accessToken,
        creation_id: container.id,
    }, {
        method: 'POST',
    });
    return publishResponse.id;
};
const publishInstagramBusinessLoginImage = async (instagramAccountId, accessToken, caption, mediaUrl) => {
    if (!mediaUrl) {
        throw new Error('Instagram publishing requires an image. Add media to the scheduled post first.');
    }
    const container = await instagramGraphFetch(`/${instagramAccountId}/media`, {
        access_token: accessToken,
        image_url: mediaUrl,
        caption: caption || undefined,
    }, {
        method: 'POST',
    });
    await pollInstagramBusinessContainerUntilReady(container.id, accessToken);
    const publishResponse = await instagramGraphFetch(`/${instagramAccountId}/media_publish`, {
        access_token: accessToken,
        creation_id: container.id,
    }, {
        method: 'POST',
    });
    return publishResponse.id;
};
const publishInstagramBusinessLoginVideo = async (instagramAccountId, accessToken, caption, mediaUrl) => {
    if (!mediaUrl) {
        throw new Error('Instagram publishing requires a video. Add media to the scheduled post first.');
    }
    const container = await instagramGraphFetch(`/${instagramAccountId}/media`, {
        access_token: accessToken,
        media_type: 'REELS',
        video_url: mediaUrl,
        share_to_feed: true,
        caption: caption || undefined,
    }, {
        method: 'POST',
    });
    await pollInstagramBusinessContainerUntilReady(container.id, accessToken);
    const publishResponse = await instagramGraphFetch(`/${instagramAccountId}/media_publish`, {
        access_token: accessToken,
        creation_id: container.id,
    }, {
        method: 'POST',
    });
    return publishResponse.id;
};
const createSignedMetaOAuthState = (input) => {
    ensureMetaOAuthConfigured();
    const now = Date.now();
    const payload = {
        userId: input.userId,
        platform: input.platform,
        accountId: input.accountId,
        profileUrl: input.profileUrl?.trim() || null,
        responseMode: input.responseMode ?? 'popup',
        nonce: (0, crypto_1.randomUUID)(),
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + constants_1.META_OAUTH_STATE_TTL_MS).toISOString(),
    };
    const payloadSegment = toBase64UrlJson(payload);
    const signature = createStateSignature(payloadSegment);
    return `${payloadSegment}.${signature}`;
};
exports.createSignedMetaOAuthState = createSignedMetaOAuthState;
const readSignedMetaOAuthState = (state) => {
    if (!constants_1.META_OAUTH_STATE_SECRET) {
        throw new Error('Meta OAuth state signing is not configured yet. Add the Meta OAuth state secret on the server first.');
    }
    const [payloadSegment, signature] = state.split('.');
    if (!payloadSegment || !signature) {
        throw new Error('Meta OAuth state is missing or malformed.');
    }
    const expectedSignature = createStateSignature(payloadSegment);
    if (signature.length !== expectedSignature.length) {
        throw new Error('Meta OAuth state signature is invalid.');
    }
    const isValid = (0, crypto_1.timingSafeEqual)(Buffer.from(signature, 'utf8'), Buffer.from(expectedSignature, 'utf8'));
    if (!isValid) {
        throw new Error('Meta OAuth state signature is invalid.');
    }
    const payload = fromBase64UrlJson(payloadSegment);
    if (new Date(payload.expiresAt).getTime() <= Date.now()) {
        throw new Error('Meta OAuth state has expired. Start the connection again.');
    }
    return payload;
};
exports.readSignedMetaOAuthState = readSignedMetaOAuthState;
const buildMetaOAuthUrl = (state) => {
    const claim = (0, exports.readSignedMetaOAuthState)(state);
    ensureMetaOAuthConfigured(claim.platform);
    if (claim.platform === 'instagram') {
        const instagramClientId = getInstagramLoginClientId();
        const authUrl = new URL(INSTAGRAM_CONSENT_URL);
        authUrl.searchParams.set('flow', 'ig_biz_login_oauth');
        authUrl.searchParams.set('params_json', JSON.stringify({
            client_id: instagramClientId,
            redirect_uri: getMetaOAuthRedirectUri('instagram'),
            response_type: 'code',
            state,
            scope: getInstagramConsentScopes().join('-'),
            logger_id: (0, crypto_1.randomUUID)(),
            app_id: instagramClientId,
            platform_app_id: instagramClientId,
        }));
        authUrl.searchParams.set('source', 'oauth_permissions_page_www');
        return authUrl.toString();
    }
    const authUrl = new URL(META_AUTH_URL);
    authUrl.searchParams.set('client_id', constants_1.META_FACEBOOK_APP_ID);
    authUrl.searchParams.set('redirect_uri', getMetaOAuthRedirectUri('facebook'));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', getFacebookOAuthScopes().join(','));
    authUrl.searchParams.set('auth_type', 'rerequest');
    authUrl.searchParams.set('display', 'popup');
    return authUrl.toString();
};
exports.buildMetaOAuthUrl = buildMetaOAuthUrl;
const exchangeMetaAuthorizationCode = async (code, platform) => {
    ensureMetaOAuthConfigured(platform);
    if (platform === 'instagram') {
        let shortLivedToken = null;
        let lastExchangeError = null;
        const tokenExchangers = [() => exchangeInstagramCodeForShortLivedUserToken(code)];
        for (const exchangeToken of tokenExchangers) {
            try {
                shortLivedToken = await exchangeToken();
                break;
            }
            catch (error) {
                lastExchangeError =
                    error instanceof Error
                        ? error
                        : new Error('Instagram could not complete the business login token exchange.');
            }
        }
        if (!shortLivedToken?.access_token) {
            throw (lastExchangeError ||
                new Error('Instagram did not return an access token for this login.'));
        }
        let tokenForInstagramApi = shortLivedToken.access_token;
        let tokenExpiresAt = typeof shortLivedToken.expires_in === 'number'
            ? new Date(Date.now() + shortLivedToken.expires_in * 1000).toISOString()
            : null;
        try {
            const longLivedToken = await exchangeInstagramForLongLivedUserToken(shortLivedToken.access_token);
            tokenForInstagramApi = longLivedToken.access_token;
            tokenExpiresAt =
                typeof longLivedToken.expires_in === 'number'
                    ? new Date(Date.now() + longLivedToken.expires_in * 1000).toISOString()
                    : tokenExpiresAt;
        }
        catch {
            // Some Business Login for Instagram setups only return a short-lived
            // Instagram user token here. We can still verify and connect the account.
        }
        const instagramProfile = await fetchInstagramBusinessProfile(tokenForInstagramApi, shortLivedToken.user_id ?? null);
        return {
            platform: 'instagram',
            loginType: 'instagram_business_login',
            longLivedUserToken: tokenForInstagramApi,
            tokenExpiresAt,
            instagramProfile,
        };
    }
    const shortLivedToken = await exchangeCodeForShortLivedUserToken(code);
    const longLivedToken = await exchangeForLongLivedUserToken(shortLivedToken.access_token);
    const [metaUser, longLivedPageResponse] = await Promise.all([
        fetchMetaUserProfile(longLivedToken.access_token),
        fetchMetaPages(longLivedToken.access_token),
    ]);
    const longLivedPages = longLivedPageResponse.data ?? [];
    let shortLivedPages = [];
    if (!longLivedPages.length || countConnectablePages(longLivedPages) === 0) {
        try {
            const shortLivedPageResponse = await fetchMetaPages(shortLivedToken.access_token);
            shortLivedPages = shortLivedPageResponse.data ?? [];
        }
        catch (error) {
            logMetaOAuthDebug('facebook_page_fetch_short_lived_failed', {
                metaUserId: metaUser.id,
                message: error instanceof Error ? error.message : 'Unknown Meta error',
            });
        }
    }
    const mergedPages = mergeMetaPages(longLivedPages, shortLivedPages);
    let debug;
    if (constants_1.META_OAUTH_DEBUG ||
        !mergedPages.length ||
        countConnectablePages(mergedPages) === 0) {
        let tokenDebug;
        try {
            tokenDebug = (await debugMetaUserToken(longLivedToken.access_token)).data;
        }
        catch (error) {
            logMetaOAuthDebug('facebook_token_debug_failed', {
                metaUserId: metaUser.id,
                message: error instanceof Error ? error.message : 'Unknown Meta error',
            });
        }
        const granularPageTargetIds = uniqueStrings((tokenDebug?.granular_scopes ?? [])
            .filter((scope) => scope.scope?.startsWith('pages_'))
            .flatMap((scope) => (scope.target_ids ?? []).map((targetId) => String(targetId))));
        debug = {
            longLivedPageCount: longLivedPages.length,
            longLivedConnectablePageCount: countConnectablePages(longLivedPages),
            shortLivedPageCount: shortLivedPages.length,
            shortLivedConnectablePageCount: countConnectablePages(shortLivedPages),
            grantedScopes: Array.isArray(tokenDebug?.scopes)
                ? tokenDebug.scopes.filter((scope) => typeof scope === 'string')
                : [],
            granularPageTargetIds,
            pages: summarizeMetaPages(mergedPages),
            usedShortLivedFallback: countConnectablePages(longLivedPages) === 0 &&
                countConnectablePages(shortLivedPages) > 0,
        };
        logMetaOAuthDebug('facebook_oauth_exchange', {
            metaUserId: metaUser.id,
            metaUserName: metaUser.name ?? null,
            ...debug,
        });
    }
    const tokenExpiresAt = typeof longLivedToken.expires_in === 'number'
        ? new Date(Date.now() + longLivedToken.expires_in * 1000).toISOString()
        : null;
    return {
        platform: 'facebook',
        longLivedUserToken: longLivedToken.access_token,
        tokenExpiresAt,
        metaUser,
        pages: mergedPages,
        debug,
    };
};
exports.exchangeMetaAuthorizationCode = exchangeMetaAuthorizationCode;
const verifyClaimedMetaAccount = (input) => {
    const verifiedAt = new Date().toISOString();
    const hasExplicitClaim = Boolean(input.claim.accountId.trim() || input.claim.profileUrl?.trim());
    if (input.claim.platform === 'instagram') {
        if (input.exchange.platform !== 'instagram') {
            throw new Error('Instagram verification returned the wrong Meta response.');
        }
        if (input.exchange.loginType === 'facebook_login_for_business') {
            const pages = input.exchange.pages ?? [];
            const match = pages.find((page) => {
                const instagramAccount = readMetaInstagramAccount(page);
                return instagramAccount
                    ? compareInstagramClaim(input.claim, instagramAccount)
                    : false;
            });
            const instagramAccount = match ? readMetaInstagramAccount(match) : null;
            if (!match || !match.access_token || !instagramAccount) {
                throw new Error('Meta did not return a linked Instagram professional account for this login. Make sure the Instagram account is professional and linked to a Facebook Page you manage.');
            }
            const username = instagramAccount.username
                ? normalizeHandle(instagramAccount.username)
                : normalizeHandle(input.claim.accountId);
            const profileUrl = toProfileUrl('instagram', username, input.claim.profileUrl || null);
            return {
                metaUserId: input.exchange.metaUser?.id || instagramAccount.id,
                socialAccount: {
                    platform: 'instagram',
                    accountId: username,
                    accountName: instagramAccount.name?.trim() ||
                        instagramAccount.username?.trim() ||
                        `@${username}`,
                    profileUrl,
                    oauthProvider: 'meta',
                    verificationStatus: 'verified',
                    verifiedAt,
                    accessToken: match.access_token,
                    refreshToken: input.exchange.longLivedUserToken,
                    tokenExpiresAt: input.exchange.tokenExpiresAt,
                    metadata: {
                        connectionSource: 'meta_oauth',
                        oauthApp: 'facebook',
                        metaUserId: input.exchange.metaUser?.id ?? null,
                        metaUserName: input.exchange.metaUser?.name ?? null,
                        metaPageId: match.id,
                        metaPageName: match.name,
                        metaInstagramAccountId: instagramAccount.id,
                        metaInstagramUsername: instagramAccount.username ?? null,
                        metaInstagramProfilePictureUrl: instagramAccount.profile_picture_url ?? null,
                        instagramLoginType: 'facebook_login',
                        profileUrl,
                        verificationClaim: {
                            accountId: input.claim.accountId,
                            profileUrl: input.claim.profileUrl,
                        },
                    },
                },
            };
        }
        if (!input.exchange.instagramProfile) {
            throw new Error('Instagram verification did not return the account profile.');
        }
        if (hasExplicitClaim &&
            !compareInstagramClaim(input.claim, input.exchange.instagramProfile)) {
            throw new Error(getMetaVerificationErrorMessage('instagram'));
        }
        const username = input.exchange.instagramProfile.username
            ? normalizeHandle(input.exchange.instagramProfile.username)
            : normalizeHandle(input.claim.accountId);
        const profileUrl = toProfileUrl('instagram', username, input.claim.profileUrl || null);
        return {
            metaUserId: input.exchange.instagramProfile.id,
            socialAccount: {
                platform: 'instagram',
                accountId: username,
                accountName: input.exchange.instagramProfile.name?.trim() ||
                    input.exchange.instagramProfile.username?.trim() ||
                    `@${username}`,
                profileUrl,
                oauthProvider: 'meta',
                verificationStatus: 'verified',
                verifiedAt,
                accessToken: input.exchange.longLivedUserToken,
                refreshToken: null,
                tokenExpiresAt: input.exchange.tokenExpiresAt,
                metadata: {
                    connectionSource: 'meta_oauth',
                    oauthApp: 'instagram',
                    metaUserId: input.exchange.instagramProfile.id,
                    metaUserName: input.exchange.instagramProfile.name ?? null,
                    metaInstagramAccountId: input.exchange.instagramProfile.id,
                    metaInstagramUsername: input.exchange.instagramProfile.username ?? null,
                    metaInstagramProfilePictureUrl: input.exchange.instagramProfile.profile_picture_url ?? null,
                    instagramLoginType: 'instagram_business_login',
                    instagramApiMode: 'instagram_login',
                    profileUrl,
                    verificationClaim: {
                        accountId: input.claim.accountId,
                        profileUrl: input.claim.profileUrl,
                    },
                },
            },
        };
    }
    if (input.exchange.platform !== 'facebook') {
        throw new Error('Facebook verification returned the wrong Meta response.');
    }
    const match = input.exchange.pages.find((page) => compareFacebookClaim(input.claim, page));
    if (!match || !match.access_token) {
        throw new Error(getMetaVerificationErrorMessage('facebook'));
    }
    const pageIdentifier = extractFacebookLinkIdentifier(match.link) || match.id;
    const profileUrl = toProfileUrl('facebook', pageIdentifier, match.link || input.claim.profileUrl);
    return {
        metaUserId: input.exchange.metaUser.id,
        socialAccount: {
            platform: 'facebook',
            accountId: pageIdentifier,
            accountName: match.name,
            profileUrl,
            oauthProvider: 'meta',
            verificationStatus: 'verified',
            verifiedAt,
            accessToken: match.access_token,
            refreshToken: input.exchange.longLivedUserToken,
            tokenExpiresAt: input.exchange.tokenExpiresAt,
            metadata: {
                connectionSource: 'meta_oauth',
                metaUserId: input.exchange.metaUser.id,
                metaUserName: input.exchange.metaUser.name ?? null,
                metaPageId: match.id,
                metaPageName: match.name,
                profileUrl,
                verificationClaim: {
                    accountId: input.claim.accountId,
                    profileUrl: input.claim.profileUrl,
                },
            },
        },
    };
};
exports.verifyClaimedMetaAccount = verifyClaimedMetaAccount;
const publishScheduledMetaPost = async (account, post) => {
    const metadata = readRecord(account.metadata);
    if (account.oauthProvider !== 'meta' || account.verificationStatus !== 'verified') {
        throw new Error('Reconnect this Meta account before PrixmoAI can publish to it.');
    }
    if (!account.accessToken) {
        throw new Error('This Meta account is missing the publish token. Reconnect it first.');
    }
    if (account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() <= Date.now()) {
        throw new Error('This Meta connection has expired. Reconnect the account first.');
    }
    const now = new Date().toISOString();
    if (account.platform === 'facebook') {
        const pageId = (typeof metadata.metaPageId === 'string' && metadata.metaPageId) || null;
        if (!pageId) {
            throw new Error(getMetaPublishingErrorMessage('facebook', metadata));
        }
        const externalPostId = await createFacebookPagePost(pageId, account.accessToken, post.caption, post.mediaUrl, post.mediaType);
        return {
            externalPostId,
            publishedAt: now,
        };
    }
    const instagramAccountId = (typeof metadata.metaInstagramAccountId === 'string' &&
        metadata.metaInstagramAccountId) ||
        null;
    if (!instagramAccountId) {
        throw new Error(getMetaPublishingErrorMessage('instagram', metadata));
    }
    const externalPostId = post.mediaType === 'video'
        ? metadata.instagramLoginType === 'instagram_business_login'
            ? await publishInstagramBusinessLoginVideo(instagramAccountId, account.accessToken, post.caption, post.mediaUrl)
            : await publishInstagramVideo(instagramAccountId, account.accessToken, post.caption, post.mediaUrl)
        : metadata.instagramLoginType === 'instagram_business_login'
            ? await publishInstagramBusinessLoginImage(instagramAccountId, account.accessToken, post.caption, post.mediaUrl)
            : await publishInstagramImage(instagramAccountId, account.accessToken, post.caption, post.mediaUrl);
    return {
        externalPostId,
        publishedAt: now,
    };
};
exports.publishScheduledMetaPost = publishScheduledMetaPost;
const getMetaOAuthSuccessRedirectUrl = (message) => buildMetaOAuthRedirectUrl('success', message);
exports.getMetaOAuthSuccessRedirectUrl = getMetaOAuthSuccessRedirectUrl;
const getMetaOAuthErrorRedirectUrl = (message) => buildMetaOAuthRedirectUrl('error', message);
exports.getMetaOAuthErrorRedirectUrl = getMetaOAuthErrorRedirectUrl;
const getMetaOAuthFacebookPageSelectionRedirectUrl = (selectionId, message) => buildMetaOAuthRedirectUrl('select_facebook_pages', message, {
    selection_id: selectionId,
});
exports.getMetaOAuthFacebookPageSelectionRedirectUrl = getMetaOAuthFacebookPageSelectionRedirectUrl;
