"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteScheduledPost = exports.updateScheduledPostStatus = exports.updateScheduledPost = exports.getDueScheduledPosts = exports.getScheduledPostById = exports.getScheduledPostsByUser = exports.createScheduledPost = void 0;
const compactObject = (value) => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
const toScheduledPost = (row) => ({
    id: row.id,
    userId: row.user_id,
    socialAccountId: row.social_account_id,
    contentId: row.content_id,
    generatedImageId: row.generated_image_id,
    platform: row.platform,
    caption: row.caption,
    mediaUrl: row.media_url,
    scheduledFor: row.scheduled_for,
    status: row.status,
    externalPostId: row.external_post_id,
    publishAttemptedAt: row.publish_attempted_at,
    lastError: row.last_error,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
const createScheduledPost = async (client, userId, input) => {
    const { data, error } = await client
        .from('scheduled_posts')
        .insert({
        user_id: userId,
        social_account_id: input.socialAccountId,
        content_id: input.contentId ?? null,
        generated_image_id: input.generatedImageId ?? null,
        platform: input.platform ?? null,
        caption: input.caption ?? null,
        media_url: input.mediaUrl ?? null,
        scheduled_for: input.scheduledFor,
        status: input.status ?? 'scheduled',
        external_post_id: input.externalPostId ?? null,
        publish_attempted_at: input.publishAttemptedAt ?? null,
        last_error: input.lastError ?? null,
    })
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to create scheduled post');
    }
    return toScheduledPost(data);
};
exports.createScheduledPost = createScheduledPost;
const getScheduledPostsByUser = async (client, userId, options = {}) => {
    const page = Number.isFinite(options.page) && options.page && options.page > 0
        ? options.page
        : 1;
    const limit = Number.isFinite(options.limit) && options.limit && options.limit > 0
        ? options.limit
        : 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, count, error } = await client
        .from('scheduled_posts')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('scheduled_for', { ascending: true })
        .range(from, to);
    if (error) {
        throw new Error(error.message || 'Failed to fetch scheduled posts');
    }
    const total = count ?? 0;
    return {
        items: (data ?? []).map((row) => toScheduledPost(row)),
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
    };
};
exports.getScheduledPostsByUser = getScheduledPostsByUser;
const getScheduledPostById = async (client, userId, scheduledPostId) => {
    const { data, error } = await client
        .from('scheduled_posts')
        .select('*')
        .eq('id', scheduledPostId)
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        throw new Error(error.message || 'Failed to fetch scheduled post');
    }
    return data ? toScheduledPost(data) : null;
};
exports.getScheduledPostById = getScheduledPostById;
const getDueScheduledPosts = async (client, limit = 10) => {
    const { data, error } = await client
        .from('scheduled_posts')
        .select('*')
        .in('status', ['pending', 'scheduled'])
        .lte('scheduled_for', new Date().toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(limit);
    if (error) {
        throw new Error(error.message || 'Failed to fetch due scheduled posts');
    }
    return (data ?? []).map((row) => toScheduledPost(row));
};
exports.getDueScheduledPosts = getDueScheduledPosts;
const updateScheduledPost = async (client, userId, scheduledPostId, input) => {
    const payload = compactObject({
        social_account_id: input.socialAccountId,
        content_id: input.contentId,
        generated_image_id: input.generatedImageId,
        platform: input.platform,
        caption: input.caption,
        media_url: input.mediaUrl,
        scheduled_for: input.scheduledFor,
        status: input.status,
        external_post_id: input.externalPostId,
        publish_attempted_at: input.publishAttemptedAt,
        last_error: input.lastError,
        published_at: input.publishedAt,
    });
    const { data, error } = await client
        .from('scheduled_posts')
        .update(payload)
        .eq('id', scheduledPostId)
        .eq('user_id', userId)
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to update scheduled post');
    }
    return toScheduledPost(data);
};
exports.updateScheduledPost = updateScheduledPost;
const updateScheduledPostStatus = async (client, userId, scheduledPostId, status, publishedAt) => (0, exports.updateScheduledPost)(client, userId, scheduledPostId, {
    status,
    publishedAt,
});
exports.updateScheduledPostStatus = updateScheduledPostStatus;
const deleteScheduledPost = async (client, userId, scheduledPostId) => {
    const { error } = await client
        .from('scheduled_posts')
        .delete()
        .eq('id', scheduledPostId)
        .eq('user_id', userId);
    if (error) {
        throw new Error(error.message || 'Failed to delete scheduled post');
    }
};
exports.deleteScheduledPost = deleteScheduledPost;
