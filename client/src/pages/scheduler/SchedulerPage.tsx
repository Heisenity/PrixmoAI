import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Facebook,
  Flag,
  FolderOpen,
  Info,
  ImagePlus,
  Instagram,
  Linkedin,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  Twitter,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BlackHoleCanvas } from '../../components/home/BlackHoleCanvas';
import { MediaThumbnail } from '../../components/scheduler/MediaThumbnail';
import { MediaPreview } from '../../components/scheduler/MediaPreview';
import { QueuePostItem } from '../../components/scheduler/QueuePostItem';
import { QueueStatusBadge } from '../../components/scheduler/QueueStatusBadge';
import { ScheduleModal } from '../../components/scheduler/ScheduleModal';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { useAuth } from '../../hooks/useAuth';
import { useScheduler } from '../../hooks/useScheduler';
import {
  fetchMediaBlob,
  getMediaDimensions,
  isInstagramVideoRatioSupported,
  prepareInstagramCompatibleImage,
} from '../../lib/instagramMedia';
import {
  clearSchedulerGeneratedMediaIntent,
  parseSchedulerGeneratedMediaIntent,
  readSchedulerGeneratedMediaIntent,
  writeSchedulerGeneratedMediaIntent,
} from '../../lib/schedulerGeneratedMedia';
import { cn, formatDateTime } from '../../lib/utils';
import type {
  MetaOAuthPopupResult,
  MediaAsset,
  PendingMetaFacebookPageSelection,
  ResolvedExternalMedia,
  ScheduleBatch,
  ScheduleBatchDetail,
  ScheduledItem,
  ScheduledItemStatus,
  ScheduledPost,
  ScheduledPostStatus,
  SchedulerGeneratedMediaIntent,
  SchedulerMediaType,
  SocialAccount,
  SocialPlatform,
} from '../../types';

const channelConnectOptions = [
  {
    platform: 'instagram' as const,
    title: 'Instagram',
    description: 'Professional account',
    helper: 'One click to connect a business or creator profile.',
  },
  {
    platform: 'facebook' as const,
    title: 'Facebook',
    description: 'Page connection',
    helper: 'Connect Pages you manage and keep them ready for scheduling.',
  },
] satisfies Array<{
  platform: Extract<SocialPlatform, 'instagram' | 'facebook'>;
  title: string;
  description: string;
  helper: string;
}>;

type ConnectModalStep = 'root' | 'instagram' | 'facebook';
type QueueTabId = 'scheduled' | 'published' | 'failed' | 'cancelled';

const instagramConnectionFeatures = [
  'Automatic posting for professional accounts',
  'Reconnect publishing permissions through Instagram directly',
  'The connected handle comes from the Instagram login you use',
  'Instagram can prompt you to upgrade to professional if needed',
];

const facebookConnectionFeatures = [
  'Use a Facebook-branded login flow just for Pages you manage',
  'Choose the exact Page you want to add after login',
  'Connect multiple Pages from the same Facebook account',
  'Groups stay manual because Meta no longer supports direct Group publishing',
];

const readMetadataValue = (
  metadata: Record<string, unknown>,
  key: string
): string | null => {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value : null;
};

const getAccountProfileUrl = (account: SocialAccount) =>
  account.profileUrl ||
  readMetadataValue(account.metadata, 'profileUrl') ||
  (account.platform === 'instagram'
    ? `https://instagram.com/${account.accountId}`
    : null);

const getPlatformLabel = (platform: SocialPlatform) => {
  if (platform === 'instagram') {
    return 'Instagram Professional Account';
  }

  if (platform === 'facebook') {
    return 'Facebook Page';
  }

  if (platform === 'linkedin') {
    return 'LinkedIn Profile';
  }

  return 'X Profile';
};

const getAccountDisplayName = (account: SocialAccount) =>
  account.accountName?.trim() || account.accountId;

const getAccountInitials = (account: SocialAccount) => {
  const source = getAccountDisplayName(account)
    .replace(/[@._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!source.length) {
    return 'CH';
  }

  return source
    .slice(0, 2)
    .map((segment) => segment.charAt(0).toUpperCase())
    .join('');
};

const getPlatformBadgeIcon = (platform: SocialPlatform) =>
  platform === 'instagram' ? (
    <Instagram size={15} />
  ) : platform === 'facebook' ? (
    <Facebook size={15} />
  ) : platform === 'linkedin' ? (
    <Linkedin size={15} />
  ) : (
    <Twitter size={15} />
  );

const QUEUE_ACTION_BUFFER_MS = 4_000;
const SCHEDULE_MIN_BUFFER_MS = 5_000;
const SCHEDULE_TIME_VALIDATION_MESSAGE = 'Please select a future date and time.';
const SCHEDULER_PLANNER_PERSISTENCE_TTL_MS = 6 * 60 * 60 * 1000;
const SCHEDULER_PLANNER_STORAGE_KEY_PREFIX = 'prixmoai.scheduler.planner.v1';

const queueTabs: Array<{
  id: QueueTabId;
  label: string;
  statuses: ScheduledPostStatus[];
}> = [
  {
    id: 'scheduled',
    label: 'Scheduled',
    statuses: ['pending', 'scheduled'],
  },
  {
    id: 'published',
    label: 'Published',
    statuses: ['published'],
  },
  {
    id: 'failed',
    label: 'Failed',
    statuses: ['failed'],
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    statuses: ['cancelled'],
  },
];

const toDateTimeLocalValue = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
};

const getMinimumScheduleDateTimeValue = (nowMs: number) =>
  toDateTimeLocalValue(new Date(nowMs + SCHEDULE_MIN_BUFFER_MS).toISOString());

const isSchedulableDateTimeValue = (value: string, nowMs: number) => {
  const scheduledAtMs = new Date(value).getTime();

  return Number.isFinite(scheduledAtMs) && scheduledAtMs > nowMs + SCHEDULE_MIN_BUFFER_MS;
};

const isCompleteDateTimeLocalValue = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);

const getScheduleDateTimeValidationMessage = (value: string, nowMs: number) => {
  if (!value || !isCompleteDateTimeLocalValue(value)) {
    return SCHEDULE_TIME_VALIDATION_MESSAGE;
  }

  return isSchedulableDateTimeValue(value, nowMs)
    ? null
    : SCHEDULE_TIME_VALIDATION_MESSAGE;
};

const getQueuePostTitle = (post: ScheduledPost) => {
  const firstLine = post.caption
    ?.split('\n')
    .map((segment) => segment.trim())
    .find(Boolean);

  return firstLine || 'Untitled post';
};

const isManagedMediaUrl = (value: string) =>
  value.includes('/storage/v1/object/public/');

const inferMediaTypeFromUrl = (value: string): SchedulerMediaType | null => {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (
    normalized.includes('.mp4') ||
    normalized.includes('.mov') ||
    normalized.includes('video/')
  ) {
    return 'video';
  }

  if (
    normalized.includes('.jpg') ||
    normalized.includes('.jpeg') ||
    normalized.includes('.png') ||
    normalized.includes('.webp') ||
    normalized.includes('image/')
  ) {
    return 'image';
  }

  return null;
};

const inferMediaTypeFromMimeType = (value: string | null | undefined): SchedulerMediaType | null => {
  const normalized = (value || '').trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('video/')) {
    return 'video';
  }

  if (normalized.startsWith('image/')) {
    return 'image';
  }

  return null;
};

const isPublicHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

const inferFileNameFromUrl = (value: string) => {
  try {
    const url = new URL(value);
    const lastSegment = url.pathname.split('/').filter(Boolean).pop();

    if (lastSegment?.trim()) {
      return decodeURIComponent(lastSegment);
    }
  } catch {
    // Ignore malformed URLs and fall back to a generic label.
  }

  return 'Imported media';
};

const buildResolvedMediaPreview = (
  sourceUrl: string,
  mediaType: SchedulerMediaType
): ResolvedExternalMedia => ({
  sourceUrl,
  resolvedUrl: sourceUrl,
  mediaType,
  contentType: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
  wasExtracted: false,
});

type SchedulerLocationState = {
  generatedMediaIntent?: SchedulerGeneratedMediaIntent | null;
};

type PersistedSchedulerPlannerState = {
  ownerUserId: string;
  savedAt: string;
  expiresAt: string;
  batchName: string;
  activeBatchId: string | null;
  isPlannerDirty: boolean;
  plannerAssets: PlannerAsset[];
};

type PlannerSlot = {
  id: string;
  socialAccountId: string;
  scheduledAt: string;
  status: ScheduledItemStatus;
  itemId: string | null;
  lastError: string | null;
};

type PlannerAsset = {
  id: string;
  dedupeKey: string;
  mediaAssetId: string;
  sourceType: 'upload' | 'generated' | 'url';
  mediaType: SchedulerMediaType;
  storageUrl: string;
  originalUrl: string | null;
  thumbnailUrl: string | null;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  contentId: string | null;
  generatedImageId: string | null;
  title: string | null;
  prompt: string | null;
  caption: string;
  instagramValidationMessage: string | null;
  instagramAdjusted: boolean;
  instagramUnsupportedVideo: boolean;
  isPreviewOpen: boolean;
  slots: PlannerSlot[];
};

type SchedulerToastType = 'success' | 'error' | 'info' | 'warning';

type SchedulerToast = {
  id: string;
  type: SchedulerToastType;
  title: string;
  message: string;
  isExiting: boolean;
};

const createLocalPlannerId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `planner-${Math.random().toString(36).slice(2, 10)}`;
};

const RECENT_TOAST_DEDUPE_WINDOW_MS = 1_500;

const schedulerGeneratedIntentProcessingIds = new Set<string>();
const schedulerGeneratedIntentHandledIds = new Set<string>();

const logSchedulerDebug = (
  event: string,
  payload?: Record<string, unknown>
) => {
  if (!import.meta.env.DEV) {
    return;
  }

  console.info('[scheduler-debug]', event, payload ?? {});
};

const buildUploadFileDedupeKey = (file: File) =>
  `upload:${file.name}:${file.size}:${file.lastModified}:${file.type}`;

const buildUrlDedupeKey = (value: string) => `url:${value.trim().toLowerCase()}`;

const buildGeneratedIntentDedupeKey = (intent: SchedulerGeneratedMediaIntent) =>
  `generated:${intent.generatedImageId}:${intent.mediaUrl}`;

const derivePlannerAssetDedupeKey = (mediaAsset: MediaAsset) => {
  if (mediaAsset.sourceType === 'generated') {
    return `generated:${mediaAsset.generatedImageId ?? mediaAsset.storageUrl}`;
  }

  if (mediaAsset.sourceType === 'url') {
    return buildUrlDedupeKey(mediaAsset.originalUrl ?? mediaAsset.storageUrl);
  }

  return `upload:${mediaAsset.filename ?? mediaAsset.storageUrl}:${mediaAsset.sizeBytes ?? 0}:${mediaAsset.mimeType ?? ''}`;
};

const getSchedulerPlannerStorageKey = (userId: string) =>
  `${SCHEDULER_PLANNER_STORAGE_KEY_PREFIX}:${userId}`;

const readPersistedSchedulerPlannerState = (
  userId: string
): PersistedSchedulerPlannerState | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getSchedulerPlannerStorageKey(userId));

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as PersistedSchedulerPlannerState | null;

    if (
      !parsed ||
      parsed.ownerUserId !== userId ||
      typeof parsed.savedAt !== 'string' ||
      typeof parsed.expiresAt !== 'string' ||
      typeof parsed.batchName !== 'string' ||
      !Array.isArray(parsed.plannerAssets)
    ) {
      window.localStorage.removeItem(getSchedulerPlannerStorageKey(userId));
      return null;
    }

    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      window.localStorage.removeItem(getSchedulerPlannerStorageKey(userId));
      return null;
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(getSchedulerPlannerStorageKey(userId));
    return null;
  }
};

const writePersistedSchedulerPlannerState = (
  userId: string,
  state: Omit<PersistedSchedulerPlannerState, 'ownerUserId' | 'savedAt' | 'expiresAt'>
) => {
  if (typeof window === 'undefined') {
    return;
  }

  const now = Date.now();
  const payload: PersistedSchedulerPlannerState = {
    ownerUserId: userId,
    savedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SCHEDULER_PLANNER_PERSISTENCE_TTL_MS).toISOString(),
    ...state,
  };

  window.localStorage.setItem(
    getSchedulerPlannerStorageKey(userId),
    JSON.stringify(payload)
  );
};

const clearPersistedSchedulerPlannerState = (userId: string | null | undefined) => {
  if (typeof window === 'undefined' || !userId) {
    return;
  }

  window.localStorage.removeItem(getSchedulerPlannerStorageKey(userId));
};

const buildPlannerSlot = (
  scheduledAt: string,
  socialAccountId = ''
): PlannerSlot => ({
  id: createLocalPlannerId(),
  socialAccountId,
  scheduledAt,
  status: 'pending',
  itemId: null,
  lastError: null,
});

const readPlannerAssetInstagramMetadata = (metadata: Record<string, unknown>) => {
  const instagramRecord =
    metadata.instagramPreparation &&
    typeof metadata.instagramPreparation === 'object' &&
    !Array.isArray(metadata.instagramPreparation)
      ? (metadata.instagramPreparation as Record<string, unknown>)
      : null;

  return {
    instagramValidationMessage:
      instagramRecord && typeof instagramRecord.warning === 'string'
        ? instagramRecord.warning
        : null,
    instagramAdjusted:
      instagramRecord?.adjusted === true || instagramRecord?.status === 'adjusted',
    instagramUnsupportedVideo: instagramRecord?.status === 'unsupported_video',
  };
};

const buildPlannerAssetFromMediaAsset = ({
  mediaAsset,
  caption,
  prompt,
  title,
  scheduledAt,
  defaultSocialAccountId,
  dedupeKey,
}: {
  mediaAsset: MediaAsset;
  caption?: string | null;
  prompt?: string | null;
  title?: string | null;
  scheduledAt: string;
  defaultSocialAccountId?: string;
  dedupeKey?: string;
}): PlannerAsset => ({
  ...readPlannerAssetInstagramMetadata(mediaAsset.metadata),
  id: createLocalPlannerId(),
  dedupeKey: dedupeKey ?? derivePlannerAssetDedupeKey(mediaAsset),
  mediaAssetId: mediaAsset.id,
  sourceType: mediaAsset.sourceType,
  mediaType: mediaAsset.mediaType,
  storageUrl: mediaAsset.storageUrl,
  originalUrl: mediaAsset.originalUrl,
  thumbnailUrl: mediaAsset.thumbnailUrl,
  filename: mediaAsset.filename,
  mimeType: mediaAsset.mimeType,
  sizeBytes: mediaAsset.sizeBytes,
  width: mediaAsset.width,
  height: mediaAsset.height,
  aspectRatio:
    mediaAsset.width && mediaAsset.height ? mediaAsset.width / mediaAsset.height : null,
  contentId: mediaAsset.contentId,
  generatedImageId: mediaAsset.generatedImageId,
  title: title ?? mediaAsset.filename ?? null,
  prompt: prompt ?? null,
  caption: caption ?? '',
  isPreviewOpen: false,
  slots: [buildPlannerSlot(scheduledAt, defaultSocialAccountId)],
});

export const SchedulerPage = () => {
  const location = useLocation();
  const { user } = useAuth();
  const scheduler = useScheduler();
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [connectModalStep, setConnectModalStep] = useState<ConnectModalStep>('root');
  const [pendingFacebookSelection, setPendingFacebookSelection] =
    useState<PendingMetaFacebookPageSelection | null>(null);
  const [selectedPendingFacebookPageIds, setSelectedPendingFacebookPageIds] = useState<
    string[]
  >([]);
  const [isLoadingPendingFacebookPages, setIsLoadingPendingFacebookPages] =
    useState(false);
  const [activeQueueTab, setActiveQueueTab] = useState<QueueTabId>('scheduled');
  const [disconnectTarget, setDisconnectTarget] = useState<SocialAccount | null>(null);
  const [disconnectValue, setDisconnectValue] = useState('');
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [cancelPostTarget, setCancelPostTarget] = useState<ScheduledPost | null>(null);
  const defaultDateTime = useMemo(() => {
    const next = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const tzOffset = next.getTimezoneOffset() * 60000;
    return new Date(next.getTime() - tzOffset).toISOString().slice(0, 16);
  }, []);
  const [batchName, setBatchName] = useState('');
  const [plannerAssets, setPlannerAssets] = useState<PlannerAsset[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [isPlannerDirty, setIsPlannerDirty] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const [isMediaDragActive, setIsMediaDragActive] = useState(false);
  const [mediaUrlInputValue, setMediaUrlInputValue] = useState('');
  const [resolvedMediaPreview, setResolvedMediaPreview] =
    useState<ResolvedExternalMedia | null>(null);
  const [mediaUrlValidationMessage, setMediaUrlValidationMessage] =
    useState<string | null>(null);
  const [isResolvingMediaUrl, setIsResolvingMediaUrl] = useState(false);
  const [isImportingMediaUrl, setIsImportingMediaUrl] = useState(false);
  const [draftTrayOpen, setDraftTrayOpen] = useState(false);
  const [draftBatches, setDraftBatches] = useState<ScheduleBatch[]>([]);
  const [draftBatchesError, setDraftBatchesError] = useState<string | null>(null);
  const [isLoadingDraftBatches, setIsLoadingDraftBatches] = useState(false);
  const [loadingDraftBatchId, setLoadingDraftBatchId] = useState<string | null>(null);
  const [deletingDraftBatchId, setDeletingDraftBatchId] = useState<string | null>(null);
  const [plannerToast, setPlannerToast] = useState<string | null>(null);
  const [schedulerToasts, setSchedulerToasts] = useState<SchedulerToast[]>([]);
  const [liveNow, setLiveNow] = useState(() => Date.now());
  const [pendingGeneratedMediaIntent, setPendingGeneratedMediaIntent] =
    useState<SchedulerGeneratedMediaIntent | null>(null);
  const [appliedGeneratedMediaIntentId, setAppliedGeneratedMediaIntentId] =
    useState<string | null>(null);
  const [dismissedGeneratedMediaIntentId, setDismissedGeneratedMediaIntentId] =
    useState<string | null>(null);
  const mediaUrlResolveRequestId = useRef(0);
  const activeMediaUrlImportRef = useRef<string | null>(null);
  const hasLoadedDraftsRef = useRef(false);
  const plannerAssetKeysRef = useRef<Set<string>>(new Set());
  const activePlannerImportKeysRef = useRef<Set<string>>(new Set());
  const recentToastTimestampsRef = useRef<Record<string, number>>({});
  const generatedIntentEffectRunsRef = useRef(0);
  const hasHydratedPersistedPlannerRef = useRef(false);
  const hydratedPlannerUserIdRef = useRef<string | null>(null);
  const schedulerToastTimersRef = useRef<
    Record<string, { exitTimer: number; removeTimer: number }>
  >({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const metaStatus = params.get('meta_oauth');
    const message = params.get('message');
    const selectionId = params.get('selection_id');

    if (!metaStatus) {
      return;
    }

    const clearOAuthParams = () => {
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    if (metaStatus === 'select_facebook_pages' && selectionId) {
      void openPendingFacebookSelection(selectionId).finally(() => {
        clearOAuthParams();
      });

      return;
    }

    if (metaStatus === 'error') {
      setOauthError(message || 'Meta verification did not finish.');
      setOauthNotice(null);
    } else {
      setOauthError(null);
      setOauthNotice(message || 'Channel connected successfully.');
      void scheduler.refresh();
    }

    setConnectModalOpen(false);
    setConnectModalStep('root');
    clearOAuthParams();
  }, [scheduler]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLiveNow(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const nextUserId = user?.id ?? null;

    if (hydratedPlannerUserIdRef.current !== nextUserId) {
      hydratedPlannerUserIdRef.current = nextUserId;
      hasHydratedPersistedPlannerRef.current = false;
    }
  }, [user?.id]);

  useEffect(() => {
    plannerAssetKeysRef.current = new Set(plannerAssets.map((asset) => asset.dedupeKey));
  }, [plannerAssets]);

  useEffect(() => {
    if (!user?.id || hasHydratedPersistedPlannerRef.current) {
      return;
    }

    const routeState = (location.state as SchedulerLocationState | null) ?? null;
    const routeIntent = parseSchedulerGeneratedMediaIntent(routeState?.generatedMediaIntent);
    const storedGeneratedIntent = readSchedulerGeneratedMediaIntent();

    if (routeIntent || storedGeneratedIntent) {
      hasHydratedPersistedPlannerRef.current = true;
      return;
    }

    const persistedPlanner = readPersistedSchedulerPlannerState(user.id);
    hasHydratedPersistedPlannerRef.current = true;

    if (!persistedPlanner) {
      return;
    }

    setBatchName(persistedPlanner.batchName);
    setPlannerAssets(
      persistedPlanner.plannerAssets.map((asset) => ({
        ...asset,
        isPreviewOpen: false,
      }))
    );
    setActiveBatchId(persistedPlanner.activeBatchId);
    setIsPlannerDirty(persistedPlanner.isPlannerDirty);
    setComposerError(null);
    setComposerNotice(null);
    logSchedulerDebug('planner restored from local persistence', {
      userId: user.id,
      assetCount: persistedPlanner.plannerAssets.length,
      activeBatchId: persistedPlanner.activeBatchId,
      expiresAt: persistedPlanner.expiresAt,
    });
    setPlannerToast('Recovered your scheduler media from this browser.');
  }, [location.state, user?.id]);

  useEffect(() => {
    if (!user?.id || !hasHydratedPersistedPlannerRef.current) {
      return;
    }

    if (!plannerAssets.length && !batchName.trim() && !activeBatchId) {
      clearPersistedSchedulerPlannerState(user.id);
      return;
    }

    writePersistedSchedulerPlannerState(user.id, {
      batchName,
      plannerAssets,
      activeBatchId,
      isPlannerDirty,
    });
  }, [activeBatchId, batchName, isPlannerDirty, plannerAssets, user?.id]);

  const removeSchedulerToast = useCallback((toastId: string) => {
    const timers = schedulerToastTimersRef.current[toastId];

    if (timers) {
      window.clearTimeout(timers.exitTimer);
      window.clearTimeout(timers.removeTimer);
      delete schedulerToastTimersRef.current[toastId];
    }

    setSchedulerToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, []);

  const dismissSchedulerToast = useCallback(
    (toastId: string) => {
      const timers = schedulerToastTimersRef.current[toastId];

      if (timers) {
        window.clearTimeout(timers.exitTimer);
        window.clearTimeout(timers.removeTimer);
        delete schedulerToastTimersRef.current[toastId];
      }

      setSchedulerToasts((current) =>
        current.map((toast) =>
          toast.id === toastId ? { ...toast, isExiting: true } : toast
        )
      );

      const removeTimer = window.setTimeout(() => {
        removeSchedulerToast(toastId);
      }, 300);

      schedulerToastTimersRef.current[toastId] = {
        exitTimer: 0,
        removeTimer,
      };
    },
    [removeSchedulerToast]
  );

  const pushSchedulerToast = useCallback(
    ({
      type,
      title,
      message,
    }: {
      type: SchedulerToastType;
      title: string;
      message: string;
    }) => {
      const signature = `${type}:${title}:${message}`;
      const now = Date.now();
      const previousTimestamp = recentToastTimestampsRef.current[signature];

      if (
        previousTimestamp &&
        now - previousTimestamp < RECENT_TOAST_DEDUPE_WINDOW_MS
      ) {
        logSchedulerDebug('toast skipped as duplicate', {
          signature,
        });
        return;
      }

      recentToastTimestampsRef.current[signature] = now;

      const toastId = createLocalPlannerId();

      setSchedulerToasts((current) => [
        ...current,
        {
          id: toastId,
          type,
          title,
          message,
          isExiting: false,
        },
      ]);

      const exitTimer = window.setTimeout(() => {
        setSchedulerToasts((current) =>
          current.map((toast) =>
            toast.id === toastId ? { ...toast, isExiting: true } : toast
          )
        );
      }, 9700);

      const removeTimer = window.setTimeout(() => {
        removeSchedulerToast(toastId);
      }, 10000);

      schedulerToastTimersRef.current[toastId] = {
        exitTimer,
        removeTimer,
      };
    },
    [removeSchedulerToast]
  );

  useEffect(
    () => () => {
      Object.values(schedulerToastTimersRef.current).forEach((timers) => {
        window.clearTimeout(timers.exitTimer);
        window.clearTimeout(timers.removeTimer);
      });
      schedulerToastTimersRef.current = {};
    },
    []
  );

  useEffect(() => {
    if (!plannerToast) {
      return;
    }

    pushSchedulerToast({
      type: 'success',
      title: 'Planner updated',
      message: plannerToast,
    });
    setPlannerToast(null);
  }, [plannerToast, pushSchedulerToast]);

  useEffect(() => {
    if (!composerNotice) {
      return;
    }

    pushSchedulerToast({
      type: 'success',
      title: 'Scheduler updated',
      message: composerNotice,
    });
    setComposerNotice(null);
  }, [composerNotice, pushSchedulerToast]);

  useEffect(() => {
    if (!composerError) {
      return;
    }

    pushSchedulerToast({
      type: 'error',
      title: 'Action failed',
      message: composerError,
    });
    setComposerError(null);
  }, [composerError, pushSchedulerToast]);

  useEffect(() => {
    if (!oauthNotice) {
      return;
    }

    pushSchedulerToast({
      type: 'success',
      title: 'Connection updated',
      message: oauthNotice,
    });
    setOauthNotice(null);
  }, [oauthNotice, pushSchedulerToast]);

  useEffect(() => {
    if (!oauthError) {
      return;
    }

    pushSchedulerToast({
      type: 'error',
      title: 'Connection failed',
      message: oauthError,
    });
    setOauthError(null);
  }, [oauthError, pushSchedulerToast]);

  const connectedAccounts = scheduler.accounts?.items ?? [];
  const queuedPosts = scheduler.posts?.items ?? [];
  const markPlannerDirty = useCallback(() => {
    setIsPlannerDirty(true);
  }, []);

  const createPreparedPlannerMediaAsset = useCallback(
    async ({
      sourceType,
      file,
      sourceUrl,
      fallbackFileName,
      contentId,
      generatedImageId,
      title,
      prompt,
      metadata,
    }: {
      sourceType: 'upload' | 'generated' | 'url';
      file?: File;
      sourceUrl?: string | null;
      fallbackFileName: string;
      contentId?: string | null;
      generatedImageId?: string | null;
      title?: string | null;
      prompt?: string | null;
      metadata?: Record<string, unknown>;
    }) => {
      let uploaded:
        | {
            sourceImageUrl: string;
            mediaType: SchedulerMediaType;
            contentType: string;
          }
        | null = null;
      let mediaBlob: Blob | null = null;
      let mediaType: SchedulerMediaType | null = null;
      let mimeType: string | null = null;
      let fileName = fallbackFileName;

      if (file) {
        mediaBlob = file;
        mediaType = inferMediaTypeFromMimeType(file.type);
        mimeType = file.type || null;
        fileName = file.name || fallbackFileName;
      } else if (sourceUrl?.trim()) {
        uploaded = await scheduler.importExternalMediaUrl(sourceUrl.trim(), {
          surfaceGlobalError: false,
        });
        mediaBlob = await fetchMediaBlob(uploaded.sourceImageUrl);
        mediaType = uploaded.mediaType;
        mimeType = uploaded.contentType;
      }

      if (!mediaBlob || !mediaType) {
        throw new Error('PrixmoAI could not prepare that media asset.');
      }

      const dimensions = await getMediaDimensions(mediaBlob, mediaType);
      let finalUpload = uploaded;
      let finalWidth = dimensions.width;
      let finalHeight = dimensions.height;
      let finalAspectRatio = dimensions.aspectRatio;
      let finalMimeType = mimeType;
      let instagramPreparation:
        | {
            status: 'compatible' | 'adjusted' | 'unsupported_video';
            warning: string | null;
            adjusted: boolean;
            mode: 'fit' | null;
            originalWidth: number;
            originalHeight: number;
            originalAspectRatio: number;
            processedWidth: number;
            processedHeight: number;
            processedAspectRatio: number;
          }
        | undefined;

      if (mediaType === 'image') {
        const prepared = await prepareInstagramCompatibleImage(
          mediaBlob,
          fileName,
          mimeType || 'image/jpeg'
        );

        if (prepared.adjusted) {
          finalUpload = await scheduler.uploadPostMedia(prepared.file, {
            surfaceGlobalError: false,
          });
          finalWidth = prepared.width;
          finalHeight = prepared.height;
          finalAspectRatio = prepared.aspectRatio;
          finalMimeType = finalUpload.contentType;
          fileName = prepared.file.name;
          instagramPreparation = {
            status: 'adjusted',
            warning: prepared.warning,
            adjusted: true,
            mode: prepared.adjustmentMode,
            originalWidth: prepared.originalWidth,
            originalHeight: prepared.originalHeight,
            originalAspectRatio: prepared.originalAspectRatio,
            processedWidth: prepared.width,
            processedHeight: prepared.height,
            processedAspectRatio: prepared.aspectRatio,
          };
        } else {
          if (!finalUpload) {
            finalUpload = await scheduler.uploadPostMedia(prepared.file, {
              surfaceGlobalError: false,
            });
          }

          finalMimeType = finalUpload.contentType;
          instagramPreparation = {
            status: 'compatible',
            warning: null,
            adjusted: false,
            mode: null,
            originalWidth: prepared.originalWidth,
            originalHeight: prepared.originalHeight,
            originalAspectRatio: prepared.originalAspectRatio,
            processedWidth: prepared.width,
            processedHeight: prepared.height,
            processedAspectRatio: prepared.aspectRatio,
          };
        }
      } else {
        if (!finalUpload) {
          finalUpload = await scheduler.uploadPostMedia(
            new File([mediaBlob], fileName, {
              type: mimeType || 'video/mp4',
            }),
            {
              surfaceGlobalError: false,
            }
          );
        }

        finalMimeType = finalUpload.contentType;

        const videoSupport = isInstagramVideoRatioSupported(
          dimensions.width,
          dimensions.height
        );
        instagramPreparation = {
          status: videoSupport.valid ? 'compatible' : 'unsupported_video',
          warning:
            videoSupport.message ??
            'Instagram can publish this video without aspect-ratio adjustment.',
          adjusted: false,
          mode: null,
          originalWidth: dimensions.width,
          originalHeight: dimensions.height,
          originalAspectRatio: dimensions.aspectRatio,
          processedWidth: dimensions.width,
          processedHeight: dimensions.height,
          processedAspectRatio: dimensions.aspectRatio,
        };
      }

      const mediaAsset = await scheduler.createMediaAssetRecord({
        sourceType,
        mediaType,
        originalUrl: sourceUrl?.trim() || null,
        storageUrl: finalUpload.sourceImageUrl,
        thumbnailUrl: mediaType === 'image' ? finalUpload.sourceImageUrl : null,
        filename: title ?? fileName,
        mimeType: finalMimeType,
        sizeBytes: file ? file.size : mediaBlob.size,
        width: finalWidth,
        height: finalHeight,
        durationSeconds: dimensions.durationSeconds,
        contentId: contentId ?? null,
        generatedImageId: generatedImageId ?? null,
        metadata: {
          ...(metadata ?? {}),
          prompt,
          instagramPreparation,
        },
      });

      return mediaAsset;
    },
    [scheduler]
  );

  const applyGeneratedMediaIntent = useCallback(
    async (
      intent: SchedulerGeneratedMediaIntent,
      notice: string,
      mode: 'append' | 'replace' = 'append'
    ) => {
      const dedupeKey = buildGeneratedIntentDedupeKey(intent);

      if (schedulerGeneratedIntentHandledIds.has(intent.intentId)) {
        logSchedulerDebug('generated media skipped because intent already handled', {
          intentId: intent.intentId,
          dedupeKey,
        });
        return;
      }

      if (schedulerGeneratedIntentProcessingIds.has(intent.intentId)) {
        logSchedulerDebug('generated media skipped because intent is already processing', {
          intentId: intent.intentId,
          dedupeKey,
        });
        return;
      }

      if (
        mode === 'append' &&
        (plannerAssetKeysRef.current.has(dedupeKey) ||
          activePlannerImportKeysRef.current.has(dedupeKey))
      ) {
        logSchedulerDebug('generated media skipped as duplicate', {
          intentId: intent.intentId,
          dedupeKey,
        });
        schedulerGeneratedIntentHandledIds.add(intent.intentId);
        clearSchedulerGeneratedMediaIntent();
        setAppliedGeneratedMediaIntentId(intent.intentId);
        setPendingGeneratedMediaIntent(null);
        return;
      }

      schedulerGeneratedIntentProcessingIds.add(intent.intentId);
      activePlannerImportKeysRef.current.add(dedupeKey);
      logSchedulerDebug('generated media upload started', {
        intentId: intent.intentId,
        dedupeKey,
        mode,
      });

      const availableAccounts = scheduler.accounts?.items ?? [];
      try {
        const mediaAsset = await createPreparedPlannerMediaAsset({
          sourceType: 'generated',
          sourceUrl: intent.mediaUrl,
          fallbackFileName: intent.title ?? 'generated-media',
          title: intent.title ?? 'Generated media',
          prompt: intent.prompt,
          contentId: intent.contentId,
          generatedImageId: intent.generatedImageId,
          metadata: {
            conversationId: intent.conversationId,
            ...(intent.metadata ?? {}),
          },
        });

        logSchedulerDebug('generated media upload succeeded', {
          intentId: intent.intentId,
          dedupeKey,
          mediaAssetId: mediaAsset.id,
        });

        const nextAsset = buildPlannerAssetFromMediaAsset({
          mediaAsset,
          caption: intent.caption,
          prompt: intent.prompt,
          title: intent.title ?? 'Generated media',
          scheduledAt: defaultDateTime,
          defaultSocialAccountId: availableAccounts[0]?.id,
          dedupeKey,
        });

        logSchedulerDebug('schedule row created', {
          mediaAssetId: mediaAsset.id,
          dedupeKey,
          slotCount: nextAsset.slots.length,
          sourceType: 'generated',
        });

        setComposerError(null);
        setComposerNotice(notice);
        setPlannerAssets((current) =>
          mode === 'replace' ? [nextAsset] : [...current, nextAsset]
        );
        setPendingGeneratedMediaIntent(null);
        setAppliedGeneratedMediaIntentId(intent.intentId);
        setDismissedGeneratedMediaIntentId(null);
        setIsPlannerDirty(true);
        setActiveBatchId(null);
        clearSchedulerGeneratedMediaIntent();
        schedulerGeneratedIntentHandledIds.add(intent.intentId);
      } catch (generatedError) {
        logSchedulerDebug('generated media apply failed', {
          intentId: intent.intentId,
          dedupeKey,
          message:
            generatedError instanceof Error
              ? generatedError.message
              : 'Unknown generated media error',
        });
        setComposerNotice(null);
        setComposerError(
          generatedError instanceof Error
            ? generatedError.message
            : 'Failed to add generated media to the batch.'
        );
      } finally {
        activePlannerImportKeysRef.current.delete(dedupeKey);
        schedulerGeneratedIntentProcessingIds.delete(intent.intentId);
      }
    },
    [createPreparedPlannerMediaAsset, defaultDateTime, scheduler.accounts?.items]
  );

  useEffect(() => {
    const routeState = (location.state as SchedulerLocationState | null) ?? null;
    const routeIntent = parseSchedulerGeneratedMediaIntent(
      routeState?.generatedMediaIntent
    );
    const storedIntent = readSchedulerGeneratedMediaIntent();
    const nextIntent = routeIntent ?? storedIntent;

    generatedIntentEffectRunsRef.current += 1;

    if (!nextIntent) {
      return;
    }

    logSchedulerDebug('generated media effect re-ran', {
      run: generatedIntentEffectRunsRef.current,
      intentId: nextIntent.intentId,
      plannerAssetCount: plannerAssets.length,
      appliedIntentId: appliedGeneratedMediaIntentId,
      dismissedIntentId: dismissedGeneratedMediaIntentId,
      pendingIntentId: pendingGeneratedMediaIntent?.intentId ?? null,
      isProcessing: schedulerGeneratedIntentProcessingIds.has(nextIntent.intentId),
      isHandled: schedulerGeneratedIntentHandledIds.has(nextIntent.intentId),
      locationKey: location.key,
    });

    if (
      nextIntent.intentId === appliedGeneratedMediaIntentId ||
      nextIntent.intentId === dismissedGeneratedMediaIntentId ||
      nextIntent.intentId === pendingGeneratedMediaIntent?.intentId ||
      schedulerGeneratedIntentProcessingIds.has(nextIntent.intentId) ||
      schedulerGeneratedIntentHandledIds.has(nextIntent.intentId)
    ) {
      return;
    }

    if (plannerAssets.length) {
      setPendingGeneratedMediaIntent(nextIntent);
      return;
    }

    void applyGeneratedMediaIntent(
      nextIntent,
      'Generated image added to the batch from Generate.'
    );
  }, [
    appliedGeneratedMediaIntentId,
    applyGeneratedMediaIntent,
    dismissedGeneratedMediaIntentId,
    location.key,
    location.state,
    pendingGeneratedMediaIntent,
    plannerAssets.length,
  ]);

  const resetMediaUrlComposer = useCallback(() => {
    mediaUrlResolveRequestId.current += 1;
    activeMediaUrlImportRef.current = null;
    setMediaUrlInputValue('');
    setResolvedMediaPreview(null);
    setMediaUrlValidationMessage(null);
    setIsResolvingMediaUrl(false);
    setIsImportingMediaUrl(false);
  }, []);

  const importMediaUrlToPlanner = useCallback(
    async (rawValue: string) => {
      const normalized = rawValue.trim();
      const dedupeKey = buildUrlDedupeKey(normalized);

      if (!normalized) {
        setResolvedMediaPreview(null);
        setMediaUrlValidationMessage(null);
        return;
      }

      if (!isPublicHttpUrl(normalized)) {
        setResolvedMediaPreview(null);
        setMediaUrlValidationMessage('Enter a valid public image, video, or page URL.');
        return;
      }

      if (
        activeMediaUrlImportRef.current === normalized ||
        activePlannerImportKeysRef.current.has(dedupeKey)
      ) {
        logSchedulerDebug('media url skipped because import is already in progress', {
          dedupeKey,
          url: normalized,
        });
        return;
      }

      if (plannerAssetKeysRef.current.has(dedupeKey)) {
        logSchedulerDebug('media url skipped as duplicate', {
          dedupeKey,
          url: normalized,
        });
        setMediaUrlValidationMessage('This media link is already in the batch.');
        return;
      }

      const requestId = mediaUrlResolveRequestId.current + 1;
      mediaUrlResolveRequestId.current = requestId;
      activeMediaUrlImportRef.current = normalized;
      activePlannerImportKeysRef.current.add(dedupeKey);

      setComposerError(null);
      setComposerNotice(null);
      setMediaUrlValidationMessage(null);
      setIsResolvingMediaUrl(true);
      setIsImportingMediaUrl(true);

      logSchedulerDebug('media url import started', {
        dedupeKey,
        url: normalized,
      });

      try {
        const directMediaType = inferMediaTypeFromUrl(normalized);
        const previewDescriptor = directMediaType
          ? buildResolvedMediaPreview(normalized, directMediaType)
          : await scheduler.resolveExternalMediaUrl(normalized, {
              surfaceGlobalError: false,
            });

        if (mediaUrlResolveRequestId.current !== requestId) {
          return;
        }

        setResolvedMediaPreview(previewDescriptor);

        if (mediaUrlResolveRequestId.current !== requestId) {
          return;
        }

        const resolvedFileName = inferFileNameFromUrl(previewDescriptor.resolvedUrl);
        const mediaAsset = await createPreparedPlannerMediaAsset({
          sourceType: 'url',
          sourceUrl: normalized,
          fallbackFileName: resolvedFileName,
          title: resolvedFileName,
          metadata: {
            importedFrom: 'scheduler-url',
            resolvedPreviewUrl: previewDescriptor.resolvedUrl,
            wasExtracted: previewDescriptor.wasExtracted,
          },
        });

        if (mediaUrlResolveRequestId.current !== requestId) {
          return;
        }

        logSchedulerDebug('media url import succeeded', {
          dedupeKey,
          mediaAssetId: mediaAsset.id,
          url: normalized,
        });

        clearSchedulerGeneratedMediaIntent();
        setDismissedGeneratedMediaIntentId(null);
        const nextAsset = buildPlannerAssetFromMediaAsset({
          mediaAsset,
          title: resolvedFileName,
          scheduledAt: defaultDateTime,
          defaultSocialAccountId: scheduler.accounts?.items?.[0]?.id ?? '',
          dedupeKey,
        });
        logSchedulerDebug('schedule row created', {
          mediaAssetId: mediaAsset.id,
          dedupeKey,
          slotCount: nextAsset.slots.length,
          sourceType: 'url',
        });
        setPlannerAssets((current) => [...current, nextAsset]);
        setComposerNotice('Media link added to the planner.');
        markPlannerDirty();
        resetMediaUrlComposer();
      } catch (importError) {
        if (mediaUrlResolveRequestId.current !== requestId) {
          return;
        }

        setResolvedMediaPreview(null);
        setMediaUrlValidationMessage(
          importError instanceof Error ? importError.message : 'Failed to import media link.'
        );
      } finally {
        if (mediaUrlResolveRequestId.current === requestId) {
          setIsResolvingMediaUrl(false);
          setIsImportingMediaUrl(false);
          if (activeMediaUrlImportRef.current === normalized) {
            activeMediaUrlImportRef.current = null;
          }
          activePlannerImportKeysRef.current.delete(dedupeKey);
        }
      }
    },
    [
      createPreparedPlannerMediaAsset,
      defaultDateTime,
      markPlannerDirty,
      resetMediaUrlComposer,
      scheduler,
    ]
  );
  const activeQueuedPosts = useMemo(
    () =>
      queuedPosts.filter(
        (post) => post.status === 'pending' || post.status === 'scheduled'
      ),
    [queuedPosts]
  );
  const minimumScheduleDateTime = useMemo(
    () => getMinimumScheduleDateTimeValue(liveNow),
    [liveNow]
  );
  const connectedAccountById = useMemo(
    () =>
      Object.fromEntries(connectedAccounts.map((account) => [account.id, account])) as Record<
        string,
        SocialAccount
      >,
    [connectedAccounts]
  );
  const defaultPlannerAccountId = connectedAccounts[0]?.id ?? '';
  const connectedChannelsLabel = `${connectedAccounts.length} channel${
    connectedAccounts.length === 1 ? '' : 's'
  } connected`;
  const queueTabCounts = useMemo(
    () =>
      queueTabs.reduce<Record<QueueTabId, number>>(
        (accumulator, tab) => ({
          ...accumulator,
          [tab.id]: queuedPosts.filter((post) => tab.statuses.includes(post.status)).length,
        }),
        {
          scheduled: 0,
          published: 0,
          failed: 0,
          cancelled: 0,
        }
      ),
    [queuedPosts]
  );
  const draftPostCount = useMemo(
    () => draftBatches.reduce((total, batch) => total + (batch.itemCount ?? 0), 0),
    [draftBatches]
  );
  const filteredQueuedPosts = useMemo(() => {
    const activeTab = queueTabs.find((tab) => tab.id === activeQueueTab) ?? queueTabs[0];

    return queuedPosts.filter((post) => activeTab.statuses.includes(post.status));
  }, [activeQueueTab, queuedPosts]);
  const plannerRows = useMemo(
    () =>
      plannerAssets
        .flatMap((asset) =>
          asset.slots.map((slot) => ({
            asset,
            slot,
            account: connectedAccountById[slot.socialAccountId],
          }))
        )
        .sort(
          (left, right) =>
            new Date(left.slot.scheduledAt).getTime() -
            new Date(right.slot.scheduledAt).getTime()
        ),
    [connectedAccountById, plannerAssets]
  );
  const slotScheduleValidationById = useMemo(() => {
    const entries = plannerAssets.flatMap((asset) =>
      asset.slots.map((slot) => [
        slot.id,
        getScheduleDateTimeValidationMessage(slot.scheduledAt, liveNow),
      ] as const)
    );

    return Object.fromEntries(entries) as Record<string, string | null>;
  }, [liveNow, plannerAssets]);
  const plannerValidationMessage = useMemo(() => {
    if (!plannerAssets.length) {
      return 'Add at least one image or video to build a schedule batch.';
    }

    if (!connectedAccounts.length) {
      return 'Connect at least one social account before scheduling.';
    }

    for (const asset of plannerAssets) {
      if (!asset.slots.length) {
        return 'Each media asset needs at least one schedule slot.';
      }

      for (const slot of asset.slots) {
        if (!slot.socialAccountId) {
          return 'Choose a social account for every schedule slot.';
        }

        if (!connectedAccountById[slot.socialAccountId]) {
          return 'One or more selected social accounts are no longer available.';
        }

        const slotScheduleValidationMessage = getScheduleDateTimeValidationMessage(
          slot.scheduledAt,
          liveNow
        );

        if (slotScheduleValidationMessage) {
          return slotScheduleValidationMessage;
        }

        if (
          connectedAccountById[slot.socialAccountId]?.platform === 'instagram' &&
          asset.mediaType === 'video' &&
          asset.instagramUnsupportedVideo
        ) {
          return (
            asset.instagramValidationMessage ||
            'This Instagram video needs a supported aspect ratio before it can be scheduled.'
          );
        }
      }
    }

    return null;
  }, [connectedAccountById, connectedAccounts.length, liveNow, plannerAssets]);

  const openConnectModal = (step: ConnectModalStep = 'root') => {
    setOauthError(null);
    setConnectModalStep(step);
    setConnectModalOpen(true);
  };

  const closeConnectModal = () => {
    setConnectModalOpen(false);
    setConnectModalStep('root');
  };

  const openPendingFacebookSelection = async (selectionId: string) => {
    setOauthError(null);
    setOauthNotice(null);
    setConnectModalOpen(false);
    setConnectModalStep('root');
    setIsLoadingPendingFacebookPages(true);

    try {
      const selection = await scheduler.loadPendingMetaFacebookPages(selectionId);
      setPendingFacebookSelection(selection);
      setSelectedPendingFacebookPageIds(
        selection.pages.filter((page) => !page.alreadyConnected).map((page) => page.pageId)
      );
    } catch (selectionError) {
      setPendingFacebookSelection(null);
      setSelectedPendingFacebookPageIds([]);
      setOauthError(
        selectionError instanceof Error
          ? selectionError.message
          : 'Facebook returned pages, but PrixmoAI could not load them.'
      );
    } finally {
      setIsLoadingPendingFacebookPages(false);
    }
  };

  const handleMetaOAuthResult = async (result: MetaOAuthPopupResult | null) => {
    if (!result) {
      return;
    }

    if (result.status === 'select_facebook_pages') {
      await openPendingFacebookSelection(result.selectionId);
      return;
    }

    if (result.status === 'error') {
      setOauthError(result.message || 'Meta verification did not finish.');
      setOauthNotice(null);
      return;
    }

    setOauthError(null);
    setOauthNotice(result.message || 'Channel connected successfully.');
    await scheduler.refresh({ silent: true });
  };

  const mutatePlannerAssets = useCallback(
    (updater: (current: PlannerAsset[]) => PlannerAsset[]) => {
      setPlannerAssets((current) => updater(current));
      markPlannerDirty();
      setComposerError(null);
    },
    [markPlannerDirty]
  );

  const toggleAssetPreview = (assetId: string) => {
    setPlannerAssets((current) =>
      current.map((asset) =>
        asset.id === assetId
          ? { ...asset, isPreviewOpen: !asset.isPreviewOpen }
          : asset
      )
    );
  };

  const updateAssetCaption = (assetId: string, caption: string) => {
    mutatePlannerAssets((current) =>
      current.map((asset) => (asset.id === assetId ? { ...asset, caption } : asset))
    );
  };

  const addSlotToAsset = (assetId: string) => {
    mutatePlannerAssets((current) =>
      current.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              slots: [
                ...asset.slots,
                buildPlannerSlot(
                  asset.slots[asset.slots.length - 1]?.scheduledAt || defaultDateTime,
                  asset.slots[asset.slots.length - 1]?.socialAccountId ||
                    defaultPlannerAccountId
                ),
              ],
            }
          : asset
      )
    );
  };

  const duplicateSlot = (assetId: string, slotId: string) => {
    const sourceAsset = plannerAssets.find((asset) => asset.id === assetId);
    const sourceSlot = sourceAsset?.slots.find((slot) => slot.id === slotId);

    if (!sourceAsset || !sourceSlot) {
      return;
    }

    const alternativeAccountId =
      connectedAccounts.find((account) => account.id !== sourceSlot.socialAccountId)?.id || '';

    mutatePlannerAssets((current) =>
      current.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              slots: [
                ...asset.slots,
                {
                  ...sourceSlot,
                  id: createLocalPlannerId(),
                  socialAccountId: alternativeAccountId || sourceSlot.socialAccountId,
                  status: 'pending',
                  itemId: null,
                  lastError: null,
                },
              ],
            }
          : asset
      )
    );
  };

  const updateSlotField = (
    assetId: string,
    slotId: string,
    key: 'socialAccountId' | 'scheduledAt',
    value: string
  ) => {
    mutatePlannerAssets((current) =>
      current.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              slots: asset.slots.map((slot) =>
                slot.id === slotId
                  ? {
                      ...slot,
                      [key]: value,
                      status: 'pending',
                      itemId: null,
                      lastError: null,
                    }
                  : slot
              ),
            }
          : asset
      )
    );
  };

  const removeSlot = (assetId: string, slotId: string) => {
    mutatePlannerAssets((current) =>
      current.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              slots:
                asset.slots.length === 1
                  ? asset.slots
                  : asset.slots.filter((slot) => slot.id !== slotId),
            }
          : asset
      )
    );
  };

  const removeAsset = (assetId: string) => {
    mutatePlannerAssets((current) => current.filter((asset) => asset.id !== assetId));
  };

  const clearPlanner = () => {
    setPlannerAssets([]);
    setBatchName('');
    setActiveBatchId(null);
    setIsPlannerDirty(false);
    setComposerError(null);
    setComposerNotice(null);
    resetMediaUrlComposer();
    setPendingGeneratedMediaIntent(null);
    clearSchedulerGeneratedMediaIntent();
    setAppliedGeneratedMediaIntentId(null);
    setDismissedGeneratedMediaIntentId(null);
    clearPersistedSchedulerPlannerState(user?.id);
  };

  const buildPlannerAssetsFromBatchDetail = useCallback(
    (detail: ScheduleBatchDetail): PlannerAsset[] => {
      const itemsByMediaAssetId = new Map<string, ScheduledItem[]>();

      detail.items
        .slice()
        .sort(
          (left, right) =>
            new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
        )
        .forEach((item) => {
          if (!item.mediaAsset) {
            return;
          }

          const current = itemsByMediaAssetId.get(item.mediaAssetId) ?? [];
          current.push(item);
          itemsByMediaAssetId.set(item.mediaAssetId, current);
        });

      return Array.from(itemsByMediaAssetId.values()).map((items) => {
        const firstItem = items[0]!;
        const mediaAsset = firstItem.mediaAsset!;

        return {
          ...readPlannerAssetInstagramMetadata(mediaAsset.metadata),
          id: createLocalPlannerId(),
          dedupeKey: derivePlannerAssetDedupeKey(mediaAsset),
          mediaAssetId: mediaAsset.id,
          sourceType: mediaAsset.sourceType,
          mediaType: mediaAsset.mediaType,
          storageUrl: mediaAsset.storageUrl,
          originalUrl: mediaAsset.originalUrl,
          thumbnailUrl: mediaAsset.thumbnailUrl,
          filename: mediaAsset.filename,
          mimeType: mediaAsset.mimeType,
          sizeBytes: mediaAsset.sizeBytes,
          width: mediaAsset.width,
          height: mediaAsset.height,
          aspectRatio:
            mediaAsset.width && mediaAsset.height
              ? mediaAsset.width / mediaAsset.height
              : null,
          contentId: mediaAsset.contentId,
          generatedImageId: mediaAsset.generatedImageId,
          title: mediaAsset.filename ?? null,
          prompt: readMetadataValue(mediaAsset.metadata, 'prompt'),
          caption: items.find((item) => item.caption?.trim())?.caption ?? '',
          isPreviewOpen: false,
          slots: items.map((item) => ({
            id: createLocalPlannerId(),
            socialAccountId: item.socialAccountId,
            scheduledAt: toDateTimeLocalValue(item.scheduledAt),
            status: item.status,
            itemId: item.id,
            lastError: item.lastError,
          })),
        };
      });
    },
    []
  );

  const loadDraftBatches = useCallback(
    async (options: { open?: boolean } = {}) => {
      try {
        setDraftBatchesError(null);
        setIsLoadingDraftBatches(true);
        const result = await scheduler.listBatches({
          status: 'draft',
          page: 1,
          limit: 24,
        });
        setDraftBatches(result.items);

        if (options.open) {
          setDraftTrayOpen(true);
        }
      } catch (draftError) {
        setDraftBatchesError(
          draftError instanceof Error ? draftError.message : 'Failed to load drafts.'
        );

        if (options.open) {
          setDraftTrayOpen(true);
        }
      } finally {
        setIsLoadingDraftBatches(false);
      }
    },
    [scheduler]
  );

  useEffect(() => {
    if (hasLoadedDraftsRef.current || scheduler.isLoading) {
      return;
    }

    hasLoadedDraftsRef.current = true;
    void loadDraftBatches();
  }, [loadDraftBatches, scheduler.isLoading]);

  const openDraftBatch = useCallback(
    async (batchId: string) => {
      try {
        setLoadingDraftBatchId(batchId);
        setComposerError(null);
        const detail = await scheduler.getBatch(batchId);
        const nextPlannerAssets = buildPlannerAssetsFromBatchDetail(detail);

        setPlannerAssets(nextPlannerAssets);
        setBatchName(detail.batch.batchName ?? '');
        setActiveBatchId(detail.batch.id);
        setIsPlannerDirty(false);
        setComposerNotice(null);
        setPlannerToast('Draft loaded');
        setDraftTrayOpen(false);
        setPendingGeneratedMediaIntent(null);
        clearSchedulerGeneratedMediaIntent();
        resetMediaUrlComposer();
      } catch (draftError) {
        setComposerNotice(null);
        setComposerError(
          draftError instanceof Error ? draftError.message : 'Failed to open draft.'
        );
      } finally {
        setLoadingDraftBatchId(null);
      }
    },
    [buildPlannerAssetsFromBatchDetail, resetMediaUrlComposer, scheduler]
  );

  const upsertDraftBatch = useCallback((batch: ScheduleBatch) => {
    setDraftBatches((current) => {
      const next = [batch, ...current.filter((entry) => entry.id !== batch.id)];

      return next.sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      );
    });
  }, []);

  const removeDraftBatch = useCallback((batchId: string) => {
    setDraftBatches((current) => current.filter((batch) => batch.id !== batchId));
  }, []);

  const deleteDraftBatch = useCallback(
    async (batchId: string) => {
      try {
        setDeletingDraftBatchId(batchId);
        setDraftBatchesError(null);
        await scheduler.deleteBatch(batchId);
        removeDraftBatch(batchId);

        if (activeBatchId === batchId) {
          clearPlanner();
        }

        pushSchedulerToast({
          type: 'success',
          title: 'Draft deleted',
          message: 'The draft was removed permanently.',
        });
      } catch (draftError) {
        pushSchedulerToast({
          type: 'error',
          title: 'Could not delete draft',
          message:
            draftError instanceof Error ? draftError.message : 'Failed to delete draft.',
        });
      } finally {
        setDeletingDraftBatchId(null);
      }
    },
    [activeBatchId, clearPlanner, pushSchedulerToast, removeDraftBatch, scheduler]
  );

  const buildBatchPayload = () => {
    if (plannerValidationMessage) {
      throw new Error(plannerValidationMessage);
    }

    const items = plannerAssets.flatMap((asset) =>
      asset.slots.map((slot) => {
        const account = connectedAccountById[slot.socialAccountId];

        if (!account) {
          throw new Error('Choose a valid social account for every schedule slot.');
        }

        return {
          mediaAssetId: asset.mediaAssetId,
          socialAccountId: account.id,
          platform: account.platform,
          accountId: account.accountId,
          caption: asset.caption.trim() || null,
          scheduledAt: new Date(slot.scheduledAt).toISOString(),
          status: 'pending' as const,
        };
      })
    );

    return {
      items,
    };
  };

  const persistUploadedFiles = async (files: File[]) => {
    if (!files.length) {
      return;
    }

    try {
      setComposerError(null);
      setComposerNotice(null);

      const createdAssets: PlannerAsset[] = [];
      const skippedDuplicateCount = { value: 0 };

      for (const file of files) {
        const dedupeKey = buildUploadFileDedupeKey(file);

        if (
          plannerAssetKeysRef.current.has(dedupeKey) ||
          activePlannerImportKeysRef.current.has(dedupeKey)
        ) {
          skippedDuplicateCount.value += 1;
          logSchedulerDebug('file upload skipped as duplicate', {
            dedupeKey,
            fileName: file.name,
            size: file.size,
          });
          continue;
        }

        activePlannerImportKeysRef.current.add(dedupeKey);
        logSchedulerDebug('file upload started', {
          dedupeKey,
          fileName: file.name,
          size: file.size,
          type: file.type,
        });

        const mediaAsset = await createPreparedPlannerMediaAsset({
          sourceType: 'upload',
          file,
          fallbackFileName: file.name,
          title: file.name,
          metadata: {
            uploadedFrom: 'scheduler-bulk',
          },
        }).finally(() => {
          activePlannerImportKeysRef.current.delete(dedupeKey);
        });

        logSchedulerDebug('file upload succeeded', {
          dedupeKey,
          mediaAssetId: mediaAsset.id,
          fileName: file.name,
        });

        const nextAsset = buildPlannerAssetFromMediaAsset({
          mediaAsset,
          title: file.name,
          scheduledAt: defaultDateTime,
          defaultSocialAccountId: defaultPlannerAccountId,
          dedupeKey,
        });
        logSchedulerDebug('schedule row created', {
          mediaAssetId: mediaAsset.id,
          dedupeKey,
          slotCount: nextAsset.slots.length,
          sourceType: 'upload',
        });

        createdAssets.push(nextAsset);
      }

      clearSchedulerGeneratedMediaIntent();
      setDismissedGeneratedMediaIntentId(null);
      if (createdAssets.length) {
        setPlannerAssets((current) => [...current, ...createdAssets]);
        setComposerNotice(
          createdAssets.length === 1
            ? `${createdAssets[0]?.filename || 'Media'} added to the batch.`
            : `${createdAssets.length} media assets added to the batch.`
        );
        markPlannerDirty();
      } else if (skippedDuplicateCount.value > 0) {
        setComposerNotice(null);
        setComposerError('That media is already in the batch.');
      }
    } catch (uploadError) {
      setComposerNotice(null);
      setComposerError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Failed to upload one or more media files.'
      );
    }
  };

  const handleMediaFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);

    input.value = '';

    if (!files.length) {
      return;
    }

    await persistUploadedFiles(files);
  };

  const handleMediaUrlBlur = () => {
    if (!mediaUrlInputValue.trim() || isImportingMediaUrl || isResolvingMediaUrl) {
      return;
    }

    void importMediaUrlToPlanner(mediaUrlInputValue);
  };

  const handleMediaUrlPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedValue = event.clipboardData.getData('text').trim();

    if (!pastedValue) {
      return;
    }

    event.preventDefault();
    setMediaUrlInputValue(pastedValue);
    setResolvedMediaPreview(null);
    setMediaUrlValidationMessage(null);
    setComposerNotice(null);
    setComposerError(null);
    void importMediaUrlToPlanner(pastedValue);
  };

  const handleMediaDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsMediaDragActive(false);

    const files = Array.from(event.dataTransfer.files ?? []);

    if (!files.length) {
      return;
    }

    await persistUploadedFiles(files);
  };

  const saveDraftBatch = async () => {
    if (plannerValidationMessage) {
      setComposerNotice(null);
      setComposerError(plannerValidationMessage);
      return;
    }

    if (activeBatchId && !isPlannerDirty) {
      setComposerError(null);
      setComposerNotice(null);
      clearPlanner();
      pushSchedulerToast({
        type: 'info',
        title: 'Already saved',
        message: 'This batch is already in drafts.',
      });
      void loadDraftBatches({ open: true });
      return;
    }

    try {
      setComposerError(null);
      setComposerNotice(null);
      const { items } = buildBatchPayload();
      const previousDraftBatchId = activeBatchId;
      const batch = await scheduler.createBatch({
        batchName: batchName.trim() || null,
        status: 'draft',
      });
      await scheduler.addBatchItems(batch.id, items);

      if (previousDraftBatchId && previousDraftBatchId !== batch.id) {
        await scheduler.deleteBatch(previousDraftBatchId);
        removeDraftBatch(previousDraftBatchId);
      }

      upsertDraftBatch({
        ...batch,
        status: 'draft',
        itemCount: items.length,
      });

      clearPlanner();
      setIsPlannerDirty(false);
      setDraftTrayOpen(true);
      pushSchedulerToast({
        type: 'success',
        title: 'Saved to drafts',
        message:
          items.length === 1
            ? '1 post moved to drafts.'
            : `${items.length} posts moved to drafts.`,
      });
      void loadDraftBatches({ open: true });
    } catch (draftError) {
      setComposerNotice(null);
      setComposerError(
        draftError instanceof Error
          ? draftError.message
          : 'Failed to save schedule batch draft.'
      );
    }
  };

  const submitPlannerBatch = async () => {
    if (plannerValidationMessage) {
      setComposerNotice(null);
      setComposerError(plannerValidationMessage);
      return;
    }

    try {
      setComposerError(null);
      setComposerNotice(null);

      let batchId = activeBatchId;
      const previousDraftBatchId = activeBatchId;

      if (!batchId || isPlannerDirty) {
        const { items } = buildBatchPayload();
        const batch = await scheduler.createBatch({
          batchName: batchName.trim() || null,
          status: 'draft',
        });
        await scheduler.addBatchItems(batch.id, items);
        batchId = batch.id;
      }

      const submitted = await scheduler.submitBatch(batchId);

      if (
        previousDraftBatchId &&
        previousDraftBatchId !== batchId
      ) {
        await scheduler.deleteBatch(previousDraftBatchId);
      }

      removeDraftBatch(batchId);
      if (previousDraftBatchId && previousDraftBatchId !== batchId) {
        removeDraftBatch(previousDraftBatchId);
      }
      clearPlanner();
      setIsPlannerDirty(false);
      setActiveQueueTab('scheduled');
      pushSchedulerToast({
        type: 'success',
        title: 'Batch scheduled',
        message:
          submitted.items.length === 1
            ? '1 schedule item moved to the queue.'
            : `${submitted.items.length} schedule items moved to the queue.`,
      });
      setComposerNotice(null);
      void loadDraftBatches();
    } catch (submitError) {
      setComposerNotice(null);
      setComposerError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to submit the schedule batch.'
      );
    }
  };

  const handleStartOAuth = async (
    platform: Extract<SocialPlatform, 'instagram' | 'facebook'>,
    account?: SocialAccount
  ) => {
    setOauthError(null);
    setOauthNotice(null);
    closeConnectModal();

    try {
      const result = await scheduler.startMetaOAuth({
        platform,
        ...(account
          ? {
              accountId: account.accountId,
              profileUrl: getAccountProfileUrl(account) || undefined,
            }
          : {}),
      });

      await handleMetaOAuthResult(result);
    } catch (oauthStartError) {
      setOauthError(
        oauthStartError instanceof Error
          ? oauthStartError.message
          : 'Unable to start the Meta connection.'
      );
    }
  };

  const togglePendingFacebookPage = (pageId: string) => {
    setSelectedPendingFacebookPageIds((current) =>
      current.includes(pageId)
        ? current.filter((value) => value !== pageId)
        : [...current, pageId]
    );
  };

  const handleFinalizePendingFacebookPages = async () => {
    if (!pendingFacebookSelection || !selectedPendingFacebookPageIds.length) {
      return;
    }

    const result = await scheduler.finalizePendingMetaFacebookPages(
      pendingFacebookSelection.selectionId,
      selectedPendingFacebookPageIds
    );
    const count = result.connectedAccounts.length;
    setOauthNotice(
      count === 1 ? 'Facebook Page connected.' : `${count} Facebook Pages connected.`
    );
    setPendingFacebookSelection(null);
    setSelectedPendingFacebookPageIds([]);
  };

  const handleDisconnectAccount = async () => {
    if (!disconnectTarget) {
      return;
    }

    await scheduler.disconnectAccount(disconnectTarget.id);
    setOauthNotice(`${getAccountDisplayName(disconnectTarget)} disconnected.`);
    setDisconnectTarget(null);
    setDisconnectValue('');
  };

  const getPostActionState = (post: ScheduledPost) => {
    const scheduledAtMs = new Date(post.scheduledFor).getTime();
    const isWithinBuffer =
      Number.isFinite(scheduledAtMs) &&
      liveNow >= scheduledAtMs - QUEUE_ACTION_BUFFER_MS;
    const isActionableStatus = post.status === 'pending' || post.status === 'scheduled';
    const tooltip = isWithinBuffer
      ? 'Post is being prepared for publishing'
      : post.actionBlockedReason;

    return {
      canEdit: post.canEdit && !isWithinBuffer,
      canCancel: post.canCancel && !isWithinBuffer,
      tooltip,
      isActionableStatus,
    };
  };

  const handleSaveEditedPost = async (input: {
    caption: string;
    mediaUrl: string;
    mediaType: SchedulerMediaType | null;
    scheduledFor: string;
  }) => {
    if (!editingPost) {
      return;
    }

    const uploaded =
      input.mediaUrl.trim() && !isManagedMediaUrl(input.mediaUrl.trim())
        ? await scheduler.importExternalMediaUrl(input.mediaUrl.trim())
        : null;
    const resolvedMediaUrl = uploaded?.sourceImageUrl ?? input.mediaUrl;
    const resolvedMediaType =
      uploaded?.mediaType ??
      input.mediaType ??
      inferMediaTypeFromUrl(input.mediaUrl.trim());

    await scheduler.updatePost(editingPost.id, {
      ...input,
      mediaUrl: resolvedMediaUrl,
      mediaType: resolvedMediaType,
    });
    setOauthNotice('Scheduled post updated.');
    setEditingPost(null);
  };

  const handleCancelScheduledPost = async () => {
    if (!cancelPostTarget) {
      return;
    }

    await scheduler.cancelPost(cancelPostTarget.id);
    setOauthNotice(`${getQueuePostTitle(cancelPostTarget)} cancelled.`);
    setCancelPostTarget(null);
  };

  return (
    <div className="page-stack">
      <ErrorMessage message={oauthError || scheduler.error} />
      {schedulerToasts.length ? (
        <div className="scheduler-toast-stack" aria-live="polite" aria-atomic="false">
          {schedulerToasts.map((toast) => (
            <div
              key={toast.id}
              className={cn(
                'scheduler-toast',
                `scheduler-toast--${toast.type}`,
                toast.isExiting && 'scheduler-toast--exiting'
              )}
              role={toast.type === 'error' ? 'alert' : 'status'}
            >
              <div className="scheduler-toast__icon">
                {toast.type === 'success' ? (
                  <CheckCircle2 size={16} />
                ) : toast.type === 'warning' ? (
                  <AlertTriangle size={16} />
                ) : toast.type === 'info' ? (
                  <Info size={16} />
                ) : (
                  <Flag size={16} />
                )}
              </div>
              <div className="scheduler-toast__copy">
                <strong>{toast.title}</strong>
                <span>{toast.message}</span>
              </div>
              <button
                type="button"
                className="scheduler-toast__close"
                onClick={() => {
                  dismissSchedulerToast(toast.id);
                }}
                aria-label="Dismiss notification"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <section className="scheduler-overview" aria-label="Scheduler overview">
        <Card className="scheduler-overview__metric">
          <span className="scheduler-overview__label">Connected channels</span>
          <strong className="scheduler-overview__value">{connectedAccounts.length}</strong>
          <small className="scheduler-overview__meta">Instagram professional accounts and Facebook Pages</small>
        </Card>
        <Card className="scheduler-overview__metric">
          <span className="scheduler-overview__label">Queued posts</span>
          <strong className="scheduler-overview__value">{activeQueuedPosts.length}</strong>
          <small className="scheduler-overview__meta">Active scheduler records</small>
        </Card>
        <Card className="scheduler-overview__metric">
          <span className="scheduler-overview__label">Scheduler state</span>
          <strong className="scheduler-overview__value">
            {scheduler.isLoading || scheduler.isMutating || scheduler.isUploadingMedia
              ? 'Syncing'
              : scheduler.schedulerStatus === 'error'
                ? 'Error'
                : 'Ready'}
          </strong>
          <small className="scheduler-overview__meta">Connect, queue, and manage everything in one place</small>
        </Card>
      </section>

      <Card className="dashboard-panel scheduler-channel-shell">
        <div className="scheduler-channel-shell__header">
          <div className="scheduler-channel-shell__copy">
            <p className="section-eyebrow">Channels</p>
            <h3>Connect and manage your publishing accounts</h3>
          </div>
          {connectedAccounts.length > 0 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                openConnectModal();
              }}
              disabled={scheduler.isBusy}
            >
              <Plus size={16} />
              Add channel
            </Button>
          ) : null}
        </div>

        <div className="scheduler-channel-plan">
          <div className="scheduler-channel-plan__icon">
            <CheckCircle2 size={16} />
          </div>
          <div>
            <strong>{connectedChannelsLabel}</strong>
          </div>
        </div>

        {connectedAccounts.length ? (
          <div className="scheduler-channel-grid" aria-label="Connected channels">
            {connectedAccounts.map((account) => {
              const profileUrl = getAccountProfileUrl(account);
              const canRefreshWithMeta =
                account.platform === 'instagram' || account.platform === 'facebook';

              return (
                <article key={account.id} className="scheduler-channel-card scheduler-channel-card--compact">
                  <div className="scheduler-channel-card__identity">
                    <div className="scheduler-channel-card__avatar-stack">
                      <div className="scheduler-channel-card__avatar">
                        {readMetadataValue(
                          account.metadata,
                          'metaInstagramProfilePictureUrl'
                        ) ? (
                          <img
                            src={
                              readMetadataValue(
                                account.metadata,
                                'metaInstagramProfilePictureUrl'
                              ) || undefined
                            }
                            alt={getAccountDisplayName(account)}
                          />
                        ) : (
                          <span>{getAccountInitials(account)}</span>
                        )}
                      </div>
                      <span
                        className={`scheduler-channel-card__platform scheduler-channel-card__platform--${account.platform}`}
                      >
                        {getPlatformBadgeIcon(account.platform)}
                      </span>
                    </div>

                    <div className="scheduler-channel-card__copy">
                      <div className="scheduler-channel-card__title-row">
                        <strong>{getAccountDisplayName(account)}</strong>
                        {account.verificationStatus === 'verified' ? (
                          <span className="scheduler-connected-badge">
                            <Check size={12} />
                            Connected
                          </span>
                        ) : null}
                      </div>
                      <span>{getPlatformLabel(account.platform)}</span>
                      <small>{profileUrl || account.accountId}</small>
                    </div>
                  </div>

                  <div className="scheduler-channel-card__actions">
                    {profileUrl ? (
                      <a
                        href={profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="generated-image-card__action scheduler-channel-card__action"
                        aria-label={`View ${getAccountDisplayName(account)} on ${
                          account.platform === 'instagram' ? 'Instagram' : 'Facebook'
                        }`}
                        title={`View ${
                          account.platform === 'instagram' ? 'Instagram' : 'Facebook'
                        }`}
                      >
                        <ExternalLink size={15} />
                      </a>
                    ) : null}
                    {canRefreshWithMeta ? (
                      <button
                        type="button"
                        className="generated-image-card__action scheduler-channel-card__action"
                        onClick={() => {
                          void handleStartOAuth(
                            account.platform as Extract<SocialPlatform, 'instagram' | 'facebook'>,
                            account
                          );
                        }}
                        disabled={scheduler.isBusy}
                        aria-label={`Refresh ${getAccountDisplayName(account)}`}
                        title="Refresh connection"
                      >
                        <RefreshCw size={15} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="generated-image-card__action scheduler-channel-card__action scheduler-channel-card__action--danger"
                      onClick={() => {
                        setDisconnectTarget(account);
                        setDisconnectValue('');
                      }}
                      aria-label={`Disconnect ${getAccountDisplayName(account)}`}
                      title="Disconnect account"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="scheduler-channel-empty">
            <button
              type="button"
              className="scheduler-channel-empty__plus"
              onClick={() => {
                openConnectModal();
              }}
              aria-label="Connect a new channel"
            >
              <Plus size={34} />
            </button>
            <h3>Connect a channel to get started</h3>
            <p>
              Once connected, Instagram and Facebook channels will show up here ready
              for scheduling, refreshing, and disconnecting.
            </p>
            <Button
              type="button"
              size="lg"
              onClick={() => {
                openConnectModal();
              }}
              disabled={scheduler.isBusy}
            >
              <Plus size={16} />
              Connect channel
            </Button>
          </div>
        )}
      </Card>

      <Card className="dashboard-panel scheduler-composer-panel">
        <div className="dashboard-panel__header">
          <div>
            <p className="section-eyebrow">Bulk planner</p>
            <h3>Build your next batch</h3>
          </div>
          <div className="scheduler-bulk-builder__header-actions">
            <button
              type="button"
              className="generated-image-card__action scheduler-draft-trigger"
              onClick={() => {
                void loadDraftBatches({ open: true });
              }}
              disabled={isLoadingDraftBatches}
              aria-label="Open drafts tray"
              title="Open drafts"
            >
              {isLoadingDraftBatches ? (
                <LoaderCircle size={16} className="analytics-icon-spin" />
              ) : (
                <FolderOpen size={16} />
              )}
              {draftPostCount > 0 ? (
                <span className="scheduler-draft-trigger__badge" aria-label={`${draftPostCount} drafts`}>
                  {draftPostCount > 99 ? '99+' : draftPostCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
        <div className="scheduler-bulk-builder">
          <div className="scheduler-bulk-builder__top">
            <Input
              label="Batch name"
              value={batchName}
              onChange={(event) => {
                setBatchName(event.target.value);
                setComposerNotice(null);
                markPlannerDirty();
              }}
              placeholder="Spring campaign batch"
            />
            <div className="scheduler-bulk-builder__summary">
              <strong>{plannerAssets.length} assets</strong>
              <span>{plannerRows.length} planned slots</span>
            </div>
          </div>

          <div className="scheduler-bulk-builder__media-inputs">
            <label
              className={`field field--full generator-upload generator-upload--compact scheduler-upload ${
                isMediaDragActive ? 'scheduler-upload--active' : ''
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsMediaDragActive(true);
              }}
              onDragLeave={() => setIsMediaDragActive(false)}
              onDrop={(event) => {
                void handleMediaDrop(event);
              }}
            >
              <div className="scheduler-upload__label-row">
                <span className="field__label">Upload media</span>
                {scheduler.isUploadingMedia ? (
                  <div
                    className="scheduler-upload__loader"
                    role="status"
                    aria-label="Uploading media"
                    title="Uploading media"
                  >
                    <BlackHoleCanvas
                      className="scheduler-upload__loader-canvas"
                      particleCount={18}
                    />
                  </div>
                ) : null}
              </div>
              <div className="scheduler-upload__helper" role="note" aria-live="polite">
                <Info size={13} />
                <span>Post multiple images and videos to all platforms at once.</span>
              </div>
              <div className="generator-upload__copy">
                <ImagePlus size={18} />
                <div>
                  <strong>
                    {scheduler.isUploadingMedia
                      ? 'Uploading media...'
                      : 'Upload multiple images or videos'}
                  </strong>
                  <span>Drag and drop JPG, PNG, WEBP, MP4, or MOV files</span>
                </div>
              </div>
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={(event) => {
                  void handleMediaFileChange(event);
                }}
              />
            </label>

            <div className="scheduler-url-import">
              <div className="scheduler-url-import__header">
                <span className="field__label">Media URL</span>
                <span className="scheduler-url-import__hint">Paste a direct file or public link</span>
              </div>
              <div className="scheduler-url-import__controls">
                <Input
                  value={mediaUrlInputValue}
                  onChange={(event) => {
                    setMediaUrlInputValue(event.target.value);
                    setResolvedMediaPreview(null);
                    setMediaUrlValidationMessage(null);
                    setComposerNotice(null);
                    setComposerError(null);
                  }}
                  onBlur={handleMediaUrlBlur}
                  onPaste={handleMediaUrlPaste}
                  placeholder="https://example.com/image.jpg"
                />
              </div>

              {mediaUrlInputValue.trim() || mediaUrlValidationMessage ? (
                <div className="scheduler-url-import__status-card">
                  <MediaThumbnail
                    src={resolvedMediaPreview?.resolvedUrl ?? null}
                    alt="Pending media link"
                    mediaType={
                      resolvedMediaPreview?.mediaType ??
                      inferMediaTypeFromUrl(mediaUrlInputValue)
                    }
                    size="sm"
                  />
                  <div className="scheduler-url-import__status-copy">
                    <strong>
                      {isImportingMediaUrl
                        ? 'Adding link to planner…'
                        : isResolvingMediaUrl
                          ? 'Checking link…'
                          : mediaUrlValidationMessage
                            ? 'Preview unavailable'
                            : resolvedMediaPreview?.wasExtracted
                              ? 'Media found in page'
                              : 'Link ready'}
                    </strong>
                    <span>
                      {mediaUrlValidationMessage
                        ? mediaUrlValidationMessage
                        : isImportingMediaUrl || isResolvingMediaUrl
                          ? 'PrixmoAI will add it automatically once the link is usable.'
                          : 'This link will appear below as a schedulable asset.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="generated-image-card__action"
                    onClick={resetMediaUrlComposer}
                    aria-label="Clear media URL"
                    title="Clear media URL"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {plannerAssets.length ? (
            <div className="scheduler-bulk-assets">
              {plannerAssets.map((asset, assetIndex) => (
                <article key={asset.id} className="scheduler-bulk-asset-card">
                  <div className="scheduler-bulk-asset-card__header">
                    <div className="scheduler-bulk-asset-card__identity">
                      <MediaThumbnail
                        src={asset.thumbnailUrl || asset.storageUrl}
                        alt={asset.title || asset.filename || `Media ${assetIndex + 1}`}
                        mediaType={asset.mediaType}
                      />
                      <div className="scheduler-bulk-asset-card__copy">
                        <strong>
                          {asset.title || asset.filename || `Media ${assetIndex + 1}`}
                        </strong>
                        <span>
                          {asset.mediaType === 'video' ? 'Video' : 'Image'}
                          {asset.sourceType === 'generated'
                            ? ' from Generate'
                            : asset.sourceType === 'url'
                              ? ' from link'
                              : ' upload'}
                        </span>
                      </div>
                    </div>
                    <div className="scheduler-bulk-asset-card__actions">
                      <button
                        type="button"
                        className="queue-post-item__action"
                        onClick={() => toggleAssetPreview(asset.id)}
                      >
                        {asset.isPreviewOpen ? <EyeOff size={15} /> : <Eye size={15} />}
                        <span>{asset.isPreviewOpen ? 'Hide' : 'Preview'}</span>
                      </button>
                      <button
                        type="button"
                        className="queue-post-item__action"
                        onClick={() => addSlotToAsset(asset.id)}
                      >
                        <Plus size={15} />
                        <span>Add slot</span>
                      </button>
                      <button
                        type="button"
                        className="queue-post-item__action queue-post-item__action--danger"
                        onClick={() => removeAsset(asset.id)}
                      >
                        <Trash2 size={15} />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>

                  {asset.isPreviewOpen ? (
                    <div className="scheduler-bulk-asset-card__preview">
                      <MediaPreview
                        src={asset.storageUrl}
                        alt={asset.title || asset.filename || `Media ${assetIndex + 1}`}
                        mediaType={asset.mediaType}
                      />
                    </div>
                  ) : null}

                  <div className="scheduler-bulk-asset-card__body">
                    {asset.instagramValidationMessage ? (
                      <div
                        className={cn(
                          'scheduler-instagram-note',
                          asset.instagramUnsupportedVideo &&
                            'scheduler-instagram-note--warning'
                        )}
                      >
                        <Info size={15} />
                        <span>{asset.instagramValidationMessage}</span>
                      </div>
                    ) : null}

                    <label className="field field--full">
                      <span className="field__label">Caption</span>
                      <textarea
                        className="field__control field__control--textarea"
                        rows={4}
                        value={asset.caption}
                        onChange={(event) => updateAssetCaption(asset.id, event.target.value)}
                        placeholder="Write one caption for every slot on this asset."
                      />
                    </label>

                    <div className="scheduler-bulk-slots">
                      {asset.slots.map((slot, slotIndex) => (
                        <div key={slot.id} className="scheduler-bulk-slot">
                          <div className="scheduler-bulk-slot__header">
                            <strong>Slot {slotIndex + 1}</strong>
                            <QueueStatusBadge status={slot.status} />
                          </div>

                          <div className="scheduler-bulk-slot__fields">
                            <Select
                              label="Platform account"
                              value={slot.socialAccountId}
                              onChange={(event) =>
                                updateSlotField(
                                  asset.id,
                                  slot.id,
                                  'socialAccountId',
                                  event.target.value
                                )
                              }
                            >
                              <option value="">Select a channel</option>
                              {connectedAccounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.platform === 'instagram' ? 'Instagram' : 'Facebook'} ·{' '}
                                  {getAccountDisplayName(account)}
                                </option>
                              ))}
                            </Select>

                            <Input
                              label="Schedule time"
                              type="datetime-local"
                              value={slot.scheduledAt}
                              min={minimumScheduleDateTime}
                              error={slotScheduleValidationById[slot.id]}
                              onChange={(event) => {
                                const input = event.currentTarget;
                                const nextValue = event.target.value;
                                updateSlotField(
                                  asset.id,
                                  slot.id,
                                  'scheduledAt',
                                  nextValue
                                );
                                if (isCompleteDateTimeLocalValue(nextValue)) {
                                  window.requestAnimationFrame(() => {
                                    input.blur();
                                  });
                                }
                              }}
                              onBlur={(event) => {
                                updateSlotField(
                                  asset.id,
                                  slot.id,
                                  'scheduledAt',
                                  event.target.value
                                );
                              }}
                            />
                          </div>

                          <div className="scheduler-bulk-slot__footer">
                            <span className="scheduler-bulk-slot__platform">
                              {slot.socialAccountId && connectedAccountById[slot.socialAccountId]
                                ? `Posting to ${getAccountDisplayName(
                                    connectedAccountById[slot.socialAccountId]
                                  )}`
                                : 'Choose a connected channel for this slot.'}
                            </span>
                            <div className="scheduler-bulk-slot__actions">
                              <button
                                type="button"
                                className="queue-post-item__action"
                                onClick={() => duplicateSlot(asset.id, slot.id)}
                              >
                                <Copy size={15} />
                                <span>Duplicate</span>
                              </button>
                              <button
                                type="button"
                                className="queue-post-item__action queue-post-item__action--danger"
                                onClick={() => removeSlot(asset.id, slot.id)}
                                disabled={asset.slots.length === 1}
                              >
                                <Trash2 size={15} />
                                <span>Remove</span>
                              </button>
                            </div>
                          </div>

                          {slot.lastError ? (
                            <p className="queue-post-item__error">{slot.lastError}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="scheduler-channel-empty scheduler-channel-empty--compact scheduler-bulk-empty">
              <h3>No media in this batch</h3>
              <p>Upload files, paste a media link, or send one from Generate.</p>
            </div>
          )}

          <div className="scheduler-bulk-matrix">
            <div className="scheduler-bulk-matrix__header">
              <div>
                <h3>Schedule matrix</h3>
              </div>
            </div>

            {plannerRows.length ? (
              <div className="scheduler-bulk-matrix__list">
                {plannerRows.map(({ asset, slot, account }) => (
                  <div key={slot.id} className="scheduler-bulk-matrix__row">
                    <div className="scheduler-bulk-matrix__media">
                      <MediaThumbnail
                        src={asset.thumbnailUrl || asset.storageUrl}
                        alt={asset.title || asset.filename || 'Scheduled media'}
                        mediaType={asset.mediaType}
                        size="sm"
                      />
                      <div>
                        <strong>{asset.title || asset.filename || 'Untitled media'}</strong>
                        <span>{account ? getAccountDisplayName(account) : 'Channel not selected'}</span>
                      </div>
                    </div>
                    <span>
                      {slot.scheduledAt
                        ? formatDateTime(new Date(slot.scheduledAt).toISOString())
                        : 'No time selected'}
                    </span>
                    <span>{asset.caption?.trim() || 'No caption yet'}</span>
                    <QueueStatusBadge status={slot.status} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="scheduler-channel-empty scheduler-channel-empty--compact scheduler-bulk-empty">
                <p>No planned rows yet.</p>
              </div>
            )}
          </div>

          <div className="field field--full">
            {!composerError && plannerValidationMessage ? (
              <p className="scheduler-bulk-builder__validation">{plannerValidationMessage}</p>
            ) : null}
            <div className="scheduler-bulk-builder__footer">
              <Button
                type="button"
                variant="ghost"
                onClick={clearPlanner}
                disabled={scheduler.isBusy || (!plannerAssets.length && !batchName.trim())}
              >
                <Trash2 size={16} />
                Clear batch
              </Button>
              <div className="scheduler-bulk-builder__submit-group">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void saveDraftBatch();
                  }}
                  disabled={scheduler.isBusy || Boolean(plannerValidationMessage)}
                >
                  <Check size={16} />
                  Save draft
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="scheduler-composer__submit"
                  onClick={() => {
                    void submitPlannerBatch();
                  }}
                  disabled={scheduler.isBusy || Boolean(plannerValidationMessage)}
                >
                  <CalendarClock size={16} />
                  {scheduler.isBusy ? 'Scheduling batch...' : 'Schedule all'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="dashboard-panel scheduler-queue-panel">
        <div className="dashboard-panel__header">
          <div>
            <p className="section-eyebrow">Scheduled posts</p>
            <h3>Queue state</h3>
          </div>
        </div>
        {queuedPosts.length ? (
          <div className="scheduler-queue">
            <div className="scheduler-queue__tabs" role="tablist" aria-label="Scheduled post states">
              {queueTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeQueueTab === tab.id}
                  className={`scheduler-queue__tab ${
                    activeQueueTab === tab.id ? 'scheduler-queue__tab--active' : ''
                  }`}
                  onClick={() => setActiveQueueTab(tab.id)}
                >
                  <span>{tab.label}</span>
                  <strong>{queueTabCounts[tab.id]}</strong>
                </button>
              ))}
            </div>

            {filteredQueuedPosts.length ? (
              <div
                key={activeQueueTab}
                className="scheduler-queue__list"
                role="tabpanel"
                aria-label={`${activeQueueTab} posts`}
              >
                {filteredQueuedPosts.map((post) => {
                  const actionState = getPostActionState(post);

                  return (
                    <QueuePostItem
                      key={post.id}
                      post={{
                        ...post,
                        actionBlockedReason: actionState.tooltip,
                      }}
                      account={connectedAccountById[post.socialAccountId]}
                      canEdit={actionState.canEdit}
                      canCancel={actionState.canCancel}
                      onEdit={() => setEditingPost(post)}
                      onCancel={() => setCancelPostTarget(post)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="scheduler-channel-empty scheduler-channel-empty--compact">
                <h3>No {activeQueueTab} posts</h3>
                <p>
                  {activeQueueTab === 'scheduled'
                    ? 'Create the next scheduled post and it will appear here.'
                    : `Posts marked ${activeQueueTab} will appear here.`}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="scheduler-channel-empty scheduler-channel-empty--compact">
            <h3>No scheduled posts yet</h3>
            <p>Create the first queued post and the release calendar will start to feel real.</p>
          </div>
        )}
      </Card>

      {draftTrayOpen ? (
        <div className="generated-image-lightbox scheduler-channel-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="generated-image-lightbox__backdrop"
            aria-label="Close drafts tray"
            onClick={() => {
              setDraftTrayOpen(false);
            }}
          />
          <div className="generated-image-lightbox__panel scheduler-channel-modal__panel scheduler-drafts-modal">
            <div className="scheduler-channel-modal__header">
              <div>
                <p className="section-eyebrow">Drafts</p>
                <h3>Saved draft batches</h3>
                <p>Open any saved batch and keep building from where you left off.</p>
              </div>
              <button
                type="button"
                className="generated-image-card__action"
                onClick={() => {
                  setDraftTrayOpen(false);
                }}
                aria-label="Close drafts tray"
              >
                <X size={16} />
              </button>
            </div>

            {isLoadingDraftBatches ? (
              <div className="scheduler-channel-empty scheduler-channel-empty--compact">
                <h3>Loading drafts…</h3>
                <p>PrixmoAI is pulling your saved batches.</p>
              </div>
            ) : draftBatchesError ? (
              <div className="scheduler-channel-empty scheduler-channel-empty--compact">
                <h3>Couldn’t load drafts</h3>
                <p>{draftBatchesError}</p>
              </div>
            ) : draftBatches.length ? (
              <div className="scheduler-drafts-list">
                {draftBatches.map((batch) => (
                  <div
                    key={batch.id}
                    className="scheduler-draft-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      void openDraftBatch(batch.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void openDraftBatch(batch.id);
                      }
                    }}
                  >
                    <div className="scheduler-draft-row__copy">
                      <strong>{batch.batchName?.trim() || 'Untitled draft'}</strong>
                      <span>
                        {batch.itemCount ?? 0} {(batch.itemCount ?? 0) === 1 ? 'post' : 'posts'} ·
                        {' '}Updated {formatDateTime(batch.updatedAt)}
                      </span>
                    </div>
                    <div className="scheduler-draft-row__actions">
                      <span className="status-pill status-pill--pending">Draft</span>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteDraftBatch(batch.id);
                        }}
                        disabled={deletingDraftBatchId === batch.id}
                      >
                        {deletingDraftBatchId === batch.id ? (
                          <LoaderCircle size={16} className="analytics-icon-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                        {deletingDraftBatchId === batch.id ? 'Deleting...' : 'Delete'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          void openDraftBatch(batch.id);
                        }}
                        disabled={loadingDraftBatchId === batch.id}
                      >
                        {loadingDraftBatchId === batch.id ? (
                          <LoaderCircle size={16} className="analytics-icon-spin" />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                        {loadingDraftBatchId === batch.id ? 'Opening...' : 'Open'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="scheduler-channel-empty scheduler-channel-empty--compact">
                <h3>No drafts yet</h3>
                <p>Saved planner batches will appear here after you store the first draft.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <ScheduleModal
        post={editingPost}
        isOpen={Boolean(editingPost)}
        isSaving={scheduler.isMutating}
        isUploadingMedia={scheduler.isUploadingMedia}
        onClose={() => setEditingPost(null)}
        onSave={handleSaveEditedPost}
        onUploadMedia={async (file) => {
          const uploaded = await scheduler.uploadPostMedia(file);
          return uploaded.sourceImageUrl;
        }}
        onImportMediaUrl={async (url) => {
          const uploaded = await scheduler.importExternalMediaUrl(url);
          return {
            sourceImageUrl: uploaded.sourceImageUrl,
            mediaType: uploaded.mediaType,
          };
        }}
      />

      {pendingGeneratedMediaIntent ? (
        <div className="generated-image-lightbox scheduler-channel-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="generated-image-lightbox__backdrop"
            aria-label="Close generated image replace dialog"
            onClick={() => {
              clearSchedulerGeneratedMediaIntent();
              setDismissedGeneratedMediaIntentId(pendingGeneratedMediaIntent.intentId);
              setPendingGeneratedMediaIntent(null);
            }}
          />
          <div className="generated-image-lightbox__panel scheduler-channel-modal__panel scheduler-channel-modal__panel--disconnect scheduler-generated-media-modal">
            <div className="scheduler-channel-modal__header">
              <div>
                <p className="section-eyebrow">Generated media</p>
                <h3>Add this generated asset to the batch?</h3>
                <p>
                  PrixmoAI found a generated image from Generate. Add it to the
                  current batch, replace the existing batch media, or keep what you
                  already have.
                </p>
              </div>
              <button
                type="button"
                className="generated-image-card__action"
                onClick={() => {
                  clearSchedulerGeneratedMediaIntent();
                  setDismissedGeneratedMediaIntentId(
                    pendingGeneratedMediaIntent.intentId
                  );
                  setPendingGeneratedMediaIntent(null);
                }}
                aria-label="Close generated image replace dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="scheduler-channel-disconnect__summary scheduler-generated-media-modal__summary">
              <MediaThumbnail
                src={pendingGeneratedMediaIntent.mediaUrl}
                alt={pendingGeneratedMediaIntent.title || 'Generated image from Generate'}
                mediaType={pendingGeneratedMediaIntent.mediaType}
                size="sm"
              />
              <div className="scheduler-channel-disconnect__copy">
                <strong>
                  {pendingGeneratedMediaIntent.title || 'Generated image from Generate'}
                </strong>
                <span>
                  Send this image straight into the bulk schedule builder.
                </span>
              </div>
            </div>

            <div className="scheduler-channel-disconnect__actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  clearSchedulerGeneratedMediaIntent();
                  setDismissedGeneratedMediaIntentId(
                    pendingGeneratedMediaIntent.intentId
                  );
                  setPendingGeneratedMediaIntent(null);
                }}
              >
                Keep current batch
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void applyGeneratedMediaIntent(
                    pendingGeneratedMediaIntent,
                    'Generated image added to the current batch.',
                    'append'
                  );
                }}
              >
                <Plus size={16} />
                Add to batch
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void applyGeneratedMediaIntent(
                    pendingGeneratedMediaIntent,
                    'Generated image replaced the current batch media.',
                    'replace'
                  );
                }}
              >
                <CalendarClock size={16} />
                Replace batch media
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelPostTarget ? (
        <div className="generated-image-lightbox scheduler-channel-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="generated-image-lightbox__backdrop"
            aria-label="Close cancel scheduled post dialog"
            onClick={() => setCancelPostTarget(null)}
          />
          <div className="generated-image-lightbox__panel scheduler-channel-modal__panel scheduler-channel-modal__panel--disconnect">
            <div className="scheduler-channel-modal__header">
              <div>
                <p className="section-eyebrow">Cancel scheduled post</p>
                <h3>Cancel this scheduled post?</h3>
                <p>This moves the post into Cancelled and removes it from active publishing.</p>
              </div>
              <button
                type="button"
                className="generated-image-card__action"
                onClick={() => setCancelPostTarget(null)}
                aria-label="Close cancel scheduled post dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="scheduler-channel-disconnect__summary">
              <MediaThumbnail
                src={cancelPostTarget.mediaUrl}
                alt={getQueuePostTitle(cancelPostTarget)}
                mediaType={cancelPostTarget.mediaType}
                size="sm"
              />
              <div className="scheduler-channel-disconnect__copy">
                <strong>{getQueuePostTitle(cancelPostTarget)}</strong>
                <span>{formatDateTime(cancelPostTarget.scheduledFor)}</span>
              </div>
              <QueueStatusBadge status={cancelPostTarget.status} />
            </div>

            <div className="scheduler-channel-disconnect__actions">
              <Button type="button" variant="ghost" onClick={() => setCancelPostTarget(null)}>
                Keep post
              </Button>
              <Button
                type="button"
                className="scheduler-channel-disconnect__button"
                onClick={() => {
                  void handleCancelScheduledPost();
                }}
              >
                <Trash2 size={16} />
                Cancel post
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {connectModalOpen ? (
        <div className="generated-image-lightbox scheduler-channel-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="generated-image-lightbox__backdrop"
            aria-label="Close connect channel dialog"
            onClick={closeConnectModal}
          />
          <div
            className={`generated-image-lightbox__panel scheduler-channel-modal__panel ${
              connectModalStep === 'root' ? 'scheduler-channel-modal__panel--selector' : ''
            }`}
          >
            {connectModalStep === 'root' ? (
              <div className="scheduler-channel-selector" role="list" aria-label="Social platforms">
                <button
                  type="button"
                  className="generated-image-card__action scheduler-channel-selector__close"
                  onClick={closeConnectModal}
                  aria-label="Close connect channel dialog"
                >
                  <X size={16} />
                </button>
                <div className="scheduler-channel-selector__rail">
                  {channelConnectOptions.map((option) => (
                    <button
                      key={option.platform}
                      type="button"
                      className={`scheduler-channel-selector__button scheduler-channel-selector__button--${option.platform}`}
                      onClick={() => {
                        setConnectModalStep(option.platform);
                      }}
                      disabled={scheduler.isBusy}
                      role="listitem"
                      aria-label={`Connect ${option.title}`}
                    >
                      <span className="scheduler-channel-selector__circle" aria-hidden="true">
                        {option.platform === 'instagram' ? (
                          <Instagram size={22} />
                        ) : (
                          <Facebook size={22} />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {connectModalStep === 'instagram' ? (
              <>
                <div className="scheduler-channel-modal__header">
                  <div>
                    <p className="section-eyebrow">Instagram channel</p>
                    <h3>Choose your Instagram connection</h3>
                    <p>
                      Buffer-style flow: connect a professional Instagram account
                      directly so PrixmoAI can discover the real profile from the
                      login you use.
                    </p>
                  </div>
                  <div className="scheduler-channel-modal__header-actions">
                    <button
                      type="button"
                      className="generated-image-card__action"
                      onClick={() => setConnectModalStep('root')}
                      aria-label="Back to channel chooser"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <button
                      type="button"
                      className="generated-image-card__action"
                      onClick={closeConnectModal}
                      aria-label="Close connect channel dialog"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="scheduler-connection-flow">
                  <div className="scheduler-connection-card scheduler-connection-card--primary">
                    <div className="scheduler-connection-card__badge">
                      <RefreshCw size={14} />
                      Automatic posting for professional accounts
                    </div>
                    <div className="scheduler-connection-card__title">
                      <Instagram size={22} />
                      <strong>Professional (Business & Creator)</strong>
                    </div>
                    <ul className="scheduler-connection-card__list">
                      {instagramConnectionFeatures.map((feature) => (
                        <li key={feature}>
                          <CheckCircle2 size={16} />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      type="button"
                      size="lg"
                      onClick={() => {
                        void handleStartOAuth('instagram');
                      }}
                      disabled={scheduler.isBusy}
                    >
                      <Instagram size={16} />
                      Connect to Instagram
                    </Button>
                  </div>

                  <div className="scheduler-connection-card scheduler-connection-card--secondary">
                    <div className="scheduler-connection-card__title">
                      <Instagram size={22} />
                      <strong>Personal</strong>
                    </div>
                    <p>
                      Personal Instagram profiles are notification-only on tools like
                      Buffer. PrixmoAI does not support that notification flow yet, so
                      professional accounts are the supported path right now.
                    </p>
                    <Button type="button" variant="ghost" disabled>
                      Personal support coming soon
                    </Button>
                  </div>
                </div>
              </>
            ) : null}

            {connectModalStep === 'facebook' ? (
              <>
                <div className="scheduler-channel-modal__header">
                  <div>
                    <p className="section-eyebrow">Facebook channel</p>
                    <h3>Select what you want to connect</h3>
                    <p>
                      Facebook should stay Facebook-only here. Sign in with Facebook,
                      then PrixmoAI will let you choose the exact Page to add.
                    </p>
                  </div>
                  <div className="scheduler-channel-modal__header-actions">
                    <button
                      type="button"
                      className="generated-image-card__action"
                      onClick={() => setConnectModalStep('root')}
                      aria-label="Back to channel chooser"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <button
                      type="button"
                      className="generated-image-card__action"
                      onClick={closeConnectModal}
                      aria-label="Close connect channel dialog"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="scheduler-connection-flow">
                  <div className="scheduler-connection-card scheduler-connection-card--primary">
                    <div className="scheduler-connection-card__badge">
                      <Flag size={14} />
                      Page-based publishing
                    </div>
                    <div className="scheduler-connection-card__title">
                      <Facebook size={22} />
                      <strong>Facebook Page</strong>
                    </div>
                    <ul className="scheduler-connection-card__list">
                      {facebookConnectionFeatures.map((feature) => (
                        <li key={feature}>
                          <CheckCircle2 size={16} />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      type="button"
                      size="lg"
                      onClick={() => {
                        void handleStartOAuth('facebook');
                      }}
                      disabled={scheduler.isBusy}
                    >
                      <Facebook size={16} />
                      Continue with Facebook
                    </Button>
                  </div>

                  <div className="scheduler-connection-card scheduler-connection-card--secondary">
                    <div className="scheduler-connection-card__title">
                      <Flag size={22} />
                      <strong>Facebook Group</strong>
                    </div>
                    <p>
                      Meta removed direct Group publishing, so PrixmoAI is keeping
                      Groups out of the live scheduler until a notification-based flow
                      is added.
                    </p>
                    <Button type="button" variant="ghost" disabled>
                      Group flow coming soon
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {pendingFacebookSelection || isLoadingPendingFacebookPages ? (
        <div className="generated-image-lightbox scheduler-channel-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="generated-image-lightbox__backdrop"
            aria-label="Close Facebook Page picker"
            onClick={() => {
              setPendingFacebookSelection(null);
              setSelectedPendingFacebookPageIds([]);
            }}
          />
          <div className="generated-image-lightbox__panel scheduler-channel-modal__panel">
            <div className="scheduler-channel-modal__header">
              <div>
                <p className="section-eyebrow">Facebook Pages</p>
                <h3>Choose the Page to connect</h3>
                <p>
                  Buffer-style finish: pick the Facebook Pages you want to add to the
                  scheduler from the account you just authenticated.
                </p>
              </div>
              <button
                type="button"
                className="generated-image-card__action"
                onClick={() => {
                  setPendingFacebookSelection(null);
                  setSelectedPendingFacebookPageIds([]);
                }}
                aria-label="Close Facebook Page picker"
              >
                <X size={16} />
              </button>
            </div>

            {isLoadingPendingFacebookPages ? (
              <div className="scheduler-channel-empty scheduler-channel-empty--compact">
                <h3>Loading your Facebook Pages...</h3>
                <p>PrixmoAI is pulling the Page list from the Facebook login you just used.</p>
              </div>
            ) : pendingFacebookSelection ? (
              <>
                <div className="scheduler-facebook-selection">
                  {pendingFacebookSelection.pages.map((page) => {
                    const isSelected = selectedPendingFacebookPageIds.includes(page.pageId);

                    return (
                      <button
                        key={page.pageId}
                        type="button"
                        className={`scheduler-facebook-selection__card ${
                          isSelected ? 'scheduler-facebook-selection__card--selected' : ''
                        }`}
                        onClick={() => togglePendingFacebookPage(page.pageId)}
                      >
                        <div className="scheduler-facebook-selection__checkbox">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePendingFacebookPage(page.pageId)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </div>
                        <div className="scheduler-facebook-selection__copy">
                          <div className="scheduler-facebook-selection__title">
                            <strong>{page.accountName}</strong>
                            {page.alreadyConnected ? (
                              <span className="status-pill status-pill--published">
                                Already connected
                              </span>
                            ) : null}
                          </div>
                          <span>{page.profileUrl || page.accountId}</span>
                          {page.linkedInstagramUsername ? (
                            <small>
                              Linked Instagram: @{page.linkedInstagramUsername}
                            </small>
                          ) : (
                            <small>Facebook Page</small>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="scheduler-connection-info">
                  <Info size={16} />
                  <span>
                    You can connect multiple Pages here. PrixmoAI will only save the
                    ones you select.
                  </span>
                </div>

                <div className="scheduler-channel-disconnect__actions">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setPendingFacebookSelection(null);
                      setSelectedPendingFacebookPageIds([]);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      void handleFinalizePendingFacebookPages();
                    }}
                    disabled={
                      !selectedPendingFacebookPageIds.length || scheduler.isBusy
                    }
                  >
                    <Facebook size={16} />
                    Connect selected Pages
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {disconnectTarget ? (
        <div className="generated-image-lightbox scheduler-channel-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="generated-image-lightbox__backdrop"
            aria-label="Close disconnect channel dialog"
            onClick={() => {
              setDisconnectTarget(null);
              setDisconnectValue('');
            }}
          />
          <div className="generated-image-lightbox__panel scheduler-channel-modal__panel scheduler-channel-modal__panel--disconnect">
            <div className="scheduler-channel-modal__header">
              <div>
                <h3>Disconnect {getAccountDisplayName(disconnectTarget)}</h3>
                <p>
                  This will remove the channel from the scheduler until you connect it
                  again.
                </p>
              </div>
              <button
                type="button"
                className="generated-image-card__action"
                onClick={() => {
                  setDisconnectTarget(null);
                  setDisconnectValue('');
                }}
                aria-label="Close disconnect channel dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="scheduler-channel-disconnect__summary">
              <div className="scheduler-channel-card__avatar-stack">
                <div className="scheduler-channel-card__avatar">
                  <span>{getAccountInitials(disconnectTarget)}</span>
                </div>
                <span
                  className={`scheduler-channel-card__platform scheduler-channel-card__platform--${disconnectTarget.platform}`}
                >
                  {getPlatformBadgeIcon(disconnectTarget.platform)}
                </span>
              </div>
              <div className="scheduler-channel-disconnect__copy">
                <strong>{getAccountDisplayName(disconnectTarget)}</strong>
                <span>{getPlatformLabel(disconnectTarget.platform)}</span>
              </div>
            </div>

            <div className="scheduler-channel-disconnect__body">
              <p>
                You will stop scheduling to this account until it is connected again.
                If the connection just looks stale, try refreshing it first from the
                channel menu.
              </p>
              <Input
                label='Type "disconnect" to confirm'
                value={disconnectValue}
                onChange={(event) => setDisconnectValue(event.target.value)}
                placeholder="disconnect"
              />
            </div>

            <div className="scheduler-channel-disconnect__actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDisconnectTarget(null);
                  setDisconnectValue('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void handleDisconnectAccount();
                }}
                disabled={disconnectValue.trim().toLowerCase() !== 'disconnect' || scheduler.isBusy}
                className="scheduler-channel-disconnect__button"
              >
                <Trash2 size={16} />
                Disconnect channel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
