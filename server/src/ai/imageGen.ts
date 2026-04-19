import dotenv from 'dotenv';
import type { GenerateImageInput } from '../schemas/image.schema';
import type { BrandProfile } from '../types';
import {
  isAbortError,
  RequestCancelledError,
  throwIfRequestCancelled,
} from '../lib/requestCancellation';
import {
  isProviderCircuitOpen,
  recordProviderCircuitFailure,
  recordProviderCircuitSuccess,
} from '../services/providerCircuit.service';

dotenv.config();

export type ImageGenerationProvider =
  | 'cloudflare-worker'
  | 'flux'
  | 'pixazo'
  | 'aimlapi';

export type GeneratedImageResult = {
  imageUrl: string;
  provider: ImageGenerationProvider;
  promptUsed: string;
};

type ImageGenerationErrorCode =
  | 'timeout'
  | 'prompt_too_long'
  | 'source_image_unsupported'
  | 'insufficient_credits'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'invalid_response'
  | 'configuration'
  | 'request_rejected'
  | 'unknown';

type ResolvedGenerateImageInput = GenerateImageInput & {
  brandName?: string | null;
};

type ProviderFailure = {
  provider: ImageGenerationProvider;
  code: ImageGenerationErrorCode;
  message: string;
  userMessage: string;
};

type ProviderAttemptResult =
  | {
      success: true;
      provider: ImageGenerationProvider;
      imageUrl: string;
    }
  | {
      success: false;
      provider: ImageGenerationProvider;
      failure: ProviderFailure;
    };

type ImageProvider = {
  provider: ImageGenerationProvider;
  generate: (
    prompt: string,
    input: ResolvedGenerateImageInput,
    signal?: AbortSignal
  ) => Promise<string>;
};

type FluxApiMode = 'huggingface' | 'bfl' | 'generic';

type FluxConfig = {
  apiKey: string;
  endpoint: string;
  endpointCandidates: string[];
  mode: FluxApiMode;
  model: string;
  statusEndpoint: string | null;
};

export class ImageGenerationProvidersExhaustedError extends Error {
  readonly failures: ProviderFailure[];

  constructor(failures: ProviderFailure[]) {
    super(resolveUserFacingFailureMessage(failures));
    this.name = 'ImageGenerationProvidersExhaustedError';
    this.failures = failures;
  }
}

const KNOWN_BFL_FLUX_ENDPOINT = 'https://api.bfl.ai/v1/flux-pro-1.1';
const DEFAULT_HF_FLUX_MODEL = 'black-forest-labs/FLUX.1-dev';
const HF_INFERENCE_BASE_URL = 'https://api-inference.huggingface.co/models';
const HF_ROUTER_INFERENCE_BASE_URL =
  'https://router.huggingface.co/hf-inference/models';
const PIXAZO_GENERATE_ENDPOINT =
  'https://gateway.pixazo.ai/flux-1-schnell/v1/getDataBatch';
const PIXAZO_STATUS_ENDPOINT =
  'https://gateway.pixazo.ai/flux-1-schnell/v1/checkStatus';
const AIMLAPI_GENERATE_ENDPOINT = 'https://api.aimlapi.com/v1/images/generations';
const DEFAULT_CLOUDFLARE_WORKER_IMAGE_URL =
  'https://prixmoai.computerbro1234.workers.dev';

const CLOUDFLARE_WORKER_TIMEOUT_MS = Number(
  process.env.CLOUDFLARE_WORKER_GENERATION_TIMEOUT_MS || 45_000
);
const FLUX_TIMEOUT_MS = Number(process.env.FLUX_GENERATION_TIMEOUT_MS || 45_000);
const PIXAZO_TIMEOUT_MS = Number(
  process.env.PIXAZO_GENERATION_TIMEOUT_MS || 75_000
);
const AIMLAPI_TIMEOUT_MS = Number(
  process.env.AIMLAPI_GENERATION_TIMEOUT_MS || 45_000
);
const IMAGE_VALIDATION_TIMEOUT_MS = 15_000;
const FLUX_POLL_INTERVAL_MS = Number(
  process.env.FLUX_POLL_INTERVAL_MS || 3_000
);
const FLUX_MAX_POLLS = Number(process.env.FLUX_MAX_POLLS || 6);
const PIXAZO_POLL_INTERVAL_MS = Number(
  process.env.PIXAZO_POLL_INTERVAL_MS || 3_000
);
const PIXAZO_MAX_POLLS = Number(process.env.PIXAZO_MAX_POLLS || 20);
const AIMLAPI_MAX_PROMPT_LENGTH = Number(
  process.env.AIMLAPI_MAX_PROMPT_LENGTH || 1900
);
const DEFAULT_AIMLAPI_MODEL =
  process.env.AIMLAPI_IMAGE_MODEL || 'alibaba/wan-2-6-image';
type HuggingFaceTextToImageClient = {
  textToImage: (
    args: {
      model: string;
      inputs: string;
      parameters?: Record<string, unknown>;
    },
    options?: {
      signal?: AbortSignal;
      outputType?: 'dataUrl';
    }
  ) => Promise<string>;
};

type HuggingFaceInferenceModule = {
  InferenceClient: new (accessToken?: string) => HuggingFaceTextToImageClient;
};

let huggingFaceInferenceModulePromise: Promise<HuggingFaceInferenceModule> | null =
  null;

const getOptionalEnv = (key: string) => {
  const value = process.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const getCloudflareWorkerConfig = () => {
  const endpoint =
    getOptionalEnv('CLOUDFLARE_WORKER_IMAGE_URL') ||
    DEFAULT_CLOUDFLARE_WORKER_IMAGE_URL;
  const apiKey = getOptionalEnv('CLOUDFLARE_WORKER_API_KEY');

  if (!apiKey) {
    throw new Error('CLOUDFLARE_WORKER_API_KEY is not configured');
  }

  return {
    endpoint,
    apiKey,
  };
};

const loadHuggingFaceInferenceModule = () => {
  if (!huggingFaceInferenceModulePromise) {
    huggingFaceInferenceModulePromise = import(
      '@huggingface/inference'
    ) as Promise<HuggingFaceInferenceModule>;
  }

  return huggingFaceInferenceModulePromise;
};

const resolveUserFacingFailureMessage = (failures: ProviderFailure[]) => {
  if (!failures.length) {
    return "We couldn't generate your image right now. Please try again.";
  }

  const codes = new Set(failures.map((failure) => failure.code));

  if (codes.has('source_image_unsupported')) {
    return 'This request uses a reference image, and the available providers could not complete image-to-image generation right now. Try again in a moment, or remove the reference image to generate from text only.';
  }

  if (codes.has('prompt_too_long')) {
    return 'Your image brief is too long for the current providers. Shorten the product description or prompt and try again.';
  }

  if (codes.size === 1 && codes.has('timeout')) {
    return 'Image generation is taking longer than expected right now. Please try again in a moment.';
  }

  if (codes.has('rate_limited')) {
    return 'The image providers are busy right now. Please wait a moment and try again.';
  }

  if (codes.has('insufficient_credits')) {
    return 'One of the image providers has run out of credits. Please top up that provider account or try again with another available provider.';
  }

  if (codes.has('configuration')) {
    return 'One of the image providers is temporarily misconfigured. Please try again in a moment.';
  }

  if (codes.has('invalid_response')) {
    return 'The image provider returned an invalid result. Please try again.';
  }

  if (codes.has('provider_unavailable')) {
    return 'The image providers are temporarily unavailable. Please try again in a moment.';
  }

  if (codes.has('request_rejected')) {
    return 'This image request could not be processed in its current form. Please adjust the prompt and try again.';
  }

  return failures[0]?.userMessage ||
    "We couldn't generate your image right now. Please try again.";
};

const buildBrandDirection = (brandProfile: BrandProfile | null): string[] => {
  if (!brandProfile) {
    return [];
  }

  return [
    'Brand profile direction (use as soft visual art direction only, never as visible text inside the image):',
    `- Industry: ${brandProfile.industry ?? 'not provided'}`,
    `- Target audience: ${brandProfile.targetAudience ?? 'not provided'}`,
    `- Brand voice: ${brandProfile.brandVoice ?? 'not provided'}`,
    `- Brand description: ${brandProfile.description ?? 'not provided'}`,
  ];
};

const buildImagePrompt = (
  brandProfile: BrandProfile | null,
  input: ResolvedGenerateImageInput
): string => {
  const parts = [
    `Create a polished, platform-ready marketing visual for ${input.productName}.`,
    input.brandName
      ? `Brand / business name: ${input.brandName}. Use this only as business context, not as visible text inside the image unless explicitly requested.`
      : 'No brand / business name is being used for this generation. Do not invent one and do not use the workspace owner personal name as the visible brand name.',
    input.productDescription
      ? `Product details: ${input.productDescription}.`
      : null,
    input.prompt
      ? `User creative direction: ${input.prompt.trim()}.`
      : 'Creative direction: premium, modern, on-brand product creative shaped by the product brief and brand profile.',
    input.sourceImageUrl
      ? 'A source image is provided. Preserve the real subject identity, recognisable details, and key visual cues while improving composition, lighting, background, and polish.'
      : 'No source image is provided. Create a fresh hero composition centered on the subject described in the brief.',
    input.backgroundStyle
      ? `Background style: ${input.backgroundStyle}.`
      : 'Background style: clean studio lighting with modern premium aesthetics.',
    'Define a clear scene, lighting style, camera angle, mood, color palette, and product focus based on the brief.',
    'Make those visual decisions feel on-brand, audience-aware, and appropriate for the inferred business domain.',
    'Do not assume fashion, ecommerce, or any other niche unless the product input or brand profile supports it.',
    'Do not add any visible text, typography, logos, brand names, usernames, watermarks, packaging copy, or poster-style wording unless the user explicitly asks for text inside the image.',
    input.negativePrompt
      ? `Avoid these elements: ${input.negativePrompt}.`
      : 'Avoid extra products, distorted anatomy, wrong materials, warped text, clutter, and low-detail rendering.',
    'Keep the main subject in sharp focus and make the final image social-media ready.',
    ...buildBrandDirection(brandProfile),
  ];

  return parts.filter(Boolean).join(' ');
};

const truncatePrompt = (prompt: string, maxLength: number) => {
  const normalized = prompt.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const truncated = normalized.slice(0, Math.max(0, maxLength - 1));
  const lastWhitespaceIndex = truncated.lastIndexOf(' ');

  if (lastWhitespaceIndex > Math.floor(maxLength * 0.7)) {
    return `${truncated.slice(0, lastWhitespaceIndex).trimEnd()}…`;
  }

  return `${truncated.trimEnd()}…`;
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RequestCancelledError('Image generation cancelled by user.'));
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);

    const handleAbort = () => {
      clearTimeout(timeout);
      reject(new RequestCancelledError('Image generation cancelled by user.'));
    };

    signal?.addEventListener('abort', handleAbort, {
      once: true,
    });
  });

const normalizeDimension = (value: number | undefined, fallback: number) => {
  const safeValue =
    Number.isFinite(value) && value ? Math.trunc(value) : fallback;
  const bounded = Math.min(1024, Math.max(256, safeValue));
  const snapped = Math.round(bounded / 32) * 32;

  return Math.min(1024, Math.max(256, snapped));
};

const withTimeout = async <T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
  requestSignal?: AbortSignal
): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const handleRequestAbort = () => {
    controller.abort();
  };

  requestSignal?.addEventListener('abort', handleRequestAbort, {
    once: true,
  });

  try {
    throwIfRequestCancelled(requestSignal, 'Image generation cancelled by user.');
    return await operation(controller.signal);
  } catch (error) {
    if (isAbortError(error)) {
      if (requestSignal?.aborted) {
        throw new RequestCancelledError('Image generation cancelled by user.');
      }

      throw new Error('Request timed out');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    requestSignal?.removeEventListener('abort', handleRequestAbort);
  }
};

const createDeadline = (timeoutMs: number) => Date.now() + timeoutMs;

const getRemainingMs = (deadlineAt: number) => Math.max(0, deadlineAt - Date.now());

const runWithDeadline = async <T>(
  deadlineAt: number,
  operation: (signal: AbortSignal) => Promise<T>,
  requestSignal?: AbortSignal
) => {
  const remainingMs = getRemainingMs(deadlineAt);

  if (remainingMs <= 0) {
    throw new Error('Request timed out');
  }

  return withTimeout(remainingMs, operation, requestSignal);
};

const sleepWithinDeadline = async (
  deadlineAt: number,
  delayMs: number,
  requestSignal?: AbortSignal
) => {
  const remainingMs = getRemainingMs(deadlineAt);

  if (remainingMs <= 0) {
    throw new Error('Request timed out');
  }

  throwIfRequestCancelled(requestSignal, 'Image generation cancelled by user.');
  await sleep(Math.min(delayMs, remainingMs), requestSignal);
  throwIfRequestCancelled(requestSignal, 'Image generation cancelled by user.');
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const BASE64_IMAGE_PATTERN = /^[A-Za-z0-9+/=\s]+$/;

const toErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (isRecord(value)) {
    const candidates = [
      value.message,
      value.error,
      value.details,
      value.reason,
      value.status,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }

    if (isRecord(value.error)) {
      return toErrorMessage(value.error, fallback);
    }
  }

  if (value instanceof Error && value.message.trim()) {
    return value.message;
  }

  return fallback;
};

const classifyProviderFailure = (
  provider: ImageGenerationProvider,
  error: unknown
): ProviderFailure => {
  const technicalMessage = toErrorMessage(
    error,
    `${provider} image generation failed`
  );
  const normalizedMessage = technicalMessage.toLowerCase();

  if (
    /source-image guided generation does not support|image-to-image generation right now|remove the reference image to generate from text only/i.test(
      technicalMessage
    )
  ) {
    return {
      provider,
      code: 'source_image_unsupported',
      message: technicalMessage,
      userMessage:
        'This request uses a reference image, and that flow is not available with the current provider right now. Try again in a moment, or remove the reference image to generate from text only.',
    };
  }

  if (
    /run out of credits|insufficent_credits|insufficient credits|top up your balance|update your payment method/i.test(
      normalizedMessage
    )
  ) {
    return {
      provider,
      code: 'insufficient_credits',
      message: technicalMessage,
      userMessage:
        'This image provider has run out of credits. Please top up that provider account or try again with another available provider.',
    };
  }

  if (
    /at most 2000 character|too_big|prompt is too long|string must contain at most/i.test(
      normalizedMessage
    )
  ) {
    return {
      provider,
      code: 'prompt_too_long',
      message: technicalMessage,
      userMessage:
        'Your image brief is too long for the current providers. Shorten the product description or prompt and try again.',
    };
  }

  if (/request timed out|timed out before returning an image|timeout/i.test(normalizedMessage)) {
    return {
      provider,
      code: 'timeout',
      message: technicalMessage,
      userMessage:
        'Image generation is taking longer than expected right now. Please try again in a moment.',
    };
  }

  if (/429|too many requests|rate limit|quota/i.test(normalizedMessage)) {
    return {
      provider,
      code: 'rate_limited',
      message: technicalMessage,
      userMessage:
        'The image providers are busy right now. Please wait a moment and try again.',
    };
  }

  if (
    /503|502|500|internal server error|service unavailable|bad gateway|overloaded|temporarily unavailable/i.test(
      normalizedMessage
    )
    || /temporarily skipped after repeated failures/i.test(normalizedMessage)
  ) {
    return {
      provider,
      code: 'provider_unavailable',
      message: technicalMessage,
      userMessage:
        'The image providers are temporarily unavailable. Please try again in a moment.',
    };
  }

  if (
    /did not return an image url|non-image response|invalid image url|invalid image|invalid result|unexpected format/i.test(
      normalizedMessage
    )
  ) {
    return {
      provider,
      code: 'invalid_response',
      message: technicalMessage,
      userMessage:
        'The image provider returned an invalid result. Please try again.',
    };
  }

  if (
    /cannot post \/models\//i.test(normalizedMessage)
  ) {
    return {
      provider,
      code: 'configuration',
      message: technicalMessage,
      userMessage:
        'Flux is pointing to the wrong endpoint. Leave FLUX_API_ENDPOINT empty when using a Hugging Face token, then restart the server.',
    };
  }

  if (
    /not configured|forbidden|unauthorized|401|403/i.test(
      normalizedMessage
    )
  ) {
    return {
      provider,
      code: 'configuration',
      message: technicalMessage,
      userMessage:
        'One of the image providers is temporarily misconfigured. Please try again in a moment.',
    };
  }

  if (/400|bad request|invalid payload|unprocessable/i.test(normalizedMessage)) {
    return {
      provider,
      code: 'request_rejected',
      message: technicalMessage,
      userMessage:
        'This image request could not be processed in its current form. Please adjust the prompt and try again.',
    };
  }

  return {
    provider,
    code: 'unknown',
    message: technicalMessage,
    userMessage: "We couldn't generate your image right now. Please try again.",
  };
};

const toDataImageUrl = (value: string, mimeType = 'image/png'): string | null => {
  const normalized = value.trim();

  if (!normalized || !BASE64_IMAGE_PATTERN.test(normalized)) {
    return null;
  }

  return `data:${mimeType};base64,${normalized.replace(/\s+/g, '')}`;
};

const extractImageUrl = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('data:image/')
    ) {
      return trimmed;
    }

    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractImageUrl(item);
      if (extracted) {
        return extracted;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const base64Candidates = [
    value.b64_json,
    value.base64,
    value.image_base64,
    value.imageBase64,
  ];

  for (const candidate of base64Candidates) {
    if (typeof candidate === 'string') {
      const dataUrl = toDataImageUrl(candidate);
      if (dataUrl) {
        return dataUrl;
      }
    }
  }

  const preferredKeys = [
    'url',
    'image_url',
    'imageUrl',
    'sample',
    'sample_url',
    'sampleUrl',
    'output',
    'response_url',
    'responseUrl',
    'result_url',
    'resultUrl',
  ];

  for (const key of preferredKeys) {
    const extracted = extractImageUrl(value[key]);
    if (extracted) {
      return extracted;
    }
  }

  for (const nestedKey of ['data', 'result', 'results', 'images', 'output']) {
    const extracted = extractImageUrl(value[nestedKey]);
    if (extracted) {
      return extracted;
    }
  }

  return null;
};

const extractStatusUrl = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }

  const candidates = [
    value.polling_url,
    value.pollingUrl,
    value.status_url,
    value.statusUrl,
    value.result_url,
    value.resultUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^https?:\/\//.test(candidate.trim())) {
      return candidate.trim();
    }
  }

  return null;
};

const extractRequestId = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }

  const candidates = [
    value.id,
    value.request_id,
    value.requestId,
    value.job_id,
    value.jobId,
    value.task_id,
    value.taskId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
};

const parseResponsePayload = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.startsWith('image/')) {
    const imageBuffer = Buffer.from(await response.arrayBuffer()).toString('base64');
    return {
      image_url: `data:${contentType};base64,${imageBuffer}`,
    };
  }

  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => '');
  return text.trim() ? { message: text } : null;
};

const validateRemoteImageUrl = async (url: string): Promise<string> => {
  if (url.startsWith('data:image/')) {
    return url;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Provider returned an invalid image URL');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Provider returned an unsupported image URL');
  }

  const headResponse = await withTimeout(IMAGE_VALIDATION_TIMEOUT_MS, (signal) =>
    fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal,
    }).catch(() => null)
  );

  const headContentType = headResponse?.headers.get('content-type') || '';

  if (
    headResponse?.ok &&
    (headContentType.startsWith('image/') ||
      headContentType === 'application/octet-stream')
  ) {
    return url;
  }

  const getResponse = await withTimeout(IMAGE_VALIDATION_TIMEOUT_MS, (signal) =>
    fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal,
    })
  );

  const getContentType = getResponse.headers.get('content-type') || '';

  if (
    !getResponse.ok ||
    (!getContentType.startsWith('image/') &&
      getContentType !== 'application/octet-stream')
  ) {
    throw new Error(
      `Provider returned a non-image response (${getResponse.status} ${getContentType || 'unknown'})`
    );
  }

  return url;
};

const validateRemoteImageUrlWithSignal = async (
  url: string,
  signal?: AbortSignal
): Promise<string> => {
  if (url.startsWith('data:image/')) {
    throwIfRequestCancelled(signal, 'Image generation cancelled by user.');
    return url;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Provider returned an invalid image URL');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Provider returned an unsupported image URL');
  }

  throwIfRequestCancelled(signal, 'Image generation cancelled by user.');
  const headResponse = await withTimeout(
    IMAGE_VALIDATION_TIMEOUT_MS,
    (validationSignal) =>
      fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: validationSignal,
      }).catch(() => null),
    signal
  );

  const headContentType = headResponse?.headers.get('content-type') || '';

  if (
    headResponse?.ok &&
    (headContentType.startsWith('image/') ||
      headContentType === 'application/octet-stream')
  ) {
    return url;
  }

  const getResponse = await withTimeout(
    IMAGE_VALIDATION_TIMEOUT_MS,
    (validationSignal) =>
      fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: validationSignal,
      }),
    signal
  );

  const getContentType = getResponse.headers.get('content-type') || '';

  if (
    !getResponse.ok ||
    (!getContentType.startsWith('image/') &&
      getContentType !== 'application/octet-stream')
  ) {
    throw new Error(
      `Provider returned a non-image response (${getResponse.status} ${getContentType || 'unknown'})`
    );
  }

  return url;
};

const toModelPath = (model: string) =>
  model
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const buildDefaultHuggingFaceEndpoints = (model: string) => {
  const modelPath = toModelPath(model);

  return [
    `${HF_ROUTER_INFERENCE_BASE_URL}/${modelPath}`,
    `${HF_INFERENCE_BASE_URL}/${modelPath}`,
  ];
};

const normalizeHuggingFaceEndpoint = (
  configuredEndpoint: string | null,
  model: string
) => {
  const modelPath = toModelPath(model);

  if (!configuredEndpoint) {
    return `${HF_ROUTER_INFERENCE_BASE_URL}/${modelPath}`;
  }

  try {
    const parsedUrl = new URL(configuredEndpoint);
    const normalizedPath = parsedUrl.pathname.replace(/\/+$/, '');

    if (
      parsedUrl.hostname === 'huggingface.co' ||
      parsedUrl.hostname.endsWith('.huggingface.co')
    ) {
      parsedUrl.protocol = 'https:';
      parsedUrl.host = 'router.huggingface.co';
    }

    if (!normalizedPath || normalizedPath === '/') {
      parsedUrl.pathname = `/hf-inference/models/${modelPath}`;
      parsedUrl.search = '';
      return parsedUrl.toString();
    }

    if (normalizedPath === '/models') {
      parsedUrl.pathname = `/hf-inference/models/${modelPath}`;
      parsedUrl.search = '';
      return parsedUrl.toString();
    }

    if (normalizedPath.startsWith('/hf-inference/models/')) {
      parsedUrl.pathname = normalizedPath;
      return parsedUrl.toString();
    }

    if (normalizedPath.startsWith('/models/')) {
      parsedUrl.pathname = `/hf-inference${normalizedPath}`;
      return parsedUrl.toString();
    }

    parsedUrl.pathname = `/hf-inference/models/${modelPath}`;
    parsedUrl.search = '';
    return parsedUrl.toString();
  } catch {
    return `${HF_ROUTER_INFERENCE_BASE_URL}/${modelPath}`;
  }
};

const resolveFluxConfig = (): FluxConfig => {
  const apiKey = getOptionalEnv('HUGGINGFACE_API_KEY');

  if (!apiKey) {
    throw new Error('HUGGINGFACE_API_KEY is not configured');
  }

  const configuredEndpoint = getOptionalEnv('FLUX_API_ENDPOINT');
  const configuredStatusEndpoint = getOptionalEnv('FLUX_STATUS_ENDPOINT');
  const model =
    getOptionalEnv('FLUX_MODEL_ID') ||
    getOptionalEnv('FLUX_IMAGE_MODEL') ||
    DEFAULT_HF_FLUX_MODEL;
  const isHuggingFaceToken = apiKey.startsWith('hf_');
  const shouldUseHuggingFaceDefault =
    isHuggingFaceToken &&
    (!configuredEndpoint || configuredEndpoint === KNOWN_BFL_FLUX_ENDPOINT);
  const isExplicitHuggingFaceEndpoint = Boolean(
    configuredEndpoint && configuredEndpoint.includes('huggingface.co')
  );
  const normalizedHuggingFaceEndpoint = normalizeHuggingFaceEndpoint(
    configuredEndpoint,
    model
  );
  const endpointCandidates =
    shouldUseHuggingFaceDefault || isExplicitHuggingFaceEndpoint
      ? Array.from(
          new Set([
            normalizedHuggingFaceEndpoint,
            ...buildDefaultHuggingFaceEndpoints(model),
          ])
        )
      : [configuredEndpoint || KNOWN_BFL_FLUX_ENDPOINT];
  const endpoint =
    shouldUseHuggingFaceDefault || isExplicitHuggingFaceEndpoint
    ? normalizedHuggingFaceEndpoint
    : configuredEndpoint || KNOWN_BFL_FLUX_ENDPOINT;
  const mode: FluxApiMode = shouldUseHuggingFaceDefault
    ? 'huggingface'
    : endpoint.includes('huggingface.co')
    ? 'huggingface'
    : endpoint.includes('bfl.ai')
    ? 'bfl'
    : 'generic';

  return {
    apiKey,
    endpoint,
    endpointCandidates,
    mode,
    model,
    statusEndpoint: configuredStatusEndpoint,
  };
};

const getFluxHeaders = (config: FluxConfig): Record<string, string> => {
  if (config.mode === 'bfl') {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'x-key': config.apiKey,
    };
  }

  return {
    'Content-Type': 'application/json',
    Accept: 'image/png, application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };
};

const getPixazoHeaders = (): Record<string, string> => {
  const apiKey = getOptionalEnv('PIXAZO_API_KEY');

  if (!apiKey) {
    throw new Error('PIXAZO_API_KEY is not configured');
  }

  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Ocp-Apim-Subscription-Key': apiKey,
  };
};

const getAimlApiKey = () => getOptionalEnv('AIMLAPI_KEY');

const pollFluxStatusUrl = async (
  config: FluxConfig,
  statusUrl: string,
  deadlineAt: number
): Promise<string> => {
  for (let attempt = 0; attempt < FLUX_MAX_POLLS; attempt += 1) {
    await sleepWithinDeadline(deadlineAt, FLUX_POLL_INTERVAL_MS);

    const payload = await runWithDeadline(deadlineAt, async (signal) => {
      const response = await fetch(statusUrl, {
        method: 'GET',
        headers: getFluxHeaders(config),
        signal,
      });
      const nextPayload = await parseResponsePayload(response);

      if (!response.ok) {
        throw new Error(toErrorMessage(nextPayload, 'Flux status polling failed'));
      }

      return nextPayload;
    });

    const imageUrl = extractImageUrl(payload);

    if (imageUrl) {
      return validateRemoteImageUrl(imageUrl);
    }

    const statusValue =
      isRecord(payload) && typeof payload.status === 'string'
        ? payload.status.toLowerCase()
        : '';

    if (
      statusValue &&
      ['failed', 'error', 'cancelled', 'rejected'].includes(statusValue)
    ) {
      throw new Error(toErrorMessage(payload, 'Flux image generation failed'));
    }
  }

  throw new Error('Flux image generation timed out before returning an image');
};

const pollFluxRequest = async (
  config: FluxConfig,
  requestId: string,
  deadlineAt: number
): Promise<string> => {
  if (!config.statusEndpoint) {
    throw new Error('Flux did not return an image URL');
  }

  const statusEndpoint = config.statusEndpoint;
  const usesPathPlaceholder = statusEndpoint.includes('{id}');

  for (let attempt = 0; attempt < FLUX_MAX_POLLS; attempt += 1) {
    await sleepWithinDeadline(deadlineAt, FLUX_POLL_INTERVAL_MS);

    const payload = await runWithDeadline(deadlineAt, async (signal) => {
      const response = await fetch(
        usesPathPlaceholder
          ? statusEndpoint.replace('{id}', encodeURIComponent(requestId))
          : statusEndpoint,
        {
          method: usesPathPlaceholder ? 'GET' : 'POST',
          headers: getFluxHeaders(config),
          body: usesPathPlaceholder
            ? undefined
            : JSON.stringify({
                id: requestId,
                request_id: requestId,
              }),
          signal,
        }
      );
      const nextPayload = await parseResponsePayload(response);

      if (!response.ok) {
        throw new Error(toErrorMessage(nextPayload, 'Flux status polling failed'));
      }

      return nextPayload;
    });

    const imageUrl = extractImageUrl(payload);

    if (imageUrl) {
      return validateRemoteImageUrl(imageUrl);
    }

    const statusValue =
      isRecord(payload) && typeof payload.status === 'string'
        ? payload.status.toLowerCase()
        : '';

    if (
      statusValue &&
      ['failed', 'error', 'cancelled', 'rejected'].includes(statusValue)
    ) {
      throw new Error(toErrorMessage(payload, 'Flux image generation failed'));
    }
  }

  throw new Error('Flux image generation timed out before returning an image');
};

const generateWithCloudflareWorker = async (
  prompt: string,
  input: ResolvedGenerateImageInput
): Promise<string> => {
  if (input.sourceImageUrl) {
    throw new Error(
      'Cloudflare Worker image generation does not support source-image guided generation in this pipeline'
    );
  }

  const { endpoint, apiKey } = getCloudflareWorkerConfig();
  const workerPrompt = truncatePrompt(prompt, 2400);

  const payload = await withTimeout(CLOUDFLARE_WORKER_TIMEOUT_MS, async (signal) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: workerPrompt,
      }),
      signal,
    });

    const nextPayload = await parseResponsePayload(response);

    if (!response.ok) {
      throw new Error(
        toErrorMessage(nextPayload, 'Cloudflare Worker image generation failed')
      );
    }

    return nextPayload;
  });

  const imageUrl = extractImageUrl(payload);

  if (!imageUrl) {
    throw new Error('Cloudflare Worker did not return an image');
  }

  return validateRemoteImageUrl(imageUrl);
};

const generateWithHuggingFaceFlux = async (
  config: FluxConfig,
  prompt: string,
  input: ResolvedGenerateImageInput,
  deadlineAt: number
) => {
  if (input.sourceImageUrl) {
    throw new Error(
      'Flux Hugging Face inference does not support source-image guided generation in this pipeline'
    );
  }

  const huggingFaceModule = await loadHuggingFaceInferenceModule();
  const client = new huggingFaceModule.InferenceClient(config.apiKey);
  const width = normalizeDimension(input.width, 768);
  const height = normalizeDimension(input.height, 768);
  const negativePrompt = input.negativePrompt?.trim();

  console.info('[image-generation] flux huggingface client', {
    model: config.model,
  });

  const imageUrl = await runWithDeadline(deadlineAt, (signal) =>
    client.textToImage(
      {
        model: config.model,
        inputs: prompt,
        parameters: {
          num_inference_steps: 5,
          width,
          height,
          ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
        },
      },
      {
        signal,
        outputType: 'dataUrl',
      }
    )
  );

  return validateRemoteImageUrl(imageUrl);
};

const generateWithFlux = async (
  prompt: string,
  input: ResolvedGenerateImageInput
): Promise<string> => {
  const config = resolveFluxConfig();
  const deadlineAt = createDeadline(FLUX_TIMEOUT_MS);
  const fluxPrompt = truncatePrompt(prompt, 2400);
  const width = normalizeDimension(input.width, 768);
  const height = normalizeDimension(input.height, 768);

  if (config.mode === 'huggingface') {
    return generateWithHuggingFaceFlux(config, fluxPrompt, input, deadlineAt);
  }

  const requestBody = JSON.stringify(
    {
      prompt: fluxPrompt,
      width,
      height,
      ...(getOptionalEnv('FLUX_IMAGE_MODEL')
        ? { model: config.model }
        : {}),
      ...(input.sourceImageUrl
        ? {
            source_image_url: input.sourceImageUrl,
          }
        : {}),
    }
  );

  let payload: unknown = null;
  let lastError: Error | null = null;

  console.info('[image-generation] flux endpoint candidates', {
    endpoints: config.endpointCandidates,
  });

  for (const endpoint of config.endpointCandidates) {
    try {
      payload = await runWithDeadline(deadlineAt, async (signal) => {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: getFluxHeaders(config),
          body: requestBody,
          signal,
        });

        const nextPayload = await parseResponsePayload(response);

        if (!response.ok) {
          throw new Error(toErrorMessage(nextPayload, 'Flux image generation failed'));
        }

        return nextPayload;
      });
      break;
    } catch (error) {
      console.warn('[image-generation] flux endpoint failed', {
        endpoint,
        error: toErrorMessage(error, 'Flux image generation failed'),
      });
      lastError =
        error instanceof Error ? error : new Error('Flux image generation failed');
    }
  }

  if (!payload) {
    throw lastError || new Error('Flux image generation failed');
  }

  const imageUrl = extractImageUrl(payload);

  if (imageUrl) {
    return validateRemoteImageUrl(imageUrl);
  }

  const statusUrl = extractStatusUrl(payload);

  if (statusUrl) {
    return pollFluxStatusUrl(config, statusUrl, deadlineAt);
  }

  const requestId = extractRequestId(payload);

  if (requestId) {
    return pollFluxRequest(config, requestId, deadlineAt);
  }

  throw new Error(toErrorMessage(payload, 'Flux did not return an image URL'));
};

const generateWithPixazo = async (
  prompt: string,
  input: ResolvedGenerateImageInput,
  signal?: AbortSignal
): Promise<string> => {
  const deadlineAt = createDeadline(PIXAZO_TIMEOUT_MS);
  const pixazoPrompt = truncatePrompt(prompt, 2400);
  const width = normalizeDimension(input.width, 768);
  const height = normalizeDimension(input.height, 768);
  const seed = Date.now();
  const headers = getPixazoHeaders();

  throwIfRequestCancelled(signal, 'Image generation cancelled by user.');
  const initialPayload = await runWithDeadline(deadlineAt, async (providerSignal) => {
    const response = await fetch(PIXAZO_GENERATE_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: pixazoPrompt,
        num_steps: 4,
        width,
        height,
        seed,
        ...(input.sourceImageUrl ? { image_urls: [input.sourceImageUrl] } : {}),
      }),
      signal: providerSignal,
    });

    const nextPayload = await parseResponsePayload(response);

    if (!response.ok) {
      throw new Error(
        toErrorMessage(nextPayload, 'Pixazo text-to-image request failed')
      );
    }

    return nextPayload;
  }, signal);

  const immediateUrl = extractImageUrl(initialPayload);

  if (immediateUrl) {
    return validateRemoteImageUrlWithSignal(immediateUrl, signal);
  }

  const requestId = extractRequestId(initialPayload);

  if (!requestId) {
    throw new Error('Pixazo did not return a request ID for polling');
  }

  for (let attempt = 0; attempt < PIXAZO_MAX_POLLS; attempt += 1) {
    await sleepWithinDeadline(deadlineAt, PIXAZO_POLL_INTERVAL_MS, signal);

    const statusPayload = await runWithDeadline(deadlineAt, async (providerSignal) => {
      const response = await fetch(PIXAZO_STATUS_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          requestId,
          request_id: requestId,
        }),
        signal: providerSignal,
      });

      const nextPayload = await parseResponsePayload(response);

      if (!response.ok) {
        throw new Error(toErrorMessage(nextPayload, 'Pixazo status polling failed'));
      }

      return nextPayload;
    }, signal);

    const imageUrl = extractImageUrl(statusPayload);

    if (imageUrl) {
      return validateRemoteImageUrlWithSignal(imageUrl, signal);
    }

    const statusValue =
      isRecord(statusPayload) && typeof statusPayload.status === 'string'
        ? statusPayload.status.toLowerCase()
        : '';

    if (
      statusValue &&
      ['failed', 'error', 'cancelled', 'rejected'].includes(statusValue)
    ) {
      throw new Error(
        toErrorMessage(statusPayload, 'Pixazo image generation failed')
      );
    }
  }

  throw new Error('Pixazo image generation timed out before returning an image');
};

const generateWithAimlApi = async (
  prompt: string,
  input: ResolvedGenerateImageInput
): Promise<string> => {
  const apiKey = getAimlApiKey();

  if (!apiKey) {
    throw new Error('AIMLAPI_KEY is not configured');
  }

  const deadlineAt = createDeadline(AIMLAPI_TIMEOUT_MS);
  const aimlPrompt = truncatePrompt(prompt, 1900);
  const width = normalizeDimension(input.width, 768);
  const height = normalizeDimension(input.height, 768);
  const payload = await runWithDeadline(deadlineAt, async (signal) => {
    const response = await fetch(AIMLAPI_GENERATE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_AIMLAPI_MODEL,
        prompt: aimlPrompt,
        response_format: 'url',
        n: 1,
        image_size: {
          width,
          height,
        },
        ...(input.sourceImageUrl ? { image_urls: [input.sourceImageUrl] } : {}),
      }),
      signal,
    });

    const nextPayload = await parseResponsePayload(response);

    if (!response.ok) {
      throw new Error(
        toErrorMessage(nextPayload, 'AIML image generation request failed')
      );
    }

    return nextPayload;
  });

  const imageUrl = extractImageUrl(payload);

  if (!imageUrl) {
    throw new Error('AIML did not return an image URL');
  }

  return validateRemoteImageUrl(imageUrl);
};

const providers: ImageProvider[] = [
  {
    provider: 'pixazo',
    generate: generateWithPixazo,
  },
];

const tryProvider = async (
  provider: ImageProvider,
  prompt: string,
  input: ResolvedGenerateImageInput,
  signal?: AbortSignal,
  onProviderChange?: (
    provider: ImageGenerationProvider
  ) => void | Promise<void>
): Promise<ProviderAttemptResult> => {
  if (await isProviderCircuitOpen('image', provider.provider)) {
    const failure = classifyProviderFailure(
      provider.provider,
      `${provider.provider} temporarily skipped after repeated failures`
    );

    return {
      success: false,
      provider: provider.provider,
      failure,
    };
  }

  try {
    await onProviderChange?.(provider.provider);
    throwIfRequestCancelled(signal, 'Image generation cancelled by user.');
    const imageUrl = await provider.generate(prompt, input, signal);
    await recordProviderCircuitSuccess('image', provider.provider);

    return {
      success: true,
      provider: provider.provider,
      imageUrl,
    };
  } catch (error) {
    if (error instanceof RequestCancelledError) {
      throw error;
    }

    const failure = classifyProviderFailure(provider.provider, error);
    await recordProviderCircuitFailure('image', provider.provider);
    console.warn(`[image-generation] ${provider.provider} provider failed`, {
      code: failure.code,
      error: failure.message,
    });

    return {
      success: false,
      provider: provider.provider,
      failure,
    };
  }
};

export const generateProductImage = async (
  brandProfile: BrandProfile | null,
  input: ResolvedGenerateImageInput,
  options: {
    signal?: AbortSignal;
    onProviderChange?: (
      provider: ImageGenerationProvider
    ) => void | Promise<void>;
  } = {}
): Promise<GeneratedImageResult> => {
  const promptUsed = buildImagePrompt(brandProfile, input);
  const failures: ProviderFailure[] = [];
  const signal = options.signal;

  for (const provider of providers) {
    throwIfRequestCancelled(signal, 'Image generation cancelled by user.');
    const result = await tryProvider(
      provider,
      promptUsed,
      input,
      signal,
      options.onProviderChange
    );

    if (result.success) {
      return {
        imageUrl: result.imageUrl,
        provider: result.provider,
        promptUsed,
      };
    }

    failures.push(result.failure);
  }

  throw new ImageGenerationProvidersExhaustedError(failures);
};
