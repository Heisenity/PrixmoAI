import { randomUUID } from 'crypto';
import type {
  CreateMediaAssetInput,
  CreateScheduleBatchInput,
  CreateScheduledItemInput,
  MediaAsset,
  PaginatedResult,
  ScheduleBatch,
  ScheduleBatchDetail,
  ScheduledItem,
  ScheduledItemLog,
  ScheduledItemStatus,
  UpdateScheduledItemInput,
} from '../../types';
import type { AppSupabaseClient } from '../supabase';

type MediaAssetRow = {
  id: string;
  user_id: string;
  source_type: MediaAsset['sourceType'];
  media_type: MediaAsset['mediaType'];
  original_url: string | null;
  storage_url: string;
  thumbnail_url: string | null;
  filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  content_id: string | null;
  generated_image_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type ScheduleBatchRow = {
  id: string;
  user_id: string;
  batch_name: string | null;
  status: ScheduleBatch['status'];
  created_at: string;
  updated_at: string;
};

type ScheduledItemRow = {
  id: string;
  batch_id: string;
  user_id: string;
  media_asset_id: string;
  scheduled_post_id: string | null;
  platform: ScheduledItem['platform'];
  account_id: string;
  social_account_id: string;
  caption: string | null;
  scheduled_at: string;
  status: ScheduledItemStatus;
  attempt_count: number;
  last_error: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
  media_assets?: MediaAssetRow | MediaAssetRow[] | null;
  social_accounts?: {
    id: string;
    user_id: string;
    platform: ScheduledItem['platform'];
    account_id: string;
    account_name: string | null;
    profile_url: string | null;
    oauth_provider: string | null;
    verification_status: string;
    verified_at: string | null;
    access_token: string | null;
    refresh_token: string | null;
    token_expires_at: string | null;
    metadata: Record<string, unknown>;
    connected_at: string;
    created_at: string;
    updated_at: string;
  } | null;
};

type ScheduledItemLogRow = {
  id: string;
  scheduled_item_id: string;
  event_type: string;
  message: string;
  payload_json: Record<string, unknown> | null;
  created_at: string;
};

const toMediaAsset = (row: MediaAssetRow): MediaAsset => ({
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

const toScheduleBatch = (row: ScheduleBatchRow): ScheduleBatch => ({
  id: row.id,
  userId: row.user_id,
  batchName: row.batch_name,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toScheduledItem = (row: ScheduledItemRow): ScheduledItem => ({
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
    ? toMediaAsset(
        Array.isArray(row.media_assets) ? row.media_assets[0] : row.media_assets
      )
    : undefined,
  socialAccount: row.social_accounts
    ? {
        id: row.social_accounts.id,
        userId: row.social_accounts.user_id,
        platform: row.social_accounts.platform,
        accountId: row.social_accounts.account_id,
        accountName: row.social_accounts.account_name,
        profileUrl: row.social_accounts.profile_url,
        oauthProvider:
          row.social_accounts.oauth_provider === 'meta' ? 'meta' : null,
        verificationStatus: row.social_accounts.verification_status as any,
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

export const toScheduledItemLog = (row: ScheduledItemLogRow): ScheduledItemLog => ({
  id: row.id,
  scheduledItemId: row.scheduled_item_id,
  eventType: row.event_type,
  message: row.message,
  payloadJson: row.payload_json,
  createdAt: row.created_at,
});

export const createMediaAsset = async (
  client: AppSupabaseClient,
  userId: string,
  input: CreateMediaAssetInput
): Promise<MediaAsset> => {
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

  return toMediaAsset(data as MediaAssetRow);
};

export const getMediaAssetById = async (
  client: AppSupabaseClient,
  userId: string,
  mediaAssetId: string
): Promise<MediaAsset | null> => {
  const { data, error } = await client
    .from('media_assets')
    .select('*')
    .eq('id', mediaAssetId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch media asset');
  }

  return data ? toMediaAsset(data as MediaAssetRow) : null;
};

export const createScheduleBatch = async (
  client: AppSupabaseClient,
  userId: string,
  input: CreateScheduleBatchInput
): Promise<ScheduleBatch> => {
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

  return toScheduleBatch(data as ScheduleBatchRow);
};

export const updateScheduleBatch = async (
  client: AppSupabaseClient,
  userId: string,
  batchId: string,
  input: Partial<CreateScheduleBatchInput>
): Promise<ScheduleBatch> => {
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

  return toScheduleBatch(data as ScheduleBatchRow);
};

export const getScheduleBatchById = async (
  client: AppSupabaseClient,
  userId: string,
  batchId: string
): Promise<ScheduleBatch | null> => {
  const { data, error } = await client
    .from('schedule_batches')
    .select('*')
    .eq('id', batchId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch schedule batch');
  }

  return data ? toScheduleBatch(data as ScheduleBatchRow) : null;
};

export const deleteScheduleBatch = async (
  client: AppSupabaseClient,
  userId: string,
  batchId: string
): Promise<void> => {
  const { error } = await client
    .from('schedule_batches')
    .delete()
    .eq('id', batchId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message || 'Failed to delete schedule batch');
  }
};

export const createScheduledItem = async (
  client: AppSupabaseClient,
  userId: string,
  batchId: string,
  input: CreateScheduledItemInput
): Promise<ScheduledItem> => {
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
      idempotency_key: input.idempotencyKey ?? randomUUID(),
    })
    .select(
      '*, media_assets(*), social_accounts(*)'
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create scheduled item');
  }

  return toScheduledItem(data as ScheduledItemRow);
};

export const getScheduledItemById = async (
  client: AppSupabaseClient,
  userId: string,
  itemId: string
): Promise<ScheduledItem | null> => {
  const { data, error } = await client
    .from('scheduled_items')
    .select('*, media_assets(*), social_accounts(*)')
    .eq('id', itemId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch scheduled item');
  }

  return data ? toScheduledItem(data as ScheduledItemRow) : null;
};

export const getScheduledItemsByBatch = async (
  client: AppSupabaseClient,
  userId: string,
  batchId: string
): Promise<ScheduledItem[]> => {
  const { data, error } = await client
    .from('scheduled_items')
    .select('*, media_assets(*), social_accounts(*)')
    .eq('batch_id', batchId)
    .eq('user_id', userId)
    .order('scheduled_at', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Failed to fetch scheduled items');
  }

  return (data ?? []).map((row) => toScheduledItem(row as ScheduledItemRow));
};

export const getScheduleBatchDetail = async (
  client: AppSupabaseClient,
  userId: string,
  batchId: string
): Promise<ScheduleBatchDetail | null> => {
  const batch = await getScheduleBatchById(client, userId, batchId);

  if (!batch) {
    return null;
  }

  const items = await getScheduledItemsByBatch(client, userId, batchId);

  return {
    batch,
    items,
  };
};

export const getScheduleBatchesByUser = async (
  client: AppSupabaseClient,
  userId: string,
  options: {
    page?: number;
    limit?: number;
    status?: ScheduleBatch['status'] | null;
  } = {}
): Promise<PaginatedResult<ScheduleBatch>> => {
  const page =
    Number.isFinite(options.page) && options.page && options.page > 0
      ? options.page
      : 1;
  const limit =
    Number.isFinite(options.limit) && options.limit && options.limit > 0
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
  } else if (options.status) {
    query = query.eq('status', options.status);
  }

  const orderedQuery = query.order('updated_at', { ascending: false });
  const { data, count, error } =
    options.status === 'draft'
      ? await orderedQuery
      : await orderedQuery.range(from, to);

  if (error) {
    throw new Error(error.message || 'Failed to fetch schedule batches');
  }

  const total = count ?? 0;
  const batchRows = (data ?? []) as ScheduleBatchRow[];
  const batchIds = batchRows.map((row) => row.id);

  let itemCountByBatch = new Map<string, number>();
  let draftLikeBatchIds = new Set<string>();

  if (batchIds.length) {
    const { data: itemRows, error: itemError } = await client
      .from('scheduled_items')
      .select('batch_id, scheduled_post_id, status')
      .eq('user_id', userId)
      .in('batch_id', batchIds);

    if (itemError) {
      throw new Error(itemError.message || 'Failed to fetch scheduled batch items');
    }

    const grouped = new Map<
      string,
      Array<{
        batch_id: string;
        scheduled_post_id: string | null;
        status: ScheduledItemStatus;
      }>
    >();

    (itemRows ?? []).forEach((row) => {
      const item = row as {
        batch_id: string;
        scheduled_post_id: string | null;
        status: ScheduledItemStatus;
      };
      const current = grouped.get(item.batch_id) ?? [];
      current.push(item);
      grouped.set(item.batch_id, current);
    });

    batchIds.forEach((batchId) => {
      const items = grouped.get(batchId) ?? [];
      itemCountByBatch.set(batchId, items.length);

      const isDraftLike =
        items.length > 0 &&
        items.every(
          (item) =>
            item.scheduled_post_id === null &&
            (item.status === 'pending' || item.status === 'cancelled')
        );

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
    .filter((batch) =>
      options.status === 'draft'
        ? batch.status === 'draft' || draftLikeBatchIds.has(batch.id)
        : true
    );

  const nextItems =
    options.status === 'draft'
      ? filteredItems.slice(from, to + 1)
      : filteredItems;
  const filteredTotal = options.status === 'draft' ? filteredItems.length : total;

  return {
    items: nextItems,
    page,
    limit,
    total: filteredTotal,
    totalPages:
      filteredTotal > 0
        ? Math.ceil(filteredTotal / limit)
        : 0,
  };
};

export const getScheduledItemsByUser = async (
  client: AppSupabaseClient,
  userId: string,
  options: {
    page?: number;
    limit?: number;
    status?: ScheduledItemStatus | null;
  } = {}
): Promise<PaginatedResult<ScheduledItem>> => {
  const page =
    Number.isFinite(options.page) && options.page && options.page > 0
      ? options.page
      : 1;
  const limit =
    Number.isFinite(options.limit) && options.limit && options.limit > 0
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
    items: (data ?? []).map((row) => toScheduledItem(row as ScheduledItemRow)),
    page,
    limit,
    total,
    totalPages: total > 0 ? Math.ceil(total / limit) : 0,
  };
};

export const updateScheduledItem = async (
  client: AppSupabaseClient,
  userId: string,
  itemId: string,
  input: UpdateScheduledItemInput
): Promise<ScheduledItem> => {
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

  return toScheduledItem(data as ScheduledItemRow);
};

export const appendScheduledItemLog = async (
  client: AppSupabaseClient,
  input: {
    scheduledItemId: string;
    eventType: string;
    message: string;
    payloadJson?: Record<string, unknown> | null;
  }
): Promise<ScheduledItemLog> => {
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

  return toScheduledItemLog(data as ScheduledItemLogRow);
};

export const syncScheduledItemStatusByScheduledPostId = async (
  client: AppSupabaseClient,
  scheduledPostId: string,
  input: {
    status?: ScheduledItemStatus;
    attemptCount?: number;
    lastError?: string | null;
  }
) => {
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

  return (data ?? []).map((row) => toScheduledItem(row as ScheduledItemRow));
};
