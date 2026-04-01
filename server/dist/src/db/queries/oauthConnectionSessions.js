"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteOAuthConnectionSession = exports.getOAuthConnectionSessionById = exports.createOAuthConnectionSession = void 0;
const toRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
const toOAuthConnectionSession = (row) => ({
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    platform: row.platform,
    selectionType: row.selection_type,
    payload: toRecord(row.payload),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
const createOAuthConnectionSession = async (client, userId, input) => {
    const { data, error } = await client
        .from('oauth_connection_sessions')
        .insert({
        user_id: userId,
        provider: input.provider,
        platform: input.platform,
        selection_type: input.selectionType,
        payload: input.payload,
        expires_at: input.expiresAt,
    })
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to create OAuth connection session');
    }
    return toOAuthConnectionSession(data);
};
exports.createOAuthConnectionSession = createOAuthConnectionSession;
const getOAuthConnectionSessionById = async (client, userId, sessionId) => {
    const { data, error } = await client
        .from('oauth_connection_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        throw new Error(error.message || 'Failed to fetch OAuth connection session');
    }
    if (!data) {
        return null;
    }
    const session = toOAuthConnectionSession(data);
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
        await (0, exports.deleteOAuthConnectionSession)(client, userId, sessionId);
        return null;
    }
    return session;
};
exports.getOAuthConnectionSessionById = getOAuthConnectionSessionById;
const deleteOAuthConnectionSession = async (client, userId, sessionId) => {
    const { error } = await client
        .from('oauth_connection_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', userId);
    if (error) {
        throw new Error(error.message || 'Failed to delete OAuth connection session');
    }
};
exports.deleteOAuthConnectionSession = deleteOAuthConnectionSession;
