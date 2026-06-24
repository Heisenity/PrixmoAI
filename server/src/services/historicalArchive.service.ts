import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import {
  HISTORICAL_ARCHIVE_ENABLED,
  HISTORICAL_ARCHIVE_INTERVAL_MS,
  HISTORICAL_ARCHIVE_LOCK_TTL_MS,
  HISTORICAL_ARCHIVE_STARTUP_DELAY_MS,
} from '../config/constants';
import { isSupabaseAdminConfigured, requireSupabaseAdmin } from '../db/supabase';
import { buildRedisKey, getRedisClient, isRedisConfigured } from '../lib/redis';
import {
  isR2GeneratedStorageConfigured,
  storeArchivePayloadInR2,
} from './r2Storage.service';

type RetentionTableName =
  | 'analytics'
  | 'analytics_audience_snapshots'
  | 'analytics_learning_runs'
  | 'brand_description_suggestion_logs'
  | 'brand_memory_generation_logs'
  | 'generate_description_drafts'
  | 'generate_messages'
  | 'generated_assets'
  | 'industry_suggestion_logs'
  | 'oauth_connection_sessions'
  | 'scheduled_item_logs'
  | 'social_account_post_insights'
  | 'social_account_posts_raw'
  | 'usage_tracking'
  | 'username_recommendation_logs';

type RetentionStrategy =
  | 'archive'
  | 'purge'
  | 'archive_message_bodies'
  | 'archive_asset_payloads'
  | 'archive_post_raw_payloads'
  | 'archive_post_insight_payloads';

type RetentionRule = {
  tableName: RetentionTableName;
  strategy: RetentionStrategy;
  cutoffColumn:
    | 'created_at'
    | 'expires_at'
    | 'posted_at'
    | 'recorded_at'
    | 'used_at';
  retentionDays: number;
  batchSize: number;
  statuses?: readonly string[];
  archiveMarkerColumn?:
    | 'archived_at'
    | 'payload_archived_at'
    | 'raw_payload_archived_at';
};

type HistoricalArchiveSweepSummary = {
  archivedRows: number;
  purgedRows: number;
  skippedArchiveRules: string[];
};

type ArchivePointer = {
  archiveKey: string;
  manifestId: string;
  archivedAt: string;
};

type BoundaryValues = {
  oldest: string | null;
  newest: string | null;
};

// ponytail: keep full-row readers hot; archive only heavy columns until those readers become archive-native.
const RETENTION_RULES: readonly RetentionRule[] = [
  {
    tableName: 'generate_description_drafts',
    strategy: 'purge',
    cutoffColumn: 'expires_at',
    retentionDays: 0,
    batchSize: 250,
  },
  {
    tableName: 'oauth_connection_sessions',
    strategy: 'purge',
    cutoffColumn: 'expires_at',
    retentionDays: 0,
    batchSize: 250,
  },
  {
    tableName: 'scheduled_item_logs',
    strategy: 'archive',
    cutoffColumn: 'created_at',
    retentionDays: 90,
    batchSize: 500,
  },
  {
    tableName: 'analytics_learning_runs',
    strategy: 'archive',
    cutoffColumn: 'created_at',
    retentionDays: 90,
    batchSize: 250,
    statuses: ['completed', 'failed'],
  },
  {
    tableName: 'industry_suggestion_logs',
    strategy: 'archive',
    cutoffColumn: 'created_at',
    retentionDays: 90,
    batchSize: 250,
  },
  {
    tableName: 'brand_description_suggestion_logs',
    strategy: 'archive',
    cutoffColumn: 'created_at',
    retentionDays: 90,
    batchSize: 250,
  },
  {
    tableName: 'username_recommendation_logs',
    strategy: 'archive',
    cutoffColumn: 'created_at',
    retentionDays: 90,
    batchSize: 250,
  },
  {
    tableName: 'brand_memory_generation_logs',
    strategy: 'archive',
    cutoffColumn: 'created_at',
    retentionDays: 120,
    batchSize: 250,
  },
  {
    tableName: 'usage_tracking',
    strategy: 'archive',
    cutoffColumn: 'used_at',
    retentionDays: 90,
    batchSize: 500,
  },
  {
    tableName: 'analytics',
    strategy: 'archive',
    cutoffColumn: 'recorded_at',
    retentionDays: 180,
    batchSize: 500,
  },
  {
    tableName: 'analytics_audience_snapshots',
    strategy: 'archive',
    cutoffColumn: 'recorded_at',
    retentionDays: 180,
    batchSize: 250,
  },
  {
    tableName: 'generate_messages',
    strategy: 'archive_message_bodies',
    cutoffColumn: 'created_at',
    retentionDays: 180,
    batchSize: 100,
    archiveMarkerColumn: 'archived_at',
  },
  {
    tableName: 'generated_assets',
    strategy: 'archive_asset_payloads',
    cutoffColumn: 'created_at',
    retentionDays: 180,
    batchSize: 100,
    archiveMarkerColumn: 'archived_at',
  },
  {
    tableName: 'social_account_posts_raw',
    strategy: 'archive_post_raw_payloads',
    cutoffColumn: 'posted_at',
    retentionDays: 180,
    batchSize: 150,
    archiveMarkerColumn: 'raw_payload_archived_at',
  },
  {
    tableName: 'social_account_post_insights',
    strategy: 'archive_post_insight_payloads',
    cutoffColumn: 'created_at',
    retentionDays: 180,
    batchSize: 150,
    archiveMarkerColumn: 'payload_archived_at',
  },
] as const;

const MAX_BATCHES_PER_RULE = 20;
const SWEEP_LEASE_KEY = buildRedisKey('historical-archive', 'lease');
const MESSAGE_PREVIEW_MAX_LENGTH = 280;

let sweepIntervalTimer: NodeJS.Timeout | null = null;
let sweepStartupTimer: NodeJS.Timeout | null = null;
let localSweepInFlight = false;
let archiveStorageWarningLogged = false;

const isoNow = () => new Date().toISOString();

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asNullableString = (value: unknown) =>
  typeof value === 'string' ? value : null;

const buildContentPreview = (content: string | null) => {
  if (!content?.trim()) {
    return null;
  }

  const trimmed = content.trim();
  return trimmed.length <= MESSAGE_PREVIEW_MAX_LENGTH
    ? trimmed
    : `${trimmed.slice(0, MESSAGE_PREVIEW_MAX_LENGTH - 1).trimEnd()}...`;
};

const cutoffIso = (rule: RetentionRule) =>
  rule.cutoffColumn === 'expires_at'
    ? isoNow()
    : new Date(Date.now() - rule.retentionDays * 24 * 60 * 60 * 1000).toISOString();

const getRowsForRule = async (rule: RetentionRule): Promise<Record<string, unknown>[]> => {
  const client = requireSupabaseAdmin();
  let query: any = client
    .from(rule.tableName)
    .select('*')
    .lt(rule.cutoffColumn, cutoffIso(rule))
    .order(rule.cutoffColumn, { ascending: true })
    .limit(rule.batchSize);

  if (rule.statuses?.length) {
    query = query.in('status', [...rule.statuses]);
  }

  if (rule.archiveMarkerColumn) {
    query = query.is(rule.archiveMarkerColumn, null);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || `Failed to read ${rule.tableName}`);
  }

  return (data ?? []) as Record<string, unknown>[];
};

const getRowIds = (rule: RetentionRule, rows: Record<string, unknown>[]) => {
  const ids = rows
    .map((row) => asNullableString(row.id))
    .filter((value): value is string => Boolean(value));

  if (!ids.length) {
    throw new Error(`No archiveable ids found for ${rule.tableName}`);
  }

  return ids;
};

const getBoundaryValues = (rule: RetentionRule, rows: Record<string, unknown>[]): BoundaryValues => {
  const values = rows
    .map((row) =>
      typeof row[rule.cutoffColumn] === 'string' ? String(row[rule.cutoffColumn]) : null
    )
    .filter((value): value is string => Boolean(value));

  return {
    oldest: values[0] ?? null,
    newest: values[values.length - 1] ?? null,
  };
};

const deleteRowsById = async (rule: RetentionRule, ids: string[]) => {
  const client = requireSupabaseAdmin();
  const { error } = await client.from(rule.tableName).delete().in('id', ids);

  if (error) {
    throw new Error(error.message || `Failed to delete retained rows from ${rule.tableName}`);
  }
};

const insertArchiveManifest = async (input: {
  rule: RetentionRule;
  rowId?: string | null;
  rowCount: number;
  boundaryValues: BoundaryValues;
  metadata?: Record<string, unknown>;
  archivedObject: Awaited<ReturnType<typeof storeArchivePayloadInR2>>;
}) => {
  const archiveKey = `${input.rule.tableName}:${input.archivedObject.objectKey}`;
  const client = requireSupabaseAdmin();
  const { data, error } = await client
    .from('archive_manifests')
    .insert({
      table_name: input.rule.tableName,
      archive_provider: input.archivedObject.provider,
      bucket: input.archivedObject.bucket,
      object_key: input.archivedObject.objectKey,
      archive_key: archiveKey,
      row_count: input.rowCount,
      oldest_created_at: input.boundaryValues.oldest,
      newest_created_at: input.boundaryValues.newest,
      metadata: {
        publicUrl: input.archivedObject.publicUrl,
        sizeBytes: input.archivedObject.sizeBytes,
        retentionDays: input.rule.retentionDays,
        cutoffColumn: input.rule.cutoffColumn,
        strategy: input.rule.strategy,
        rowId: input.rowId ?? null,
        ...(input.metadata ?? {}),
      },
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(
      error?.message || `Failed to write archive manifest for ${input.rule.tableName}`
    );
  }

  return {
    archiveKey,
    manifestId: data.id,
  };
};

const archiveRows = async (rule: RetentionRule, rows: Record<string, unknown>[]) => {
  const ids = getRowIds(rule, rows);
  const boundaryValues = getBoundaryValues(rule, rows);
  const archivedObject = await storeArchivePayloadInR2({
    scope: rule.tableName,
    payload: {
      tableName: rule.tableName,
      exportedAt: isoNow(),
      retentionDays: rule.retentionDays,
      cutoffColumn: rule.cutoffColumn,
      rowCount: rows.length,
      rows,
    },
    metadata: {
      table_name: rule.tableName,
      row_count: String(rows.length),
      cutoff_column: rule.cutoffColumn,
      oldest_boundary_at: boundaryValues.oldest,
      newest_boundary_at: boundaryValues.newest,
    },
  });

  await insertArchiveManifest({
    rule,
    rowCount: rows.length,
    boundaryValues,
    metadata: {
      ids,
      mode: 'full-row',
    },
    archivedObject,
  });
  await deleteRowsById(rule, ids);
  return rows.length;
};

const purgeRows = async (rule: RetentionRule, rows: Record<string, unknown>[]) => {
  const ids = getRowIds(rule, rows);
  await deleteRowsById(rule, ids);
  return ids.length;
};

const archiveGenerateMessageBodies = async (
  rule: RetentionRule,
  rows: Record<string, unknown>[]
) => {
  const client = requireSupabaseAdmin();
  let processedRows = 0;

  for (const row of rows) {
    const rowId = asNullableString(row.id);

    if (!rowId) {
      continue;
    }

    const archivedObject = await storeArchivePayloadInR2({
      scope: rule.tableName,
      payload: {
        rowId,
        content: asNullableString(row.content),
        metadata: toRecord(row.metadata),
      },
      metadata: {
        table_name: rule.tableName,
        row_id: rowId,
        payload_kind: 'message-body',
      },
    });

    const pointer = await insertArchiveManifest({
      rule,
      rowId,
      rowCount: 1,
      boundaryValues: {
        oldest: asNullableString(row.created_at),
        newest: asNullableString(row.created_at),
      },
      metadata: {
        fields: ['content', 'metadata'],
        mode: 'partial-row',
      },
      archivedObject,
    });

    const archivedAt = isoNow();
    const { error } = await client
      .from('generate_messages')
      .update({
        content: null,
        metadata: {},
        content_preview: buildContentPreview(asNullableString(row.content)),
        archived_at: archivedAt,
        archive_manifest_id: pointer.manifestId,
        archive_key: pointer.archiveKey,
      })
      .eq('id', rowId)
      .is('archived_at', null);

    if (error) {
      throw new Error(error.message || 'Failed to compact generate message payload');
    }

    processedRows += 1;
  }

  return processedRows;
};

const archiveGeneratedAssetPayloads = async (
  rule: RetentionRule,
  rows: Record<string, unknown>[]
) => {
  const client = requireSupabaseAdmin();
  let processedRows = 0;

  for (const row of rows) {
    const rowId = asNullableString(row.id);

    if (!rowId) {
      continue;
    }

    const archivedObject = await storeArchivePayloadInR2({
      scope: rule.tableName,
      payload: {
        rowId,
        payload: toRecord(row.payload),
      },
      metadata: {
        table_name: rule.tableName,
        row_id: rowId,
        payload_kind: 'generated-asset',
      },
    });

    const pointer = await insertArchiveManifest({
      rule,
      rowId,
      rowCount: 1,
      boundaryValues: {
        oldest: asNullableString(row.created_at),
        newest: asNullableString(row.created_at),
      },
      metadata: {
        fields: ['payload'],
        mode: 'partial-row',
      },
      archivedObject,
    });

    const { error } = await client
      .from('generated_assets')
      .update({
        payload: {},
        archived_at: isoNow(),
        archive_manifest_id: pointer.manifestId,
        archive_key: pointer.archiveKey,
      })
      .eq('id', rowId)
      .is('archived_at', null);

    if (error) {
      throw new Error(error.message || 'Failed to compact generated asset payload');
    }

    processedRows += 1;
  }

  return processedRows;
};

const archiveSocialAccountPostRawPayloads = async (
  rule: RetentionRule,
  rows: Record<string, unknown>[]
) => {
  const client = requireSupabaseAdmin();
  let processedRows = 0;

  for (const row of rows) {
    const rowId = asNullableString(row.id);

    if (!rowId) {
      continue;
    }

    const archivedObject = await storeArchivePayloadInR2({
      scope: rule.tableName,
      payload: {
        rowId,
        rawPayload: toRecord(row.raw_payload),
      },
      metadata: {
        table_name: rule.tableName,
        row_id: rowId,
        payload_kind: 'raw-payload',
      },
    });

    const pointer = await insertArchiveManifest({
      rule,
      rowId,
      rowCount: 1,
      boundaryValues: {
        oldest: asNullableString(row.posted_at) ?? asNullableString(row.created_at),
        newest: asNullableString(row.posted_at) ?? asNullableString(row.created_at),
      },
      metadata: {
        fields: ['raw_payload'],
        mode: 'partial-row',
      },
      archivedObject,
    });

    const { error } = await client
      .from('social_account_posts_raw')
      .update({
        raw_payload: {},
        raw_payload_archived_at: isoNow(),
        raw_payload_archive_manifest_id: pointer.manifestId,
        raw_payload_archive_key: pointer.archiveKey,
      })
      .eq('id', rowId)
      .is('raw_payload_archived_at', null);

    if (error) {
      throw new Error(error.message || 'Failed to compact connected-account raw payload');
    }

    processedRows += 1;
  }

  return processedRows;
};

const archiveSocialAccountPostInsightPayloads = async (
  rule: RetentionRule,
  rows: Record<string, unknown>[]
) => {
  const client = requireSupabaseAdmin();
  let processedRows = 0;

  for (const row of rows) {
    const rowId = asNullableString(row.id);

    if (!rowId) {
      continue;
    }

    const archivedObject = await storeArchivePayloadInR2({
      scope: rule.tableName,
      payload: {
        rowId,
        metrics: toRecord(row.metrics),
        rawPayload: toRecord(row.raw_payload),
      },
      metadata: {
        table_name: rule.tableName,
        row_id: rowId,
        payload_kind: 'insight-payload',
      },
    });

    const pointer = await insertArchiveManifest({
      rule,
      rowId,
      rowCount: 1,
      boundaryValues: {
        oldest: asNullableString(row.created_at),
        newest: asNullableString(row.created_at),
      },
      metadata: {
        fields: ['metrics', 'raw_payload'],
        mode: 'partial-row',
      },
      archivedObject,
    });

    const { error } = await client
      .from('social_account_post_insights')
      .update({
        metrics: {},
        raw_payload: {},
        payload_archived_at: isoNow(),
        payload_archive_manifest_id: pointer.manifestId,
        payload_archive_key: pointer.archiveKey,
      })
      .eq('id', rowId)
      .is('payload_archived_at', null);

    if (error) {
      throw new Error(error.message || 'Failed to compact connected-account insight payload');
    }

    processedRows += 1;
  }

  return processedRows;
};

const runRuleSweep = async (rule: RetentionRule) => {
  let processedRows = 0;

  for (let batchIndex = 0; batchIndex < MAX_BATCHES_PER_RULE; batchIndex += 1) {
    const rows = await getRowsForRule(rule);

    if (!rows.length) {
      break;
    }

    let affectedRows = 0;
    switch (rule.strategy) {
      case 'archive':
        affectedRows = await archiveRows(rule, rows);
        break;
      case 'purge':
        affectedRows = await purgeRows(rule, rows);
        break;
      case 'archive_message_bodies':
        affectedRows = await archiveGenerateMessageBodies(rule, rows);
        break;
      case 'archive_asset_payloads':
        affectedRows = await archiveGeneratedAssetPayloads(rule, rows);
        break;
      case 'archive_post_raw_payloads':
        affectedRows = await archiveSocialAccountPostRawPayloads(rule, rows);
        break;
      case 'archive_post_insight_payloads':
        affectedRows = await archiveSocialAccountPostInsightPayloads(rule, rows);
        break;
      default:
        affectedRows = 0;
    }

    processedRows += affectedRows;

    console.info(
      `[archive] ${rule.tableName}: ${rule.strategy === 'purge' ? 'purged' : 'archived'} ${affectedRows} row${
        affectedRows === 1 ? '' : 's'
      }`
    );

    if (affectedRows < rule.batchSize) {
      break;
    }
  }

  return processedRows;
};

const acquireSweepLease = async () => {
  if (!isRedisConfigured) {
    if (localSweepInFlight) {
      return null;
    }

    localSweepInFlight = true;
    return async () => {
      localSweepInFlight = false;
    };
  }

  const token = randomUUID();
  const lockResult = await getRedisClient().set(
    SWEEP_LEASE_KEY,
    token,
    'PX',
    HISTORICAL_ARCHIVE_LOCK_TTL_MS,
    'NX'
  );

  if (lockResult !== 'OK') {
    return null;
  }

  return async () => {
    // ponytail: best-effort lease release; switch to compare-and-del Lua only if multi-instance contention shows up.
    try {
      const currentToken = await getRedisClient().get(SWEEP_LEASE_KEY);
      if (currentToken === token) {
        await getRedisClient().del(SWEEP_LEASE_KEY);
      }
    } catch {
      // Best effort only.
    }
  };
};

const usesR2Archive = (rule: RetentionRule) => rule.strategy !== 'purge';

export const runHistoricalArchiveSweep = async (
  options: {
    skipLease?: boolean;
  } = {}
): Promise<HistoricalArchiveSweepSummary> => {
  assert(RETENTION_RULES.length > 0);
  assert(
    RETENTION_RULES.every(
      (rule) => rule.batchSize > 0 && rule.retentionDays >= 0 && rule.tableName.trim()
    )
  );
  assert(
    new Set(RETENTION_RULES.map((rule) => `${rule.tableName}:${rule.strategy}`)).size ===
      RETENTION_RULES.length
  );

  if (!isSupabaseAdminConfigured) {
    console.warn('[archive] Skipping historical archive sweep because Supabase admin is not configured.');
    return {
      archivedRows: 0,
      purgedRows: 0,
      skippedArchiveRules: RETENTION_RULES.filter(usesR2Archive).map((rule) => rule.tableName),
    };
  }

  const releaseLease = options.skipLease ? null : await acquireSweepLease();
  if (!options.skipLease && !releaseLease) {
    console.info('[archive] Skipping historical archive sweep because another worker already holds the lease.');
    return {
      archivedRows: 0,
      purgedRows: 0,
      skippedArchiveRules: [],
    };
  }

  const archiveStorageConfigured = isR2GeneratedStorageConfigured();
  const summary: HistoricalArchiveSweepSummary = {
    archivedRows: 0,
    purgedRows: 0,
    skippedArchiveRules: [],
  };

  try {
    for (const rule of RETENTION_RULES) {
      if (usesR2Archive(rule) && !archiveStorageConfigured) {
        summary.skippedArchiveRules.push(rule.tableName);
        continue;
      }

      const processedRows = await runRuleSweep(rule);
      if (rule.strategy === 'purge') {
        summary.purgedRows += processedRows;
      } else {
        summary.archivedRows += processedRows;
      }
    }

    if (!archiveStorageConfigured && !archiveStorageWarningLogged) {
      archiveStorageWarningLogged = true;
      console.warn(
        '[archive] R2 is not configured. Historical archive sweep ran purge rules only; archive rules were skipped.'
      );
    }

    console.info(
      `[archive] completed. archived_rows=${summary.archivedRows} purged_rows=${summary.purgedRows}`
    );

    return summary;
  } finally {
    await releaseLease?.();
  }
};

export const startHistoricalArchiveWorker = () => {
  if (!HISTORICAL_ARCHIVE_ENABLED || sweepIntervalTimer || sweepStartupTimer) {
    return;
  }

  if (!isSupabaseAdminConfigured) {
    console.warn(
      '[archive] Historical archive worker is disabled because Supabase admin is not configured.'
    );
    return;
  }

  const runSweep = () => {
    void runHistoricalArchiveSweep().catch((error) => {
      console.warn(
        `[archive] Historical archive sweep failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });
  };

  sweepStartupTimer = setTimeout(() => {
    sweepStartupTimer = null;
    runSweep();
  }, Math.max(0, HISTORICAL_ARCHIVE_STARTUP_DELAY_MS));
  sweepStartupTimer.unref?.();

  sweepIntervalTimer = setInterval(
    runSweep,
    Math.max(5 * 60_000, HISTORICAL_ARCHIVE_INTERVAL_MS)
  );
  sweepIntervalTimer.unref?.();

  console.log(
    `[archive] Historical archive worker scheduled every ${Math.max(
      5 * 60_000,
      HISTORICAL_ARCHIVE_INTERVAL_MS
    )}ms.`
  );
};
