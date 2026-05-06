"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBrandMemoryEmbeddingById = exports.archiveBrandMemoryEmbeddingsBySource = exports.getBrandMemoryEmbeddingsBySource = exports.updateBrandMemoryEmbeddingsBySource = exports.hybridMatchBrandMemory = exports.matchBrandMemory = exports.upsertBrandMemoryEmbedding = void 0;
const toBrandMemoryMatch = (row) => ({
    id: row.id,
    brandProfileId: row.brand_profile_id,
    sourceTable: row.source_table,
    sourceId: row.source_id,
    sourceKey: row.source_key,
    memoryType: row.memory_type,
    contentText: row.content_text,
    metadata: row.metadata ?? {},
    similarity: typeof row.similarity === 'number' && Number.isFinite(row.similarity)
        ? row.similarity
        : 0,
    vectorSimilarity: typeof row.vector_similarity === 'number' && Number.isFinite(row.vector_similarity)
        ? row.vector_similarity
        : undefined,
    keywordScore: typeof row.keyword_score === 'number' && Number.isFinite(row.keyword_score)
        ? row.keyword_score
        : undefined,
    hybridScore: typeof row.hybrid_score === 'number' && Number.isFinite(row.hybrid_score)
        ? row.hybrid_score
        : undefined,
    qualityScore: typeof row.quality_score === 'number' && Number.isFinite(row.quality_score)
        ? row.quality_score
        : undefined,
    promotionScore: typeof row.promotion_score === 'number' && Number.isFinite(row.promotion_score)
        ? row.promotion_score
        : undefined,
    performanceScore: typeof row.performance_score === 'number' && Number.isFinite(row.performance_score)
        ? row.performance_score
        : undefined,
    reuseCount: typeof row.reuse_count === 'number' && Number.isFinite(row.reuse_count)
        ? row.reuse_count
        : undefined,
    successfulReuseCount: typeof row.successful_reuse_count === 'number' &&
        Number.isFinite(row.successful_reuse_count)
        ? row.successful_reuse_count
        : undefined,
    acceptanceCount: typeof row.acceptance_count === 'number' && Number.isFinite(row.acceptance_count)
        ? row.acceptance_count
        : undefined,
    rejectionCount: typeof row.rejection_count === 'number' && Number.isFinite(row.rejection_count)
        ? row.rejection_count
        : undefined,
    regenerationCount: typeof row.regeneration_count === 'number' &&
        Number.isFinite(row.regeneration_count)
        ? row.regeneration_count
        : undefined,
    editCount: typeof row.edit_count === 'number' && Number.isFinite(row.edit_count)
        ? row.edit_count
        : undefined,
    scheduleUseCount: typeof row.schedule_use_count === 'number' &&
        Number.isFinite(row.schedule_use_count)
        ? row.schedule_use_count
        : undefined,
    lastFeedbackAt: typeof row.last_feedback_at === 'string' ? row.last_feedback_at : undefined,
    archivedAt: typeof row.archived_at === 'string' || row.archived_at === null
        ? row.archived_at ?? null
        : undefined,
    createdAt: typeof row.created_at === 'string' ? row.created_at : undefined,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
});
const upsertBrandMemoryEmbedding = async (client, input) => {
    const { error } = await client.from('brand_memory_embeddings').upsert({
        user_id: input.userId,
        brand_profile_id: input.brandProfileId ?? null,
        source_table: input.sourceTable,
        source_id: input.sourceId,
        source_key: input.sourceKey,
        memory_type: input.memoryType,
        content_text: input.contentText,
        embedding: input.embedding,
        metadata: input.metadata ?? {},
        archived_at: null,
    }, {
        onConflict: 'user_id,source_table,source_id,source_key',
    });
    if (error) {
        throw new Error(error.message || 'Failed to upsert brand memory embedding');
    }
};
exports.upsertBrandMemoryEmbedding = upsertBrandMemoryEmbedding;
const matchBrandMemory = async (client, options) => {
    const { data, error } = await client.rpc('match_brand_memory', {
        query_embedding: options.embedding,
        match_user_id: options.userId,
        match_count: options.limit ?? 5,
        match_memory_types: options.memoryTypes ?? null,
    });
    if (error) {
        throw new Error(error.message || 'Failed to match brand memory');
    }
    return (data ?? []).map(toBrandMemoryMatch);
};
exports.matchBrandMemory = matchBrandMemory;
const hybridMatchBrandMemory = async (client, options) => {
    const { data, error } = await client.rpc('hybrid_match_brand_memory', {
        query_embedding: options.embedding,
        query_text: options.queryText,
        match_user_id: options.userId,
        match_count: options.limit ?? 7,
        match_memory_types: options.memoryTypes ?? null,
        vector_limit: options.vectorLimit ?? 24,
        keyword_limit: options.keywordLimit ?? 24,
    });
    if (error) {
        throw new Error(error.message || 'Failed to hybrid match brand memory');
    }
    return (data ?? []).map(toBrandMemoryMatch);
};
exports.hybridMatchBrandMemory = hybridMatchBrandMemory;
const updateBrandMemoryEmbeddingsBySource = async (client, input) => {
    let query = client
        .from('brand_memory_embeddings')
        .update(input.patch)
        .eq('user_id', input.userId)
        .eq('source_table', input.sourceTable)
        .eq('source_id', input.sourceId);
    if (input.sourceKeys?.length) {
        query = query.in('source_key', input.sourceKeys);
    }
    const { error } = await query;
    if (error) {
        throw new Error(error.message || 'Failed to update brand memory embedding signals');
    }
};
exports.updateBrandMemoryEmbeddingsBySource = updateBrandMemoryEmbeddingsBySource;
const getBrandMemoryEmbeddingsBySource = async (client, input) => {
    const { data, error } = await client
        .from('brand_memory_embeddings')
        .select('*')
        .eq('user_id', input.userId)
        .eq('source_table', input.sourceTable)
        .eq('source_id', input.sourceId)
        .is('archived_at', null);
    if (error) {
        throw new Error(error.message || 'Failed to fetch brand memory embeddings by source');
    }
    return (data ?? []);
};
exports.getBrandMemoryEmbeddingsBySource = getBrandMemoryEmbeddingsBySource;
const archiveBrandMemoryEmbeddingsBySource = async (client, input) => {
    const retainSourceKeys = input.retainSourceKeys.filter(Boolean);
    let query = client
        .from('brand_memory_embeddings')
        .update({
        archived_at: new Date().toISOString(),
    })
        .eq('user_id', input.userId)
        .eq('source_table', input.sourceTable)
        .eq('source_id', input.sourceId)
        .is('archived_at', null);
    if (retainSourceKeys.length > 0) {
        query = query.not('source_key', 'in', `(${retainSourceKeys.map((key) => `"${key.replace(/"/g, '""')}"`).join(',')})`);
    }
    const { error } = await query;
    if (error) {
        throw new Error(error.message || 'Failed to archive stale brand memory embeddings');
    }
};
exports.archiveBrandMemoryEmbeddingsBySource = archiveBrandMemoryEmbeddingsBySource;
const updateBrandMemoryEmbeddingById = async (client, input) => {
    const { error } = await client
        .from('brand_memory_embeddings')
        .update(input.patch)
        .eq('id', input.id)
        .eq('user_id', input.userId);
    if (error) {
        throw new Error(error.message || 'Failed to update brand memory embedding');
    }
};
exports.updateBrandMemoryEmbeddingById = updateBrandMemoryEmbeddingById;
