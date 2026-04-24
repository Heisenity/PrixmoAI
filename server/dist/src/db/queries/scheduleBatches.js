"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncScheduledItemStatusByScheduledPostId = exports.appendScheduledItemLog = exports.updateScheduledItem = exports.getScheduledItemsByUser = exports.getScheduleBatchesByUser = exports.getScheduleBatchDetail = exports.getScheduledItemsByBatch = exports.getScheduledItemById = exports.createScheduledItem = exports.deleteScheduleBatch = exports.getScheduleBatchById = exports.updateScheduleBatch = exports.createScheduleBatch = exports.getMediaAssetById = exports.createMediaAsset = exports.toScheduledItemLog = void 0;
const crypto_1 = require("crypto");
const toMediaAsset = (row) => ({
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type,
    mediaType: row.media_type,
    originalUrl: row.original_url,
    storageUrl: row.storage_url,
    thumbnailUrl: row.thumbnail_url,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds,
    contentId: row.content_id,
    generatedImageId: row.generated_image_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
});
const toScheduleBatch = (row) => ({
    id: row.id,
    userId: row.user_id,
    batchName: row.batch_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
const toScheduledItem = (row) => ({
    id: row.id,
    batchId: row.batch_id,
    userId: row.user_id,
    mediaAssetId: row.media_asset_id,
    scheduledPostId: row.scheduled_post_id,
    platform: row.platform,
    accountId: row.account_id,
    socialAccountId: row.social_account_id,
    caption: row.caption,
    scheduledAt: row.scheduled_at,
    status: row.status,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mediaAsset: row.media_assets
        ? toMediaAsset(Array.isArray(row.media_assets) ? row.media_assets[0] : row.media_assets)
        : undefined,
    socialAccount: row.social_accounts
        ? {
            id: row.social_accounts.id,
            userId: row.social_accounts.user_id,
            platform: row.social_accounts.platform,
            accountId: row.social_accounts.account_id,
            accountName: row.social_accounts.account_name,
            profileUrl: row.social_accounts.profile_url,
            oauthProvider: row.social_accounts.oauth_provider === 'meta' ? 'meta' : null,
            verificationStatus: row.social_accounts.verification_status,
            verifiedAt: row.social_accounts.verified_at,
            accessToken: row.social_accounts.access_token,
            refreshToken: row.social_accounts.refresh_token,
            tokenExpiresAt: row.social_accounts.token_expires_at,
            metadata: row.social_accounts.metadata ?? {},
            connectedAt: row.social_accounts.connected_at,
            createdAt: row.social_accounts.created_at,
            updatedAt: row.social_accounts.updated_at,
        }
        : undefined,
});
const toScheduledItemLog = (row) => ({
    id: row.id,
    scheduledItemId: row.scheduled_item_id,
    eventType: row.event_type,
    message: row.message,
    payloadJson: row.payload_json,
    createdAt: row.created_at,
});
exports.toScheduledItemLog = toScheduledItemLog;
const createMediaAsset = async (client, userId, input) => {
    const { data, error } = await client
        .from('media_assets')
        .insert({
        user_id: userId,
        source_type: input.sourceType,
        media_type: input.mediaType,
        original_url: input.originalUrl ?? null,
        storage_url: input.storageUrl,
        thumbnail_url: input.thumbnailUrl ?? null,
        filename: input.filename ?? null,
        mime_type: input.mimeType ?? null,
        size_bytes: input.sizeBytes ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        duration_seconds: input.durationSeconds ?? null,
        content_id: input.contentId ?? null,
        generated_image_id: input.generatedImageId ?? null,
        metadata: input.metadata ?? {},
    })
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to create media asset');
    }
    return toMediaAsset(data);
};
exports.createMediaAsset = createMediaAsset;
const getMediaAssetById = async (client, userId, mediaAssetId) => {
    const { data, error } = await client
        .from('media_assets')
        .select('*')
        .eq('id', mediaAssetId)
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        throw new Error(error.message || 'Failed to fetch media asset');
    }
    return data ? toMediaAsset(data) : null;
};
exports.getMediaAssetById = getMediaAssetById;
const createScheduleBatch = async (client, userId, input) => {
    const { data, error } = await client
        .from('schedule_batches')
        .insert({
        user_id: userId,
        batch_name: input.batchName ?? null,
        status: input.status ?? 'draft',
    })
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to create schedule batch');
    }
    return toScheduleBatch(data);
};
exports.createScheduleBatch = createScheduleBatch;
const updateScheduleBatch = async (client, userId, batchId, input) => {
    const { data, error } = await client
        .from('schedule_batches')
        .update({
        ...(input.batchName !== undefined ? { batch_name: input.batchName } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
    })
        .eq('id', batchId)
        .eq('user_id', userId)
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to update schedule batch');
    }
    return toScheduleBatch(data);
};
exports.updateScheduleBatch = updateScheduleBatch;
const getScheduleBatchById = async (client, userId, batchId) => {
    const { data, error } = await client
        .from('schedule_batches')
        .select('*')
        .eq('id', batchId)
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        throw new Error(error.message || 'Failed to fetch schedule batch');
    }
    return data ? toScheduleBatch(data) : null;
};
exports.getScheduleBatchById = getScheduleBatchById;
const deleteScheduleBatch = async (client, userId, batchId) => {
    const { error } = await client
        .from('schedule_batches')
        .delete()
        .eq('id', batchId)
        .eq('user_id', userId);
    if (error) {
        throw new Error(error.message || 'Failed to delete schedule batch');
    }
};
exports.deleteScheduleBatch = deleteScheduleBatch;
const createScheduledItem = async (client, userId, batchId, input) => {
    const { data, error } = await client
        .from('scheduled_items')
        .insert({
        batch_id: batchId,
        user_id: userId,
        media_asset_id: input.mediaAssetId,
        scheduled_post_id: input.scheduledPostId ?? null,
        platform: input.platform,
        account_id: input.accountId,
        social_account_id: input.socialAccountId,
        caption: input.caption ?? null,
        scheduled_at: input.scheduledAt,
        status: input.status ?? 'pending',
        attempt_count: input.attemptCount ?? 0,
        last_error: input.lastError ?? null,
        idempotency_key: input.idempotencyKey ?? (0, crypto_1.randomUUID)(),
    })
        .select('*, media_assets(*), social_accounts(*)')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to create scheduled item');
    }
    return toScheduledItem(data);
};
exports.createScheduledItem = createScheduledItem;
const getScheduledItemById = async (client, userId, itemId) => {
    const { data, error } = await client
        .from('scheduled_items')
        .select('*, media_assets(*), social_accounts(*)')
        .eq('id', itemId)
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        throw new Error(error.message || 'Failed to fetch scheduled item');
    }
    return data ? toScheduledItem(data) : null;
};
exports.getScheduledItemById = getScheduledItemById;
const getScheduledItemsByBatch = async (client, userId, batchId) => {
    const { data, error } = await client
        .from('scheduled_items')
        .select('*, media_assets(*), social_accounts(*)')
        .eq('batch_id', batchId)
        .eq('user_id', userId)
        .order('scheduled_at', { ascending: true });
    if (error) {
        throw new Error(error.message || 'Failed to fetch scheduled items');
    }
    return (data ?? []).map((row) => toScheduledItem(row));
};
exports.getScheduledItemsByBatch = getScheduledItemsByBatch;
const getScheduleBatchDetail = async (client, userId, batchId) => {
    const batch = await (0, exports.getScheduleBatchById)(client, userId, batchId);
    if (!batch) {
        return null;
    }
    const items = await (0, exports.getScheduledItemsByBatch)(client, userId, batchId);
    return {
        batch,
        items,
    };
};
exports.getScheduleBatchDetail = getScheduleBatchDetail;
const getScheduleBatchesByUser = async (client, userId, options = {}) => {
    const page = Number.isFinite(options.page) && options.page && options.page > 0
        ? options.page
        : 1;
    const limit = Number.isFinite(options.limit) && options.limit && options.limit > 0
        ? options.limit
        : 24;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    let query = client
        .from('schedule_batches')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);
    if (options.status === 'draft') {
        query = query.in('status', ['draft', 'queued']);
    }
    else if (options.status) {
        query = query.eq('status', options.status);
    }
    const orderedQuery = query.order('updated_at', { ascending: false });
    const { data, count, error } = options.status === 'draft'
        ? await orderedQuery
        : await orderedQuery.range(from, to);
    if (error) {
        throw new Error(error.message || 'Failed to fetch schedule batches');
    }
    const total = count ?? 0;
    const batchRows = (data ?? []);
    const batchIds = batchRows.map((row) => row.id);
    let itemCountByBatch = new Map();
    let draftLikeBatchIds = new Set();
    if (batchIds.length) {
        const { data: itemRows, error: itemError } = await client
            .from('scheduled_items')
            .select('batch_id, scheduled_post_id, status')
            .eq('user_id', userId)
            .in('batch_id', batchIds);
        if (itemError) {
            throw new Error(itemError.message || 'Failed to fetch scheduled batch items');
        }
        const grouped = new Map();
        (itemRows ?? []).forEach((row) => {
            const item = row;
            const current = grouped.get(item.batch_id) ?? [];
            current.push(item);
            grouped.set(item.batch_id, current);
        });
        batchIds.forEach((batchId) => {
            const items = grouped.get(batchId) ?? [];
            itemCountByBatch.set(batchId, items.length);
            const isDraftLike = items.length > 0 &&
                items.every((item) => item.scheduled_post_id === null &&
                    (item.status === 'pending' || item.status === 'cancelled'));
            if (isDraftLike) {
                draftLikeBatchIds.add(batchId);
            }
        });
    }
    const filteredItems = batchRows
        .map((row) => ({
        ...toScheduleBatch(row),
        itemCount: itemCountByBatch.get(row.id) ?? 0,
    }))
        .filter((batch) => options.status === 'draft'
        ? batch.status === 'draft' || draftLikeBatchIds.has(batch.id)
        : true);
    const nextItems = options.status === 'draft'
        ? filteredItems.slice(from, to + 1)
        : filteredItems;
    const filteredTotal = options.status === 'draft' ? filteredItems.length : total;
    return {
        items: nextItems,
        page,
        limit,
        total: filteredTotal,
        totalPages: filteredTotal > 0
            ? Math.ceil(filteredTotal / limit)
            : 0,
    };
};
exports.getScheduleBatchesByUser = getScheduleBatchesByUser;
const getScheduledItemsByUser = async (client, userId, options = {}) => {
    const page = Number.isFinite(options.page) && options.page && options.page > 0
        ? options.page
        : 1;
    const limit = Number.isFinite(options.limit) && options.limit && options.limit > 0
        ? options.limit
        : 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    let query = client
        .from('scheduled_items')
        .select('*, media_assets(*), social_accounts(*)', { count: 'exact' })
        .eq('user_id', userId);
    if (options.status) {
        query = query.eq('status', options.status);
    }
    const { data, count, error } = await query
        .order('scheduled_at', { ascending: true })
        .range(from, to);
    if (error) {
        throw new Error(error.message || 'Failed to fetch scheduled items');
    }
    const total = count ?? 0;
    return {
        items: (data ?? []).map((row) => toScheduledItem(row)),
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
    };
};
exports.getScheduledItemsByUser = getScheduledItemsByUser;
const updateScheduledItem = async (client, userId, itemId, input) => {
    const { data, error } = await client
        .from('scheduled_items')
        .update({
        ...(input.mediaAssetId !== undefined
            ? { media_asset_id: input.mediaAssetId }
            : {}),
        ...(input.scheduledPostId !== undefined
            ? { scheduled_post_id: input.scheduledPostId }
            : {}),
        ...(input.platform !== undefined ? { platform: input.platform } : {}),
        ...(input.accountId !== undefined ? { account_id: input.accountId } : {}),
        ...(input.socialAccountId !== undefined
            ? { social_account_id: input.socialAccountId }
            : {}),
        ...(input.caption !== undefined ? { caption: input.caption } : {}),
        ...(input.scheduledAt !== undefined ? { scheduled_at: input.scheduledAt } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.attemptCount !== undefined
            ? { attempt_count: input.attemptCount }
            : {}),
        ...(input.lastError !== undefined ? { last_error: input.lastError } : {}),
        ...(input.idempotencyKey !== undefined
            ? { idempotency_key: input.idempotencyKey }
            : {}),
    })
        .eq('id', itemId)
        .eq('user_id', userId)
        .select('*, media_assets(*), social_accounts(*)')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to update scheduled item');
    }
    return toScheduledItem(data);
};
exports.updateScheduledItem = updateScheduledItem;
const appendScheduledItemLog = async (client, input) => {
    const { data, error } = await client
        .from('scheduled_item_logs')
        .insert({
        scheduled_item_id: input.scheduledItemId,
        event_type: input.eventType,
        message: input.message,
        payload_json: input.payloadJson ?? null,
    })
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to append scheduled item log');
    }
    return (0, exports.toScheduledItemLog)(data);
};
exports.appendScheduledItemLog = appendScheduledItemLog;
const syncScheduledItemStatusByScheduledPostId = async (client, scheduledPostId, input) => {
    const { data, error } = await client
        .from('scheduled_items')
        .update({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.attemptCount !== undefined
            ? { attempt_count: input.attemptCount }
            : {}),
        ...(input.lastError !== undefined ? { last_error: input.lastError } : {}),
    })
        .eq('scheduled_post_id', scheduledPostId)
        .select('*, media_assets(*), social_accounts(*)');
    if (error) {
        throw new Error(error.message || 'Failed to sync scheduled item status');
    }
    return (data ?? []).map((row) => toScheduledItem(row));
};
exports.syncScheduledItemStatusByScheduledPostId = syncScheduledItemStatusByScheduledPostId;
