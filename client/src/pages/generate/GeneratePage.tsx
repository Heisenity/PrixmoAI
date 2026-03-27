import {
  BarChart3,
  Check,
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Edit3,
  ImagePlus,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
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
import { ProfileAvatar } from '../../components/shared/ProfileAvatar';
import { useBilling } from '../../hooks/useBilling';
import { useBrandProfile } from '../../hooks/useBrandProfile';
import { useGenerateWorkspace } from '../../hooks/useGenerateWorkspace';
import { useAuth } from '../../hooks/useAuth';
import { useAnalytics } from '../../hooks/useAnalytics';
import { useUpgradePrompt } from '../../hooks/useUpgradePrompt';
import { getAvatarCandidates } from '../../lib/profile';
import { getOverallUsageSummary } from '../../lib/usage';
import { APP_NAME } from '../../lib/constants';
import { UpgradePrompt } from '../../components/shared/UpgradePrompt';
import {
  CONTENT_GOAL_OPTIONS,
  CONTENT_PLATFORM_OPTIONS,
  CONTENT_TONE_OPTIONS,
  IMAGE_BACKGROUND_OPTIONS,
  PLAN_DASHBOARD_DETAILS,
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

const createDefaultContentForm = (useBrandName = false) => ({
  useBrandName,
  productName: '',
  productDescription: '',
  platform: 'Instagram',
  goal: 'Drive product discovery and clicks',
  tone: 'Trendy and persuasive',
  audience: '',
});

const createDefaultImageForm = (useBrandName = false) => ({
  useBrandName,
  productName: '',
  productDescription: '',
  backgroundStyle: '',
  sourceImageUrl: '',
  prompt: '',
});

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

const renderRequiredLabel = (label: string) => (
  <span className="field__label-row">
    <span className="field__label">{label}</span>
    <span className="field__required" aria-hidden="true">
      ✦
    </span>
    <span className="sr-only">Required field</span>
  </span>
);

const normalizeWorkspaceError = (
  message: string | null,
  mode: WorkspaceMode
) => {
  if (!message) {
    return null;
  }

  if (/conversation not found/i.test(message)) {
    return 'That conversation is no longer available. Open another thread or start a new chat.';
  }

  if (/product name is required|please fill in product name/i.test(message)) {
    return mode === 'copy'
      ? 'Add a product or offer name before generating copy.'
      : 'Add a product or offer name before generating an image.';
  }

  if (/settings\s*>\s*brand memory|turn off use brand name/i.test(message)) {
    return 'Add your brand name in Settings > Brand memory, or switch off the saved-brand toggle.';
  }

  if (/valid source image url/i.test(message)) {
    return 'Use a valid source image URL, or clear the field if you want text-to-image generation.';
  }

  if (/only jpg, png, and webp images are supported/i.test(message)) {
    return 'Upload a JPG, PNG, or WEBP file for the reference image.';
  }

  if (/6mb or smaller/i.test(message)) {
    return 'Choose a smaller reference image. Files must be 6MB or smaller.';
  }

  if (/unable to reach the prixmoai server/i.test(message)) {
    return 'PrixmoAI could not reach the server. Check that the API is running, then try again.';
  }

  return message;
};

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

const hydrateCopyInput = (message: GenerateConversationMessage) => {
  const input = toRecord(message.metadata.input);
  const productName =
    typeof input.productName === 'string' ? input.productName : '';

  if (!productName) {
    return null;
  }

  return {
    useBrandName:
      typeof input.useBrandName === 'boolean'
        ? input.useBrandName
        : typeof input.brandName === 'string' && input.brandName.trim().length > 0,
    productName,
    productDescription:
      typeof input.productDescription === 'string'
        ? input.productDescription
        : '',
    platform:
      typeof input.platform === 'string' ? input.platform : createDefaultContentForm().platform,
    goal: typeof input.goal === 'string' ? input.goal : createDefaultContentForm().goal,
    tone: typeof input.tone === 'string' ? input.tone : createDefaultContentForm().tone,
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
    useBrandName:
      typeof input.useBrandName === 'boolean'
        ? input.useBrandName
        : typeof input.brandName === 'string' && input.brandName.trim().length > 0,
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
  const { signOut, user } = useAuth();
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
  const [pendingDeleteConversation, setPendingDeleteConversation] =
    useState<GenerateConversation | null>(null);
  const { prompt: upgradePrompt, dismissPrompt } = useUpgradePrompt();
  const [keywordInput, setKeywordInput] = useState('');
  const [contentForm, setContentForm] = useState(() => createDefaultContentForm());
  const [imageForm, setImageForm] = useState(() => createDefaultImageForm());
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const avatarCandidates = getAvatarCandidates(
    profile?.avatarUrl,
    user?.user_metadata && typeof user.user_metadata === 'object'
      ? (user.user_metadata as Record<string, unknown>)
      : null
  );

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
          useBrandName: hydratedCopy.useBrandName,
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
  const readableWorkspaceError = normalizeWorkspaceError(
    workspace.error,
    activeWorkspace
  );
  const currentPlan = subscription?.plan ?? catalog?.currentSubscription.plan ?? 'free';
  const planDetails = PLAN_DASHBOARD_DETAILS[currentPlan];
  const isUsageLoading = isBillingLoading || isAnalyticsLoading;
  const usageSummary = getOverallUsageSummary({
    contentLimit: planDetails.contentLimit,
    imageLimit: planDetails.imageLimit,
    contentUsed: overview?.generation.contentGenerationsToday ?? 0,
    imageUsed: overview?.generation.imageGenerationsToday ?? 0,
    isLoading: isUsageLoading,
    usageWindowLabel: planDetails.usageWindowLabel,
  });
  const shouldWatermarkImages =
    !subscription || subscription.plan === 'free';
  const threadTitle = activeConversation?.title || 'New conversation';
  const savedBrandName = profile?.brandName?.trim() || '';
  const hasSavedBrandName = Boolean(savedBrandName);
  const brandProfileHint = useMemo(() => {
    if (!profile) {
      return null;
    }

    const parts = [
      profile.brandName || null,
      profile.industry || null,
      profile.brandVoice ? `${profile.brandVoice} voice` : null,
      profile.targetAudience ? `${profile.targetAudience} audience` : null,
    ].filter(Boolean);

    if (!parts.length) {
      return null;
    }

    return parts.join(' • ');
  }, [profile]);

  useEffect(() => {
    const defaultUseBrandName = Boolean(profile?.brandName?.trim());

    setContentForm((current) => {
      if (
        current.productName ||
        current.productDescription ||
        current.audience ||
        keywordInput.trim()
      ) {
        return current;
      }

      return current.useBrandName === defaultUseBrandName
        ? current
        : {
            ...current,
            useBrandName: defaultUseBrandName,
          };
    });

    setImageForm((current) => {
      if (
        current.productName ||
        current.productDescription ||
        current.sourceImageUrl ||
        current.prompt ||
        current.backgroundStyle
      ) {
        return current;
      }

      return current.useBrandName === defaultUseBrandName
        ? current
        : {
            ...current,
            useBrandName: defaultUseBrandName,
          };
    });
  }, [profile?.brandName]);

  const resetComposer = () => {
    setActiveWorkspace('copy');
    setIsComposerCollapsed(false);
    setKeywordInput('');
    setContentForm(createDefaultContentForm(hasSavedBrandName));
    setImageForm(createDefaultImageForm(hasSavedBrandName));
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
    try {
      await workspace.deleteConversation(conversationId);
      setPendingDeleteConversation(null);
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

    if (contentForm.useBrandName && !hasSavedBrandName) {
      workspace.setError(
        'Add your brand name in Settings > Brand memory, or switch off the saved-brand toggle.'
      );
      return;
    }

    if (!contentForm.productName.trim()) {
      workspace.setError('Add a product or offer name before generating copy.');
      return;
    }

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

    if (imageForm.useBrandName && !hasSavedBrandName) {
      workspace.setError(
        'Add your brand name in Settings > Brand memory, or switch off the saved-brand toggle.'
      );
      return;
    }

    if (!imageForm.productName.trim()) {
      workspace.setError('Add a product or offer name before generating an image.');
      return;
    }

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
                      onClick={() => {
                        workspace.openConversation(conversation.id);
                        setIsComposerCollapsed(false);
                      }}
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
                        onClick={() => {
                          workspace.openConversation(conversation.id);
                          setIsComposerCollapsed(false);
                        }}
                        aria-label={`Open conversation ${conversation.title}`}
                      >
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
                            onClick={() => setPendingDeleteConversation(conversation)}
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

        {pendingDeleteConversation && !isConversationSidebarCollapsed ? (
          <div className="generate-chat__delete-popover" role="alertdialog" aria-modal="false">
            <div className="generate-chat__delete-popover-copy">
              <strong>Delete conversation?</strong>
              <span>
                {pendingDeleteConversation.title} will be removed from your workspace list.
              </span>
            </div>
            <div className="generate-chat__delete-popover-actions">
              <button
                type="button"
                className="generate-chat__delete-popover-button"
                onClick={() => setPendingDeleteConversation(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="generate-chat__delete-popover-button generate-chat__delete-popover-button--danger"
                onClick={() => void handleDeleteConversation(pendingDeleteConversation.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ) : null}

        <div className="generate-chat__account" ref={accountMenuRef}>
          {upgradePrompt ? (
            <UpgradePrompt
              prompt={upgradePrompt}
              currentPlan={currentPlan}
              onDismiss={dismissPrompt}
            />
          ) : null}

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
            <ProfileAvatar
              avatarCandidates={avatarCandidates}
              fullName={profile?.fullName}
              className="generate-chat__account-avatar"
            />
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
          message={readableWorkspaceError}
          title="Generate issue"
          variant="toast"
          onDismiss={() => workspace.setError(null)}
        />
        <div
          className={`generate-chat__workspace-shell ${
            isComposerCollapsed
              ? 'generate-chat__workspace-shell--composer-collapsed'
              : ''
          }`}
        >
          <Card className="generate-chat__thread-panel">
            <div className="generate-chat__thread-header">
              <div>
                <h2>{threadTitle}</h2>
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
                workspace.activeThread.messages
                  .filter(
                    (message) =>
                      message.role !== 'user' &&
                      (message.assets.length > 0 || Boolean(message.content))
                  )
                  .map((message) => (
                  <div
                    key={message.id}
                    className="generate-chat__message generate-chat__message--assistant"
                  >
                    <div className="generate-chat__message-bubble">
                      <div className="generate-chat__message-meta">
                        <span>PrixmoAI</span>
                        <time dateTime={message.createdAt}>
                          {formatMessageTimestamp(message.createdAt)}
                        </time>
                      </div>
                      {!message.assets.length && message.content ? (
                        <p>{message.content}</p>
                      ) : null}
                      <AssistantAssets
                        assets={message.assets}
                        showImageWatermark={shouldWatermarkImages}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="generate-chat__thread-placeholder">
                  <strong>No output yet</strong>
                  <p>
                    Generate something below and the result will appear here as a
                    saved thread turn.
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
          </Card>

          <Card
            className={`generate-chat__composer ${
              isComposerCollapsed ? 'generate-chat__composer--collapsed' : ''
            }`}
          >
            <div className="generate-chat__composer-header">
              <div className="generate-chat__composer-topline">
                <div className="generate-chat__composer-controls">
                  <div className="generate-chat__switcher">
                    <button
                      type="button"
                      className={`generate-chat__switcher-button ${
                        activeWorkspace === 'copy'
                          ? 'generate-chat__switcher-button--active'
                          : ''
                      }`}
                      onClick={() => {
                        setActiveWorkspace('copy');
                        setIsComposerCollapsed(false);
                      }}
                      aria-pressed={activeWorkspace === 'copy'}
                    >
                      <Sparkles size={16} />
                      Content
                    </button>
                    <button
                      type="button"
                      className={`generate-chat__switcher-button ${
                        activeWorkspace === 'image'
                          ? 'generate-chat__switcher-button--active'
                          : ''
                      }`}
                      onClick={() => {
                        setActiveWorkspace('image');
                        setIsComposerCollapsed(false);
                      }}
                      aria-pressed={activeWorkspace === 'image'}
                    >
                      <ImagePlus size={16} />
                      Image
                    </button>
                  </div>
                </div>
                <div className="generate-chat__composer-side">
                  <div className="generate-chat__composer-toolbar">
                    <button
                      type="button"
                      className={`generate-chat__composer-toggle ${
                        isComposerCollapsed
                          ? 'generate-chat__composer-toggle--collapsed'
                          : ''
                      }`}
                      onClick={() =>
                        setIsComposerCollapsed((current) => !current)
                      }
                      aria-expanded={!isComposerCollapsed}
                      aria-controls="generate-composer-body"
                      aria-label={
                        isComposerCollapsed
                          ? 'Show generator panel'
                          : 'Hide generator panel'
                      }
                      title={
                        isComposerCollapsed
                          ? 'Show generator panel'
                          : 'Hide generator panel'
                      }
                    >
                      {isComposerCollapsed ? (
                        <PanelRightOpen size={16} />
                      ) : (
                        <PanelRightClose size={16} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <div className="generate-chat__actions generate-chat__actions--header">
                <Button
                  type="submit"
                  size="sm"
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
                      : 'Generate content'
                    : workspace.isGeneratingImage
                      ? 'Generating...'
                      : 'Generate image'}
                </Button>
                {workspace.activeThread?.messages.length ? (
                  <RegenerateButton
                    size="sm"
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
                    {renderRequiredLabel('Product or offer name')}
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
                  <div className="field">
                    <span className="field__label">Saved brand name</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={contentForm.useBrandName}
                      className={`generate-chat__brand-toggle ${
                        contentForm.useBrandName
                          ? 'generate-chat__brand-toggle--active'
                          : ''
                      }`}
                      onClick={() =>
                        setContentForm((current) => ({
                          ...current,
                          useBrandName: hasSavedBrandName
                            ? !current.useBrandName
                            : false,
                        }))
                      }
                      disabled={!hasSavedBrandName}
                    >
                      <span className="generate-chat__brand-toggle-copy">
                        <strong>
                          {hasSavedBrandName ? savedBrandName : 'Use saved brand name'}
                        </strong>
                        <span>
                          {hasSavedBrandName
                            ? contentForm.useBrandName
                              ? 'Brand memory is shaping this content.'
                              : 'Generate without the saved brand name.'
                            : 'Add a brand name in Settings > Brand memory to enable.'}
                        </span>
                      </span>
                      <span className="generate-chat__brand-toggle-track" aria-hidden="true">
                        <span className="generate-chat__brand-toggle-thumb" />
                      </span>
                    </button>
                  </div>
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
                    {renderRequiredLabel('Product or offer name')}
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
                  <div className="field">
                    <span className="field__label">Saved brand name</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={imageForm.useBrandName}
                      className={`generate-chat__brand-toggle ${
                        imageForm.useBrandName
                          ? 'generate-chat__brand-toggle--active'
                          : ''
                      }`}
                      onClick={() =>
                        setImageForm((current) => ({
                          ...current,
                          useBrandName: hasSavedBrandName
                            ? !current.useBrandName
                            : false,
                        }))
                      }
                      disabled={!hasSavedBrandName}
                    >
                      <span className="generate-chat__brand-toggle-copy">
                        <strong>
                          {hasSavedBrandName ? savedBrandName : 'Use saved brand name'}
                        </strong>
                        <span>
                          {hasSavedBrandName
                            ? imageForm.useBrandName
                              ? 'Brand memory is shaping this visual.'
                              : 'Generate without the saved brand name.'
                            : 'Add a brand name in Settings > Brand memory to enable.'}
                        </span>
                      </span>
                      <span className="generate-chat__brand-toggle-track" aria-hidden="true">
                        <span className="generate-chat__brand-toggle-thumb" />
                      </span>
                    </button>
                  </div>
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
          </Card>
        </div>
      </div>
    </div>
  );
};
