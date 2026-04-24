import { AlertCircle, ChevronDown, Eraser, Loader2, Mic, Square } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type TextareaHTMLAttributes,
} from 'react';
import { useAuth } from '../../hooks/useAuth';
import { apiRequest } from '../../lib/axios';
import { API_BASE_URL } from '../../lib/constants';
import {
  DICTATION_LANGUAGE_OPTIONS,
  SUPPORTED_DICTATION_LANGUAGE_HINTS,
} from '../../lib/dictationLanguages';
import type { AudioTranscriptionResult } from '../../types';

type DictationStatus = 'idle' | 'recording' | 'transcribing' | 'error';

type DictationTextareaFieldProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  storageKey?: string;
  historyCommitSignal?: number;
  showHistoryToggle?: boolean;
  showClearButton?: boolean;
  hideLabel?: boolean;
  initialDictationLanguage?: string;
  onDictationLanguageChange?: (language: string) => void;
};

type RecordedAudioChunk = {
  blob: Blob;
  startTimeMs: number;
  endTimeMs: number;
};

type TranscodeBlobOptions = {
  startOffsetSeconds?: number;
  endOffsetSeconds?: number;
  targetSampleRate?: number;
  preserveSpeechEdges?: boolean;
  preserveNaturalLevels?: boolean;
};

type TranscriptionStage = 'stream' | 'final';

type PromptHistoryEntry = {
  id: string;
  text: string;
  createdAt: string;
};

type PromptHistoryRing = {
  entries: Array<PromptHistoryEntry | null>;
  nextIndex: number;
  size: number;
};

type PromptHistoryMemory = Record<string, PromptHistoryRing>;

type DescriptionDraftResponse = {
  drafts: Array<{
    language: string;
    text: string;
    updatedAt: string;
    expiresAt: string;
  }>;
};

const PCM_TRIM_RMS_THRESHOLD = 0.009;
const MEDIA_RECORDER_SLICE_MS = 1200;
const PCM_ANALYSIS_WINDOW_MS = 50;
const PCM_SILENCE_PADDING_MS = 420;
const LIVE_PREVIEW_MIN_CHUNK_SECONDS = 5.6;
const LIVE_PREVIEW_MAX_CHUNK_SECONDS = 7.2;
const LIVE_PREVIEW_OVERLAP_SECONDS = 1.2;
const LIVE_PREVIEW_MIN_CHUNK_COUNT = Math.max(
  3,
  Math.round((LIVE_PREVIEW_MIN_CHUNK_SECONDS * 1000) / MEDIA_RECORDER_SLICE_MS)
);
const LIVE_PREVIEW_MAX_CHUNK_COUNT = Math.max(
  LIVE_PREVIEW_MIN_CHUNK_COUNT + 1,
  Math.round((LIVE_PREVIEW_MAX_CHUNK_SECONDS * 1000) / MEDIA_RECORDER_SLICE_MS)
);
const LIVE_PREVIEW_OVERLAP_COUNT = Math.max(
  1,
  Math.round((LIVE_PREVIEW_OVERLAP_SECONDS * 1000) / MEDIA_RECORDER_SLICE_MS)
);
const LIVE_PREVIEW_FORCE_FLUSH_SECONDS =
  LIVE_PREVIEW_MAX_CHUNK_SECONDS + LIVE_PREVIEW_OVERLAP_SECONDS + 1;
const VAD_RMS_THRESHOLD = 0.018;
const VAD_SPEECH_HOLD_MS = 280;
const VAD_CHUNK_SILENCE_MS = 720;
const BENGALI_VAD_SPEECH_HOLD_MS = 420;
const BENGALI_VAD_CHUNK_SILENCE_MS = 1080;
const BENGALI_RECORDER_REQUEST_DATA_COOLDOWN_MS = 260;
const BENGALI_STOP_TAIL_FLUSH_MAX_MS = 900;
const BENGALI_STOP_TAIL_FLUSH_POLL_MS = 60;
const BENGALI_FINAL_PREVIEW_TAIL_TOKENS = 16;
const MAX_CONTEXT_CHARS = 320;
const MAX_PREVIEW_TRANSCRIPT_CHARS = 2200;
const MAX_TRANSCRIPT_MERGE_TOKENS = 18;
const MIN_TRANSCRIPT_CHAR_OVERLAP = 16;
const MAX_TRANSCRIPT_CHAR_OVERLAP = 120;
const TARGET_SAMPLE_RATE = 16000;
const STREAM_TRANSCRIPT_MIN_CHARS = 8;
const WAVEFORM_BAR_COUNT = 12;
const DICTATION_HISTORY_STORAGE_PREFIX = 'prixmoai.dictation.history';
const PROMPT_HISTORY_RING_SIZE = 3;
const DRAFT_SYNC_DEBOUNCE_MS = 450;

const createIdleWaveform = () =>
  Array.from({ length: WAVEFORM_BAR_COUNT }, () => 0.14);

const buildHistoryStorageKey = (storageKey: string) =>
  `${DICTATION_HISTORY_STORAGE_PREFIX}:${storageKey}`;

const createEmptyPromptHistoryRing = (): PromptHistoryRing => ({
  entries: Array.from({ length: PROMPT_HISTORY_RING_SIZE }, () => null),
  nextIndex: 0,
  size: 0,
});

const normalizePromptHistoryRing = (value: unknown): PromptHistoryRing => {
  if (!value || typeof value !== 'object') {
    return createEmptyPromptHistoryRing();
  }

  const candidate = value as {
    entries?: unknown;
    nextIndex?: unknown;
    size?: unknown;
  };
  const rawEntries = Array.isArray(candidate.entries) ? candidate.entries : [];
  const entries = Array.from({ length: PROMPT_HISTORY_RING_SIZE }, (_, index) => {
    const entry = rawEntries[index];

    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const typedEntry = entry as {
      id?: unknown;
      text?: unknown;
      createdAt?: unknown;
    };

    if (
      typeof typedEntry.id !== 'string' ||
      typeof typedEntry.text !== 'string' ||
      typeof typedEntry.createdAt !== 'string'
    ) {
      return null;
    }

    return {
      id: typedEntry.id,
      text: typedEntry.text,
      createdAt: typedEntry.createdAt,
    };
  });

  const size =
    typeof candidate.size === 'number' && Number.isFinite(candidate.size)
      ? Math.max(0, Math.min(PROMPT_HISTORY_RING_SIZE, Math.floor(candidate.size)))
      : entries.filter(Boolean).length;
  const nextIndex =
    typeof candidate.nextIndex === 'number' && Number.isFinite(candidate.nextIndex)
      ? ((Math.floor(candidate.nextIndex) % PROMPT_HISTORY_RING_SIZE) + PROMPT_HISTORY_RING_SIZE) %
        PROMPT_HISTORY_RING_SIZE
      : size % PROMPT_HISTORY_RING_SIZE;

  return {
    entries,
    nextIndex,
    size,
  };
};

const readHistoryMemory = (storageKey?: string) => {
  if (!storageKey || typeof window === 'undefined') {
    return {} as PromptHistoryMemory;
  }

  try {
    const rawValue = window.localStorage.getItem(buildHistoryStorageKey(storageKey));

    if (!rawValue) {
      return {} as PromptHistoryMemory;
    }

    const parsed = JSON.parse(rawValue) as Record<string, unknown>;

    return Object.entries(parsed).reduce<PromptHistoryMemory>((accumulator, [key, entry]) => {
      accumulator[key] = normalizePromptHistoryRing(entry);
      return accumulator;
    }, {});
  } catch {
    return {} as PromptHistoryMemory;
  }
};

const writeHistoryMemory = (
  storageKey: string | undefined,
  historyMemory: PromptHistoryMemory
) => {
  if (!storageKey || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      buildHistoryStorageKey(storageKey),
      JSON.stringify(historyMemory)
    );
  } catch {
    // Ignore storage write failures quietly; the field still works in-memory.
  }
};

const hasOwnLanguageDraft = (drafts: Record<string, string>, language: string) =>
  Object.prototype.hasOwnProperty.call(drafts, language);

const getPromptHistoryEntries = (ring?: PromptHistoryRing) => {
  if (!ring || !ring.size) {
    return [] as PromptHistoryEntry[];
  }

  const ordered: PromptHistoryEntry[] = [];

  for (let index = 0; index < ring.size; index += 1) {
    const ringIndex =
      (ring.nextIndex - 1 - index + PROMPT_HISTORY_RING_SIZE) % PROMPT_HISTORY_RING_SIZE;
    const entry = ring.entries[ringIndex];

    if (entry) {
      ordered.push(entry);
    }
  }

  return ordered;
};

const buildPromptHistoryRing = (entries: PromptHistoryEntry[]) => {
  const limitedEntries = entries.slice(0, PROMPT_HISTORY_RING_SIZE);
  const ring = createEmptyPromptHistoryRing();
  const chronological = [...limitedEntries].reverse();

  chronological.forEach((entry, index) => {
    ring.entries[index] = entry;
  });

  ring.size = chronological.length;
  ring.nextIndex = chronological.length % PROMPT_HISTORY_RING_SIZE;

  return ring;
};

const normalizeServerDraftMemory = (drafts?: DescriptionDraftResponse['drafts']) => {
  if (!drafts?.length) {
    return {} as Record<string, string>;
  }

  const now = Date.now();

  return drafts.reduce<Record<string, string>>((accumulator, draft) => {
    if (
      typeof draft.language !== 'string' ||
      typeof draft.text !== 'string' ||
      typeof draft.expiresAt !== 'string'
    ) {
      return accumulator;
    }

    const expiresAtMs = Date.parse(draft.expiresAt);

    if (Number.isNaN(expiresAtMs) || expiresAtMs <= now) {
      return accumulator;
    }

    accumulator[draft.language] = draft.text;
    return accumulator;
  }, {});
};

const toFriendlyMicrophoneError = (error: unknown) => {
  if (error instanceof Error) {
    if (/notallowederror|permission denied/i.test(error.name) || /permission/i.test(error.message)) {
      return 'Mic access got blocked. Give browser permission and try again.';
    }

    if (/notfounderror|no audio input device/i.test(error.name) || /no microphone/i.test(error.message)) {
      return 'No microphone showed up. Plug one in or switch devices and try again.';
    }

    return error.message;
  }

  return 'Voice capture hit a weird detour. Try one more time.';
};

const pickRecorderMimeType = () => {
  if (typeof MediaRecorder === 'undefined') {
    return '';
  }

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
};

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== 'string') {
        reject(new Error('Failed to read microphone audio.'));
        return;
      }

      const [, base64 = ''] = result.split(',', 2);
      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read microphone audio.'));
    };

    reader.readAsDataURL(blob);
  });

const getAudioContextConstructor = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const candidateWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };

  return window.AudioContext ?? candidateWindow.webkitAudioContext ?? null;
};

const mixAudioBufferToMono = (audioBuffer: AudioBuffer) => {
  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }

  const mono = new Float32Array(audioBuffer.length);

  for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex += 1) {
    const channelData = audioBuffer.getChannelData(channelIndex);

    for (let sampleIndex = 0; sampleIndex < channelData.length; sampleIndex += 1) {
      mono[sampleIndex] += channelData[sampleIndex] / audioBuffer.numberOfChannels;
    }
  }

  return mono;
};

const applyHighPassFilter = (samples: Float32Array, sampleRate: number, cutoffHz = 120) => {
  if (!samples.length) {
    return samples;
  }

  const filtered = new Float32Array(samples.length);
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  let previousInput = samples[0] ?? 0;
  let previousOutput = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const input = samples[index] ?? 0;
    const output = alpha * (previousOutput + input - previousInput);
    filtered[index] = output;
    previousInput = input;
    previousOutput = output;
  }

  return filtered;
};

const normalizeVolume = (samples: Float32Array) => {
  let peak = 0;

  for (let index = 0; index < samples.length; index += 1) {
    peak = Math.max(peak, Math.abs(samples[index] ?? 0));
  }

  if (!peak || peak >= 0.9) {
    return samples;
  }

  const gain = Math.min(2.2, 0.92 / peak);

  if (gain <= 1.01) {
    return samples;
  }

  const normalized = new Float32Array(samples.length);

  for (let index = 0; index < samples.length; index += 1) {
    normalized[index] = Math.max(-1, Math.min(1, (samples[index] ?? 0) * gain));
  }

  return normalized;
};

const resampleLinear = (
  samples: Float32Array,
  fromSampleRate: number,
  toSampleRate: number
) => {
  if (fromSampleRate === toSampleRate || !samples.length) {
    return samples;
  }

  const targetLength = Math.max(
    1,
    Math.round(samples.length * (toSampleRate / fromSampleRate))
  );
  const resampled = new Float32Array(targetLength);
  const ratio = fromSampleRate / toSampleRate;

  for (let index = 0; index < targetLength; index += 1) {
    const position = index * ratio;
    const baseIndex = Math.floor(position);
    const nextIndex = Math.min(samples.length - 1, baseIndex + 1);
    const weight = position - baseIndex;
    const current = samples[baseIndex] ?? 0;
    const next = samples[nextIndex] ?? current;

    resampled[index] = current + (next - current) * weight;
  }

  return resampled;
};

const trimSilenceFromSamples = (samples: Float32Array, sampleRate: number) => {
  const windowSize = Math.max(1, Math.floor((sampleRate * PCM_ANALYSIS_WINDOW_MS) / 1000));
  const paddingWindows = Math.max(
    1,
    Math.ceil((sampleRate * PCM_SILENCE_PADDING_MS) / 1000 / windowSize)
  );
  const totalWindows = Math.ceil(samples.length / windowSize);
  let firstSpeechWindow = -1;
  let lastSpeechWindow = -1;

  for (let windowIndex = 0; windowIndex < totalWindows; windowIndex += 1) {
    const start = windowIndex * windowSize;
    const end = Math.min(samples.length, start + windowSize);

    let sumSquares = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      const value = samples[sampleIndex] ?? 0;
      sumSquares += value * value;
    }

    const rms = Math.sqrt(sumSquares / Math.max(1, end - start));

    if (rms >= PCM_TRIM_RMS_THRESHOLD) {
      if (firstSpeechWindow === -1) {
        firstSpeechWindow = windowIndex;
      }

      lastSpeechWindow = windowIndex;
    }
  }

  if (firstSpeechWindow === -1 || lastSpeechWindow === -1) {
    return samples;
  }

  const paddedStartWindow = Math.max(0, firstSpeechWindow - paddingWindows);
  const paddedEndWindow = Math.min(totalWindows - 1, lastSpeechWindow + paddingWindows);
  const startSample = paddedStartWindow * windowSize;
  const endSample = Math.min(samples.length, (paddedEndWindow + 1) * windowSize);

  if (startSample <= 0 && endSample >= samples.length) {
    return samples;
  }

  return samples.slice(startSample, endSample);
};

const hasEnoughStreamingTranscriptContent = (value: string) => {
  const normalized = normalizeTranscriptForMerge(value);

  if (!normalized) {
    return false;
  }

  const tokens = normalized.split(' ').filter(Boolean);

  return tokens.length >= 2 || normalized.length >= STREAM_TRANSCRIPT_MIN_CHARS;
};

const hasEnoughStreamingTranscriptContentForLanguage = (
  value: string,
  language: string
) => {
  if (language !== 'bn') {
    return hasEnoughStreamingTranscriptContent(value);
  }

  const normalized = normalizeTranscriptForMerge(value);

  if (!normalized) {
    return false;
  }

  const tokens = normalized.split(' ').filter(Boolean);

  return tokens.length >= 2 || normalized.length >= 5;
};

const shouldRejectHindiJunkStreamTranscript = (value: string, language: string) => {
  if (language !== 'hi') {
    return false;
  }

  const normalized = normalizeTranscriptForMerge(value);

  if (!normalized) {
    return false;
  }

  const tokens = normalized
    .split(' ')
    .map((token) => canonicalizeTranscriptToken(token))
    .filter(Boolean);

  if (tokens.length < 2 || tokens.length > 3) {
    return false;
  }

  return new Set(tokens).size === 1;
};

const shouldRejectIndicJunkStreamTranscript = (value: string, language: string) => {
  if (!new Set(['ur', 'ta', 'te', 'ml', 'kn', 'pa']).has(language)) {
    return false;
  }

  const normalized = normalizeTranscriptForMerge(value);

  if (!normalized) {
    return false;
  }

  const tokens = normalized
    .split(' ')
    .map((token) => canonicalizeTranscriptToken(token))
    .filter(Boolean);

  if (tokens.length < 2 || tokens.length > 3) {
    return false;
  }

  return new Set(tokens).size === 1;
};

const sliceSamplesByTimeRange = (
  samples: Float32Array,
  sampleRate: number,
  startOffsetSeconds?: number,
  endOffsetSeconds?: number
) => {
  if (
    (startOffsetSeconds === undefined || startOffsetSeconds <= 0) &&
    (endOffsetSeconds === undefined || endOffsetSeconds <= 0)
  ) {
    return samples;
  }

  const startSeconds = Math.max(0, startOffsetSeconds ?? 0);
  const endSeconds =
    typeof endOffsetSeconds === 'number' && Number.isFinite(endOffsetSeconds)
      ? Math.max(startSeconds, endOffsetSeconds)
      : samples.length / sampleRate;
  const startSample = Math.max(0, Math.floor(startSeconds * sampleRate));
  const endSample = Math.min(
    samples.length,
    Math.max(startSample + 1, Math.ceil(endSeconds * sampleRate))
  );

  if (startSample <= 0 && endSample >= samples.length) {
    return samples;
  }

  return samples.slice(startSample, endSample);
};

const encodePcm16Wav = (samples: Float32Array, sampleRate: number) => {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: 'audio/wav' });
};

const transcodeBlobToWav = async (blob: Blob, options: TranscodeBlobOptions = {}) => {
  if (blob.type === 'audio/wav' || blob.type === 'audio/x-wav') {
    return blob;
  }

  const AudioContextCtor = getAudioContextConstructor();

  if (!AudioContextCtor) {
    return blob;
  }

  const audioContext = new AudioContextCtor();

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const monoSamples = mixAudioBufferToMono(audioBuffer);
    const filteredSamples = options.preserveSpeechEdges
      ? monoSamples
      : applyHighPassFilter(monoSamples, audioBuffer.sampleRate);
    const rangedSamples = sliceSamplesByTimeRange(
      filteredSamples,
      audioBuffer.sampleRate,
      options.startOffsetSeconds,
      options.endOffsetSeconds
    );
    const normalizedSamples = options.preserveNaturalLevels
      ? rangedSamples
      : normalizeVolume(rangedSamples);
    const trimmedSamples = options.preserveSpeechEdges
      ? normalizedSamples
      : trimSilenceFromSamples(normalizedSamples, audioBuffer.sampleRate);
    const targetSampleRate = options.targetSampleRate ?? TARGET_SAMPLE_RATE;
    const resampled = resampleLinear(
      trimmedSamples,
      audioBuffer.sampleRate,
      targetSampleRate
    );

    return encodePcm16Wav(resampled, targetSampleRate);
  } finally {
    void audioContext.close().catch(() => undefined);
  }
};

const getBlobDurationSeconds = async (blob: Blob) => {
  const AudioContextCtor = getAudioContextConstructor();

  if (!AudioContextCtor) {
    return null;
  }

  const audioContext = new AudioContextCtor();

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    return audioBuffer.duration;
  } catch {
    return null;
  } finally {
    void audioContext.close().catch(() => undefined);
  }
};

const mergeTranscriptIntoValue = (currentValue: string, transcript: string) => {
  const nextTranscript = transcript.trim();

  if (!nextTranscript) {
    return currentValue;
  }

  const current = currentValue ?? '';

  if (!current.trim()) {
    return nextTranscript;
  }

  const trimmedEnd = current.trimEnd();
  return `${trimmedEnd} ${nextTranscript}`.replace(/\s{2,}/g, ' ').trim();
};

const collapseRepeatedTrailingSpan = (value: string) => {
  const normalized = normalizeTranscriptForMerge(value);

  if (!normalized) {
    return normalized;
  }

  const tokens = normalized.split(' ');

  if (tokens.length < 8) {
    return normalized;
  }

  const maxSpan = Math.min(16, Math.floor(tokens.length / 2));

  for (let spanLength = maxSpan; spanLength >= 3; spanLength -= 1) {
    const leading = tokens.slice(0, tokens.length - spanLength);
    const trailing = tokens.slice(tokens.length - spanLength);

    for (
      let startIndex = Math.max(0, leading.length - spanLength - 4);
      startIndex < leading.length;
      startIndex += 1
    ) {
      const candidate = leading.slice(startIndex, startIndex + spanLength);

      if (candidate.length !== trailing.length) {
        continue;
      }

      const matches = candidate.every(
        (token, index) =>
          canonicalizeTranscriptToken(token) === canonicalizeTranscriptToken(trailing[index] ?? '')
      );

      if (matches) {
        return normalizeTranscriptForMerge(
          tokens.slice(0, tokens.length - spanLength).join(' ')
        );
      }
    }
  }

  return normalized;
};

const buildRollingContext = (value: string) => {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return undefined;
  }

  const sentenceChunks = normalized
    .split(/(?<=[.!?।！？])\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const trailingSentences = sentenceChunks.slice(-2).join(' ').trim();
  const contextualSeed = trailingSentences || normalized;

  if (contextualSeed.length <= MAX_CONTEXT_CHARS) {
    return contextualSeed;
  }

  return contextualSeed.slice(-MAX_CONTEXT_CHARS).trim();
};

const normalizeTranscriptForMerge = (value: string) =>
  value
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();

const buildComparableTranscript = (value: string) =>
  normalizeTranscriptForMerge(value)
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, '')
    .trim();

const canonicalizeTranscriptToken = (token: string) =>
  token
    .normalize('NFC')
    .toLowerCase()
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');

const levenshteinDistance = (source: string, target: string) => {
  if (source === target) {
    return 0;
  }

  if (!source.length) {
    return target.length;
  }

  if (!target.length) {
    return source.length;
  }

  const previous = Array.from({ length: target.length + 1 }, (_, index) => index);
  const current = new Array<number>(target.length + 1).fill(0);

  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
    current[0] = sourceIndex;

    for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
      const substitutionCost =
        source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1;

      current[targetIndex] = Math.min(
        previous[targetIndex] + 1,
        current[targetIndex - 1] + 1,
        previous[targetIndex - 1] + substitutionCost
      );
    }

    for (let targetIndex = 0; targetIndex < previous.length; targetIndex += 1) {
      previous[targetIndex] = current[targetIndex] ?? 0;
    }
  }

  return previous[target.length] ?? 0;
};

const tokenizeComparableTranscript = (value: string) =>
  buildComparableTranscript(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

const estimateTokenOverlapRatio = (
  sourceTokens: string[],
  targetTokens: string[]
) => {
  if (!sourceTokens.length || !targetTokens.length) {
    return 0;
  }

  const targetCounts = new Map<string, number>();

  for (const token of targetTokens) {
    targetCounts.set(token, (targetCounts.get(token) ?? 0) + 1);
  }

  let overlapCount = 0;

  for (const token of sourceTokens) {
    const count = targetCounts.get(token) ?? 0;

    if (count <= 0) {
      continue;
    }

    overlapCount += 1;
    targetCounts.set(token, count - 1);
  }

  return overlapCount / Math.max(1, Math.min(sourceTokens.length, targetTokens.length));
};

const splitTranscriptClauses = (value: string) =>
  normalizeTranscriptForMerge(value)
    .match(/[^.!?।\n]+(?:[.!?।]+)?/gu)
    ?.map((clause) => clause.trim())
    .filter(Boolean) ?? [];

const areNearDuplicateBengaliClauses = (leftClause: string, rightClause: string) => {
  const leftComparable = buildComparableTranscript(leftClause);
  const rightComparable = buildComparableTranscript(rightClause);

  if (!leftComparable || !rightComparable || leftComparable === rightComparable) {
    return Boolean(leftComparable && rightComparable);
  }

  const leftTokens = tokenizeComparableTranscript(leftClause);
  const rightTokens = tokenizeComparableTranscript(rightClause);

  if (leftTokens.length < 4 || rightTokens.length < 4) {
    return false;
  }

  const overlapRatio = estimateTokenOverlapRatio(leftTokens, rightTokens);

  if (overlapRatio < 0.8) {
    return false;
  }

  const distance = levenshteinDistance(leftComparable, rightComparable);
  const maxLength = Math.max(leftComparable.length, rightComparable.length, 1);
  const similarityRatio = 1 - distance / maxLength;

  return similarityRatio >= 0.72;
};

const collapseNearDuplicateBengaliClauses = (value: string) => {
  const clauses = splitTranscriptClauses(value);

  if (clauses.length < 2) {
    return normalizeTranscriptForMerge(value);
  }

  const dedupedClauses: string[] = [];

  for (const clause of clauses) {
    const previousClause = dedupedClauses[dedupedClauses.length - 1];

    if (!previousClause || !areNearDuplicateBengaliClauses(previousClause, clause)) {
      dedupedClauses.push(clause);
      continue;
    }

    const previousComparable = buildComparableTranscript(previousClause);
    const currentComparable = buildComparableTranscript(clause);
    const shouldReplacePrevious =
      currentComparable.startsWith(previousComparable) ||
      clause.length > previousClause.length * 1.12;

    if (shouldReplacePrevious) {
      dedupedClauses[dedupedClauses.length - 1] = clause;
    }
  }

  return normalizeTranscriptForMerge(dedupedClauses.join(' '));
};

const trimPreviewTranscriptMemory = (value: string) => {
  if (value.length <= MAX_PREVIEW_TRANSCRIPT_CHARS) {
    return value;
  }

  return value.slice(-MAX_PREVIEW_TRANSCRIPT_CHARS).trim();
};

const findTokenOverlapLength = (previous: string[], next: string[]) => {
  const maxOverlap = Math.min(
    MAX_TRANSCRIPT_MERGE_TOKENS,
    previous.length,
    next.length
  );

  for (let overlapLength = maxOverlap; overlapLength >= 2; overlapLength -= 1) {
    let matches = true;

    for (let tokenIndex = 0; tokenIndex < overlapLength; tokenIndex += 1) {
      if (
        canonicalizeTranscriptToken(
          previous[previous.length - overlapLength + tokenIndex] ?? ''
        ) !== canonicalizeTranscriptToken(next[tokenIndex] ?? '')
      ) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return overlapLength;
    }
  }

  return 0;
};

const findCharacterOverlapLength = (previous: string, next: string) => {
  const maxOverlap = Math.min(MAX_TRANSCRIPT_CHAR_OVERLAP, previous.length, next.length);

  for (let overlapLength = maxOverlap; overlapLength >= MIN_TRANSCRIPT_CHAR_OVERLAP; overlapLength -= 1) {
    if (previous.slice(-overlapLength) === next.slice(0, overlapLength)) {
      return overlapLength;
    }
  }

  return 0;
};

// Merge overlapping preview chunks so the hidden rolling context grows naturally
// instead of re-reading the same tail of audio over and over.
const mergePreviewTranscript = (
  previousValue: string,
  nextValue: string,
  language?: string
) => {
  const previous = normalizeTranscriptForMerge(previousValue);
  const next = normalizeTranscriptForMerge(nextValue);
  const comparablePrevious = buildComparableTranscript(previous);
  const comparableNext = buildComparableTranscript(next);
  const finalizeMergedPreview = (value: string) =>
    trimPreviewTranscriptMemory(
      language === 'bn'
        ? normalizeTranscriptForMerge(value)
        : collapseRepeatedTrailingSpan(value)
    );

  if (!previous) {
    return finalizeMergedPreview(next);
  }

  if (
    !next ||
    previous === next ||
    previous.endsWith(next) ||
    (comparableNext && comparablePrevious.endsWith(comparableNext))
  ) {
    return finalizeMergedPreview(previous);
  }

  if (
    next.startsWith(previous) ||
    (comparablePrevious && comparableNext.startsWith(comparablePrevious))
  ) {
    return finalizeMergedPreview(next);
  }

  const previousTokens = previous.toLowerCase().split(' ');
  const nextTokens = next.toLowerCase().split(' ');
  const tokenOverlapLength = findTokenOverlapLength(previousTokens, nextTokens);

  if (tokenOverlapLength > 0) {
    const nextOriginalTokens = next.split(' ');
    return finalizeMergedPreview(
      `${previous} ${nextOriginalTokens.slice(tokenOverlapLength).join(' ')}`.trim()
    );
  }

  if (language === 'bn') {
    return finalizeMergedPreview(`${previous} ${next}`.trim());
  }

  const characterOverlapLength = findCharacterOverlapLength(previous, next);

  if (characterOverlapLength > 0) {
    return finalizeMergedPreview(`${previous}${next.slice(characterOverlapLength)}`.trim());
  }

  return finalizeMergedPreview(`${previous} ${next}`.trim());
};

const mergeFinalTranscriptWithPreviewTail = (
  finalValue: string,
  previewValue: string,
  language?: string
) => {
  const normalizedFinal = normalizeTranscriptForMerge(finalValue);
  const normalizedPreview = normalizeTranscriptForMerge(previewValue);

  if (!normalizedPreview) {
    return normalizedFinal;
  }

  if (!normalizedFinal) {
    return normalizedPreview;
  }

  const comparableFinal = buildComparableTranscript(normalizedFinal);
  const previewTokens = normalizedPreview.split(' ').filter(Boolean);
  const previewTail = previewTokens
    .slice(-Math.min(BENGALI_FINAL_PREVIEW_TAIL_TOKENS, previewTokens.length))
    .join(' ');
  const comparablePreviewTail = buildComparableTranscript(previewTail);

  if (!comparablePreviewTail || comparableFinal.includes(comparablePreviewTail)) {
    return normalizedFinal;
  }

  return mergePreviewTranscript(normalizedFinal, previewTail, language);
};

const isAbortLikeError = (error: unknown) =>
  error instanceof Error && /abort|cancelled by user/i.test(error.message);

const buildWaveformLevels = (frequencyData: ArrayLike<number>) => {
  const bucketSize = Math.max(1, Math.floor(frequencyData.length / WAVEFORM_BAR_COUNT));

  return Array.from({ length: WAVEFORM_BAR_COUNT }, (_, barIndex) => {
    const start = barIndex * bucketSize;
    const end = Math.min(frequencyData.length, start + bucketSize);
    let total = 0;

    for (let dataIndex = start; dataIndex < end; dataIndex += 1) {
      total += frequencyData[dataIndex] ?? 0;
    }

    const average = total / Math.max(1, end - start);
    return Math.max(0.12, Math.min(1, average / 160));
  });
};

const computeTimeDomainRms = (timeDomainData: Uint8Array) => {
  if (!timeDomainData.length) {
    return 0;
  }

  let sumSquares = 0;

  for (let index = 0; index < timeDomainData.length; index += 1) {
    const normalized = ((timeDomainData[index] ?? 128) - 128) / 128;
    sumSquares += normalized * normalized;
  }

  return Math.sqrt(sumSquares / timeDomainData.length);
};

const getSpeechHoldMsForLanguage = (language: string) =>
  language === 'bn' ? BENGALI_VAD_SPEECH_HOLD_MS : VAD_SPEECH_HOLD_MS;

const getChunkSilenceMsForLanguage = (language: string) =>
  language === 'bn' ? BENGALI_VAD_CHUNK_SILENCE_MS : VAD_CHUNK_SILENCE_MS;

export const DictationTextareaField = ({
  label,
  value,
  onChange,
  storageKey,
  historyCommitSignal = 0,
  showHistoryToggle = true,
  showClearButton = true,
  hideLabel = false,
  initialDictationLanguage = 'en',
  onDictationLanguageChange,
  className,
  id,
  rows = 2,
  placeholder,
  disabled,
  ...textareaProps
}: DictationTextareaFieldProps) => {
  const { token } = useAuth();
  const [dictationStatus, setDictationStatus] = useState<DictationStatus>('idle');
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [dictationLanguage, setDictationLanguage] = useState<string>(
    SUPPORTED_DICTATION_LANGUAGE_HINTS.has(initialDictationLanguage)
      ? initialDictationLanguage
      : 'en'
  );
  const [languageDrafts, setLanguageDrafts] = useState<Record<string, string>>({});
  const [languagePromptHistory, setLanguagePromptHistory] = useState<PromptHistoryMemory>(() =>
    readHistoryMemory(storageKey)
  );
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [expandedHistoryEntries, setExpandedHistoryEntries] = useState<Record<string, boolean>>({});
  const [waveformLevels, setWaveformLevels] = useState<number[]>(() =>
    createIdleWaveform()
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveformBufferRef = useRef<Uint8Array | null>(null);
  const waveformTimeDomainBufferRef = useRef<Uint8Array | null>(null);
  const waveformFrameRef = useRef<number | null>(null);
  const rawChunksRef = useRef<RecordedAudioChunk[]>([]);
  const valueRef = useRef(value);
  const dictationBaseValueRef = useRef(value);
  const lastDispatchedValueRef = useRef<string | null>(null);
  const resolvedLanguageHintRef = useRef<string>('en');
  const previousLanguageRef = useRef<string>('en');
  const previousHistoryCommitSignalRef = useRef(historyCommitSignal);
  const dictationStatusRef = useRef<DictationStatus>('idle');
  const stopRecordingPromiseRef = useRef<Promise<void> | null>(null);
  const previewAbortControllerRef = useRef<AbortController | null>(null);
  const previewInFlightRef = useRef(false);
  const previewPromiseRef = useRef<Promise<void> | null>(null);
  const pendingChunkQueueRef = useRef<Array<{ startChunkIndex: number; endChunkIndex: number }>>(
    []
  );
  const previewSequenceRef = useRef(0);
  const previewTranscriptRef = useRef('');
  const lastPreviewChunkCountRef = useRef(0);
  const chunkStartIndexRef = useRef<number | null>(null);
  const lastSpeechChunkIndexRef = useRef(0);
  const lastSpeechAtRef = useRef(0);
  const speechActiveRef = useRef(false);
  const lastRecorderFlushAtRef = useRef(0);
  const recordingStartedAtRef = useRef(0);
  const lastChunkEndTimeMsRef = useRef(0);
  const statusId = `${id ?? label.replace(/\s+/g, '-').toLowerCase()}-dictation-status`;
  const textareaId = id ?? `${label.replace(/\s+/g, '-').toLowerCase()}-dictation`;
  const historyButtonId = useId();
  const historyPanelRef = useRef<HTMLDivElement | null>(null);
  const draftSyncTimerRef = useRef<number | null>(null);
  const draftSyncAbortControllerRef = useRef<AbortController | null>(null);
  const draftLoadSequenceRef = useRef(0);
  const latestDraftsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    latestDraftsRef.current = languageDrafts;
  }, [languageDrafts]);

  useEffect(() => {
    setLanguagePromptHistory(readHistoryMemory(storageKey));
  }, [storageKey]);

  useEffect(() => {
    dictationStatusRef.current = dictationStatus;
  }, [dictationStatus]);

  const cleanupMediaStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const cancelPreviewRequest = useCallback(() => {
    previewSequenceRef.current += 1;
    previewAbortControllerRef.current?.abort();
    previewAbortControllerRef.current = null;
  }, []);

  const resetPreviewState = useCallback(() => {
    cancelPreviewRequest();
    previewInFlightRef.current = false;
    previewPromiseRef.current = null;
    pendingChunkQueueRef.current = [];
    previewTranscriptRef.current = '';
    lastPreviewChunkCountRef.current = 0;
    chunkStartIndexRef.current = null;
    lastSpeechChunkIndexRef.current = 0;
    lastSpeechAtRef.current = 0;
    speechActiveRef.current = false;
  }, [cancelPreviewRequest]);

  const cleanupWaveform = useCallback(() => {
    if (waveformFrameRef.current !== null) {
      window.cancelAnimationFrame(waveformFrameRef.current);
      waveformFrameRef.current = null;
    }

    audioSourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    audioSourceRef.current = null;
    analyserRef.current = null;
    waveformBufferRef.current = null;
    waveformTimeDomainBufferRef.current = null;
    setWaveformLevels(createIdleWaveform());

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (draftSyncTimerRef.current !== null) {
        window.clearTimeout(draftSyncTimerRef.current);
      }

      draftSyncAbortControllerRef.current?.abort();

      if (mediaRecorderRef.current?.state && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }

      resetPreviewState();
      cleanupWaveform();
      cleanupMediaStream();
    };
  }, [cleanupMediaStream, cleanupWaveform, resetPreviewState]);

  const resolvedLanguageHint = useMemo(
    () =>
      SUPPORTED_DICTATION_LANGUAGE_HINTS.has(dictationLanguage)
        ? dictationLanguage
        : 'en',
    [dictationLanguage]
  );

  useEffect(() => {
    onDictationLanguageChange?.(resolvedLanguageHint);
  }, [onDictationLanguageChange, resolvedLanguageHint]);

  const currentLanguageValue = hasOwnLanguageDraft(languageDrafts, resolvedLanguageHint)
    ? languageDrafts[resolvedLanguageHint] ?? ''
    : '';
  const currentLanguageHistory = useMemo(
    () => getPromptHistoryEntries(languagePromptHistory[resolvedLanguageHint]),
    [languagePromptHistory, resolvedLanguageHint]
  );

  useEffect(() => {
    resolvedLanguageHintRef.current = resolvedLanguageHint;
  }, [resolvedLanguageHint]);

  const persistDraftToServer = useCallback(
    async (
      scope: string,
      language: string,
      text: string,
      options: {
        signal?: AbortSignal;
        keepalive?: boolean;
      } = {}
    ) => {
      if (!token || !scope || !text.trim()) {
        return;
      }

      if (options.keepalive) {
        await fetch(`${API_BASE_URL}/api/generate/drafts/description`, {
          method: 'PUT',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            scope,
            language,
            text,
          }),
        });
        return;
      }

      await apiRequest('/api/generate/drafts/description', {
        method: 'PUT',
        token,
        signal: options.signal,
        body: {
          scope,
          language,
          text,
        },
      });
    },
    [token]
  );

  const deleteDraftFromServer = useCallback(
    async (
      scope: string,
      language: string,
      options: {
        signal?: AbortSignal;
        keepalive?: boolean;
      } = {}
    ) => {
      if (!token || !scope) {
        return;
      }

      if (options.keepalive) {
        await fetch(`${API_BASE_URL}/api/generate/drafts/description`, {
          method: 'DELETE',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            scope,
            language,
          }),
        });
        return;
      }

      await apiRequest('/api/generate/drafts/description', {
        method: 'DELETE',
        token,
        signal: options.signal,
        body: {
          scope,
          language,
        },
      });
    },
    [token]
  );

  const scheduleDraftSync = useCallback(
    (nextValue: string, language: string) => {
      if (!storageKey || !token || typeof window === 'undefined') {
        return;
      }

      if (draftSyncTimerRef.current !== null) {
        window.clearTimeout(draftSyncTimerRef.current);
        draftSyncTimerRef.current = null;
      }

      draftSyncAbortControllerRef.current?.abort();
      const controller = new AbortController();
      draftSyncAbortControllerRef.current = controller;

      draftSyncTimerRef.current = window.setTimeout(() => {
        draftSyncTimerRef.current = null;

        const request = nextValue.trim()
          ? persistDraftToServer(storageKey, language, nextValue, {
              signal: controller.signal,
            })
          : deleteDraftFromServer(storageKey, language, {
              signal: controller.signal,
            });

        void request.catch((error) => {
          if (error instanceof Error && /cancelled/i.test(error.message)) {
            return;
          }

          console.warn('[dictation] failed to sync description draft', error);
        });
      }, DRAFT_SYNC_DEBOUNCE_MS);
    },
    [deleteDraftFromServer, persistDraftToServer, storageKey, token]
  );

  const flushActiveDraftWithKeepalive = useCallback(() => {
    const activeLanguage = resolvedLanguageHintRef.current;
    const activeDraft = latestDraftsRef.current[activeLanguage] ?? '';

    if (!storageKey || !token) {
      return;
    }

    if (activeDraft.trim()) {
      void persistDraftToServer(storageKey, activeLanguage, activeDraft, {
        keepalive: true,
      }).catch(() => undefined);
      return;
    }

    void deleteDraftFromServer(storageKey, activeLanguage, {
      keepalive: true,
    }).catch(() => undefined);
  }, [deleteDraftFromServer, persistDraftToServer, storageKey, token]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushActiveDraftWithKeepalive();
      }
    };

    const handlePageHide = () => {
      flushActiveDraftWithKeepalive();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [flushActiveDraftWithKeepalive]);

  useEffect(() => {
    if (!storageKey || !token) {
      setLanguageDrafts({});
      return;
    }

    const loadSequence = ++draftLoadSequenceRef.current;
    const controller = new AbortController();

    void apiRequest<DescriptionDraftResponse>('/api/generate/drafts/description', {
      token,
      signal: controller.signal,
      query: {
        scope: storageKey,
      },
    })
      .then((result) => {
        if (loadSequence !== draftLoadSequenceRef.current) {
          return;
        }

        setLanguageDrafts((current) => ({
          ...normalizeServerDraftMemory(result.drafts),
          ...current,
        }));
      })
      .catch((error) => {
        if (error instanceof Error && /cancelled/i.test(error.message)) {
          return;
        }

        console.warn('[dictation] failed to load persisted drafts', error);
      });

    return () => {
      controller.abort();
    };
  }, [storageKey, token]);

  useEffect(() => {
    if (previousLanguageRef.current !== resolvedLanguageHint) {
      return;
    }

    if (lastDispatchedValueRef.current !== null && value === lastDispatchedValueRef.current) {
      lastDispatchedValueRef.current = null;
      valueRef.current = value;
      return;
    }

    if (storageKey) {
      valueRef.current = value;
      return;
    }

    const activeLanguage = resolvedLanguageHintRef.current;

    valueRef.current = value;
    setLanguageDrafts((current) => {
      if ((current[activeLanguage] ?? '') === value) {
        return current;
      }

      const nextDrafts = {
        ...current,
        [activeLanguage]: value,
      };

      return nextDrafts;
    });
  }, [storageKey, value]);

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    const nextValue = hasOwnLanguageDraft(languageDrafts, resolvedLanguageHint)
      ? languageDrafts[resolvedLanguageHint] ?? ''
      : '';

    if (valueRef.current === nextValue) {
      return;
    }

    valueRef.current = nextValue;
    lastDispatchedValueRef.current = nextValue;
    onChange(nextValue);
  }, [languageDrafts, onChange, resolvedLanguageHint, storageKey]);

  useEffect(() => {
    if (previousLanguageRef.current === resolvedLanguageHint) {
      return;
    }

    previousLanguageRef.current = resolvedLanguageHint;
    setIsHistoryOpen(false);
    setExpandedHistoryEntries({});
    const nextValue = languageDrafts[resolvedLanguageHint] ?? '';

    if (valueRef.current === nextValue) {
      return;
    }

    valueRef.current = nextValue;
    lastDispatchedValueRef.current = nextValue;
    onChange(nextValue);
  }, [languageDrafts, onChange, resolvedLanguageHint]);

  useEffect(() => {
    if (previousHistoryCommitSignalRef.current === historyCommitSignal) {
      return;
    }

    previousHistoryCommitSignalRef.current = historyCommitSignal;
    const nextPrompt = (languageDrafts[resolvedLanguageHint] ?? '').trim();

    if (!nextPrompt) {
      return;
    }

    const nextEntry: PromptHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: nextPrompt,
      createdAt: new Date().toISOString(),
    };

    setLanguagePromptHistory((current) => {
      const currentEntries = getPromptHistoryEntries(current[resolvedLanguageHint]);
      const nextEntries = [nextEntry, ...currentEntries].slice(0, PROMPT_HISTORY_RING_SIZE);
      const nextHistory = {
        ...current,
        [resolvedLanguageHint]: buildPromptHistoryRing(nextEntries),
      };

      writeHistoryMemory(storageKey, nextHistory);
      return nextHistory;
    });

    setLanguageDrafts((current) => {
      if (!hasOwnLanguageDraft(current, resolvedLanguageHint)) {
        return current;
      }

      const nextDrafts = { ...current };
      delete nextDrafts[resolvedLanguageHint];
      return nextDrafts;
    });

    valueRef.current = '';
    lastDispatchedValueRef.current = '';
    onChange('');

    if (draftSyncTimerRef.current !== null) {
      window.clearTimeout(draftSyncTimerRef.current);
      draftSyncTimerRef.current = null;
    }

    draftSyncAbortControllerRef.current?.abort();
    void deleteDraftFromServer(storageKey ?? '', resolvedLanguageHint).catch((error) => {
      console.warn('[dictation] failed to clear generated draft', error);
    });
  }, [
    deleteDraftFromServer,
    historyCommitSignal,
    languageDrafts,
    onChange,
    resolvedLanguageHint,
    storageKey,
  ]);

  useEffect(() => {
    if (!isHistoryOpen || typeof document === 'undefined') {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (historyPanelRef.current?.contains(target)) {
        return;
      }

      const trigger = document.getElementById(historyButtonId);

      if (trigger?.contains(target)) {
        return;
      }

      setIsHistoryOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHistoryOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [historyButtonId, isHistoryOpen]);

  const updateDraftValue = useCallback(
    (nextValue: string) => {
      valueRef.current = nextValue;
      lastDispatchedValueRef.current = nextValue;
      setLanguageDrafts((current) => {
        const nextDrafts = {
          ...current,
          [resolvedLanguageHint]: nextValue,
        };

        return nextDrafts;
      });
      scheduleDraftSync(nextValue, resolvedLanguageHint);
      onChange(nextValue);
    },
    [onChange, resolvedLanguageHint, scheduleDraftSync]
  );

  const buildRecordedBlob = useCallback(() => {
    const recorderMimeType =
      mediaRecorderRef.current?.mimeType || pickRecorderMimeType() || 'audio/webm';

    return new Blob(
      rawChunksRef.current.map((chunk) => chunk.blob),
      {
      type: recorderMimeType,
      }
    );
  }, []);

  const getChunkOffsets = useCallback(
    (startChunkIndex: number, endChunkIndex: number) => {
      const startChunk = rawChunksRef.current[startChunkIndex];
      const endChunk = rawChunksRef.current[endChunkIndex - 1];

      if (!startChunk || !endChunk) {
        return null;
      }

      return {
        startOffsetSeconds: Math.max(0, startChunk.startTimeMs / 1000 - 0.18),
        endOffsetSeconds: Math.max(
          startChunk.endTimeMs / 1000,
          endChunk.endTimeMs / 1000 + 0.12
        ),
      };
    },
    []
  );

  const startWaveform = useCallback((stream: MediaStream) => {
    const AudioContextCtor = getAudioContextConstructor();

    if (!AudioContextCtor) {
      return;
    }

    const audioContext = new AudioContextCtor();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();

    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);

    const waveformBuffer = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    const timeDomainBuffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));

    audioContextRef.current = audioContext;
    audioSourceRef.current = source;
    analyserRef.current = analyser;
    waveformBufferRef.current = waveformBuffer;
    waveformTimeDomainBufferRef.current = timeDomainBuffer;

    const renderWaveform = () => {
      if (!analyserRef.current || !waveformBufferRef.current || !waveformTimeDomainBufferRef.current) {
        return;
      }

      analyserRef.current.getByteFrequencyData(
        waveformBufferRef.current as Uint8Array<ArrayBuffer>
      );
      analyserRef.current.getByteTimeDomainData(
        waveformTimeDomainBufferRef.current as Uint8Array<ArrayBuffer>
      );
      const rms = computeTimeDomainRms(waveformTimeDomainBufferRef.current);
      const now = performance.now();
      const previousSpeechActive = speechActiveRef.current;
      const activeLanguage = resolvedLanguageHintRef.current;
      const speechHoldMs = getSpeechHoldMsForLanguage(activeLanguage);

      if (rms >= VAD_RMS_THRESHOLD) {
        lastSpeechAtRef.current = now;
      }

      speechActiveRef.current = now - lastSpeechAtRef.current <= speechHoldMs;

      if (
        activeLanguage === 'bn' &&
        previousSpeechActive &&
        !speechActiveRef.current &&
        mediaRecorderRef.current?.state === 'recording' &&
        now - lastRecorderFlushAtRef.current >= BENGALI_RECORDER_REQUEST_DATA_COOLDOWN_MS
      ) {
        lastRecorderFlushAtRef.current = now;

        try {
          mediaRecorderRef.current.requestData();
        } catch {
          // Ignore requestData race failures quietly; the periodic slice still continues.
        }
      }

      setWaveformLevels(buildWaveformLevels(waveformBufferRef.current));
      waveformFrameRef.current = window.requestAnimationFrame(renderWaveform);
    };

    void audioContext.resume().catch(() => undefined);
    renderWaveform();
  }, []);

  const requestTranscription = useCallback(
    async (
      blob: Blob,
      options: {
        startOffsetSeconds?: number;
        endOffsetSeconds?: number;
        signal?: AbortSignal;
        previousContext?: string;
        stage?: TranscriptionStage;
      } = {}
    ) => {
      if (!token) {
        throw new Error('Sign in again before using voice dictation.');
      }

      let finalBlob = blob;
      const isBengali = resolvedLanguageHint === 'bn';

      try {
        finalBlob = await transcodeBlobToWav(blob, {
          startOffsetSeconds: options.startOffsetSeconds,
          endOffsetSeconds: options.endOffsetSeconds,
          targetSampleRate: TARGET_SAMPLE_RATE,
          preserveSpeechEdges: options.stage === 'final' || isBengali,
          preserveNaturalLevels: isBengali,
        });
      } catch (error) {
        console.warn('[dictation] audio preprocessing fell back to original blob', error);
      }

      return apiRequest<AudioTranscriptionResult>('/api/generate/transcribe', {
        method: 'POST',
        token,
        signal: options.signal,
        body: {
          audioBase64: await blobToBase64(finalBlob),
          mimeType: finalBlob.type || blob.type || 'audio/wav',
          languageHint: resolvedLanguageHint,
          previousContext: options.previousContext,
          stage: options.stage ?? 'final',
        },
      });
    },
    [resolvedLanguageHint, token]
  );

  const runPreviewTranscription = useCallback(async (startChunkIndex: number, endChunkIndex: number) => {
    if (
      previewInFlightRef.current ||
      !rawChunksRef.current.length ||
      endChunkIndex <= startChunkIndex
    ) {
      return;
    }

    previewInFlightRef.current = true;
    const sequence = ++previewSequenceRef.current;
    const controller = new AbortController();
    previewAbortControllerRef.current = controller;
    const chunkPromise = (async () => {
      try {
        const previewBlob = buildRecordedBlob();
        const chunkOffsets = getChunkOffsets(startChunkIndex, endChunkIndex);

        if (!chunkOffsets) {
          return;
        }

        const result = await requestTranscription(previewBlob, {
          startOffsetSeconds: chunkOffsets.startOffsetSeconds,
          endOffsetSeconds: Math.min(
            LIVE_PREVIEW_FORCE_FLUSH_SECONDS + chunkOffsets.startOffsetSeconds,
            chunkOffsets.endOffsetSeconds
          ),
          previousContext: buildRollingContext(
            previewTranscriptRef.current || dictationBaseValueRef.current
          ),
          stage: 'stream',
          signal: controller.signal,
        });

        if (
          controller.signal.aborted ||
          sequence !== previewSequenceRef.current
        ) {
          return;
        }

        const nextPreview = result.transcript.trim();

        if (
          nextPreview &&
          hasEnoughStreamingTranscriptContentForLanguage(
            nextPreview,
            resolvedLanguageHintRef.current
          ) &&
          !shouldRejectHindiJunkStreamTranscript(nextPreview, resolvedLanguageHintRef.current) &&
          !shouldRejectIndicJunkStreamTranscript(nextPreview, resolvedLanguageHintRef.current)
        ) {
          previewTranscriptRef.current = mergePreviewTranscript(
            previewTranscriptRef.current,
            nextPreview,
            resolvedLanguageHintRef.current
          );
          updateDraftValue(
            mergeTranscriptIntoValue(
              dictationBaseValueRef.current,
              previewTranscriptRef.current
            )
          );
        }

        lastPreviewChunkCountRef.current = endChunkIndex;
      } catch (error) {
        if (!isAbortLikeError(error)) {
          console.warn('[dictation] chunk transcription failed', error);
        }
      } finally {
        if (previewAbortControllerRef.current === controller) {
          previewAbortControllerRef.current = null;
        }

        previewInFlightRef.current = false;
        previewPromiseRef.current = null;

        const nextQueuedChunk = pendingChunkQueueRef.current.shift();

        if (nextQueuedChunk) {
          queueMicrotask(() => {
            void runPreviewTranscription(
              nextQueuedChunk.startChunkIndex,
              nextQueuedChunk.endChunkIndex
            );
          });
        }
      }
    })();

    previewPromiseRef.current = chunkPromise;
    await chunkPromise;
  }, [buildRecordedBlob, getChunkOffsets, requestTranscription, updateDraftValue]);

  const finalizeSpeechChunk = useCallback(
    (endChunkIndex: number) => {
      const activeChunkStartIndex = chunkStartIndexRef.current;

      if (activeChunkStartIndex === null || endChunkIndex <= activeChunkStartIndex) {
        return;
      }

      chunkStartIndexRef.current = null;
      lastPreviewChunkCountRef.current = endChunkIndex;
      lastSpeechChunkIndexRef.current = endChunkIndex;

      if (previewInFlightRef.current) {
        pendingChunkQueueRef.current.push({
          startChunkIndex: activeChunkStartIndex,
          endChunkIndex,
        });
        return;
      }

      void runPreviewTranscription(activeChunkStartIndex, endChunkIndex);
    },
    [runPreviewTranscription]
  );

  const evaluateChunkBoundary = useCallback(
    (forceFlush = false) => {
      const totalChunkCount = rawChunksRef.current.length;

      if (!totalChunkCount) {
        return;
      }

      const activeChunkStartIndex = chunkStartIndexRef.current;
      const silenceWindowMs = getChunkSilenceMsForLanguage(
        resolvedLanguageHintRef.current
      );
      const recentSpeech =
        forceFlush || performance.now() - lastSpeechAtRef.current <= silenceWindowMs;

      if (activeChunkStartIndex === null) {
        if (!recentSpeech) {
          return;
        }

        const nextStartChunkIndex = Math.max(
          0,
          lastPreviewChunkCountRef.current - LIVE_PREVIEW_OVERLAP_COUNT
        );

        chunkStartIndexRef.current = nextStartChunkIndex;
        lastSpeechChunkIndexRef.current = totalChunkCount;

        if (forceFlush) {
          finalizeSpeechChunk(totalChunkCount);
        }

        return;
      }

      if (recentSpeech) {
        lastSpeechChunkIndexRef.current = totalChunkCount;
      }

      const chunkLength = totalChunkCount - activeChunkStartIndex;
      const speechEndChunkIndex = Math.max(lastSpeechChunkIndexRef.current, totalChunkCount);
      const shouldFinalizeForSilence =
        !recentSpeech && chunkLength >= LIVE_PREVIEW_MIN_CHUNK_COUNT;
      const shouldFinalizeForLength = chunkLength >= LIVE_PREVIEW_MAX_CHUNK_COUNT;

      if (forceFlush || shouldFinalizeForSilence || shouldFinalizeForLength) {
        const finalEndChunkIndex = forceFlush ? totalChunkCount : speechEndChunkIndex;
        finalizeSpeechChunk(finalEndChunkIndex);
      }
    },
    [finalizeSpeechChunk]
  );

  const startDictation = useCallback(async () => {
    if (dictationStatusRef.current === 'recording' || dictationStatusRef.current === 'transcribing') {
      return;
    }

    if (
      typeof window === 'undefined' ||
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setDictationStatus('error');
      setDictationError(
        'This browser is not giving mic support right now. Try Chrome or Edge and we will cook.'
      );
      return;
    }

    setDictationError(null);
    rawChunksRef.current = [];
    previewTranscriptRef.current = '';
    lastPreviewChunkCountRef.current = 0;
    dictationBaseValueRef.current = valueRef.current;
    recordingStartedAtRef.current = 0;
    lastChunkEndTimeMsRef.current = 0;
    lastRecorderFlushAtRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      mediaStreamRef.current = stream;
      startWaveform(stream);

      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = performance.now();
      lastChunkEndTimeMsRef.current = 0;

      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) {
          return;
        }

        const now = Math.max(0, performance.now() - recordingStartedAtRef.current);
        const startTimeMs = lastChunkEndTimeMsRef.current;
        const endTimeMs = Math.max(startTimeMs, now);

        rawChunksRef.current.push({
          blob: event.data,
          startTimeMs,
          endTimeMs,
        });
        lastChunkEndTimeMsRef.current = endTimeMs;
        evaluateChunkBoundary(false);
      };

      recorder.start(MEDIA_RECORDER_SLICE_MS);
      setDictationStatus('recording');
    } catch (error) {
      cleanupMediaStream();
      cleanupWaveform();
      resetPreviewState();
      setDictationStatus('error');
      setDictationError(toFriendlyMicrophoneError(error));
    }
  }, [
    cleanupMediaStream,
    cleanupWaveform,
    dictationLanguage,
    resetPreviewState,
    evaluateChunkBoundary,
    startWaveform,
  ]);

  const stopDictation = useCallback(async () => {
    if (dictationStatusRef.current !== 'recording' || stopRecordingPromiseRef.current) {
      return;
    }

    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      setDictationStatus('idle');
      return;
    }

    setDictationStatus('transcribing');

    if (resolvedLanguageHintRef.current === 'bn') {
      try {
        recorder.requestData();
      } catch {
        // Ignore requestData race failures; stop will still flush the final chunk.
      }

      const tailFlushStartedAt = performance.now();
      const silenceWindowMs = getChunkSilenceMsForLanguage('bn');

      while (
        performance.now() - tailFlushStartedAt < BENGALI_STOP_TAIL_FLUSH_MAX_MS &&
        performance.now() - lastSpeechAtRef.current <= silenceWindowMs
      ) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, BENGALI_STOP_TAIL_FLUSH_POLL_MS)
        );
      }

      try {
        recorder.requestData();
      } catch {
        // Ignore requestData race failures; the final stop flush still applies.
      }
    }

    stopRecordingPromiseRef.current = new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        stopRecordingPromiseRef.current = null;

        try {
          cleanupMediaStream();
          cleanupWaveform();
          const recordedBlob = buildRecordedBlob();

          if (!recordedBlob.size) {
            throw new Error('No voice landed in that take. Give the mic another shot.');
          }

          if (previewPromiseRef.current) {
            await previewPromiseRef.current;
          }

          evaluateChunkBoundary(true);

          while (previewPromiseRef.current || pendingChunkQueueRef.current.length) {
            if (previewPromiseRef.current) {
              await previewPromiseRef.current;
              continue;
            }

            const nextQueuedChunk = pendingChunkQueueRef.current.shift();

            if (!nextQueuedChunk) {
              break;
            }

            await runPreviewTranscription(
              nextQueuedChunk.startChunkIndex,
              nextQueuedChunk.endChunkIndex
            );
          }

          let finalTranscript = previewTranscriptRef.current.trim();

          try {
            const finalResult = await requestTranscription(recordedBlob, {
              previousContext:
                resolvedLanguageHintRef.current === 'bn'
                  ? buildRollingContext(
                      previewTranscriptRef.current || dictationBaseValueRef.current
                    )
                  : undefined,
              stage: 'final',
              signal: undefined,
            });

            if (finalResult.transcript.trim()) {
              finalTranscript = finalResult.transcript.trim();
            }
          } catch (error) {
            console.warn('[dictation] final reconciliation transcription failed', error);
          }

          if (resolvedLanguageHintRef.current === 'bn') {
            finalTranscript = mergeFinalTranscriptWithPreviewTail(
              finalTranscript,
              previewTranscriptRef.current,
              resolvedLanguageHintRef.current
            );
          }

          if (!finalTranscript.trim()) {
            throw new Error('No clear words came through that time. Try again a little closer to the mic.');
          }

          updateDraftValue(
            mergeTranscriptIntoValue(
              dictationBaseValueRef.current,
              finalTranscript
            )
          );
          setDictationStatus('idle');
          setDictationError(null);
          rawChunksRef.current = [];
          previewTranscriptRef.current = '';
        } catch (error) {
          setDictationStatus('error');
          setDictationError(
            error instanceof Error
              ? error.message
              : 'Voice transcription took a weird turn. Try again.'
          );
        } finally {
          mediaRecorderRef.current = null;
          resolve();
        }
      };

      recorder.stop();
    });

    await stopRecordingPromiseRef.current;
  }, [
    buildRecordedBlob,
    cleanupMediaStream,
    evaluateChunkBoundary,
    updateDraftValue,
  ]);

  const toggleDictation = useCallback(async () => {
    if (dictationStatus === 'recording') {
      await stopDictation();
      return;
    }

    await startDictation();
  }, [dictationStatus, startDictation, stopDictation]);

  const statusText = useMemo(() => {
    if (dictationStatus === 'error') {
      return dictationError;
    }

    return null;
  }, [dictationError, dictationStatus]);

  const micButtonLabel =
    dictationStatus === 'recording'
      ? 'Stop voice dictation'
      : dictationStatus === 'transcribing'
      ? 'Voice dictation is processing'
      : 'Start voice dictation';

  const canShowClearButton = showClearButton && Boolean(currentLanguageValue.trim());

  const handleClearCurrentLanguage = useCallback(() => {
    updateDraftValue('');
    setDictationError(null);
  }, [updateDraftValue]);

  const formatPromptHistoryTimestamp = useCallback((createdAt: string) => {
    const timestamp = new Date(createdAt);

    if (Number.isNaN(timestamp.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(timestamp);
  }, []);

  const buildPromptHistoryPreview = useCallback((text: string) => {
    const normalized = text.replace(/\s+/g, ' ').trim();

    if (normalized.length <= 88) {
      return normalized;
    }

    return `${normalized.slice(0, 88).trimEnd()}…`;
  }, []);

  const toggleHistoryEntry = useCallback((entryId: string) => {
    setExpandedHistoryEntries((current) => ({
      ...current,
      [entryId]: !current[entryId],
    }));
  }, []);

  return (
    <div className={`${className ?? ''} generate-chat__dictation-shell`}>
      {(!hideLabel || showHistoryToggle || canShowClearButton) ? (
        <div className="generate-chat__dictation-header">
          <div className="generate-chat__dictation-heading">
            {!hideLabel ? (
              <label className="field__label" htmlFor={textareaId}>
                {label}
              </label>
            ) : null}
            {showHistoryToggle ? (
              <button
                id={historyButtonId}
                type="button"
                className={`generate-chat__dictation-history-toggle ${
                  isHistoryOpen ? 'generate-chat__dictation-history-toggle--open' : ''
                }`}
                onClick={() => setIsHistoryOpen((current) => !current)}
                aria-label={`Show last 3 prompts for ${DICTATION_LANGUAGE_OPTIONS.find((option) => option.value === resolvedLanguageHint)?.label ?? 'current language'}`}
                aria-expanded={isHistoryOpen}
                title="Show last 3 prompts"
              >
                <ChevronDown size={14} />
              </button>
            ) : null}
          </div>
          {canShowClearButton ? (
            <button
              type="button"
              className="generate-chat__dictation-clear"
              onClick={handleClearCurrentLanguage}
              aria-label={`Clear ${label.toLowerCase()} for ${DICTATION_LANGUAGE_OPTIONS.find((option) => option.value === resolvedLanguageHint)?.label ?? 'current language'}`}
              title="Clear this language draft"
              disabled={disabled || dictationStatus === 'recording' || dictationStatus === 'transcribing'}
            >
              <Eraser size={12} />
              <span>Erase</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {showHistoryToggle && isHistoryOpen ? (
        <div
          ref={historyPanelRef}
          className="generate-chat__dictation-history-panel"
          role="dialog"
          aria-modal="false"
          aria-label={`${label} prompt history`}
        >
          <div className="generate-chat__dictation-history-panel-header">
            <strong>Last 3 prompts</strong>
            <span>
              {DICTATION_LANGUAGE_OPTIONS.find(
                (option) => option.value === resolvedLanguageHint
              )?.label ?? 'Current language'}
            </span>
          </div>
          {currentLanguageHistory.length ? (
            <ol className="generate-chat__dictation-history-list">
              {currentLanguageHistory.map((entry, index) => (
                <li key={entry.id} className="generate-chat__dictation-history-item">
                  <span className="generate-chat__dictation-history-index">
                    {index + 1}
                  </span>
                  <div className="generate-chat__dictation-history-copy">
                    <button
                      type="button"
                      className={`generate-chat__dictation-history-entry-toggle ${
                        expandedHistoryEntries[entry.id]
                          ? 'generate-chat__dictation-history-entry-toggle--open'
                          : ''
                      }`}
                      onClick={() => toggleHistoryEntry(entry.id)}
                      aria-expanded={Boolean(expandedHistoryEntries[entry.id])}
                      aria-label={`Toggle prompt ${index + 1}`}
                    >
                      <div className="generate-chat__dictation-history-entry-text">
                        <p className="generate-chat__dictation-history-preview">
                          {buildPromptHistoryPreview(entry.text)}
                        </p>
                        <time dateTime={entry.createdAt}>
                          {formatPromptHistoryTimestamp(entry.createdAt)}
                        </time>
                      </div>
                      <ChevronDown size={14} />
                    </button>
                    {expandedHistoryEntries[entry.id] ? (
                      <p className="generate-chat__dictation-history-full">{entry.text}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="generate-chat__dictation-history-empty">
              No saved prompts for this language yet.
            </p>
          )}
        </div>
      ) : null}
      <div
        className={`generate-chat__dictation-field ${
          dictationStatus === 'recording'
            ? 'generate-chat__dictation-field--recording'
            : dictationStatus === 'transcribing'
            ? 'generate-chat__dictation-field--processing'
            : dictationStatus === 'error'
            ? 'generate-chat__dictation-field--error'
            : ''
        }`}
      >
        <textarea
          id={textareaId}
          className="field__control field__control--textarea generate-chat__textarea--compact generate-chat__dictation-textarea"
          value={currentLanguageValue}
          onChange={(event) => updateDraftValue(event.target.value)}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          aria-describedby={statusText ? statusId : undefined}
          {...textareaProps}
        />
        <label className="generate-chat__dictation-language" aria-label="Dictation language">
          <select
            value={dictationLanguage}
            onChange={(event) => setDictationLanguage(event.target.value)}
            disabled={disabled || dictationStatus === 'recording' || dictationStatus === 'transcribing'}
            aria-label="Choose dictation language"
          >
            {DICTATION_LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`generate-chat__dictation-button ${
            dictationStatus === 'recording'
              ? 'generate-chat__dictation-button--recording'
              : dictationStatus === 'transcribing'
              ? 'generate-chat__dictation-button--processing'
              : dictationStatus === 'error'
              ? 'generate-chat__dictation-button--error'
              : ''
          }`}
          onClick={() => void toggleDictation()}
          aria-label={micButtonLabel}
          title={micButtonLabel}
          aria-pressed={dictationStatus === 'recording'}
          disabled={disabled || dictationStatus === 'transcribing'}
        >
          {dictationStatus === 'transcribing' ? (
            <Loader2 size={16} className="generate-chat__dictation-button-spinner" />
          ) : dictationStatus === 'recording' ? (
            <Square size={13} />
          ) : (
            <Mic size={16} />
          )}
        </button>
        {statusText ? (
          <div
            id={statusId}
            className={`generate-chat__dictation-status ${
              dictationStatus === 'error'
                ? 'generate-chat__dictation-status--error'
                : ''
            }`}
            aria-live="polite"
          >
            {dictationStatus === 'error' ? (
              <AlertCircle size={13} />
            ) : (
              <span className="generate-chat__dictation-pulse" />
            )}
            <span>{statusText}</span>
          </div>
        ) : null}
        {dictationStatus === 'recording' ? (
          <div className="generate-chat__dictation-waveform" aria-hidden="true">
            {waveformLevels.map((level, index) => (
              <span
                key={index}
                className="generate-chat__dictation-waveform-bar"
                style={{ '--dictation-level': level } as CSSProperties}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
