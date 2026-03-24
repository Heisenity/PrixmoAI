import type {
  AppSupabaseClient,
} from '../supabase';
import type {
  GenerateConversation,
  GenerateConversationAsset,
  GenerateConversationMessage,
  GenerateConversationMessageType,
  GenerateConversationRole,
  GenerateConversationThread,
  GenerateConversationType,
  GeneratedAssetType,
} from '../../types';

type GenerateConversationRow = {
  id: string;
  user_id: string;
  title: string;
  last_message_preview: string | null;
  conversation_type: GenerateConversationType;
  is_archived: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

type GenerateMessageRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: GenerateConversationRole;
  message_type: GenerateConversationMessageType;
  content: string | null;
  metadata: unknown;
  generation_id: string | null;
  created_at: string;
};

type GeneratedAssetRow = {
  id: string;
  conversation_id: string;
  message_id: string;
  user_id: string;
  asset_type: GeneratedAssetType;
  payload: unknown;
  created_at: string;
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toGenerateConversation = (
  row: GenerateConversationRow
): GenerateConversation => ({
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

const toGenerateConversationMessage = (
  row: GenerateMessageRow
): GenerateConversationMessage => ({
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

const toGenerateConversationAsset = (
  row: GeneratedAssetRow
): GenerateConversationAsset => ({
  id: row.id,
  conversationId: row.conversation_id,
  messageId: row.message_id,
  userId: row.user_id,
  assetType: row.asset_type,
  payload: toRecord(row.payload),
  createdAt: row.created_at,
});

export const listGenerateConversations = async (
  client: AppSupabaseClient,
  userId: string
): Promise<GenerateConversation[]> => {
  const { data, error } = await client
    .from('generate_conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to fetch conversations');
  }

  return (data ?? []).map((row) =>
    toGenerateConversation(row as GenerateConversationRow)
  );
};

export const createGenerateConversation = async (
  client: AppSupabaseClient,
  userId: string,
  input: {
    title: string;
    type: GenerateConversationType;
    lastMessagePreview?: string | null;
    isArchived?: boolean;
  }
): Promise<GenerateConversation> => {
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

  return toGenerateConversation(data as GenerateConversationRow);
};

export const getGenerateConversationById = async (
  client: AppSupabaseClient,
  userId: string,
  conversationId: string
): Promise<GenerateConversation | null> => {
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

  return data ? toGenerateConversation(data as GenerateConversationRow) : null;
};

export const updateGenerateConversation = async (
  client: AppSupabaseClient,
  userId: string,
  conversationId: string,
  input: {
    title?: string;
    lastMessagePreview?: string | null;
    type?: GenerateConversationType;
    isArchived?: boolean;
    isDeleted?: boolean;
  }
): Promise<GenerateConversation> => {
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

  return toGenerateConversation(data as GenerateConversationRow);
};

export const softDeleteGenerateConversation = async (
  client: AppSupabaseClient,
  userId: string,
  conversationId: string
): Promise<void> => {
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

export const createGenerateMessage = async (
  client: AppSupabaseClient,
  userId: string,
  input: {
    conversationId: string;
    role: GenerateConversationRole;
    messageType: GenerateConversationMessageType;
    content?: string | null;
    metadata?: Record<string, unknown>;
    generationId?: string | null;
  }
): Promise<GenerateConversationMessage> => {
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

  return toGenerateConversationMessage(data as GenerateMessageRow);
};

export const createGeneratedAssets = async (
  client: AppSupabaseClient,
  userId: string,
  input: {
    conversationId: string;
    messageId: string;
    assets: Array<{
      assetType: GeneratedAssetType;
      payload: Record<string, unknown>;
    }>;
  }
): Promise<GenerateConversationAsset[]> => {
  if (input.assets.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from('generated_assets')
    .insert(
      input.assets.map((asset) => ({
        conversation_id: input.conversationId,
        message_id: input.messageId,
        user_id: userId,
        asset_type: asset.assetType,
        payload: asset.payload,
      }))
    )
    .select('*');

  if (error) {
    throw new Error(error.message || 'Failed to create generated assets');
  }

  return (data ?? []).map((row) =>
    toGenerateConversationAsset(row as GeneratedAssetRow)
  );
};

export const getGenerateConversationThread = async (
  client: AppSupabaseClient,
  userId: string,
  conversationId: string
): Promise<GenerateConversationThread | null> => {
  const conversation = await getGenerateConversationById(
    client,
    userId,
    conversationId
  );

  if (!conversation) {
    return null;
  }

  const [{ data: messagesData, error: messagesError }, { data: assetsData, error: assetsError }] =
    await Promise.all([
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

  const assetsByMessageId = new Map<string, GenerateConversationAsset[]>();

  for (const assetRow of assetsData ?? []) {
    const asset = toGenerateConversationAsset(assetRow as GeneratedAssetRow);
    const collection = assetsByMessageId.get(asset.messageId) ?? [];
    collection.push(asset);
    assetsByMessageId.set(asset.messageId, collection);
  }

  const messages = (messagesData ?? []).map((messageRow) => {
    const message = toGenerateConversationMessage(messageRow as GenerateMessageRow);
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
