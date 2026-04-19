import type { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import type { TranscribeAudioInput } from '../schemas/transcription.schema';
import {
  createRequestCancellation,
  isRequestCancelledError,
} from '../lib/requestCancellation';
import { transcribeAudioWithGroq } from '../ai/transcription';

type AuthenticatedRequest<
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
> = Request<Params, ResBody, ReqBody> & {
  user?: User;
  accessToken?: string;
};

export const transcribeGenerateAudio = async (
  req: AuthenticatedRequest<{}, unknown, TranscribeAudioInput>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  const cancellation = createRequestCancellation(req, res);

  try {
    const result = await transcribeAudioWithGroq({
      audioBase64: req.body.audioBase64,
      mimeType: req.body.mimeType,
      languageHint: req.body.languageHint,
      signal: cancellation.signal,
    });

    return res.status(200).json({
      status: 'success',
      message: 'Audio transcribed successfully',
      data: result,
    });
  } catch (error) {
    if (isRequestCancelledError(error)) {
      return;
    }

    return res.status(502).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to transcribe audio',
    });
  } finally {
    cancellation.cleanup();
  }
};
