"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDescriptionDraft = exports.upsertDescriptionDraft = exports.listDescriptionDrafts = void 0;
const supabase_1 = require("../db/supabase");
const DESCRIPTION_DRAFT_TTL_HOURS = 48;
const buildExpiresAtIso = () => {
    const nextDate = new Date();
    nextDate.setHours(nextDate.getHours() + DESCRIPTION_DRAFT_TTL_HOURS);
    return nextDate.toISOString();
};
const cleanupExpiredDescriptionDrafts = async () => {
    const client = (0, supabase_1.requireSupabaseAdmin)();
    const nowIso = new Date().toISOString();
    const { error } = await client
        .from('generate_description_drafts')
        .delete()
        .lt('expires_at', nowIso);
    if (error) {
        throw new Error(`Failed to clean up expired drafts: ${error.message}`);
    }
};
const listDescriptionDrafts = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        await cleanupExpiredDescriptionDrafts();
        const client = (0, supabase_1.requireSupabaseAdmin)();
        const nowIso = new Date().toISOString();
        const { data, error } = await client
            .from('generate_description_drafts')
            .select('language, content, updated_at, expires_at')
            .eq('user_id', req.user.id)
            .eq('draft_scope', req.query.scope)
            .gt('expires_at', nowIso)
            .order('updated_at', { ascending: false });
        if (error) {
            throw new Error(error.message);
        }
        return res.status(200).json({
            status: 'success',
            data: {
                drafts: (data ?? []).map((entry) => ({
                    language: entry.language,
                    text: entry.content,
                    updatedAt: entry.updated_at,
                    expiresAt: entry.expires_at,
                })),
            },
        });
    }
    catch (error) {
        console.error('[description-drafts] list failed', {
            userId: req.user.id,
            scope: req.query.scope,
            error: error instanceof Error ? error.message : String(error),
        });
        return res.status(500).json({
            status: 'error',
            message: 'Failed to load saved description drafts.',
        });
    }
};
exports.listDescriptionDrafts = listDescriptionDrafts;
const upsertDescriptionDraft = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        await cleanupExpiredDescriptionDrafts();
        const client = (0, supabase_1.requireSupabaseAdmin)();
        const expiresAt = buildExpiresAtIso();
        const { error } = await client.from('generate_description_drafts').upsert({
            user_id: req.user.id,
            draft_scope: req.body.scope,
            language: req.body.language,
            content: req.body.text,
            expires_at: expiresAt,
        }, {
            onConflict: 'user_id,draft_scope,language',
        });
        if (error) {
            throw new Error(error.message);
        }
        return res.status(200).json({
            status: 'success',
            data: {
                scope: req.body.scope,
                language: req.body.language,
                text: req.body.text,
                expiresAt,
            },
        });
    }
    catch (error) {
        console.error('[description-drafts] upsert failed', {
            userId: req.user.id,
            scope: req.body.scope,
            language: req.body.language,
            error: error instanceof Error ? error.message : String(error),
        });
        return res.status(500).json({
            status: 'error',
            message: 'Failed to save the description draft.',
        });
    }
};
exports.upsertDescriptionDraft = upsertDescriptionDraft;
const deleteDescriptionDraft = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        await cleanupExpiredDescriptionDrafts();
        const client = (0, supabase_1.requireSupabaseAdmin)();
        const { error } = await client
            .from('generate_description_drafts')
            .delete()
            .eq('user_id', req.user.id)
            .eq('draft_scope', req.body.scope)
            .eq('language', req.body.language);
        if (error) {
            throw new Error(error.message);
        }
        return res.status(200).json({
            status: 'success',
            data: {
                scope: req.body.scope,
                language: req.body.language,
            },
        });
    }
    catch (error) {
        console.error('[description-drafts] delete failed', {
            userId: req.user.id,
            scope: req.body.scope,
            language: req.body.language,
            error: error instanceof Error ? error.message : String(error),
        });
        return res.status(500).json({
            status: 'error',
            message: 'Failed to clear the description draft.',
        });
    }
};
exports.deleteDescriptionDraft = deleteDescriptionDraft;
