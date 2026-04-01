import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  Facebook,
  Flag,
  Info,
  ImagePlus,
  Instagram,
  Linkedin,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Twitter,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { useScheduler } from '../../hooks/useScheduler';
import { cn, formatDateTime } from '../../lib/utils';
import type {
  MetaOAuthPopupResult,
  PendingMetaFacebookPageSelection,
  ScheduledPost,
  ScheduledPostStatus,
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

export const SchedulerPage = () => {
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
  const [postForm, setPostForm] = useState({
    socialAccountId: '',
    caption: '',
    mediaUrl: '',
    mediaType: null as SchedulerMediaType | null,
    scheduledFor: defaultDateTime,
  });
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const [queuedMediaName, setQueuedMediaName] = useState<string | null>(null);
  const [isMediaDragActive, setIsMediaDragActive] = useState(false);
  const [isComposerMediaPreviewExpanded, setIsComposerMediaPreviewExpanded] =
    useState(false);
  const [liveNow, setLiveNow] = useState(() => Date.now());

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
    if (!scheduler.accounts?.items.length) {
      setPostForm((current) =>
        current.socialAccountId ? { ...current, socialAccountId: '' } : current
      );
      return;
    }

    setPostForm((current) =>
      scheduler.accounts?.items.some((account) => account.id === current.socialAccountId)
        ? current
        : { ...current, socialAccountId: scheduler.accounts?.items[0]?.id || '' }
    );
  }, [scheduler.accounts]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLiveNow(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const connectedAccounts = scheduler.accounts?.items ?? [];
  const queuedPosts = scheduler.posts?.items ?? [];
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
  const isScheduledTimeValid = isSchedulableDateTimeValue(postForm.scheduledFor, liveNow);
  const connectedAccountById = useMemo(
    () =>
      Object.fromEntries(connectedAccounts.map((account) => [account.id, account])) as Record<
        string,
        SocialAccount
      >,
    [connectedAccounts]
  );
  const selectedAccount = connectedAccounts.find(
    (account) => account.id === postForm.socialAccountId
  );
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
  const filteredQueuedPosts = useMemo(() => {
    const activeTab = queueTabs.find((tab) => tab.id === activeQueueTab) ?? queueTabs[0];

    return queuedPosts.filter((post) => activeTab.statuses.includes(post.status));
  }, [activeQueueTab, queuedPosts]);

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

  const resolveComposerMediaUrl = async () => {
    const currentMediaUrl = mediaUrlInput.trim();

    if (!currentMediaUrl) {
      setPostForm((current) =>
        current.mediaUrl || current.mediaType
          ? {
              ...current,
              mediaUrl: '',
              mediaType: null,
            }
          : current
      );
      return {
        mediaUrl: '',
        mediaType: null as SchedulerMediaType | null,
      };
    }

    if (isManagedMediaUrl(currentMediaUrl)) {
      const resolvedMediaType = postForm.mediaType ?? inferMediaTypeFromUrl(currentMediaUrl);
      setPostForm((current) => ({
        ...current,
        mediaUrl: currentMediaUrl,
        mediaType: resolvedMediaType,
      }));
      return {
        mediaUrl: currentMediaUrl,
        mediaType: resolvedMediaType,
      };
    }

    const uploaded = await scheduler.importExternalMediaUrl(currentMediaUrl);
    setPostForm((current) => ({
      ...current,
      mediaUrl: uploaded.sourceImageUrl,
      mediaType: uploaded.mediaType,
    }));
    setMediaUrlInput(uploaded.sourceImageUrl);
    setQueuedMediaName((current) => current || 'Imported from URL');
    return {
      mediaUrl: uploaded.sourceImageUrl,
      mediaType: uploaded.mediaType,
    };
  };

  const submitPost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.info('[scheduler] Schedule post submit triggered');

    if (!postForm.socialAccountId) {
      setComposerError('Select a social account before scheduling.');
      setComposerNotice(null);
      return;
    }

    if (!postForm.scheduledFor) {
      setComposerError('Choose a scheduled time before scheduling.');
      setComposerNotice(null);
      return;
    }

    if (!isSchedulableDateTimeValue(postForm.scheduledFor, Date.now())) {
      setComposerError(SCHEDULE_TIME_VALIDATION_MESSAGE);
      setComposerNotice(null);
      return;
    }

    if (!postForm.mediaUrl && !mediaUrlInput.trim()) {
      setComposerError('Add image or video media before scheduling this post.');
      setComposerNotice(null);
      return;
    }

    try {
      setComposerError(null);
      const resolvedMedia = await resolveComposerMediaUrl();

      if (!resolvedMedia.mediaUrl || !resolvedMedia.mediaType) {
        throw new Error('Add image or video media before scheduling this post.');
      }

      await scheduler.createPost({
        ...postForm,
        mediaUrl: resolvedMedia.mediaUrl,
        mediaType: resolvedMedia.mediaType,
        scheduledFor: new Date(postForm.scheduledFor).toISOString(),
      });
      setComposerNotice('Scheduled post created.');
      setOauthNotice('Scheduled post created.');
      setPostForm((current) => ({
        ...current,
        caption: '',
        mediaUrl: '',
        mediaType: null,
        scheduledFor: defaultDateTime,
      }));
      setMediaUrlInput('');
      setQueuedMediaName(null);
      setIsComposerMediaPreviewExpanded(false);
    } catch (submitError) {
      setComposerNotice(null);
      setComposerError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to create scheduled post.'
      );
    }
  };

  const uploadPostMedia = async (file: File) => {
    const uploaded = await scheduler.uploadPostMedia(file);
    setComposerError(null);
    setPostForm((current) => ({
      ...current,
      mediaUrl: uploaded.sourceImageUrl,
      mediaType: uploaded.mediaType,
    }));
    setMediaUrlInput(uploaded.sourceImageUrl);
    setQueuedMediaName(file.name);
    setIsComposerMediaPreviewExpanded(false);
    return uploaded;
  };

  const handleMediaFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    await uploadPostMedia(file);
    event.target.value = '';
  };

  const handleMediaDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsMediaDragActive(false);

    const file = event.dataTransfer.files?.[0];

    if (!file) {
      return;
    }

    await uploadPostMedia(file);
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
      {oauthNotice ? <div className="message">{oauthNotice}</div> : null}

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
            <p className="section-eyebrow">Queue post</p>
            <h3>Create a scheduled post</h3>
          </div>
        </div>
        <form className="form-grid" onSubmit={submitPost}>
          <Select
            label="Social account"
            value={postForm.socialAccountId}
            onChange={(event) =>
              setPostForm((current) => ({
                ...current,
                socialAccountId: event.target.value,
              }))
            }
          >
            <option value="">Select an account</option>
            {connectedAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {getAccountDisplayName(account)}
              </option>
            ))}
          </Select>
          <Input
            label="Media URL"
            value={mediaUrlInput}
            onChange={(event) => {
              setComposerError(null);
              setComposerNotice(null);
              setQueuedMediaName(null);
              setMediaUrlInput(event.target.value);
              setPostForm((current) => ({
                ...current,
                mediaUrl: '',
                mediaType: null,
              }));
              setIsComposerMediaPreviewExpanded(false);
            }}
            onBlur={() => {
              void resolveComposerMediaUrl().catch(() => {});
            }}
            placeholder="https://..."
          />
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
            <span className="field__label">Upload media</span>
            <div className="generator-upload__copy">
              <ImagePlus size={18} />
              <div>
                <strong>
                  {scheduler.isUploadingMedia
                    ? 'Uploading media...'
                    : 'Upload media (image or video)'}
                </strong>
                <span>JPG, PNG, WEBP, MP4, or MOV</span>
              </div>
            </div>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={(event) => {
                void handleMediaFileChange(event);
              }}
            />
          </label>
          {postForm.mediaUrl && postForm.mediaType ? (
            <div className="field field--full scheduler-inline-media">
              <div className="scheduler-inline-media__summary">
                <MediaThumbnail
                  src={postForm.mediaUrl}
                  alt={queuedMediaName || 'Uploaded media ready'}
                  mediaType={postForm.mediaType}
                  size="sm"
                />
                <div className="scheduler-inline-media__copy">
                  <strong>{queuedMediaName || 'Uploaded media ready'}</strong>
                  <span>
                    {selectedAccount
                      ? `Will post to ${getAccountDisplayName(selectedAccount)}`
                      : 'Media attached to this scheduled post'}
                  </span>
                </div>
                <div className="scheduler-inline-media__actions">
                  <button
                    type="button"
                    className="queue-post-item__action"
                    onClick={() =>
                      setIsComposerMediaPreviewExpanded((current) => !current)
                    }
                  >
                    {isComposerMediaPreviewExpanded ? <EyeOff size={15} /> : <Eye size={15} />}
                    <span>{isComposerMediaPreviewExpanded ? 'Hide' : 'Preview'}</span>
                  </button>
                  <button
                    type="button"
                    className="queue-post-item__action queue-post-item__action--danger"
                    onClick={() => {
                      setPostForm((current) => ({
                        ...current,
                        mediaUrl: '',
                        mediaType: null,
                      }));
                      setMediaUrlInput('');
                      setQueuedMediaName(null);
                      setIsComposerMediaPreviewExpanded(false);
                    }}
                    aria-label="Remove uploaded media"
                  >
                    <Trash2 size={15} />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
              <div
                className={cn(
                  'queue-post-item__preview',
                  isComposerMediaPreviewExpanded && 'queue-post-item__preview--open'
                )}
              >
                <MediaPreview
                  src={postForm.mediaUrl}
                  alt={queuedMediaName || 'Uploaded media ready'}
                  mediaType={postForm.mediaType}
                />
              </div>
            </div>
          ) : null}
          <label className="field field--full">
            <span className="field__label">Caption</span>
            <textarea
              className="field__control field__control--textarea"
              rows={4}
              value={postForm.caption}
              onChange={(event) => {
                setComposerError(null);
                setComposerNotice(null);
                setPostForm((current) => ({ ...current, caption: event.target.value }));
              }}
            />
          </label>
          <Input
            label="Scheduled for"
            type="datetime-local"
            value={postForm.scheduledFor}
            min={minimumScheduleDateTime}
            onChange={(event) => {
              setComposerNotice(null);
              const nextValue = event.target.value;
              setPostForm((current) => ({
                ...current,
                scheduledFor: nextValue,
              }));
              setComposerError(
                nextValue && !isSchedulableDateTimeValue(nextValue, Date.now())
                  ? SCHEDULE_TIME_VALIDATION_MESSAGE
                  : null
              );
            }}
          />
          <div className="field field--full">
            <ErrorMessage message={composerError} />
            {composerNotice ? (
              <div className="message message--success" role="status" aria-live="polite">
                {composerNotice}
              </div>
            ) : null}
            <Button
              type="submit"
              size="sm"
              className="scheduler-composer__submit"
              disabled={
                scheduler.isBusy ||
                !postForm.socialAccountId ||
                !postForm.scheduledFor ||
                !isScheduledTimeValid ||
                (!postForm.mediaUrl && !mediaUrlInput.trim())
              }
            >
              <Send size={16} />
              {scheduler.isBusy ? 'Scheduling...' : 'Schedule post'}
            </Button>
          </div>
        </form>
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
