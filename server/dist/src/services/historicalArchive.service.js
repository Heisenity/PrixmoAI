"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHistoricalArchiveWorker = exports.runHistoricalArchiveSweep = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const crypto_1 = require("crypto");
const constants_1 = require("../config/constants");
const supabase_1 = require("../db/supabase");
const redis_1 = require("../lib/redis");
const r2Storage_service_1 = require("./r2Storage.service");
// ponytail: keep full-row readers hot; archive only heavy columns until those readers become archive-native.
const RETENTION_RULES = [
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
];
const MAX_BATCHES_PER_RULE = 20;
const SWEEP_LEASE_KEY = (0, redis_1.buildRedisKey)('historical-archive', 'lease');
const MESSAGE_PREVIEW_MAX_LENGTH = 280;
let sweepIntervalTimer = null;
let sweepStartupTimer = null;
let localSweepInFlight = false;
let archiveStorageWarningLogged = false;
const isoNow = () => new Date().toISOString();
const toRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
const asNullableString = (value) => typeof value === 'string' ? value : null;
const buildContentPreview = (content) => {
    if (!content?.trim()) {
        return null;
    }
    const trimmed = content.trim();
    return trimmed.length <= MESSAGE_PREVIEW_MAX_LENGTH
        ? trimmed
        : `${trimmed.slice(0, MESSAGE_PREVIEW_MAX_LENGTH - 1).trimEnd()}...`;
};
const cutoffIso = (rule) => rule.cutoffColumn === 'expires_at'
    ? isoNow()
    : new Date(Date.now() - rule.retentionDays * 24 * 60 * 60 * 1000).toISOString();
const getRowsForRule = async (rule) => {
    const client = (0, supabase_1.requireSupabaseAdmin)();
    let query = client
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
    return (data ?? []);
};
const getRowIds = (rule, rows) => {
    const ids = rows
        .map((row) => asNullableString(row.id))
        .filter((value) => Boolean(value));
    if (!ids.length) {
        throw new Error(`No archiveable ids found for ${rule.tableName}`);
    }
    return ids;
};
const getBoundaryValues = (rule, rows) => {
    const values = rows
        .map((row) => typeof row[rule.cutoffColumn] === 'string' ? String(row[rule.cutoffColumn]) : null)
        .filter((value) => Boolean(value));
    return {
        oldest: values[0] ?? null,
        newest: values[values.length - 1] ?? null,
    };
};
const deleteRowsById = async (rule, ids) => {
    const client = (0, supabase_1.requireSupabaseAdmin)();
    const { error } = await client.from(rule.tableName).delete().in('id', ids);
    if (error) {
        throw new Error(error.message || `Failed to delete retained rows from ${rule.tableName}`);
    }
};
const insertArchiveManifest = async (input) => {
    const archiveKey = `${input.rule.tableName}:${input.archivedObject.objectKey}`;
    const client = (0, supabase_1.requireSupabaseAdmin)();
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
        throw new Error(error?.message || `Failed to write archive manifest for ${input.rule.tableName}`);
    }
    return {
        archiveKey,
        manifestId: data.id,
    };
};
const archiveRows = async (rule, rows) => {
    const ids = getRowIds(rule, rows);
    const boundaryValues = getBoundaryValues(rule, rows);
    const archivedObject = await (0, r2Storage_service_1.storeArchivePayloadInR2)({
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
const purgeRows = async (rule, rows) => {
    const ids = getRowIds(rule, rows);
    await deleteRowsById(rule, ids);
    return ids.length;
};
const archiveGenerateMessageBodies = async (rule, rows) => {
    const client = (0, supabase_1.requireSupabaseAdmin)();
    let processedRows = 0;
    for (const row of rows) {
        const rowId = asNullableString(row.id);
        if (!rowId) {
            continue;
        }
        const archivedObject = await (0, r2Storage_service_1.storeArchivePayloadInR2)({
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
const archiveGeneratedAssetPayloads = async (rule, rows) => {
    const client = (0, supabase_1.requireSupabaseAdmin)();
    let processedRows = 0;
    for (const row of rows) {
        const rowId = asNullableString(row.id);
        if (!rowId) {
            continue;
        }
        const archivedObject = await (0, r2Storage_service_1.storeArchivePayloadInR2)({
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
const archiveSocialAccountPostRawPayloads = async (rule, rows) => {
    const client = (0, supabase_1.requireSupabaseAdmin)();
    let processedRows = 0;
    for (const row of rows) {
        const rowId = asNullableString(row.id);
        if (!rowId) {
            continue;
        }
        const archivedObject = await (0, r2Storage_service_1.storeArchivePayloadInR2)({
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
const archiveSocialAccountPostInsightPayloads = async (rule, rows) => {
    const client = (0, supabase_1.requireSupabaseAdmin)();
    let processedRows = 0;
    for (const row of rows) {
        const rowId = asNullableString(row.id);
        if (!rowId) {
            continue;
        }
        const archivedObject = await (0, r2Storage_service_1.storeArchivePayloadInR2)({
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
const runRuleSweep = async (rule) => {
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
        console.info(`[archive] ${rule.tableName}: ${rule.strategy === 'purge' ? 'purged' : 'archived'} ${affectedRows} row${affectedRows === 1 ? '' : 's'}`);
        if (affectedRows < rule.batchSize) {
            break;
        }
    }
    return processedRows;
};
const acquireSweepLease = async () => {
    if (!redis_1.isRedisConfigured) {
        if (localSweepInFlight) {
            return null;
        }
        localSweepInFlight = true;
        return async () => {
            localSweepInFlight = false;
        };
    }
    const token = (0, crypto_1.randomUUID)();
    const lockResult = await (0, redis_1.getRedisClient)().set(SWEEP_LEASE_KEY, token, 'PX', constants_1.HISTORICAL_ARCHIVE_LOCK_TTL_MS, 'NX');
    if (lockResult !== 'OK') {
        return null;
    }
    return async () => {
        // ponytail: best-effort lease release; switch to compare-and-del Lua only if multi-instance contention shows up.
        try {
            const currentToken = await (0, redis_1.getRedisClient)().get(SWEEP_LEASE_KEY);
            if (currentToken === token) {
                await (0, redis_1.getRedisClient)().del(SWEEP_LEASE_KEY);
            }
        }
        catch {
            // Best effort only.
        }
    };
};
const usesR2Archive = (rule) => rule.strategy !== 'purge';
const runHistoricalArchiveSweep = async (options = {}) => {
    (0, strict_1.default)(RETENTION_RULES.length > 0);
    (0, strict_1.default)(RETENTION_RULES.every((rule) => rule.batchSize > 0 && rule.retentionDays >= 0 && rule.tableName.trim()));
    (0, strict_1.default)(new Set(RETENTION_RULES.map((rule) => `${rule.tableName}:${rule.strategy}`)).size ===
        RETENTION_RULES.length);
    if (!supabase_1.isSupabaseAdminConfigured) {
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
    const archiveStorageConfigured = (0, r2Storage_service_1.isR2GeneratedStorageConfigured)();
    const summary = {
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
            }
            else {
                summary.archivedRows += processedRows;
            }
        }
        if (!archiveStorageConfigured && !archiveStorageWarningLogged) {
            archiveStorageWarningLogged = true;
            console.warn('[archive] R2 is not configured. Historical archive sweep ran purge rules only; archive rules were skipped.');
        }
        console.info(`[archive] completed. archived_rows=${summary.archivedRows} purged_rows=${summary.purgedRows}`);
        return summary;
    }
    finally {
        await releaseLease?.();
    }
};
exports.runHistoricalArchiveSweep = runHistoricalArchiveSweep;
const startHistoricalArchiveWorker = () => {
    if (!constants_1.HISTORICAL_ARCHIVE_ENABLED || sweepIntervalTimer || sweepStartupTimer) {
        return;
    }
    if (!supabase_1.isSupabaseAdminConfigured) {
        console.warn('[archive] Historical archive worker is disabled because Supabase admin is not configured.');
        return;
    }
    const runSweep = () => {
        void (0, exports.runHistoricalArchiveSweep)().catch((error) => {
            console.warn(`[archive] Historical archive sweep failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };
    sweepStartupTimer = setTimeout(() => {
        sweepStartupTimer = null;
        runSweep();
    }, Math.max(0, constants_1.HISTORICAL_ARCHIVE_STARTUP_DELAY_MS));
    sweepStartupTimer.unref?.();
    sweepIntervalTimer = setInterval(runSweep, Math.max(5 * 60000, constants_1.HISTORICAL_ARCHIVE_INTERVAL_MS));
    sweepIntervalTimer.unref?.();
    console.log(`[archive] Historical archive worker scheduled every ${Math.max(5 * 60000, constants_1.HISTORICAL_ARCHIVE_INTERVAL_MS)}ms.`);
};
exports.startHistoricalArchiveWorker = startHistoricalArchiveWorker;
