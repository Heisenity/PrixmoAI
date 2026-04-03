import type { SchedulerGeneratedMediaIntent } from '../types';

const SCHEDULER_GENERATED_MEDIA_STORAGE_KEY =
  'prixmoai.scheduler.generatedMediaIntent';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

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
    createdAt:
      typeof value.createdAt === 'string' && value.createdAt.trim()
        ? value.createdAt
        : new Date().toISOString(),
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
};

export const writeSchedulerGeneratedMediaIntent = (
  intent: SchedulerGeneratedMediaIntent
) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(
      SCHEDULER_GENERATED_MEDIA_STORAGE_KEY,
      JSON.stringify(intent)
    );
  } catch {
    // Ignore storage issues and rely on route state fallback.
  }
};

export const readSchedulerGeneratedMediaIntent = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  let stored: string | null = null;

  try {
    stored = window.sessionStorage.getItem(SCHEDULER_GENERATED_MEDIA_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!stored) {
    return null;
  }

  try {
    return parseSchedulerGeneratedMediaIntent(JSON.parse(stored));
  } catch {
    return null;
  }
};

export const clearSchedulerGeneratedMediaIntent = () => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(SCHEDULER_GENERATED_MEDIA_STORAGE_KEY);
  } catch {
    // Ignore storage issues.
  }
};
