import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Edit3,
  ImagePlus,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Search as SearchIcon,
  Sparkles,
  CalendarClock,
  Settings,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { CaptionList } from '../../components/generate/CaptionList';
import { GenerationBlackHoleLoader } from '../../components/generate/GenerationBlackHoleLoader';
import { GeneratedImage } from '../../components/generate/GeneratedImage';
import { HashtagDisplay } from '../../components/generate/HashtagDisplay';
import { ReelScript } from '../../components/generate/ReelScript';
import { RegenerateButton } from '../../components/generate/RegenerateButton';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { CurrentPlanBadge } from '../../components/billing/CurrentPlanBadge';
import { useBilling } from '../../hooks/useBilling';
import { useBrandProfile } from '../../hooks/useBrandProfile';
import { useGenerateWorkspace } from '../../hooks/useGenerateWorkspace';
import { useAuth } from '../../hooks/useAuth';
import { useAnalytics } from '../../hooks/useAnalytics';
import { APP_NAME } from '../../lib/constants';
import {
  CONTENT_GOAL_OPTIONS,
  CONTENT_PLATFORM_OPTIONS,
  CONTENT_TONE_OPTIONS,
  IMAGE_BACKGROUND_OPTIONS,
} from '../../lib/constants';
import { formatDateTime, splitKeywords } from '../../lib/utils';
import type {
  CaptionVariant,
  GenerateConversation,
  GenerateConversationAsset,
  GenerateConversationMessage,
  GeneratedImage as GeneratedImageRecord,
  ReelScript as ReelScriptType,
} from '../../types';

type WorkspaceMode = 'copy' | 'image';

const WORKSPACE_MENU_ITEMS = [
  { label: 'Generate', href: '/app/generate', icon: Sparkles },
  { label: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
  { label: 'Analytics', href: '/app/analytics', icon: BarChart3 },
  { label: 'Scheduler', href: '/app/scheduler', icon: CalendarClock },
  { label: 'Billing', href: '/app/billing', icon: CreditCard },
  { label: 'Settings', href: '/app/settings', icon: Settings },
] as const;

const DEFAULT_CONTENT_FORM = {
  productName: '',
  productDescription: '',
  platform: 'Instagram',
  goal: 'Drive product discovery and clicks',
  tone: 'Trendy and persuasive',
  audience: '',
};

const DEFAULT_IMAGE_FORM = {
  productName: '',
  productDescription: '',
  backgroundStyle: '',
  sourceImageUrl: '',
  prompt: '',
};

const GENERATE_SIDEBAR_COLLAPSED_STORAGE_KEY =
  'prixmoai.generate.sidebarCollapsed';
const GENERATE_COMPOSER_COLLAPSED_STORAGE_KEY =
  'prixmoai.generate.composerCollapsed';

const readStoredGenerateSidebarCollapsed = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(GENERATE_SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
};

const readStoredGenerateComposerCollapsed = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.localStorage.getItem(GENERATE_COMPOSER_COLLAPSED_STORAGE_KEY) === 'true'
  );
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toCaptionVariants = (value: unknown): CaptionVariant[] =>
  Array.isArray(value)
    ? value
        .map((entry) => {
          const record = toRecord(entry);
          const hook =
            typeof record.hook === 'string' ? record.hook.trim() : '';
          const mainCopy =
            typeof record.mainCopy === 'string' ? record.mainCopy.trim() : '';
          const shortCaption =
            typeof record.shortCaption === 'string'
              ? record.shortCaption.trim()
              : '';
          const cta = typeof record.cta === 'string' ? record.cta.trim() : '';

          if (!hook || !mainCopy || !shortCaption || !cta) {
            return null;
          }

          return {
            hook,
            mainCopy,
            shortCaption,
            cta,
          };
        })
        .filter((entry): entry is CaptionVariant => Boolean(entry))
    : [];

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

const toReelScript = (value: unknown): ReelScriptType | null => {
  const record = toRecord(value);
  const hook = typeof record.hook === 'string' ? record.hook.trim() : '';
  const body = typeof record.body === 'string' ? record.body.trim() : '';
  const cta = typeof record.cta === 'string' ? record.cta.trim() : '';

  if (!hook || !body || !cta) {
    return null;
  }

  return {
    hook,
    body,
    cta,
  };
};

const toGeneratedImage = (value: unknown): GeneratedImageRecord | null => {
  const record = toRecord(value);
  const imageRecord = toRecord(record.image ?? value);

  const id = typeof imageRecord.id === 'string' ? imageRecord.id : '';
  const userId = typeof imageRecord.userId === 'string' ? imageRecord.userId : '';
  const contentId =
    typeof imageRecord.contentId === 'string' ? imageRecord.contentId : null;
  const conversationId =
    typeof imageRecord.conversationId === 'string'
      ? imageRecord.conversationId
      : null;
  const sourceImageUrl =
    typeof imageRecord.sourceImageUrl === 'string'
      ? imageRecord.sourceImageUrl
      : null;
  const generatedImageUrl =
    typeof imageRecord.generatedImageUrl === 'string'
      ? imageRecord.generatedImageUrl
      : '';
  const backgroundStyle =
    typeof imageRecord.backgroundStyle === 'string'
      ? imageRecord.backgroundStyle
      : null;
  const prompt =
    typeof imageRecord.prompt === 'string' ? imageRecord.prompt : null;
  const createdAt =
    typeof imageRecord.createdAt === 'string'
      ? imageRecord.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof imageRecord.updatedAt === 'string'
      ? imageRecord.updatedAt
      : createdAt;
  const provider =
    typeof imageRecord.provider === 'string' ? imageRecord.provider : undefined;

  if (!generatedImageUrl) {
    return null;
  }

  return {
    id: id || generatedImageUrl,
    userId,
    contentId,
    conversationId,
    sourceImageUrl,
    generatedImageUrl,
    backgroundStyle,
    prompt,
    createdAt,
    updatedAt,
    provider,
  };
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const diff = Date.now() - date.getTime();
  const hours = Math.round(diff / (1000 * 60 * 60));

  if (hours < 1) {
    return 'Just now';
  }

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

const formatMessageTimestamp = (value: string) => formatDateTime(value);

const getConversationIcon = (conversation: GenerateConversation) =>
  conversation.type === 'image' ? (
    <ImagePlus size={16} />
  ) : conversation.type === 'copy' ? (
    <Sparkles size={16} />
  ) : (
    <MessageSquare size={16} />
  );

const getMessageModeLabel = (message: GenerateConversationMessage) => {
  const mode = message.metadata.mode;
  return typeof mode === 'string' ? `${mode} request` : message.messageType;
};

const trimInlineText = (value: string, maxLength = 180) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trimEnd()}…`
    : normalized;
};

const getUserMessageContent = (message: GenerateConversationMessage) => {
  if (message.role !== 'user') {
    if (message.metadata.mode === 'image') {
      return null;
    }

    return message.content;
  }

  const input = toRecord(message.metadata.input);
  const mode = message.metadata.mode;
  const productName =
    typeof input.productName === 'string' ? input.productName.trim() : '';
  const productDescription =
    typeof input.productDescription === 'string'
      ? input.productDescription.trim()
      : '';

  if (mode === 'image') {
    const fragments = [
      productName ? `Generate an image for "${productName}"` : 'Generate an image',
      typeof input.sourceImageUrl === 'string' && input.sourceImageUrl.trim()
        ? 'Reference image attached'
        : null,
      typeof input.backgroundStyle === 'string' && input.backgroundStyle.trim()
        ? `Background: ${input.backgroundStyle.trim()}`
        : null,
    ].filter(Boolean);

    return productDescription
      ? `${fragments.join(' ')}. ${trimInlineText(productDescription, 140)}`
      : `${fragments.join(' ')}.`;
  }

  if (mode === 'copy') {
    const fragments = [
      productName ? `Create copy for "${productName}"` : 'Create copy',
      typeof input.platform === 'string' && input.platform.trim()
        ? `for ${input.platform.trim()}`
        : null,
      typeof input.goal === 'string' && input.goal.trim()
        ? `with the goal "${input.goal.trim()}"`
        : null,
    ].filter(Boolean);

    return productDescription
      ? `${fragments.join(' ')}. ${trimInlineText(productDescription, 140)}`
      : `${fragments.join(' ')}.`;
  }

  return message.content;
};

const getProfileAvatar = (avatarUrl: string | null | undefined, fullName?: string | null) => {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={fullName || 'Workspace owner'} />;
  }

  return (fullName || 'P').slice(0, 1);
};

const getUsageSnapshot = (used: number, limit: number | null) => {
  if (limit === null) {
    return {
      used,
      remaining: null,
      percentLeft: null,
    };
  }

  const safeUsed = Math.max(0, used);
  const remaining = Math.max(0, limit - safeUsed);
  const percentLeft = limit > 0 ? Math.max(0, Math.round((remaining / limit) * 100)) : 0;

  return {
    used: safeUsed,
    remaining,
    percentLeft,
  };
};

const hydrateCopyInput = (message: GenerateConversationMessage) => {
  const input = toRecord(message.metadata.input);
  const productName =
    typeof input.productName === 'string' ? input.productName : '';

  if (!productName) {
    return null;
  }

  return {
    productName,
    productDescription:
      typeof input.productDescription === 'string'
        ? input.productDescription
        : '',
    platform:
      typeof input.platform === 'string' ? input.platform : DEFAULT_CONTENT_FORM.platform,
    goal: typeof input.goal === 'string' ? input.goal : DEFAULT_CONTENT_FORM.goal,
    tone: typeof input.tone === 'string' ? input.tone : DEFAULT_CONTENT_FORM.tone,
    audience: typeof input.audience === 'string' ? input.audience : '',
    keywords: toStringArray(input.keywords),
  };
};

const hydrateImageInput = (message: GenerateConversationMessage) => {
  const input = toRecord(message.metadata.input);
  const productName =
    typeof input.productName === 'string' ? input.productName : '';

  if (!productName) {
    return null;
  }

  return {
    productName,
    productDescription:
      typeof input.productDescription === 'string'
        ? input.productDescription
        : '',
    backgroundStyle:
      typeof input.backgroundStyle === 'string' ? input.backgroundStyle : '',
    sourceImageUrl:
      typeof input.sourceImageUrl === 'string' ? input.sourceImageUrl : '',
    prompt: typeof input.prompt === 'string' ? input.prompt : '',
  };
};

const AssistantAssets = ({
  assets,
  showImageWatermark,
}: {
  assets: GenerateConversationAsset[];
  showImageWatermark: boolean;
}) => {
  const copyAsset = assets.find((asset) => asset.assetType === 'copy');
  const hashtagAsset = assets.find((asset) => asset.assetType === 'hashtags');
  const scriptAsset = assets.find((asset) => asset.assetType === 'script');
  const imageAsset = assets.find((asset) => asset.assetType === 'image');

  const captions = copyAsset
    ? toCaptionVariants(copyAsset.payload.captions)
    : [];
  const hashtags = hashtagAsset
    ? toStringArray(hashtagAsset.payload.hashtags)
    : [];
  const reelScript = scriptAsset
    ? toReelScript(scriptAsset.payload.reelScript)
    : null;
  const image = imageAsset ? toGeneratedImage(imageAsset.payload) : null;

  if (!captions.length && !hashtags.length && !reelScript && !image) {
    return null;
  }

  return (
    <div className="generate-chat__assistant-assets">
      {captions.length ? <CaptionList captions={captions} /> : null}
      {hashtags.length ? <HashtagDisplay hashtags={hashtags} /> : null}
      {reelScript ? <ReelScript script={reelScript} /> : null}
      {image ? (
        <GeneratedImage image={image} showWatermark={showImageWatermark} />
      ) : null}
    </div>
  );
};

export const GeneratePage = () => {
  const workspace = useGenerateWorkspace();
  const { subscription, catalog, isLoading: isBillingLoading } = useBilling();
  const { overview, isLoading: isAnalyticsLoading } = useAnalytics();
  const { profile } = useBrandProfile();
  const { signOut } = useAuth();
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceMode>('copy');
  const [isConversationSidebarCollapsed, setIsConversationSidebarCollapsed] =
    useState(() => readStoredGenerateSidebarCollapsed());
  const [isComposerCollapsed, setIsComposerCollapsed] = useState(() =>
    readStoredGenerateComposerCollapsed()
  );
  const [editingConversationId, setEditingConversationId] = useState<string | null>(
    null
  );
  const [draftTitle, setDraftTitle] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [contentForm, setContentForm] = useState(DEFAULT_CONTENT_FORM);
  const [imageForm, setImageForm] = useState(DEFAULT_IMAGE_FORM);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  useEffect(() => {
    if (!workspace.activeThread) {
      return;
    }

    const reversedMessages = [...workspace.activeThread.messages].reverse();
    const lastCopyMessage = reversedMessages.find(
      (message) => message.role === 'user' && message.metadata.mode === 'copy'
    );
    const lastImageMessage = reversedMessages.find(
      (message) => message.role === 'user' && message.metadata.mode === 'image'
    );

    if (lastCopyMessage) {
      const hydratedCopy = hydrateCopyInput(lastCopyMessage);
      if (hydratedCopy) {
        setContentForm({
          productName: hydratedCopy.productName,
          productDescription: hydratedCopy.productDescription,
          platform: hydratedCopy.platform,
          goal: hydratedCopy.goal,
          tone: hydratedCopy.tone,
          audience: hydratedCopy.audience,
        });
        setKeywordInput(hydratedCopy.keywords.join(', '));
      }
    }

    if (lastImageMessage) {
      const hydratedImage = hydrateImageInput(lastImageMessage);
      if (hydratedImage) {
        setImageForm(hydratedImage);
      }
    }
  }, [workspace.activeThread]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [
    workspace.activeThread,
    workspace.isGeneratingCopy,
    workspace.isGeneratingImage,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      GENERATE_SIDEBAR_COLLAPSED_STORAGE_KEY,
      String(isConversationSidebarCollapsed)
    );
  }, [isConversationSidebarCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      GENERATE_COMPOSER_COLLAPSED_STORAGE_KEY,
      String(isComposerCollapsed)
    );
  }, [isComposerCollapsed]);

  useEffect(() => {
    if (!workspace.error) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      workspace.setError(null);
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [workspace.error, workspace.setError]);

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isAccountMenuOpen]);


  const filteredConversations = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    if (!normalizedSearch) {
      return workspace.conversations;
    }

    return workspace.conversations.filter((conversation) => {
      const haystack = [
        conversation.title,
        conversation.lastMessagePreview ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [searchQuery, workspace.conversations]);

  const activeConversation =
    workspace.activeThread?.conversation ??
    workspace.conversations.find(
      (conversation) => conversation.id === workspace.activeConversationId
    ) ??
    null;
  const hasActiveMessages = Boolean(workspace.activeThread?.messages.length);
  const activeFormId =
    activeWorkspace === 'copy' ? 'generate-copy-form' : 'generate-image-form';
  const currentPlan = subscription?.plan ?? catalog?.currentSubscription.plan ?? 'free';
  const monthlyLimit =
    subscription?.monthlyLimit ?? catalog?.currentSubscription.monthlyLimit ?? null;
  const contentUsage = getUsageSnapshot(
    overview?.generation.contentGenerationsThisMonth ?? 0,
    monthlyLimit
  );
  const imageUsage = getUsageSnapshot(
    overview?.generation.imageGenerationsThisMonth ?? 0,
    monthlyLimit
  );
  const isUsageLoading = isBillingLoading || isAnalyticsLoading;
  const usageSummary =
    monthlyLimit === null
      ? 'Unlimited access'
      : isUsageLoading
        ? 'Checking limits…'
        : `Copy ${contentUsage.percentLeft ?? 0}% • Image ${imageUsage.percentLeft ?? 0}% left`;
  const shouldWatermarkImages =
    !subscription || subscription.plan === 'free';
  const threadTitle = activeConversation?.title || 'New conversation';
  const threadDescription = activeConversation
    ? 'Everything generated in this thread stays here.'
    : 'Generate copy or images below and PrixmoAI will keep the thread history here.';
  const brandProfileHint = useMemo(() => {
    if (!profile) {
      return null;
    }

    const parts = [
      profile.fullName || null,
      profile.industry || null,
      profile.brandVoice ? `${profile.brandVoice} voice` : null,
      profile.targetAudience ? `${profile.targetAudience} audience` : null,
    ].filter(Boolean);

    if (!parts.length) {
      return null;
    }

    return parts.join(' • ');
  }, [profile]);

  const resetComposer = () => {
    setActiveWorkspace('copy');
    setKeywordInput('');
    setContentForm(DEFAULT_CONTENT_FORM);
    setImageForm(DEFAULT_IMAGE_FORM);
  };

  const startFreshChat = () => {
    workspace.startNewChat();
    resetComposer();
  };

  const handleRenameConversation = async (conversationId: string) => {
    try {
      await workspace.renameConversation(conversationId, draftTitle);
      setEditingConversationId(null);
      setDraftTitle('');
    } catch (error) {
      workspace.setError(
        error instanceof Error ? error.message : 'Failed to rename conversation'
      );
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    const shouldDelete = window.confirm(
      'Delete this conversation? This will remove it from your workspace list.'
    );

    if (!shouldDelete) {
      return;
    }

    try {
      await workspace.deleteConversation(conversationId);
      if (activeConversation?.id === conversationId) {
        resetComposer();
      }
    } catch (error) {
      workspace.setError(
        error instanceof Error ? error.message : 'Failed to delete conversation'
      );
    }
  };

  const handleSubmitCopy = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await workspace.generateCopy({
        ...contentForm,
        keywords: splitKeywords(keywordInput),
      });
    } catch {
      return;
    }
  };

  const handleSubmitImage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await workspace.generateImage({
        ...imageForm,
        width: 768,
        height: 768,
        sourceImageUrl: imageForm.sourceImageUrl || undefined,
        prompt: imageForm.prompt || undefined,
      });
    } catch {
      return;
    }
  };

  const handleSourceImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const uploaded = await workspace.uploadSourceImage(file);
      setImageForm((current) => ({
        ...current,
        sourceImageUrl: uploaded.sourceImageUrl,
      }));
      setActiveWorkspace('image');
    } catch {
      return;
    } finally {
      event.target.value = '';
    }
  };

  const regenerateCopy = () => {
    void workspace
      .generateCopy({
        ...contentForm,
        keywords: splitKeywords(keywordInput),
      })
      .catch(() => undefined);
  };

  const regenerateImage = () => {
    void workspace
      .generateImage({
        ...imageForm,
        width: 768,
        height: 768,
        sourceImageUrl: imageForm.sourceImageUrl || undefined,
        prompt: imageForm.prompt || undefined,
      })
      .catch(() => undefined);
  };

  return (
    <div
      className={`generate-chat ${
        isConversationSidebarCollapsed ? 'generate-chat--sidebar-collapsed' : ''
      }`}
    >
      <Card
        className={`generate-chat__sidebar ${
          isConversationSidebarCollapsed ? 'generate-chat__sidebar--collapsed' : ''
        }`}
      >
        <div className="generate-chat__brand-row">
          <div className="generate-chat__brand">
            <div className="generate-chat__brand-mark">
              <span className="topbar__brand-dot" />
              {!isConversationSidebarCollapsed ? <strong>{APP_NAME}</strong> : null}
            </div>
            {!isConversationSidebarCollapsed ? <p>Conversation memory</p> : null}
          </div>

          <button
            type="button"
            className="generate-chat__sidebar-toggle"
            onClick={() =>
              setIsConversationSidebarCollapsed((current) => !current)
            }
            aria-label={
              isConversationSidebarCollapsed
                ? 'Expand conversations panel'
                : 'Collapse conversations panel'
            }
            title={
              isConversationSidebarCollapsed
                ? 'Expand conversations panel'
                : 'Collapse conversations panel'
            }
          >
            {isConversationSidebarCollapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
        </div>

        <div className="generate-chat__sidebar-actions">
          <Button
            type="button"
            size="sm"
            className="generate-chat__new-chat"
            onClick={startFreshChat}
            title="Start a new chat"
          >
            <Sparkles size={16} />
            {!isConversationSidebarCollapsed ? 'New chat' : null}
          </Button>
        </div>

        {!isConversationSidebarCollapsed ? (
          <label className="generate-chat__search">
            <SearchIcon size={16} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search conversations"
            />
          </label>
        ) : null}

        <div
          className="generate-chat__conversation-list"
          data-lenis-prevent
          data-lenis-prevent-wheel
          data-lenis-prevent-touch
        >
          {workspace.isLoadingConversations ? (
            <div className="generate-chat__sidebar-state">
              <LoadingSpinner label="Loading conversations" />
            </div>
          ) : filteredConversations.length ? (
            filteredConversations.map((conversation) => {
              const isActive = conversation.id === activeConversation?.id;
              const isEditing = editingConversationId === conversation.id;

              return (
                <div
                  key={conversation.id}
                  className={`generate-chat__conversation-item ${
                    isActive ? 'generate-chat__conversation-item--active' : ''
                  } ${
                    isEditing ? 'generate-chat__conversation-item--editing' : ''
                  }`}
                >
                  {isEditing ? (
                    <>
                      <div className="generate-chat__conversation-icon">
                        {getConversationIcon(conversation)}
                      </div>
                      <div className="generate-chat__conversation-copy">
                        <input
                          className="generate-chat__conversation-input"
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              void handleRenameConversation(conversation.id);
                            }

                            if (event.key === 'Escape') {
                              setEditingConversationId(null);
                              setDraftTitle('');
                            }
                          }}
                          autoFocus
                        />
                        <span>{conversation.lastMessagePreview || 'No messages yet'}</span>
                      </div>
                      <div className="generate-chat__conversation-meta">
                        <div className="generate-chat__conversation-actions generate-chat__conversation-actions--visible">
                          <button
                            type="button"
                            onClick={() => void handleRenameConversation(conversation.id)}
                            aria-label="Save conversation title"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingConversationId(null);
                              setDraftTitle('');
                            }}
                            aria-label="Cancel rename"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    </>
                  ) : isConversationSidebarCollapsed ? (
                    <button
                      type="button"
                      className={`generate-chat__conversation-pill ${
                        isActive ? 'generate-chat__conversation-pill--active' : ''
                      }`}
                      onClick={() => workspace.openConversation(conversation.id)}
                      aria-label={conversation.title}
                      title={conversation.title}
                    >
                      <div className="generate-chat__conversation-icon">
                        {getConversationIcon(conversation)}
                      </div>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="generate-chat__conversation-button"
                        onClick={() => workspace.openConversation(conversation.id)}
                      >
                        <div className="generate-chat__conversation-icon">
                          {getConversationIcon(conversation)}
                        </div>
                        <div className="generate-chat__conversation-copy">
                          <strong>{conversation.title}</strong>
                          <span>{conversation.lastMessagePreview || 'No messages yet'}</span>
                        </div>
                      </button>

                      <div className="generate-chat__conversation-meta">
                        <time>{formatTimestamp(conversation.updatedAt)}</time>
                        <div className="generate-chat__conversation-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingConversationId(conversation.id);
                              setDraftTitle(conversation.title);
                            }}
                            aria-label="Rename conversation"
                            title="Rename conversation"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteConversation(conversation.id)}
                            aria-label="Delete conversation"
                            title="Delete conversation"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          ) : (
            isConversationSidebarCollapsed ? null : (
              <div className="generate-chat__sidebar-state">
                <EmptyState
                  title="No conversations yet"
                  description="Start a new chat and every generation will stay inside its own thread."
                />
              </div>
            )
          )}
        </div>

        <div className="generate-chat__account" ref={accountMenuRef}>
          {isAccountMenuOpen ? (
            <div
              className={`generate-chat__account-menu ${
                isConversationSidebarCollapsed
                  ? 'generate-chat__account-menu--collapsed'
                  : ''
              }`}
            >
              <div className="generate-chat__account-menu-header">
                <div className="generate-chat__account-menu-header-row">
                  <strong>{profile?.fullName || 'Workspace Owner'}</strong>
                  <CurrentPlanBadge
                    plan={currentPlan}
                    className="generate-chat__plan-badge"
                  />
                </div>
                <span>{profile?.industry || 'Open workspace options'}</span>
              </div>

              <nav className="generate-chat__account-menu-links" aria-label="Workspace navigation">
                {WORKSPACE_MENU_ITEMS.map((item) => {
                  const Icon = item.icon;

                  return (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      className={({ isActive }) =>
                        `generate-chat__account-menu-link ${
                          isActive ? 'generate-chat__account-menu-link--active' : ''
                        }`
                      }
                      onClick={() => setIsAccountMenuOpen(false)}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </nav>

              <button
                className="generate-chat__account-menu-signout"
                type="button"
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  void signOut();
                }}
              >
                <LogOut size={16} />
                <span>Sign out</span>
              </button>
            </div>
          ) : null}

          <button
            type="button"
            className={`generate-chat__account-trigger ${
              isAccountMenuOpen ? 'generate-chat__account-trigger--active' : ''
            }`}
            onClick={() => setIsAccountMenuOpen((current) => !current)}
            aria-haspopup="menu"
            aria-expanded={isAccountMenuOpen}
          >
            <div className="generate-chat__account-avatar">
              {getProfileAvatar(profile?.avatarUrl, profile?.fullName)}
            </div>
            {!isConversationSidebarCollapsed ? (
              <>
                <div className="generate-chat__account-copy">
                  <div className="generate-chat__account-title">
                    <strong>{profile?.fullName || 'Workspace Owner'}</strong>
                  </div>
                  <span>{profile?.industry || 'Open workspace options'}</span>
                  <div className="generate-chat__account-usage">
                    <span>{usageSummary}</span>
                  </div>
                </div>
                <ChevronDown size={16} />
              </>
            ) : null}
          </button>
        </div>
      </Card>

      <div className="generate-chat__workspace-column">
        <ErrorMessage
          message={workspace.error}
          title="Generate issue"
          variant="toast"
          onDismiss={() => workspace.setError(null)}
        />
        <Card
          className={`generate-chat__workspace-shell ${
            isComposerCollapsed
              ? 'generate-chat__workspace-shell--composer-collapsed'
              : ''
          }`}
        >
          <div className="generate-chat__thread-header">
            <div>
              <h2>{threadTitle}</h2>
              <p>{threadDescription}</p>
            </div>
          </div>

          <div
            className="generate-chat__thread"
            data-lenis-prevent
            data-lenis-prevent-wheel
            data-lenis-prevent-touch
          >
            {workspace.isLoadingThread ? (
              <div className="generate-chat__thread-loading">
                <LoadingSpinner label="Opening conversation" />
              </div>
            ) : workspace.activeThread?.messages.length ? (
              workspace.activeThread.messages.map((message) => (
                <div
                  key={message.id}
                  className={`generate-chat__message ${
                    message.role === 'user'
                      ? 'generate-chat__message--user'
                      : 'generate-chat__message--assistant'
                  }`}
                >
                  <div className="generate-chat__message-bubble">
                    <div className="generate-chat__message-meta">
                      <span>{message.role === 'user' ? 'You' : 'PrixmoAI'}</span>
                      <strong>{getMessageModeLabel(message)}</strong>
                      <time dateTime={message.createdAt}>
                        {formatMessageTimestamp(message.createdAt)}
                      </time>
                    </div>
                    {(() => {
                      const visibleContent = getUserMessageContent(message);
                      return visibleContent ? <p>{visibleContent}</p> : null;
                    })()}
                    {message.role !== 'user' ? (
                      <AssistantAssets
                        assets={message.assets}
                        showImageWatermark={shouldWatermarkImages}
                      />
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="generate-chat__thread-placeholder">
                <strong>No output yet</strong>
                <p>
                  Your captions, hashtags, reel scripts, and generated images will
                  appear here in this conversation.
                </p>
              </div>
            )}

            {(workspace.isGeneratingCopy || workspace.isGeneratingImage) && (
              <div className="generate-chat__message generate-chat__message--assistant generate-chat__message--loading">
                <div className="generate-chat__message-bubble generate-chat__message-bubble--loading">
                  <GenerationBlackHoleLoader
                    label={
                      workspace.isGeneratingCopy
                        ? 'Building copy for this thread'
                        : 'Creating a visual for this thread'
                    }
                  />
                </div>
              </div>
            )}

            <div ref={threadEndRef} />
          </div>

          <div
            className={`generate-chat__composer ${
              isComposerCollapsed ? 'generate-chat__composer--collapsed' : ''
            }`}
          >
            <div className="generate-chat__composer-header">
              <div className="generate-chat__composer-controls">
                <div className="generate-chat__switcher">
                  <button
                    type="button"
                    className={`generate-chat__switcher-button ${
                      activeWorkspace === 'copy'
                        ? 'generate-chat__switcher-button--active'
                        : ''
                    }`}
                    onClick={() => setActiveWorkspace('copy')}
                  >
                    <Sparkles size={16} />
                    Copy
                  </button>
                  <button
                    type="button"
                    className={`generate-chat__switcher-button ${
                      activeWorkspace === 'image'
                        ? 'generate-chat__switcher-button--active'
                        : ''
                    }`}
                    onClick={() => setActiveWorkspace('image')}
                  >
                    <ImagePlus size={16} />
                    Image
                  </button>
                </div>

                <div className="generate-chat__actions generate-chat__actions--header">
                  <Button
                    type="submit"
                    size="md"
                    form={activeFormId}
                    disabled={
                      activeWorkspace === 'copy'
                        ? workspace.isGeneratingCopy
                        : workspace.isGeneratingImage
                    }
                  >
                    {activeWorkspace === 'copy'
                      ? workspace.isGeneratingCopy
                        ? 'Generating...'
                        : 'Generate copy'
                      : workspace.isGeneratingImage
                        ? 'Generating...'
                        : 'Generate image'}
                  </Button>
                  {workspace.activeThread?.messages.length ? (
                    <RegenerateButton
                      disabled={
                        activeWorkspace === 'copy'
                          ? workspace.isGeneratingCopy
                          : workspace.isGeneratingImage
                      }
                      onClick={
                        activeWorkspace === 'copy'
                          ? regenerateCopy
                          : regenerateImage
                      }
                    />
                  ) : null}
                </div>
              </div>
              <div className="generate-chat__composer-note">
                <strong>
                  {activeWorkspace === 'copy'
                    ? 'Copy generation'
                    : imageForm.sourceImageUrl.trim()
                      ? 'Image-to-image generation'
                      : 'Image generation'}
                </strong>
                <span>
                  {activeConversation
                    ? ''
                    : ''}
                </span>
              </div>
              <div className="generate-chat__composer-toolbar">
                {isComposerCollapsed ? (
                  <span className="generate-chat__composer-status">
                    Generator hidden
                  </span>
                ) : null}
                <button
                  type="button"
                  className="generate-chat__composer-toggle"
                  onClick={() =>
                    setIsComposerCollapsed((current) => !current)
                  }
                  aria-expanded={!isComposerCollapsed}
                  aria-controls="generate-composer-body"
                >
                  {isComposerCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {isComposerCollapsed ? 'Show panel' : 'Hide panel'}
                </button>
              </div>
            </div>

            <div
              id="generate-composer-body"
              className="generate-chat__composer-body"
              data-lenis-prevent
              data-lenis-prevent-wheel
              data-lenis-prevent-touch
              hidden={isComposerCollapsed}
            >
              {activeWorkspace === 'copy' ? (
                <form
                  id="generate-copy-form"
                  className="generate-chat__form"
                  onSubmit={handleSubmitCopy}
                >
                <div className="generate-chat__form-grid generate-chat__form-grid--tight">
                  <label className="field">
                    <span className="field__label">Product or offer name</span>
                    <input
                      className="field__control"
                      value={contentForm.productName}
                      onChange={(event) =>
                        setContentForm((current) => ({
                          ...current,
                          productName: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <Input
                    label="Audience"
                    value={contentForm.audience}
                    onChange={(event) =>
                      setContentForm((current) => ({
                        ...current,
                        audience: event.target.value,
                      }))
                    }
                  />
                  <Select
                    label="Platform"
                    value={contentForm.platform}
                    onChange={(event) =>
                      setContentForm((current) => ({
                        ...current,
                        platform: event.target.value,
                      }))
                    }
                  >
                    {CONTENT_PLATFORM_OPTIONS.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </Select>
                  <Select
                    label="Goal"
                    value={contentForm.goal}
                    onChange={(event) =>
                      setContentForm((current) => ({
                        ...current,
                        goal: event.target.value,
                      }))
                    }
                  >
                    {CONTENT_GOAL_OPTIONS.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </Select>
                  <Select
                    label="Tone"
                    value={contentForm.tone}
                    onChange={(event) =>
                      setContentForm((current) => ({
                        ...current,
                        tone: event.target.value,
                      }))
                    }
                  >
                    {CONTENT_TONE_OPTIONS.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </Select>
                  <label className="field">
                    <span className="field__label">Keywords</span>
                    <input
                      className="field__control"
                      value={keywordInput}
                      onChange={(event) => setKeywordInput(event.target.value)}
                      placeholder="Themes, pain points, campaign terms"
                    />
                  </label>
                  <label className="field field--full">
                    <span className="field__label">Description / brief</span>
                    <textarea
                      className="field__control field__control--textarea generate-chat__textarea--compact"
                      value={contentForm.productDescription}
                      onChange={(event) =>
                        setContentForm((current) => ({
                          ...current,
                          productDescription: event.target.value,
                        }))
                      }
                      rows={2}
                      placeholder="Describe the product or offer, what matters most, and what the audience should feel or do."
                    />
                  </label>
                </div>

                {brandProfileHint ? (
                  <div className="generator-mode-note generate-chat__brand-note generate-chat__brand-note--compact">
                    <strong>Brand memory active</strong>
                    <span>{brandProfileHint}</span>
                  </div>
                ) : null}
                </form>
              ) : (
                <form
                  id="generate-image-form"
                  className="generate-chat__form"
                  onSubmit={handleSubmitImage}
                >
                <div className="generate-chat__form-grid generate-chat__form-grid--tight">
                  <label className="field">
                    <span className="field__label">Product or offer name</span>
                    <input
                      className="field__control"
                      value={imageForm.productName}
                      onChange={(event) =>
                        setImageForm((current) => ({
                          ...current,
                          productName: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <Select
                    label="Background style"
                    value={
                      imageForm.backgroundStyle || IMAGE_BACKGROUND_OPTIONS[0]
                    }
                    onChange={(event) =>
                      setImageForm((current) => ({
                        ...current,
                        backgroundStyle: event.target.value,
                      }))
                    }
                    >
                      {IMAGE_BACKGROUND_OPTIONS.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </Select>
                  <label className="field field--full">
                    <span className="field__label">Description / brief</span>
                    <textarea
                      className="field__control field__control--textarea generate-chat__textarea--compact"
                      value={imageForm.productDescription}
                      onChange={(event) =>
                        setImageForm((current) => ({
                          ...current,
                          productDescription: event.target.value,
                        }))
                      }
                      rows={2}
                      placeholder="Describe the subject, important details, and the kind of visual result you want."
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Optional source image URL</span>
                    <input
                      className="field__control"
                      value={imageForm.sourceImageUrl}
                      onChange={(event) =>
                        setImageForm((current) => ({
                          ...current,
                          sourceImageUrl: event.target.value,
                        }))
                      }
                      placeholder="https://..."
                    />
                  </label>
                  <div className="field">
                    <span className="field__label">Upload source image</span>
                    <label className="generator-upload generator-upload--compact">
                      <div className="generator-upload__copy">
                        <Upload size={18} />
                        <div>
                          <strong>
                            {workspace.isUploadingSource
                              ? 'Uploading...'
                              : 'Choose file'}
                          </strong>
                          <span>JPG, PNG, WEBP</span>
                        </div>
                      </div>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleSourceImageUpload}
                        disabled={workspace.isUploadingSource}
                        />
                      </label>
                  </div>
                </div>

                <label className="field field--full">
                  <span className="field__label">Creative direction</span>
                  <input
                    className="field__control"
                    value={imageForm.prompt}
                    onChange={(event) =>
                      setImageForm((current) => ({
                        ...current,
                        prompt: event.target.value,
                      }))
                    }
                    placeholder="Optional creative direction: clean studio look, warm premium lighting, minimal background, bold launch visual..."
                  />
                </label>

                {imageForm.sourceImageUrl.trim() ? (
                  <div className="generator-source-chip">
                    <img
                      src={imageForm.sourceImageUrl}
                      alt={`${imageForm.productName || 'Reference'} preview`}
                    />
                    <div className="generator-source-chip__copy">
                      <strong>Reference ready</strong>
                      <span>Used only for this generation.</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setImageForm((current) => ({
                          ...current,
                          sourceImageUrl: '',
                        }))
                      }
                    >
                      <X size={16} />
                      Remove
                    </Button>
                  </div>
                ) : null}

                {brandProfileHint ? (
                  <div className="generator-mode-note generate-chat__brand-note generate-chat__brand-note--compact">
                    <strong>Brand profile awareness</strong>
                    <span>{brandProfileHint}</span>
                  </div>
                ) : null}
                </form>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
