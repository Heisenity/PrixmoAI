"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const supabase_1 = require("../db/supabase");
const r2Storage_service_1 = require("../services/r2Storage.service");
const ARCHIVE_RULES = [
    { tableName: 'scheduled_item_logs', retentionDays: 90, batchSize: 500 },
    { tableName: 'brand_memory_generation_logs', retentionDays: 120, batchSize: 250 },
    { tableName: 'analytics_learning_runs', retentionDays: 90, batchSize: 250 },
];
const MAX_BATCHES_PER_TABLE = 20;
const cutoffIso = (retentionDays) => new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
const getRowsForRule = async (rule) => {
    const client = (0, supabase_1.requireSupabaseAdmin)();
    const cutoff = cutoffIso(rule.retentionDays);
    switch (rule.tableName) {
        case 'scheduled_item_logs': {
            const { data, error } = await client
                .from(rule.tableName)
                .select('*')
                .lt('created_at', cutoff)
                .order('created_at', { ascending: true })
                .limit(rule.batchSize);
            if (error) {
                throw new Error(error.message || `Failed to read ${rule.tableName}`);
            }
            return data ?? [];
        }
        case 'brand_memory_generation_logs': {
            const { data, error } = await client
                .from(rule.tableName)
                .select('*')
                .lt('created_at', cutoff)
                .order('created_at', { ascending: true })
                .limit(rule.batchSize);
            if (error) {
                throw new Error(error.message || `Failed to read ${rule.tableName}`);
            }
            return data ?? [];
        }
        case 'analytics_learning_runs': {
            const { data, error } = await client
                .from(rule.tableName)
                .select('*')
                .in('status', ['completed', 'failed'])
                .lt('created_at', cutoff)
                .order('created_at', { ascending: true })
                .limit(rule.batchSize);
            if (error) {
                throw new Error(error.message || `Failed to read ${rule.tableName}`);
            }
            return data ?? [];
        }
        case 'social_account_sync_runs': {
            const { data, error } = await client
                .from(rule.tableName)
                .select('*')
                .in('status', ['completed', 'failed', 'skipped'])
                .lt('created_at', cutoff)
                .order('created_at', { ascending: true })
                .limit(rule.batchSize);
            if (error) {
                throw new Error(error.message || `Failed to read ${rule.tableName}`);
            }
            return data ?? [];
        }
    }
};
const archiveBatch = async (rule, rows) => {
    if (!rows.length) {
        return 0;
    }
    const ids = rows
        .map((row) => (typeof row.id === 'string' ? row.id : null))
        .filter((value) => Boolean(value));
    if (!ids.length) {
        throw new Error(`No archiveable ids found for ${rule.tableName}`);
    }
    const createdAtValues = rows
        .map((row) => (typeof row.created_at === 'string' ? row.created_at : null))
        .filter((value) => Boolean(value));
    const oldestCreatedAt = createdAtValues[0] ?? null;
    const newestCreatedAt = createdAtValues[createdAtValues.length - 1] ?? null;
    const archivedObject = await (0, r2Storage_service_1.storeArchivePayloadInR2)({
        scope: rule.tableName,
        payload: {
            tableName: rule.tableName,
            exportedAt: new Date().toISOString(),
            retentionDays: rule.retentionDays,
            rowCount: rows.length,
            rows,
        },
        metadata: {
            table_name: rule.tableName,
            row_count: String(rows.length),
            oldest_created_at: oldestCreatedAt,
            newest_created_at: newestCreatedAt,
        },
    });
    const archiveKey = `${rule.tableName}:${archivedObject.objectKey}`;
    const client = (0, supabase_1.requireSupabaseAdmin)();
    const { error: manifestError } = await client.from('archive_manifests').insert({
        table_name: rule.tableName,
        archive_provider: archivedObject.provider,
        bucket: archivedObject.bucket,
        object_key: archivedObject.objectKey,
        archive_key: archiveKey,
        row_count: rows.length,
        oldest_created_at: oldestCreatedAt,
        newest_created_at: newestCreatedAt,
        metadata: {
            publicUrl: archivedObject.publicUrl,
            sizeBytes: archivedObject.sizeBytes,
            retentionDays: rule.retentionDays,
            ids,
        },
    });
    if (manifestError) {
        throw new Error(manifestError.message || `Failed to write archive manifest for ${rule.tableName}`);
    }
    const { error: deleteError } = await client.from(rule.tableName).delete().in('id', ids);
    if (deleteError) {
        throw new Error(deleteError.message || `Failed to delete archived rows from ${rule.tableName}`);
    }
    return rows.length;
};
const run = async () => {
    (0, strict_1.default)(ARCHIVE_RULES.every((rule) => rule.retentionDays > 0 && rule.batchSize > 0));
    let archivedRows = 0;
    for (const rule of ARCHIVE_RULES) {
        for (let batchIndex = 0; batchIndex < MAX_BATCHES_PER_TABLE; batchIndex += 1) {
            const rows = (await getRowsForRule(rule));
            if (!rows.length) {
                break;
            }
            const batchArchivedRows = await archiveBatch(rule, rows);
            archivedRows += batchArchivedRows;
            console.info(`[archive] ${rule.tableName}: archived ${batchArchivedRows} row${batchArchivedRows === 1 ? '' : 's'}`);
            if (batchArchivedRows < rule.batchSize) {
                break;
            }
        }
    }
    console.info(`[archive] completed. archived_rows=${archivedRows}`);
};
void run().catch((error) => {
    console.error(`[archive] ${error instanceof Error ? error.message : 'Historical archive failed.'}`);
    process.exitCode = 1;
});
