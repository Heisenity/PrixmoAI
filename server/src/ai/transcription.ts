import {
  GROQ_TRANSCRIPTION_MODEL,
  GROQ_TRANSCRIPTION_TIMEOUT_MS,
  TRANSCRIPTION_MAX_AUDIO_BYTES,
} from '../config/constants';
import {
  isAbortError,
  RequestCancelledError,
  throwIfRequestCancelled,
} from '../lib/requestCancellation';

type GroqTranscriptionOptions = {
  audioBase64: string;
  mimeType: string;
  languageHint?: string;
  signal?: AbortSignal;
};

type GroqVerboseSegment = {
  id?: number;
  start?: number;
  end?: number;
  text?: string;
  avg_logprob?: number;
};

type GroqVerboseTranscriptionResponse = {
  text?: string;
  language?: string;
  duration?: number;
  segments?: GroqVerboseSegment[];
  error?: {
    message?: string;
  };
};

export type AudioTranscriptionResult = {
  transcript: string;
  detectedLanguage: string | null;
  durationSeconds: number | null;
  segments: Array<{
    start: number | null;
    end: number | null;
    text: string;
  }>;
};

const MIME_EXTENSION_MAP: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/webm;codecs=opus': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/ogg': 'ogg',
  'audio/ogg;codecs=opus': 'ogg',
};

const normalizeTranscriptText = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const toTranscriptionErrorMessage = (
  payload: GroqVerboseTranscriptionResponse | null,
  fallback: string
) => payload?.error?.message?.trim() || fallback;

const withTimeout = async <T>(
  timeoutMs: number,
  runner: (signal: AbortSignal) => Promise<T>,
  requestSignal?: AbortSignal
) => {
  throwIfRequestCancelled(requestSignal, 'Transcription cancelled by user.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const handleAbort = () => controller.abort();

  requestSignal?.addEventListener('abort', handleAbort);

  try {
    return await runner(controller.signal);
  } catch (error) {
    if (error instanceof RequestCancelledError) {
      throw error;
    }

    if (requestSignal?.aborted) {
      throw new RequestCancelledError('Transcription cancelled by user.');
    }

    if (isAbortError(error)) {
      throw new Error(
        `Voice transcription timed out after ${Math.round(timeoutMs / 1000)}s`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    requestSignal?.removeEventListener('abort', handleAbort);
  }
};

const inferAudioExtension = (mimeType: string) =>
  MIME_EXTENSION_MAP[mimeType.trim().toLowerCase()] ?? 'webm';

export const transcribeAudioWithGroq = async (
  input: GroqTranscriptionOptions
): Promise<AudioTranscriptionResult> => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const binary = Buffer.from(input.audioBase64, 'base64');

  if (!binary.byteLength) {
    throw new Error('Audio payload was empty');
  }

  if (binary.byteLength > TRANSCRIPTION_MAX_AUDIO_BYTES) {
    throw new Error('That recording is a little too chunky right now. Keep it under 10MB and try again.');
  }

  const normalizedMimeType = input.mimeType.trim().toLowerCase();
  const extension = inferAudioExtension(normalizedMimeType);
  const file = new Blob([binary], { type: normalizedMimeType });
  const formData = new FormData();

  formData.append('file', file, `prixmoai-dictation.${extension}`);
  formData.append('model', GROQ_TRANSCRIPTION_MODEL);
  formData.append('temperature', '0');
  formData.append('response_format', 'verbose_json');

  if (input.languageHint?.trim()) {
    formData.append('language', input.languageHint.trim().toLowerCase());
  }

  const payload = await withTimeout(
    GROQ_TRANSCRIPTION_TIMEOUT_MS,
    async (signal) => {
      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
        signal,
      });

      const rawPayload = (await response.json().catch(() => null)) as
        | GroqVerboseTranscriptionResponse
        | null;

      if (!response.ok) {
        throw new Error(
          toTranscriptionErrorMessage(
            rawPayload,
            `Groq transcription failed with status ${response.status}`
          )
        );
      }

      return rawPayload;
    },
    input.signal
  );

  const transcript = normalizeTranscriptText(payload?.text ?? '');

  return {
    transcript,
    detectedLanguage: payload?.language?.trim() || null,
    durationSeconds:
      typeof payload?.duration === 'number' && Number.isFinite(payload.duration)
        ? payload.duration
        : null,
    segments: Array.isArray(payload?.segments)
      ? payload!.segments
          .map((segment) => ({
            start:
              typeof segment.start === 'number' && Number.isFinite(segment.start)
                ? segment.start
                : null,
            end:
              typeof segment.end === 'number' && Number.isFinite(segment.end)
                ? segment.end
                : null,
            text: normalizeTranscriptText(segment.text ?? ''),
          }))
          .filter((segment) => segment.text)
      : [],
  };
};
