import type { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { requireSupabaseAdmin } from '../db/supabase';
import type {
  DeleteDescriptionDraftInput,
  ListDescriptionDraftsInput,
  UpsertDescriptionDraftInput,
} from '../schemas/descriptionDraft.schema';

type AuthenticatedRequest<
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>,
> = Request<Params, ResBody, ReqBody, ReqQuery> & {
  user?: User;
  accessToken?: string;
};

const DESCRIPTION_DRAFT_TTL_HOURS = 48;

const buildExpiresAtIso = () => {
  const nextDate = new Date();
  nextDate.setHours(nextDate.getHours() + DESCRIPTION_DRAFT_TTL_HOURS);
  return nextDate.toISOString();
};

const cleanupExpiredDescriptionDrafts = async () => {
  const client = requireSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { error } = await client
    .from('generate_description_drafts')
    .delete()
    .lt('expires_at', nowIso);

  if (error) {
    throw new Error(`Failed to clean up expired drafts: ${error.message}`);
  }
};

export const listDescriptionDrafts = async (
  req: AuthenticatedRequest<{}, unknown, unknown, ListDescriptionDraftsInput>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    await cleanupExpiredDescriptionDrafts();
    const client = requireSupabaseAdmin();
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
  } catch (error) {
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

export const upsertDescriptionDraft = async (
  req: AuthenticatedRequest<{}, unknown, UpsertDescriptionDraftInput>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    await cleanupExpiredDescriptionDrafts();
    const client = requireSupabaseAdmin();
    const expiresAt = buildExpiresAtIso();

    const { error } = await client.from('generate_description_drafts').upsert(
      {
        user_id: req.user.id,
        draft_scope: req.body.scope,
        language: req.body.language,
        content: req.body.text,
        expires_at: expiresAt,
      },
      {
        onConflict: 'user_id,draft_scope,language',
      }
    );

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
  } catch (error) {
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

export const deleteDescriptionDraft = async (
  req: AuthenticatedRequest<{}, unknown, DeleteDescriptionDraftInput>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    await cleanupExpiredDescriptionDrafts();
    const client = requireSupabaseAdmin();
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
  } catch (error) {
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
