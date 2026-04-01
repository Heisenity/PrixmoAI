"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGenerateConversationThread = exports.createGeneratedAssets = exports.createGenerateMessage = exports.softDeleteGenerateConversation = exports.updateGenerateConversation = exports.getGenerateConversationById = exports.createGenerateConversation = exports.listGenerateConversations = void 0;
const toRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
const toGenerateConversation = (row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    lastMessagePreview: row.last_message_preview,
    type: row.conversation_type,
    isArchived: row.is_archived,
    isDeleted: row.is_deleted,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
const toGenerateConversationMessage = (row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    role: row.role,
    messageType: row.message_type,
    content: row.content,
    metadata: toRecord(row.metadata),
    generationId: row.generation_id,
    createdAt: row.created_at,
    assets: [],
});
const toGenerateConversationAsset = (row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    userId: row.user_id,
    assetType: row.asset_type,
    payload: toRecord(row.payload),
    createdAt: row.created_at,
});
const listGenerateConversations = async (client, userId) => {
    const { data, error } = await client
        .from('generate_conversations')
        .select('*')
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false });
    if (error) {
        throw new Error(error.message || 'Failed to fetch conversations');
    }
    return (data ?? []).map((row) => toGenerateConversation(row));
};
exports.listGenerateConversations = listGenerateConversations;
const createGenerateConversation = async (client, userId, input) => {
    const { data, error } = await client
        .from('generate_conversations')
        .insert({
        user_id: userId,
        title: input.title,
        last_message_preview: input.lastMessagePreview ?? null,
        conversation_type: input.type,
        is_archived: input.isArchived ?? false,
    })
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to create conversation');
    }
    return toGenerateConversation(data);
};
exports.createGenerateConversation = createGenerateConversation;
const getGenerateConversationById = async (client, userId, conversationId) => {
    const { data, error } = await client
        .from('generate_conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .maybeSingle();
    if (error) {
        throw new Error(error.message || 'Failed to fetch conversation');
    }
    return data ? toGenerateConversation(data) : null;
};
exports.getGenerateConversationById = getGenerateConversationById;
const updateGenerateConversation = async (client, userId, conversationId, input) => {
    const { data, error } = await client
        .from('generate_conversations')
        .update({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.lastMessagePreview !== undefined
            ? { last_message_preview: input.lastMessagePreview }
            : {}),
        ...(input.type !== undefined
            ? { conversation_type: input.type }
            : {}),
        ...(input.isArchived !== undefined
            ? { is_archived: input.isArchived }
            : {}),
        ...(input.isDeleted !== undefined ? { is_deleted: input.isDeleted } : {}),
    })
        .eq('id', conversationId)
        .eq('user_id', userId)
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to update conversation');
    }
    return toGenerateConversation(data);
};
exports.updateGenerateConversation = updateGenerateConversation;
const softDeleteGenerateConversation = async (client, userId, conversationId) => {
    const { error } = await client
        .from('generate_conversations')
        .update({
        is_deleted: true,
        is_archived: false,
    })
        .eq('id', conversationId)
        .eq('user_id', userId);
    if (error) {
        throw new Error(error.message || 'Failed to delete conversation');
    }
};
exports.softDeleteGenerateConversation = softDeleteGenerateConversation;
const createGenerateMessage = async (client, userId, input) => {
    const { data, error } = await client
        .from('generate_messages')
        .insert({
        conversation_id: input.conversationId,
        user_id: userId,
        role: input.role,
        message_type: input.messageType,
        content: input.content ?? null,
        metadata: input.metadata ?? {},
        generation_id: input.generationId ?? null,
    })
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to create message');
    }
    return toGenerateConversationMessage(data);
};
exports.createGenerateMessage = createGenerateMessage;
const createGeneratedAssets = async (client, userId, input) => {
    if (input.assets.length === 0) {
        return [];
    }
    const { data, error } = await client
        .from('generated_assets')
        .insert(input.assets.map((asset) => ({
        conversation_id: input.conversationId,
        message_id: input.messageId,
        user_id: userId,
        asset_type: asset.assetType,
        payload: asset.payload,
    })))
        .select('*');
    if (error) {
        throw new Error(error.message || 'Failed to create generated assets');
    }
    return (data ?? []).map((row) => toGenerateConversationAsset(row));
};
exports.createGeneratedAssets = createGeneratedAssets;
const getGenerateConversationThread = async (client, userId, conversationId) => {
    const conversation = await (0, exports.getGenerateConversationById)(client, userId, conversationId);
    if (!conversation) {
        return null;
    }
    const [{ data: messagesData, error: messagesError }, { data: assetsData, error: assetsError }] = await Promise.all([
        client
            .from('generate_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .order('created_at', { ascending: true }),
        client
            .from('generated_assets')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .order('created_at', { ascending: true }),
    ]);
    if (messagesError) {
        throw new Error(messagesError.message || 'Failed to fetch conversation messages');
    }
    if (assetsError) {
        throw new Error(assetsError.message || 'Failed to fetch generated assets');
    }
    const assetsByMessageId = new Map();
    for (const assetRow of assetsData ?? []) {
        const asset = toGenerateConversationAsset(assetRow);
        const collection = assetsByMessageId.get(asset.messageId) ?? [];
        collection.push(asset);
        assetsByMessageId.set(asset.messageId, collection);
    }
    const messages = (messagesData ?? []).map((messageRow) => {
        const message = toGenerateConversationMessage(messageRow);
        return {
            ...message,
            assets: assetsByMessageId.get(message.id) ?? [],
        };
    });
    return {
        conversation,
        messages,
    };
};
exports.getGenerateConversationThread = getGenerateConversationThread;
