import { AlertCircle, Loader2, Mic, Square } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TextareaHTMLAttributes,
} from 'react';
import { useAuth } from '../../hooks/useAuth';
import { apiRequest } from '../../lib/axios';
import type { AudioTranscriptionResult } from '../../types';

type DictationStatus = 'idle' | 'recording' | 'transcribing' | 'error';

type DictationTextareaFieldProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

type BrowserSpeechRecognitionConstructor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

const SUPPORTED_LANGUAGE_HINTS = new Set([
  'hi',
  'bn',
  'en',
  'ta',
  'te',
  'ml',
  'kn',
  'pa',
]);

const RMS_SPEECH_THRESHOLD = 0.02;
const MEDIA_RECORDER_SLICE_MS = 1200;
const TRAILING_AUDIO_KEEP_MS = 1200;

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

  if (trimmedEnd.endsWith('\n')) {
    return `${trimmedEnd}${nextTranscript}`;
  }

  if (/[.!?…]$/.test(trimmedEnd)) {
    return `${trimmedEnd} ${nextTranscript}`;
  }

  return `${trimmedEnd}\n${nextTranscript}`;
};

const getLanguageHint = () => {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  const baseLanguage = navigator.language.split('-')[0]?.toLowerCase();
  return baseLanguage && SUPPORTED_LANGUAGE_HINTS.has(baseLanguage)
    ? baseLanguage
    : undefined;
};

const getSpeechRecognitionConstructor = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const candidateWindow = window as Window & {
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };

  return candidateWindow.SpeechRecognition ?? candidateWindow.webkitSpeechRecognition ?? null;
};

export const DictationTextareaField = ({
  label,
  value,
  onChange,
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
  const [livePreview, setLivePreview] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speechRafRef = useRef<number | null>(null);
  const rawChunksRef = useRef<Blob[]>([]);
  const voicedChunksRef = useRef<Blob[]>([]);
  const chunkHasSpeechRef = useRef(false);
  const keepAudioUntilRef = useRef(0);
  const recognitionRef = useRef<InstanceType<BrowserSpeechRecognitionConstructor> | null>(
    null
  );
  const shouldKeepRecognitionAliveRef = useRef(false);
  const valueRef = useRef(value);
  const finalPreviewRef = useRef('');
  const stopRecordingPromiseRef = useRef<Promise<void> | null>(null);
  const statusId = `${id ?? label.replace(/\s+/g, '-').toLowerCase()}-dictation-status`;

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const cleanupAudioGraph = useCallback(() => {
    if (speechRafRef.current !== null) {
      window.cancelAnimationFrame(speechRafRef.current);
      speechRafRef.current = null;
    }

    analyserRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }, []);

  const cleanupMediaStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const cleanupRecognition = useCallback(() => {
    shouldKeepRecognitionAliveRef.current = false;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {
        // noop
      }
    }

    recognitionRef.current = null;
    finalPreviewRef.current = '';
    setLivePreview('');
  }, []);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      cleanupRecognition();
      cleanupAudioGraph();
      cleanupMediaStream();
    };
  }, [cleanupAudioGraph, cleanupMediaStream, cleanupRecognition]);

  const beginLivePreview = useCallback(() => {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();

    if (!SpeechRecognitionCtor) {
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-IN';

    recognition.onresult = (event) => {
      const speechEvent = event as Event & {
        resultIndex?: number;
        results?: ArrayLike<{
          isFinal: boolean;
          length: number;
          [index: number]: { transcript: string };
        }>;
      };

      const results = speechEvent.results;

      if (!results) {
        return;
      }

      let interimText = '';

      for (let index = speechEvent.resultIndex ?? 0; index < results.length; index += 1) {
        const result = results[index];
        const transcript = result?.[0]?.transcript?.trim();

        if (!transcript) {
          continue;
        }

        if (result.isFinal) {
          finalPreviewRef.current = [finalPreviewRef.current, transcript]
            .filter(Boolean)
            .join(' ')
            .trim();
        } else {
          interimText = transcript;
        }
      }

      setLivePreview([finalPreviewRef.current, interimText].filter(Boolean).join(' ').trim());
    };

    recognition.onerror = () => {
      // Browser preview is optional. We silently keep the main recording session alive.
    };

    recognition.onend = () => {
      if (!shouldKeepRecognitionAliveRef.current) {
        return;
      }

      try {
        recognition.start();
      } catch {
        // If restart fails we simply continue with backend-only final transcription.
      }
    };

    try {
      recognition.start();
      shouldKeepRecognitionAliveRef.current = true;
      recognitionRef.current = recognition;
    } catch {
      recognitionRef.current = null;
    }
  }, []);

  const monitorSpeech = useCallback(() => {
    const analyser = analyserRef.current;

    if (!analyser) {
      return;
    }

    const samples = new Uint8Array(analyser.fftSize);

    const tick = () => {
      const activeRecorder = mediaRecorderRef.current;

      if (!analyserRef.current || !activeRecorder || activeRecorder.state !== 'recording') {
        speechRafRef.current = null;
        return;
      }

      analyser.getByteTimeDomainData(samples);

      let sumSquares = 0;

      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sumSquares += normalized * normalized;
      }

      const rms = Math.sqrt(sumSquares / samples.length);
      const now = performance.now();

      if (rms >= RMS_SPEECH_THRESHOLD) {
        chunkHasSpeechRef.current = true;
        keepAudioUntilRef.current = now + TRAILING_AUDIO_KEEP_MS;
      }

      speechRafRef.current = window.requestAnimationFrame(tick);
    };

    speechRafRef.current = window.requestAnimationFrame(tick);
  }, []);

  const startDictation = useCallback(async () => {
    if (dictationStatus === 'recording' || dictationStatus === 'transcribing') {
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
    setLivePreview('');
    finalPreviewRef.current = '';
    rawChunksRef.current = [];
    voicedChunksRef.current = [];
    chunkHasSpeechRef.current = false;
    keepAudioUntilRef.current = 0;

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

      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) {
          chunkHasSpeechRef.current = false;
          return;
        }

        rawChunksRef.current.push(event.data);

        // Silence cleanup happens here: we drop clearly silent slices, but never stop the session.
        const shouldKeepChunk =
          chunkHasSpeechRef.current || performance.now() <= keepAudioUntilRef.current;

        if (shouldKeepChunk) {
          voicedChunksRef.current.push(event.data);
        }

        chunkHasSpeechRef.current = false;
      };

      recorder.start(MEDIA_RECORDER_SLICE_MS);
      setDictationStatus('recording');
      monitorSpeech();
      beginLivePreview();
    } catch (error) {
      cleanupAudioGraph();
      cleanupMediaStream();
      cleanupRecognition();
      setDictationStatus('error');
      setDictationError(toFriendlyMicrophoneError(error));
    }
  }, [
    beginLivePreview,
    cleanupAudioGraph,
    cleanupMediaStream,
    cleanupRecognition,
    dictationStatus,
    monitorSpeech,
  ]);

  const stopDictation = useCallback(async () => {
    if (dictationStatus !== 'recording' || stopRecordingPromiseRef.current) {
      return;
    }

    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      setDictationStatus('idle');
      return;
    }

    cleanupRecognition();
    cleanupAudioGraph();
    setDictationStatus('transcribing');

    stopRecordingPromiseRef.current = new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        stopRecordingPromiseRef.current = null;

        try {
          cleanupMediaStream();

          const finalChunks =
            voicedChunksRef.current.length > 0 ? voicedChunksRef.current : rawChunksRef.current;
          const finalBlob = new Blob(finalChunks, {
            type: recorder.mimeType || pickRecorderMimeType() || 'audio/webm',
          });

          if (!finalBlob.size) {
            throw new Error('No voice landed in that take. Give the mic another shot.');
          }

          if (!token) {
            throw new Error('Sign in again before using voice dictation.');
          }

          const transcript = await apiRequest<AudioTranscriptionResult>('/api/generate/transcribe', {
            method: 'POST',
            token,
            body: {
              audioBase64: await blobToBase64(finalBlob),
              mimeType: finalBlob.type || 'audio/webm',
              languageHint: getLanguageHint(),
            },
          });

          if (!transcript.transcript.trim()) {
            throw new Error('No clear words came through that time. Try again a little closer to the mic.');
          }

          onChange(mergeTranscriptIntoValue(valueRef.current, transcript.transcript));
          setDictationStatus('idle');
          setDictationError(null);
          setLivePreview('');
          rawChunksRef.current = [];
          voicedChunksRef.current = [];
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
    cleanupAudioGraph,
    cleanupMediaStream,
    cleanupRecognition,
    dictationStatus,
    onChange,
    token,
  ]);

  const toggleDictation = useCallback(async () => {
    if (dictationStatus === 'recording') {
      await stopDictation();
      return;
    }

    await startDictation();
  }, [dictationStatus, startDictation, stopDictation]);

  const statusText = useMemo(() => {
    if (dictationStatus === 'recording') {
      return livePreview
        ? `Listening… ${livePreview}`
        : 'Listening… click the mic again when you are done.';
    }

    if (dictationStatus === 'transcribing') {
      return 'Processing voice note…';
    }

    if (dictationStatus === 'error') {
      return dictationError;
    }

    return null;
  }, [dictationError, dictationStatus, livePreview]);

  const micButtonLabel =
    dictationStatus === 'recording'
      ? 'Stop voice dictation'
      : dictationStatus === 'transcribing'
      ? 'Voice dictation is processing'
      : 'Start voice dictation';

  return (
    <label className={className}>
      <span className="field__label">{label}</span>
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
          id={id}
          className="field__control field__control--textarea generate-chat__textarea--compact generate-chat__dictation-textarea"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          aria-describedby={statusText ? statusId : undefined}
          {...textareaProps}
        />
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
            {dictationStatus === 'error' ? <AlertCircle size={13} /> : <span className="generate-chat__dictation-pulse" />}
            <span>{statusText}</span>
          </div>
        ) : null}
      </div>
    </label>
  );
};
