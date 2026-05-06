import type {
  CaptionVariant,
  SchedulerAcceptedCaptionCarryover,
  SchedulerGeneratedMediaIntent,
} from '../types';

const SCHEDULER_GENERATED_MEDIA_STORAGE_KEY =
  'prixmoai.scheduler.generatedMediaIntent';
const SCHEDULER_ACCEPTED_CAPTION_STORAGE_KEY =
  'prixmoai.scheduler.acceptedCaptionCarryover';
const SCHEDULER_GENERATED_MEDIA_TTL_MS = 24 * 60 * 60 * 1000;

type TimedSchedulerStorage<T> = {
  value: T;
  savedAt: string;
  expiresAt: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readTimedStorage = <T>(
  storageKey: string,
  parser: (value: unknown) => T | null
): T | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as TimedSchedulerStorage<unknown> | unknown;
    const payload =
      isRecord(parsed) && 'value' in parsed ? (parsed as TimedSchedulerStorage<unknown>) : null;

    if (!payload || typeof payload.expiresAt !== 'string') {
      return parser(parsed);
    }

    if (new Date(payload.expiresAt).getTime() <= Date.now()) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    return parser(payload.value);
  } catch {
    return null;
  }
};

const writeTimedStorage = <T>(storageKey: string, value: T) => {
  if (typeof window === 'undefined') {
    return;
  }

  const now = Date.now();
  const payload: TimedSchedulerStorage<T> = {
    value,
    savedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SCHEDULER_GENERATED_MEDIA_TTL_MS).toISOString(),
  };

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Ignore storage issues and rely on route state fallback.
  }
};

const clearTimedStorage = (storageKey: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage issues.
  }
};

export const parseSchedulerGeneratedMediaIntent = (
  value: unknown
): SchedulerGeneratedMediaIntent | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.intentId !== 'string' ||
    typeof value.generatedImageId !== 'string' ||
    typeof value.mediaUrl !== 'string' ||
    typeof value.mediaType !== 'string'
  ) {
    return null;
  }

  if (value.mediaType !== 'image' && value.mediaType !== 'video') {
    return null;
  }

  return {
    intentId: value.intentId,
    generatedImageId: value.generatedImageId,
    contentId:
      typeof value.contentId === 'string' || value.contentId === null
        ? value.contentId
        : null,
    conversationId:
      typeof value.conversationId === 'string' || value.conversationId === null
        ? value.conversationId
        : null,
    mediaUrl: value.mediaUrl,
    mediaType: value.mediaType,
    prompt:
      typeof value.prompt === 'string' || value.prompt === null ? value.prompt : null,
    title:
      typeof value.title === 'string' || value.title === null ? value.title : null,
    caption:
      typeof value.caption === 'string' || value.caption === null
        ? value.caption
        : null,
    captionVariants: Array.isArray(value.captionVariants)
      ? value.captionVariants.filter(
          (entry): entry is CaptionVariant =>
            Boolean(entry) &&
            typeof entry === 'object' &&
            typeof (entry as { hook?: unknown }).hook === 'string' &&
            typeof (entry as { mainCopy?: unknown }).mainCopy === 'string' &&
            typeof (entry as { shortCaption?: unknown }).shortCaption === 'string' &&
            typeof (entry as { cta?: unknown }).cta === 'string'
        )
      : undefined,
    goal:
      typeof value.goal === 'string' || value.goal === null ? value.goal : null,
    tone:
      typeof value.tone === 'string' || value.tone === null ? value.tone : null,
    audience:
      typeof value.audience === 'string' || value.audience === null
        ? value.audience
        : null,
    keywords: Array.isArray(value.keywords)
      ? value.keywords.filter((entry): entry is string => typeof entry === 'string')
      : [],
    productName:
      typeof value.productName === 'string' || value.productName === null
        ? value.productName
        : null,
    productDescription:
      typeof value.productDescription === 'string' ||
      value.productDescription === null
        ? value.productDescription
        : null,
    platform:
      typeof value.platform === 'string' || value.platform === null
        ? value.platform
        : null,
    createdAt:
      typeof value.createdAt === 'string' && value.createdAt.trim()
        ? value.createdAt
        : new Date().toISOString(),
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
};

export const parseSchedulerAcceptedCaptionCarryover = (
  value: unknown
): SchedulerAcceptedCaptionCarryover | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.carryoverId !== 'string' ||
    typeof value.contentId !== 'string' ||
    typeof value.sourceKey !== 'string' ||
    typeof value.selectedVariantIndex !== 'number' ||
    typeof value.acceptedCaption !== 'string'
  ) {
    return null;
  }

  return {
    carryoverId: value.carryoverId,
    contentId: value.contentId,
    sourceKey: value.sourceKey,
    selectedVariantIndex: value.selectedVariantIndex,
    acceptedCaption: value.acceptedCaption,
    platform:
      typeof value.platform === 'string' || value.platform === null
        ? value.platform
        : null,
    productName:
      typeof value.productName === 'string' || value.productName === null
        ? value.productName
        : null,
    goal:
      typeof value.goal === 'string' || value.goal === null ? value.goal : null,
    tone:
      typeof value.tone === 'string' || value.tone === null ? value.tone : null,
    audience:
      typeof value.audience === 'string' || value.audience === null
        ? value.audience
        : null,
    acceptedFeedbackEventId:
      typeof value.acceptedFeedbackEventId === 'string' ||
      value.acceptedFeedbackEventId === null
        ? value.acceptedFeedbackEventId
        : null,
    captionVariants: Array.isArray(value.captionVariants)
      ? value.captionVariants.filter(
          (entry): entry is CaptionVariant =>
            Boolean(entry) &&
            typeof entry === 'object' &&
            typeof (entry as { hook?: unknown }).hook === 'string' &&
            typeof (entry as { mainCopy?: unknown }).mainCopy === 'string' &&
            typeof (entry as { shortCaption?: unknown }).shortCaption === 'string' &&
            typeof (entry as { cta?: unknown }).cta === 'string'
        )
      : undefined,
    createdAt:
      typeof value.createdAt === 'string' && value.createdAt.trim()
        ? value.createdAt
        : new Date().toISOString(),
  };
};

export const writeSchedulerGeneratedMediaIntent = (
  intent: SchedulerGeneratedMediaIntent
) => {
  writeTimedStorage(SCHEDULER_GENERATED_MEDIA_STORAGE_KEY, intent);
};

export const readSchedulerGeneratedMediaIntent = () =>
  readTimedStorage(
    SCHEDULER_GENERATED_MEDIA_STORAGE_KEY,
    parseSchedulerGeneratedMediaIntent
  );

export const clearSchedulerGeneratedMediaIntent = () => {
  clearTimedStorage(SCHEDULER_GENERATED_MEDIA_STORAGE_KEY);
};

export const writeSchedulerAcceptedCaptionCarryover = (
  carryover: SchedulerAcceptedCaptionCarryover
) => {
  writeTimedStorage(SCHEDULER_ACCEPTED_CAPTION_STORAGE_KEY, carryover);
};

export const readSchedulerAcceptedCaptionCarryover = () =>
  readTimedStorage(
    SCHEDULER_ACCEPTED_CAPTION_STORAGE_KEY,
    parseSchedulerAcceptedCaptionCarryover
  );

export const clearSchedulerAcceptedCaptionCarryover = () => {
  clearTimedStorage(SCHEDULER_ACCEPTED_CAPTION_STORAGE_KEY);
};
