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
  ShieldCheck,
  Square,
  Sparkles,
  CalendarClock,
  Settings,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { CaptionList } from '../../components/generate/CaptionList';
import { DictationTextareaField } from '../../components/generate/DictationTextareaField';
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
import { useAdminAccess } from '../../hooks/useAdminAccess';
import { useUpgradePrompt } from '../../hooks/useUpgradePrompt';
import { apiRequest } from '../../lib/axios';
import { getAvatarCandidates } from '../../lib/profile';
import {
  writeSchedulerAcceptedCaptionCarryover,
  writeSchedulerGeneratedMediaIntent,
} from '../../lib/schedulerGeneratedMedia';
import { getUserFacingTimeZone } from '../../lib/timezone';
import {
  SUPER_ADMIN_TESTING_TIER_EVENT,
  isSuperAdminUser,
  normalizeSuperAdminTestingTier,
  readStoredSuperAdminTestingTier,
  writeStoredSuperAdminTestingTier,
} from '../../lib/superAdmin';
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
  BrandMemoryFeedbackEvent,
  CaptionVariant,
  GenerateContentInput,
  GenerateConversation,
  GenerateConversationAsset,
  GenerateConversationMessage,
  GeneratedImage as GeneratedImageRecord,
  ReelScript as ReelScriptType,
  SchedulerAcceptedCaptionCarryover,
  SchedulerGeneratedMediaIntent,
} from '../../types';

type WorkspaceMode = 'copy' | 'image';
type GenerateButtonAnimationMode = 'copy' | 'image';
type GenerateButtonProgressStage = {
  durationMs: number;
  start: number;
  end: number;
  easePower: number;
};
type GenerateButtonSpeedLevel = 'slow' | 'medium' | 'fast';
type GenerateButtonPaceProfile =
  | 'slow-burn'
  | 'erratic'
  | 'front-loaded'
  | 'rollercoaster';
type GenerateButtonTempoWindow = {
  startMs: number;
  durationMs: number;
  strength: number;
};
type GenerateButtonMotionProfile = {
  stages: GenerateButtonProgressStage[];
  softCap: number;
  driftFactor: number;
  easeFactor: number;
  paceProfile: GenerateButtonPaceProfile;
  startSpeedLevel: GenerateButtonSpeedLevel;
  endSpeedLevel: GenerateButtonSpeedLevel;
  hiddenPhaseCount: number;
  decimalStartAt: number;
  chaosFactor: number;
  totalExpectedDurationMs: number;
  stallWindows: GenerateButtonTempoWindow[];
  surgeWindows: GenerateButtonTempoWindow[];
  tempoWaveMs: number;
  settleWaveMs: number;
  tempoPhase: number;
  settlePhase: number;
  burstStrength: number;
  pauseStrength: number;
  flowDurationMs: number;
  bobDurationMs: number;
  auraShiftPx: number;
  tiltDeg: number;
};

const WORKSPACE_MENU_ITEMS = [
  { label: 'Generate', href: '/app/generate', icon: Sparkles },
  { label: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
  { label: 'Analytics', href: '/app/analytics', icon: BarChart3 },
  { label: 'Scheduler', href: '/app/scheduler', icon: CalendarClock },
  { label: 'Billing', href: '/app/billing', icon: CreditCard },
  { label: 'Settings', href: '/app/settings', icon: Settings },
] as const;

const CUSTOM_BACKGROUND_OPTION = 'Custom background';

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
  platform: 'Instagram',
  backgroundStyle: '',
  backgroundPrompt: '',
  sourceImageUrl: '',
  prompt: '',
});

const DESCRIPTION_REQUIRED_MESSAGE =
  'Description is mandatory. (A detailed description will create better results.)';
const IMAGE_REFERENCE_OR_BRIEF_REQUIRED_MESSAGE =
  'Add a short brief, creative direction, or a reference image before generating.';

const hasImageGenerationSignal = (input: {
  productDescription: string;
  prompt: string;
  sourceImageUrl: string;
}) =>
  Boolean(
    input.productDescription.trim() ||
      input.prompt.trim() ||
      input.sourceImageUrl.trim()
  );

const GENERATE_SIDEBAR_COLLAPSED_STORAGE_KEY =
  'prixmoai.generate.sidebarCollapsed';
const GENERATE_COMPOSER_COLLAPSED_STORAGE_KEY =
  'prixmoai.generate.composerCollapsed';
const CONTENT_BUTTON_MIN_VISIBLE_MS = 900;
const CONTENT_BUTTON_COMPLETE_HOLD_MS = 380;
const CONTENT_BUTTON_COMPLETE_ANIMATION_MS = 320;
const GENERATE_BUTTON_BASE_SOFT_CAP_PROGRESS: Record<
  GenerateButtonAnimationMode,
  number
> = {
  copy: 98.8,
  image: 99.15,
};
const GENERATE_BUTTON_PACE_PROFILES: GenerateButtonPaceProfile[] = [
  'slow-burn',
  'erratic',
  'front-loaded',
  'rollercoaster',
];
const GENERATE_BUTTON_SPEED_LEVELS: GenerateButtonSpeedLevel[] = [
  'slow',
  'medium',
  'fast',
];
const GENERATE_BUTTON_SPEED_MULTIPLIERS: Record<
  GenerateButtonSpeedLevel,
  number
> = {
  slow: 0.8,
  medium: 1,
  fast: 1.28,
};

const randomBetween = (min: number, max: number) =>
  min + Math.random() * (max - min);

const jitterByRatio = (value: number, ratio: number) =>
  value * (1 + randomBetween(-ratio, ratio));

const pickRandomItem = <T,>(items: T[]) =>
  items[Math.floor(Math.random() * items.length)] ?? items[0];

const buildPhaseWeights = (
  paceProfile: GenerateButtonPaceProfile,
  phaseCount: number,
  startSpeedLevel: GenerateButtonSpeedLevel,
  endSpeedLevel: GenerateButtonSpeedLevel,
  chaosFactor: number
) => {
  const startSpeed = GENERATE_BUTTON_SPEED_MULTIPLIERS[startSpeedLevel];
  const endSpeed = GENERATE_BUTTON_SPEED_MULTIPLIERS[endSpeedLevel];

  return Array.from({ length: phaseCount }, (_, index) => {
    const ratio = phaseCount === 1 ? 1 : index / (phaseCount - 1);
    const blendedSpeed = startSpeed + (endSpeed - startSpeed) * ratio;
    let profileBias = 1;

    if (paceProfile === 'slow-burn') {
      profileBias = 0.72 + Math.pow(ratio, 1.45) * 0.76;
    } else if (paceProfile === 'front-loaded') {
      profileBias = 1.34 - ratio * 0.54;
    } else if (paceProfile === 'rollercoaster') {
      profileBias = index % 2 === 0 ? 1.18 : 0.78;
    } else {
      profileBias = randomBetween(0.68, 1.38);
    }

    return Math.max(
      0.34,
      blendedSpeed * profileBias * jitterByRatio(1, 0.14 + chaosFactor * 0.16)
    );
  });
};

const buildTempoWindows = (
  totalExpectedDurationMs: number,
  chaosFactor: number,
  type: 'stall' | 'surge'
): GenerateButtonTempoWindow[] => {
  const count =
    type === 'stall'
      ? Math.floor(randomBetween(0, 2.99 + chaosFactor * 1.5))
      : Math.floor(randomBetween(1, 3.3 + chaosFactor * 1.7));

  return Array.from({ length: count }, () => ({
    startMs: totalExpectedDurationMs * randomBetween(0.1, 0.84),
    durationMs: totalExpectedDurationMs * randomBetween(0.035, 0.11),
    strength:
      type === 'stall'
        ? randomBetween(0.18, 0.54 + chaosFactor * 0.14)
        : randomBetween(0.18, 0.48 + chaosFactor * 0.18),
  }));
};

// Give each generation run its own motion profile so the progress animation
// feels organic instead of repeating the exact same curve on every click.
const createGenerateButtonMotionProfile = (
  mode: GenerateButtonAnimationMode
): GenerateButtonMotionProfile => {
  const paceProfile = pickRandomItem(GENERATE_BUTTON_PACE_PROFILES);
  const startSpeedLevel = pickRandomItem(GENERATE_BUTTON_SPEED_LEVELS);
  const endSpeedLevel = pickRandomItem(GENERATE_BUTTON_SPEED_LEVELS);
  const hiddenPhaseCount = Math.round(randomBetween(3, 8));
  const decimalStartAt = randomBetween(12, 92);
  const chaosFactor = randomBetween(0.22, 1);
  const totalExpectedDurationMs =
    mode === 'image'
      ? randomBetween(18_000, 33_000)
      : randomBetween(11_000, 22_000);
  const phaseWeights = buildPhaseWeights(
    paceProfile,
    hiddenPhaseCount,
    startSpeedLevel,
    endSpeedLevel,
    chaosFactor
  );
  const durationWeights = phaseWeights.map((weight, index) => {
    const ratio = hiddenPhaseCount === 1 ? 1 : index / (hiddenPhaseCount - 1);
    const durationBias =
      paceProfile === 'slow-burn'
        ? 1.12 + ratio * 0.46
        : paceProfile === 'front-loaded'
          ? 1.14 - ratio * 0.24
          : paceProfile === 'rollercoaster'
            ? index % 2 === 0
              ? 0.92
              : 1.18
            : randomBetween(0.84, 1.26);

    return Math.max(0.18, (1 / weight) * durationBias);
  });
  const durationWeightSum = durationWeights.reduce(
    (sum, weight) => sum + weight,
    0
  );
  const progressWeightSum = phaseWeights.reduce((sum, weight) => sum + weight, 0);
  const targetTerminalProgress =
    mode === 'image'
      ? randomBetween(93.8, 97.4)
      : randomBetween(94.6, 97.8);
  let consumedProgress = clamp(randomBetween(2.5, 6.2), 2.5, 7);

  const randomizedStages = phaseWeights.map((weight, index) => {
    const isLastPhase = index === hiddenPhaseCount - 1;
    const remainingProgress = Math.max(
      4,
      targetTerminalProgress - consumedProgress
    );
    const phaseShare = isLastPhase
      ? remainingProgress
      : remainingProgress * (weight / (progressWeightSum || 1));
    const phaseDuration = Math.round(
      totalExpectedDurationMs * (durationWeights[index] / (durationWeightSum || 1))
    );
    const nextProgress = isLastPhase
      ? targetTerminalProgress
      : clamp(
          consumedProgress +
            phaseShare * jitterByRatio(1, 0.16 + chaosFactor * 0.22),
          consumedProgress + 3,
          targetTerminalProgress - (hiddenPhaseCount - index - 1) * 2.25
        );
    const phaseEaseBase =
      paceProfile === 'erratic'
        ? randomBetween(1.06, 1.84)
        : paceProfile === 'slow-burn'
          ? randomBetween(1.16, 1.5)
          : paceProfile === 'front-loaded'
            ? randomBetween(1.18, 1.62)
            : randomBetween(1.12, 1.72);
    const stage = {
      durationMs: Math.max(720, phaseDuration),
      start: consumedProgress,
      end: nextProgress,
      easePower: clamp(phaseEaseBase, 1.04, 1.9),
    };

    consumedProgress = nextProgress;
    return stage;
  });

  return {
    stages: randomizedStages,
    softCap: clamp(
      GENERATE_BUTTON_BASE_SOFT_CAP_PROGRESS[mode] + randomBetween(-0.22, 0.16),
      mode === 'image' ? 98.85 : 98.3,
      99.32
    ),
    driftFactor: randomBetween(0.9, 1.15),
    easeFactor: randomBetween(0.94, 1.1),
    paceProfile,
    startSpeedLevel,
    endSpeedLevel,
    hiddenPhaseCount,
    decimalStartAt,
    chaosFactor,
    totalExpectedDurationMs,
    stallWindows: buildTempoWindows(totalExpectedDurationMs, chaosFactor, 'stall'),
    surgeWindows: buildTempoWindows(totalExpectedDurationMs, chaosFactor, 'surge'),
    tempoWaveMs: randomBetween(820, 1320),
    settleWaveMs: randomBetween(2100, 3600),
    tempoPhase: randomBetween(0, Math.PI * 2),
    settlePhase: randomBetween(0, Math.PI * 2),
    burstStrength: randomBetween(0.04, 0.11),
    pauseStrength: randomBetween(0.05, 0.12),
    flowDurationMs: Math.round(randomBetween(1650, 2550)),
    bobDurationMs: Math.round(randomBetween(2100, 3400)),
    auraShiftPx: randomBetween(10, 22),
    tiltDeg: randomBetween(-1.8, 1.8),
  };
};

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
    timeZone: getUserFacingTimeZone(),
    month: 'short',
    day: 'numeric',
  });
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const getGenerateButtonProgressTarget = (
  elapsedMs: number,
  profile: GenerateButtonMotionProfile
) => {
  if (elapsedMs <= 0) {
    return 0;
  }

  const stages = profile.stages;
  let consumedDurationMs = 0;

  for (const stage of stages) {
    const stageStartAt = consumedDurationMs;
    const stageEndAt = stageStartAt + stage.durationMs;

    if (elapsedMs <= stageEndAt) {
      const progressRatio = clamp(
        (elapsedMs - stageStartAt) / stage.durationMs,
        0,
        1
      );
      const easedRatio = 1 - Math.pow(1 - progressRatio, stage.easePower);

      return clamp(
        stage.start + (stage.end - stage.start) * easedRatio,
        0,
        stage.end
      );
    }

    consumedDurationMs = stageEndAt;
  }

  const finalStage = stages[stages.length - 1] ?? { end: 96, durationMs: 1 };
  const progressRatio =
    (elapsedMs - consumedDurationMs) /
    Math.max(7_500, profile.totalExpectedDurationMs * 0.82);
  const easedRatio =
    1 -
    Math.exp(
      -progressRatio *
        (profile.hiddenPhaseCount > 5 ? 1.01 : 1.14) *
        profile.easeFactor
    );
  const softCap = profile.softCap;

  return clamp(
    finalStage.end + (softCap - finalStage.end) * easedRatio,
    0,
    softCap
  );
};

const getGenerateButtonMinimumDrift = (
  progress: number,
  deltaMs: number,
  mode: GenerateButtonAnimationMode,
  profile: GenerateButtonMotionProfile
) => {
  const deltaSeconds = deltaMs / 1000;

  if (mode === 'copy') {
    if (progress >= 96) {
      return deltaSeconds * 0.34 * profile.driftFactor;
    }

    if (progress >= 90) {
      return deltaSeconds * 0.52 * profile.driftFactor;
    }

    if (progress >= 82) {
      return deltaSeconds * 0.82 * profile.driftFactor;
    }

    if (progress >= 70) {
      return deltaSeconds * 1.16 * profile.driftFactor;
    }

    if (progress >= 60) {
      return deltaSeconds * 1.42 * profile.driftFactor;
    }

    if (progress >= 50) {
      return deltaSeconds * 1.74 * profile.driftFactor;
    }

    return 0;
  }

  if (progress >= 97.6) {
    return deltaSeconds * 0.2 * profile.driftFactor;
  }

  if (progress >= 95.5) {
    return deltaSeconds * 0.28 * profile.driftFactor;
  }

  if (progress >= 92) {
    return deltaSeconds * 0.42 * profile.driftFactor;
  }

  if (progress >= 88) {
    return deltaSeconds * 0.6 * profile.driftFactor;
  }

  if (progress >= 80) {
    return deltaSeconds * 0.84 * profile.driftFactor;
  }

  if (progress >= 70) {
    return deltaSeconds * 1.02 * profile.driftFactor;
  }

  if (progress >= 60) {
    return deltaSeconds * 1.24 * profile.driftFactor;
  }

  if (progress >= 50) {
    return deltaSeconds * 1.58 * profile.driftFactor;
  }

  return 0;
};

const getGenerateButtonEaseFactor = (
  progress: number,
  mode: GenerateButtonAnimationMode,
  profile: GenerateButtonMotionProfile
) => {
  if (mode === 'copy') {
    if (progress >= 96) {
      return 0.058 * profile.easeFactor;
    }

    if (progress >= 88) {
      return 0.072 * profile.easeFactor;
    }

    if (progress >= 70) {
      return 0.094 * profile.easeFactor;
    }

    return 0.118 * profile.easeFactor;
  }

  if (progress >= 97.4) {
    return 0.044 * profile.easeFactor;
  }

  if (progress >= 94) {
    return 0.058 * profile.easeFactor;
  }

  if (progress >= 88) {
    return 0.072 * profile.easeFactor;
  }

  if (progress >= 78) {
    return 0.086 * profile.easeFactor;
  }

  return 0.11 * profile.easeFactor;
};

const getGenerateButtonTempoModifier = (
  elapsedMs: number,
  progress: number,
  profile: GenerateButtonMotionProfile
) => {
  // Blend tiny bursts and soft settles so each run feels unique without
  // becoming chaotic or dishonest about completion timing.
  const burstWave =
    (Math.sin(elapsedMs / profile.tempoWaveMs + profile.tempoPhase) + 1) / 2;
  const settleWave =
    (Math.sin(elapsedMs / profile.settleWaveMs + profile.settlePhase) + 1) / 2;
  const burstBoost =
    burstWave > 0.54
      ? 1 + (burstWave - 0.54) * profile.burstStrength * 2.25
      : 1;
  const pauseDampening =
    progress > 18 && progress < 95 && settleWave > 0.72
      ? 1 - (settleWave - 0.72) * profile.pauseStrength * 2.4
      : 1;
  const stallModifier = profile.stallWindows.reduce((modifier, window) => {
    if (
      elapsedMs >= window.startMs &&
      elapsedMs <= window.startMs + window.durationMs
    ) {
      return modifier * (1 - window.strength * (0.6 + profile.chaosFactor * 0.2));
    }

    return modifier;
  }, 1);
  const surgeModifier = profile.surgeWindows.reduce((modifier, window) => {
    if (
      elapsedMs >= window.startMs &&
      elapsedMs <= window.startMs + window.durationMs
    ) {
      return modifier * (1 + window.strength * (0.72 + profile.chaosFactor * 0.28));
    }

    return modifier;
  }, 1);
  const chaosJitter =
    1 + Math.sin(elapsedMs / 420 + profile.tempoPhase * 0.7) * 0.04 * profile.chaosFactor;

  return clamp(
    burstBoost * pauseDampening * stallModifier * surgeModifier * chaosJitter,
    0.24,
    1.52
  );
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
    return 'That chat dipped out on us. Open another thread or start a fresh one.';
  }

  if (/product name is required|please fill in product name/i.test(message)) {
    return mode === 'copy'
      ? 'Give your product or offer a name first so we know what we’re writing about.'
      : 'Give your product or offer a name first so we know what image magic to make.';
  }

  if (/settings\s*>\s*brand memory|turn off use brand name/i.test(message)) {
    return 'Tiny setup moment: add your brand name in Settings > Brand memory, or switch off the saved-brand toggle and keep it moving.';
  }

  if (/valid source image url/i.test(message)) {
    return 'That source image link is not giving valid energy. Paste a proper image URL, or clear it and go text-only.';
  }

  if (/only jpg, png, and webp images are supported/i.test(message)) {
    return 'For the reference image, bring a JPG, PNG, or WEBP. Those are the VIPs right now.';
  }

  if (/6mb or smaller/i.test(message)) {
    return 'That reference image is a little too chunky right now. Keep it 6MB or smaller and we’re good.';
  }

  if (/unable to reach the prixmoai server/i.test(message)) {
    return 'PrixmoAI and the server are not talking right now. Check that the API is awake, then give it another go.';
  }

  if (/reference image|image-to-image generation|text only/i.test(message)) {
    return 'Your reference image sent us into a side quest and the providers are not finishing it right now. Try again in a bit, or remove the reference image and go text-only.';
  }

  if (/too long for the current providers|at most 2000 character|prompt is too long|too_big/i.test(message)) {
    return 'Your image brief is a bit too long right now. Trim the product description or prompt a little and run it back.';
  }

  if (/taking longer than expected|timed out/i.test(message)) {
    return 'Image generation is moving a little slow right now. Give it a moment and try again.';
  }

  if (
    /speedrunning the image lab|image lab needs a tiny breather|fast lane needs a quick vibe check|too many image generations|requests per minute|retry-after|429/i.test(
      message
    )
  ) {
    return message;
  }

  if (/temporarily unavailable|temporarily misconfigured|busy right now/i.test(message)) {
    return 'The image crew is booked and busy for a sec. Try again in a moment and we’ll get back to cooking.';
  }

  if (
    /unexpected .* format|did not return valid json|invalid_type|reelscript/i.test(
      message
    )
  ) {
    return mode === 'copy'
      ? 'The AI sent back some weird chaos instead of clean content. Try generating again and we’ll ask nicer.'
      : 'The AI sent back image chaos instead of something usable. Try again and we’ll keep it cute.';
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

const CONTENT_GENERATION_VERBOSE_MESSAGES_BY_PHASE: Record<string, string[]> = {
  idle: [],
  preparing: [
    'Reading your brief and extracting the strongest signals.',
    'Matching the product angle to the right audience energy.',
    'Pulling in brand memory, tone, and offer context.',
  ],
  writing: [
    'Mapping a sharper creative direction for the thread.',
    'Testing a few opening-hook angles in the background.',
    'Drafting caption language around the chosen offer.',
    'Weaving tone, CTA pressure, and audience fit together.',
    'Shaping hashtag coverage without making it feel spammy.',
    'Checking if the brief supports reel-ready phrasing too.',
  ],
  stitching: [
    'Cleaning the strongest draft into a usable response.',
    'Removing awkward repetition and tightening the flow.',
    'Packing the final copy into the thread format.',
  ],
  syncing: [
    'Saving the generated copy into this workspace thread.',
    'Refreshing the conversation so the latest output lands cleanly.',
  ],
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
    const prompt =
      typeof input.prompt === 'string' ? input.prompt.trim() : '';
    const imageBrief = productDescription || prompt;
    const fragments = [
      productName ? `Generate an image for "${productName}"` : 'Generate an image',
      typeof input.platform === 'string' && input.platform.trim()
        ? `for ${input.platform.trim()}`
        : null,
      typeof input.sourceImageUrl === 'string' && input.sourceImageUrl.trim()
        ? 'Reference image attached'
        : null,
      typeof input.backgroundStyle === 'string' && input.backgroundStyle.trim()
        ? `Background: ${input.backgroundStyle.trim()}`
        : null,
      typeof input.backgroundPrompt === 'string' && input.backgroundPrompt.trim()
        ? `Custom background: ${trimInlineText(input.backgroundPrompt.trim(), 80)}`
        : null,
    ].filter(Boolean);

    return imageBrief
      ? `${fragments.join(' ')}. ${trimInlineText(imageBrief, 140)}`
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
    platform:
      typeof input.platform === 'string' ? input.platform : createDefaultImageForm().platform,
    backgroundStyle:
      typeof input.backgroundStyle === 'string' ? input.backgroundStyle : '',
    backgroundPrompt:
      typeof input.backgroundPrompt === 'string' ? input.backgroundPrompt : '',
    sourceImageUrl:
      typeof input.sourceImageUrl === 'string' ? input.sourceImageUrl : '',
    prompt: typeof input.prompt === 'string' ? input.prompt : '',
  };
};

const getAssistantCopyFeedbackMeta = (message: GenerateConversationMessage) => {
  const metadata = toRecord(message.metadata);
  const copyAsset = message.assets.find((asset) => asset.assetType === 'copy');
  const contentId =
    typeof metadata.contentId === 'string'
      ? metadata.contentId
      : copyAsset && typeof copyAsset.payload.contentId === 'string'
        ? copyAsset.payload.contentId
        : null;
  const platform =
    copyAsset && typeof copyAsset.payload.platform === 'string'
      ? copyAsset.payload.platform
      : null;

  return {
    contentId,
    platform,
  };
};

const buildCaptionTextForScheduler = (caption: CaptionVariant) =>
  [caption.hook, caption.mainCopy, caption.cta].filter(Boolean).join('\n\n').trim();

const AssistantAssets = ({
  message,
  assets,
  showImageWatermark,
  onCaptionFeedback,
  onCaptionReuse,
  feedbackResetToken,
  onRegenerateAllRejected,
  isRegeneratingAllRejected = false,
}: {
  message: GenerateConversationMessage;
  assets: GenerateConversationAsset[];
  showImageWatermark: boolean;
  onCaptionFeedback?: (input: {
    contentId: string;
    platform: string | null;
    sourceKey: string;
    eventType: 'accepted' | 'rejected';
    captionText: string;
    selectedVariantIndex: number;
    scheduleIntent: SchedulerGeneratedMediaIntent | null;
    captionVariants: CaptionVariant[];
    productName: string | null;
    goal: string | null;
    tone: string | null;
    audience: string | null;
  }) => void | Promise<void>;
  onCaptionReuse?: (input: {
    contentId: string;
    platform: string | null;
    sourceKey: string;
  }) => void | Promise<void>;
  feedbackResetToken?: string | null;
  onRegenerateAllRejected?: (input: GenerateContentInput & {
    contentId: string;
    captionCount: number;
  }) => void | Promise<void>;
  isRegeneratingAllRejected?: boolean;
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
  const scheduleIntent: SchedulerGeneratedMediaIntent | null = image
    ? {
        intentId: `${image.id}:${Date.now()}`,
        generatedImageId: image.id,
        contentId: image.contentId,
        conversationId: image.conversationId,
        mediaUrl: image.generatedImageUrl,
        mediaType: 'image',
        prompt: null,
        title: 'Generated image',
        caption: null,
        captionVariants: captions,
        goal:
          copyAsset && typeof copyAsset.payload.goal === 'string'
            ? copyAsset.payload.goal
            : null,
        tone:
          copyAsset && typeof copyAsset.payload.tone === 'string'
            ? copyAsset.payload.tone
            : null,
        audience:
          copyAsset && typeof copyAsset.payload.audience === 'string'
            ? copyAsset.payload.audience
            : null,
        keywords:
          copyAsset && Array.isArray(copyAsset.payload.keywords)
            ? toStringArray(copyAsset.payload.keywords)
            : [],
        productName:
          copyAsset && typeof copyAsset.payload.productName === 'string'
            ? copyAsset.payload.productName
            : null,
        productDescription:
          copyAsset && typeof copyAsset.payload.productDescription === 'string'
            ? copyAsset.payload.productDescription
            : null,
        platform:
          copyAsset && typeof copyAsset.payload.platform === 'string'
            ? copyAsset.payload.platform
            : null,
        createdAt: image.createdAt,
        metadata: {
          backgroundStyle: image.backgroundStyle,
          provider: image.provider ?? null,
          sourceImageUrl: image.sourceImageUrl,
          requiresWatermark: showImageWatermark,
        },
      }
    : null;

  if (!captions.length && !hashtags.length && !reelScript && !image) {
    return null;
  }

  const copyFeedbackMeta = getAssistantCopyFeedbackMeta(message);
  const feedbackContentId = copyFeedbackMeta.contentId;
  const feedbackResetSourceKey = feedbackContentId
    ? feedbackResetToken
        ?.slice(feedbackContentId.length + 2)
        ?.split('::')[0] ?? null
    : null;
  const feedbackResetKey =
    feedbackContentId &&
    feedbackResetToken?.startsWith(`${feedbackContentId}::`)
      ? feedbackResetSourceKey
      : null;

  return (
    <div className="generate-chat__assistant-assets">
      {captions.length ? (
        <CaptionList
          captions={captions}
          feedbackResetKey={feedbackResetKey}
          onRegenerateAllRejected={
            feedbackContentId && copyAsset
              ? () =>
                  onRegenerateAllRejected?.({
                    contentId: feedbackContentId,
                    captionCount: captions.length,
                    useBrandName:
                      copyAsset.payload.useBrandName === true ||
                      (typeof copyAsset.payload.brandName === 'string' &&
                        copyAsset.payload.brandName.trim().length > 0),
                    productName:
                      typeof copyAsset.payload.productName === 'string'
                        ? copyAsset.payload.productName
                        : '',
                    productDescription:
                      typeof copyAsset.payload.productDescription === 'string'
                        ? copyAsset.payload.productDescription
                        : '',
                    platform:
                      typeof copyAsset.payload.platform === 'string'
                        ? copyAsset.payload.platform
                        : undefined,
                    goal:
                      typeof copyAsset.payload.goal === 'string'
                        ? copyAsset.payload.goal
                        : undefined,
                    tone:
                      typeof copyAsset.payload.tone === 'string'
                        ? copyAsset.payload.tone
                        : undefined,
                    audience:
                      typeof copyAsset.payload.audience === 'string'
                        ? copyAsset.payload.audience
                        : undefined,
                    keywords: Array.isArray(copyAsset.payload.keywords)
                      ? toStringArray(copyAsset.payload.keywords)
                      : [],
                  })
              : undefined
          }
          isRegeneratingAllRejected={isRegeneratingAllRejected}
          onFeedback={
            feedbackContentId
              ? (sourceKey, eventType, caption, index) =>
                  onCaptionFeedback?.({
                    contentId: feedbackContentId,
                    platform: copyFeedbackMeta.platform,
                    sourceKey,
                    eventType,
                    captionText: buildCaptionTextForScheduler(caption),
                    selectedVariantIndex: index + 1,
                    scheduleIntent,
                    captionVariants: captions,
                    productName:
                      copyAsset && typeof copyAsset.payload.productName === 'string'
                        ? copyAsset.payload.productName
                        : null,
                    goal:
                      copyAsset && typeof copyAsset.payload.goal === 'string'
                        ? copyAsset.payload.goal
                        : null,
                    tone:
                      copyAsset && typeof copyAsset.payload.tone === 'string'
                        ? copyAsset.payload.tone
                        : null,
                    audience:
                      copyAsset && typeof copyAsset.payload.audience === 'string'
                        ? copyAsset.payload.audience
                        : null,
                  })
              : undefined
          }
          onReuse={
            feedbackContentId
              ? (sourceKey) =>
                  onCaptionReuse?.({
                    contentId: feedbackContentId,
                    platform: copyFeedbackMeta.platform,
                    sourceKey,
                  })
              : undefined
          }
        />
      ) : null}
      {hashtags.length ? <HashtagDisplay hashtags={hashtags} /> : null}
      {reelScript ? <ReelScript script={reelScript} /> : null}
      {image ? (
        <GeneratedImage
          image={image}
          showWatermark={showImageWatermark}
          scheduleIntent={scheduleIntent}
        />
      ) : null}
    </div>
  );
};

export const GeneratePage = () => {
  const workspace = useGenerateWorkspace();
  const { subscription, catalog, isLoading: isBillingLoading } = useBilling();
  const { overview, isLoading: isAnalyticsLoading } = useAnalytics();
  const { profile } = useBrandProfile();
  const { signOut, token, user } = useAuth();
  const { isAdmin } = useAdminAccess();
  const navigate = useNavigate();
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
  const showSuperAdminBadge = isSuperAdminUser(user);
  const [superAdminTestingTier, setSuperAdminTestingTier] = useState(() =>
    readStoredSuperAdminTestingTier()
  );
  const [draftTitle, setDraftTitle] = useState('');
  const [pendingDeleteConversation, setPendingDeleteConversation] =
    useState<GenerateConversation | null>(null);
  const { prompt: upgradePrompt, dismissPrompt } = useUpgradePrompt();
  const [keywordInput, setKeywordInput] = useState('');
  const [contentForm, setContentForm] = useState(() => createDefaultContentForm());
  const [imageForm, setImageForm] = useState(() => createDefaultImageForm());
  const [contentDescriptionHistoryCommitSignal, setContentDescriptionHistoryCommitSignal] =
    useState(0);
  const [imageDescriptionHistoryCommitSignal, setImageDescriptionHistoryCommitSignal] =
    useState(0);
  const [acceptedCaptionSchedulerPrompt, setAcceptedCaptionSchedulerPrompt] = useState<{
    carryover: SchedulerAcceptedCaptionCarryover;
    scheduleIntent: SchedulerGeneratedMediaIntent | null;
  } | null>(null);
  const [captionFeedbackResetToken, setCaptionFeedbackResetToken] = useState<
    string | null
  >(null);
  const [isRegeneratingRejectedSet, setIsRegeneratingRejectedSet] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [contentButtonProgress, setContentButtonProgress] = useState(0);
  const [isContentButtonCompleting, setIsContentButtonCompleting] = useState(false);
  const contentButtonAnimationFrameRef = useRef<number | null>(null);
  const contentButtonCompletionTimeoutRef = useRef<number | null>(null);
  const contentButtonGenerationStartedAtRef = useRef<number | null>(null);
  const contentButtonProgressRef = useRef(0);
  const contentButtonLastFrameAtRef = useRef<number | null>(null);
  const contentButtonModeRef = useRef<GenerateButtonAnimationMode>('copy');
  const contentButtonMotionProfileRef = useRef<GenerateButtonMotionProfile>(
    createGenerateButtonMotionProfile('copy')
  );
  const avatarCandidates = useMemo(() => {
    const metadataSources: Array<Record<string, unknown> | null> = [
      user?.user_metadata && typeof user.user_metadata === 'object'
        ? (user.user_metadata as Record<string, unknown>)
        : null,
      ...(user?.identities ?? []).map((identity) =>
        identity.identity_data && typeof identity.identity_data === 'object'
          ? (identity.identity_data as Record<string, unknown>)
          : null
      ),
    ];

    return getAvatarCandidates(profile?.avatarUrl, metadataSources);
  }, [profile?.avatarUrl, user?.identities, user?.user_metadata]);

  const latestCopyFeedbackContext = useMemo(() => {
    const messages = workspace.activeThread?.messages ?? [];

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      const copyAsset = message.assets.find((asset) => asset.assetType === 'copy');
      const copyFeedbackMeta = getAssistantCopyFeedbackMeta(message);

      if (!copyFeedbackMeta.contentId || !copyAsset) {
        continue;
      }

      const payload = copyAsset.payload;
      const captionCount = Array.isArray(payload.captions)
        ? toCaptionVariants(payload.captions).length
        : 0;

      return {
        contentId: copyFeedbackMeta.contentId,
        captionCount,
        platform: typeof payload.platform === 'string' ? payload.platform : null,
        goal: typeof payload.goal === 'string' ? payload.goal : null,
        tone: typeof payload.tone === 'string' ? payload.tone : null,
        audience: typeof payload.audience === 'string' ? payload.audience : null,
      };
    }

    return null;
  }, [workspace.activeThread]);

  const submitGenerateMemoryFeedback = async (input: {
    sourceId: string;
    sourceKey: string;
    memoryType: string;
    eventType:
      | 'accepted'
      | 'rejected'
      | 'regenerated'
      | 'reused';
    platform?: string | null;
    contentId?: string | null;
    metadata?: Record<string, unknown>;
  }) => {
    if (!token) {
      return null;
    }

    return await apiRequest<BrandMemoryFeedbackEvent | null>('/api/content/feedback', {
      method: 'POST',
      token,
      body: {
        sourceTable: 'generated_content',
        sourceId: input.sourceId,
        sourceKey: input.sourceKey,
        memoryType: input.memoryType,
        eventType: input.eventType,
        platform: input.platform ?? null,
        contentId: input.contentId ?? input.sourceId,
        wasAiRecommended:
          input.eventType === 'accepted' || input.eventType === 'reused',
        metadata: input.metadata ?? {},
      },
    });
  };

  const handleCaptionFeedback = async (input: {
    contentId: string;
    platform: string | null;
    sourceKey: string;
    eventType: 'accepted' | 'rejected';
    captionText: string;
    selectedVariantIndex: number;
    scheduleIntent: SchedulerGeneratedMediaIntent | null;
    captionVariants: CaptionVariant[];
    productName: string | null;
    goal: string | null;
    tone: string | null;
    audience: string | null;
  }) => {
    if (!input.contentId) {
      return;
    }

    const carryoverId = `${input.contentId}:${input.sourceKey}:${Date.now()}`;
    const carryover: SchedulerAcceptedCaptionCarryover = {
      carryoverId,
      contentId: input.contentId,
      sourceKey: input.sourceKey,
      selectedVariantIndex: input.selectedVariantIndex,
      acceptedCaption: input.captionText.trim(),
      platform: input.platform,
      productName: input.productName,
      goal: input.goal,
      tone: input.tone,
      audience: input.audience,
      acceptedFeedbackEventId: null,
      captionVariants: input.captionVariants,
      createdAt: new Date().toISOString(),
    };

    const buildAcceptedScheduleIntent = (
      acceptedFeedbackEventId: string | null
    ): SchedulerGeneratedMediaIntent | null =>
      input.scheduleIntent
      ? {
          ...input.scheduleIntent,
          caption: input.captionText.trim(),
          metadata: {
            ...(input.scheduleIntent.metadata ?? {}),
            acceptedCaption: {
              sourceKey: input.sourceKey,
              memoryType: 'generated-caption',
              selectedVariantIndex: input.selectedVariantIndex,
              acceptedCaption: input.captionText.trim(),
              acceptedFeedbackEventId,
              wasAiRecommended: true,
            },
          },
        }
      : null;

    if (input.eventType === 'accepted' && input.captionText.trim()) {
      setAcceptedCaptionSchedulerPrompt({
        carryover,
        scheduleIntent: buildAcceptedScheduleIntent(null),
      });
    }

    let feedbackEvent: BrandMemoryFeedbackEvent | null = null;

    try {
      feedbackEvent = await submitGenerateMemoryFeedback({
        sourceId: input.contentId,
        sourceKey: input.sourceKey,
        memoryType: 'generated-caption',
        eventType: input.eventType,
        platform: input.platform,
        contentId: input.contentId,
        metadata: {
          requestContext: 'generate-page',
          interactionSurface: 'caption-card',
          selectedVariantIndex: input.selectedVariantIndex,
        },
      });
    } catch (error) {
      console.warn('[generate-page] failed to record caption feedback', {
        contentId: input.contentId,
        sourceKey: input.sourceKey,
        eventType: input.eventType,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (input.eventType !== 'accepted' || !input.captionText.trim()) {
      return;
    }

    setAcceptedCaptionSchedulerPrompt((current) => {
      if (!current || current.carryover.carryoverId !== carryoverId) {
        return current;
      }

      return {
        carryover: {
          ...current.carryover,
          acceptedFeedbackEventId: feedbackEvent?.id ?? null,
        },
        scheduleIntent: buildAcceptedScheduleIntent(feedbackEvent?.id ?? null),
      };
    });
  };

  const handleCaptionReuse = async (input: {
    contentId: string;
    platform: string | null;
    sourceKey: string;
  }) => {
    if (!input.contentId) {
      return;
    }

    try {
      await submitGenerateMemoryFeedback({
        sourceId: input.contentId,
        sourceKey: input.sourceKey,
        memoryType: 'generated-caption',
        eventType: 'reused',
        platform: input.platform,
        contentId: input.contentId,
        metadata: {
          requestContext: 'generate-page',
          interactionSurface: 'copy',
        },
      });
    } catch (error) {
      console.warn('[generate-page] failed to record caption reuse', {
        contentId: input.contentId,
        sourceKey: input.sourceKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const regenerateRejectedCaptionSet = async (
    input: GenerateContentInput & {
      contentId: string;
      captionCount: number;
    }
  ) => {
    if (isRegeneratingRejectedSet) {
      return;
    }

    setIsRegeneratingRejectedSet(true);
    setAcceptedCaptionSchedulerPrompt(null);

    if (input.contentId && input.captionCount > 0) {
      Array.from({ length: input.captionCount }).forEach((_, index) => {
        void submitGenerateMemoryFeedback({
          sourceId: input.contentId,
          sourceKey: `caption-${index + 1}`,
          memoryType: 'generated-caption',
          eventType: 'regenerated',
          platform: input.platform ?? null,
          contentId: input.contentId,
          metadata: {
            requestContext: 'generate-page',
            interactionSurface: 'all-rejected-regenerate',
            allVariantsRejected: true,
            goal: input.goal ?? null,
            tone: input.tone ?? null,
            audience: input.audience ?? null,
          },
        }).catch((error) => {
          console.warn('[generate-page] failed to record all-rejected regeneration', {
            contentId: input.contentId,
            sourceKey: `caption-${index + 1}`,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      });
    }

    const refinementNote =
      'Previous caption variations were rejected. Create a clearly stronger set with more distinct hooks, fresher phrasing, sharper platform fit, and clearer CTA alignment. Avoid repeating the earlier wording.';
    const refinedDescription = input.productDescription?.trim()
      ? `${input.productDescription.trim()}\n\n${refinementNote}`
      : refinementNote;

    try {
      await workspace.generateCopy({
        ...input,
        productDescription: refinedDescription,
      });
    } catch {
      return;
    } finally {
      setIsRegeneratingRejectedSet(false);
    }
  };

  const closeAcceptedCaptionSchedulerPrompt = () => {
    if (acceptedCaptionSchedulerPrompt) {
      setCaptionFeedbackResetToken(
        `${acceptedCaptionSchedulerPrompt.carryover.contentId}::${acceptedCaptionSchedulerPrompt.carryover.sourceKey}::${Date.now()}`
      );
    }
    setAcceptedCaptionSchedulerPrompt(null);
  };

  const useAcceptedCaptionInScheduler = () => {
    if (!acceptedCaptionSchedulerPrompt) {
      return;
    }

    if (acceptedCaptionSchedulerPrompt.scheduleIntent) {
      writeSchedulerGeneratedMediaIntent(acceptedCaptionSchedulerPrompt.scheduleIntent);
    } else {
      writeSchedulerAcceptedCaptionCarryover(acceptedCaptionSchedulerPrompt.carryover);
    }

    navigate('/app/scheduler', {
      state: {
        generatedMediaIntent: acceptedCaptionSchedulerPrompt.scheduleIntent,
        acceptedCaptionCarryover: acceptedCaptionSchedulerPrompt.carryover,
      },
    });
    setAcceptedCaptionSchedulerPrompt(null);
  };

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncTestingTier = () => {
      setSuperAdminTestingTier(readStoredSuperAdminTestingTier());
    };

    const handleTierChange = (event: Event) => {
      const customEvent = event as CustomEvent<string | undefined>;
      setSuperAdminTestingTier(
        normalizeSuperAdminTestingTier(customEvent.detail ?? null)
      );
    };

    window.addEventListener(SUPER_ADMIN_TESTING_TIER_EVENT, handleTierChange);
    window.addEventListener('storage', syncTestingTier);

    return () => {
      window.removeEventListener(
        SUPER_ADMIN_TESTING_TIER_EVENT,
        handleTierChange
      );
      window.removeEventListener('storage', syncTestingTier);
    };
  }, []);

  useEffect(() => {
    contentButtonProgressRef.current = contentButtonProgress;
  }, [contentButtonProgress]);

  useEffect(() => {
    if (contentButtonAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(contentButtonAnimationFrameRef.current);
      contentButtonAnimationFrameRef.current = null;
    }

    if (contentButtonCompletionTimeoutRef.current !== null) {
      window.clearTimeout(contentButtonCompletionTimeoutRef.current);
      contentButtonCompletionTimeoutRef.current = null;
    }

    if (workspace.isGeneratingCopy || workspace.isGeneratingImage) {
      setIsContentButtonCompleting(false);
      contentButtonModeRef.current = workspace.isGeneratingImage ? 'image' : 'copy';
      if (contentButtonProgressRef.current <= 0) {
        contentButtonMotionProfileRef.current = createGenerateButtonMotionProfile(
          contentButtonModeRef.current
        );
      }

      if (contentButtonProgressRef.current <= 0) {
        setContentButtonProgress(3);
      }

      if (contentButtonGenerationStartedAtRef.current === null) {
        contentButtonGenerationStartedAtRef.current = performance.now();
      }

      if (contentButtonLastFrameAtRef.current === null) {
        contentButtonLastFrameAtRef.current = performance.now();
      }

      const tick = () => {
        const currentFrameAt = performance.now();
        const startedAt =
          contentButtonGenerationStartedAtRef.current ?? currentFrameAt;
        const previousFrameAt =
          contentButtonLastFrameAtRef.current ?? currentFrameAt;
        const deltaMs = clamp(currentFrameAt - previousFrameAt, 0, 80);
        const elapsed = currentFrameAt - startedAt;
        const animationMode = contentButtonModeRef.current;
        const motionProfile = contentButtonMotionProfileRef.current;
        const targetProgress = getGenerateButtonProgressTarget(
          elapsed,
          motionProfile
        );
        const softCapProgress = motionProfile.softCap;

        contentButtonLastFrameAtRef.current = currentFrameAt;

        setContentButtonProgress((current) => {
          const tempoModifier = getGenerateButtonTempoModifier(
            elapsed,
            current,
            motionProfile
          );
          const boundedTarget = clamp(
            targetProgress,
            current,
            softCapProgress
          );
          const minimumLateDrift = getGenerateButtonMinimumDrift(
            current,
            deltaMs,
            animationMode,
            motionProfile
          ) * tempoModifier;
          const easeFactor = getGenerateButtonEaseFactor(
            current,
            animationMode,
            motionProfile
          ) * tempoModifier;
          const easedProgress =
            current +
            Math.max((boundedTarget - current) * easeFactor, minimumLateDrift);

          return clamp(
            Math.abs(boundedTarget - easedProgress) < 0.12
              ? boundedTarget
              : easedProgress,
            0,
            softCapProgress
          );
        });

        contentButtonAnimationFrameRef.current = window.requestAnimationFrame(tick);
      };

      contentButtonAnimationFrameRef.current = window.requestAnimationFrame(tick);

      return () => {
        if (contentButtonAnimationFrameRef.current !== null) {
          window.cancelAnimationFrame(contentButtonAnimationFrameRef.current);
          contentButtonAnimationFrameRef.current = null;
        }

        contentButtonLastFrameAtRef.current = null;
      };
    }

    if (contentButtonProgressRef.current <= 0) {
      setIsContentButtonCompleting(false);
      contentButtonGenerationStartedAtRef.current = null;
      contentButtonLastFrameAtRef.current = null;
      contentButtonModeRef.current = 'copy';
      contentButtonMotionProfileRef.current = createGenerateButtonMotionProfile(
        'copy'
      );
      return;
    }

    setIsContentButtonCompleting(true);
    const startingProgress = contentButtonProgressRef.current;
    const generationStartedAt = contentButtonGenerationStartedAtRef.current;
    const elapsedVisibleMs = generationStartedAt
      ? performance.now() - generationStartedAt
      : CONTENT_BUTTON_MIN_VISIBLE_MS;
    const remainingVisibleMs = Math.max(
      0,
      CONTENT_BUTTON_MIN_VISIBLE_MS - elapsedVisibleMs
    );

    const runCompletionAnimation = () => {
      const completionStartedAt = performance.now();

      const completeTick = () => {
        const elapsed = performance.now() - completionStartedAt;
        const progressRatio = clamp(
          elapsed / CONTENT_BUTTON_COMPLETE_ANIMATION_MS,
          0,
          1
        );
        const easedRatio = 1 - Math.pow(1 - progressRatio, 3);

        setContentButtonProgress(
          startingProgress + (100 - startingProgress) * easedRatio
        );

        if (progressRatio < 1) {
          contentButtonAnimationFrameRef.current =
            window.requestAnimationFrame(completeTick);
          return;
        }

        contentButtonAnimationFrameRef.current = null;
        contentButtonCompletionTimeoutRef.current = window.setTimeout(() => {
          setIsContentButtonCompleting(false);
          setContentButtonProgress(0);
          contentButtonModeRef.current = 'copy';
          contentButtonMotionProfileRef.current = createGenerateButtonMotionProfile(
            'copy'
          );
          contentButtonCompletionTimeoutRef.current = null;
        }, CONTENT_BUTTON_COMPLETE_HOLD_MS);
      };

      contentButtonAnimationFrameRef.current =
        window.requestAnimationFrame(completeTick);
    };

    contentButtonCompletionTimeoutRef.current = window.setTimeout(() => {
      contentButtonCompletionTimeoutRef.current = null;
      contentButtonGenerationStartedAtRef.current = null;
      contentButtonLastFrameAtRef.current = null;
      runCompletionAnimation();
    }, remainingVisibleMs);

    return () => {
      if (contentButtonAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(contentButtonAnimationFrameRef.current);
        contentButtonAnimationFrameRef.current = null;
      }

      if (contentButtonCompletionTimeoutRef.current !== null) {
        window.clearTimeout(contentButtonCompletionTimeoutRef.current);
        contentButtonCompletionTimeoutRef.current = null;
      }
    };
  }, [workspace.isGeneratingCopy, workspace.isGeneratingImage]);

  useEffect(
    () => () => {
      if (contentButtonAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(contentButtonAnimationFrameRef.current);
      }

      if (contentButtonCompletionTimeoutRef.current !== null) {
        window.clearTimeout(contentButtonCompletionTimeoutRef.current);
      }

      contentButtonLastFrameAtRef.current = null;
    },
    []
  );


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
  const isAnyGenerationRunning =
    workspace.isGeneratingCopy || workspace.isGeneratingImage;
  const isContentButtonAnimating =
    isAnyGenerationRunning || isContentButtonCompleting;
  const activeButtonAnimationMode = workspace.isGeneratingImage
    ? 'image'
    : workspace.isGeneratingCopy
      ? 'copy'
      : contentButtonModeRef.current;
  const submitButtonBaseLabel =
    activeWorkspace === 'copy' ? 'Generate content' : 'Generate image';
  const submitButtonProgressLabel = 'Generating...';
  const roundedContentButtonProgress = Math.round(contentButtonProgress);
  const activeButtonMotionProfile = contentButtonMotionProfileRef.current;
  const activeContentVerboseMessages = workspace.isGeneratingCopy
    ? workspace.copyGenerationVerboseMessages.length
      ? workspace.copyGenerationVerboseMessages
      : CONTENT_GENERATION_VERBOSE_MESSAGES_BY_PHASE[workspace.copyGenerationPhase] ??
        CONTENT_GENERATION_VERBOSE_MESSAGES_BY_PHASE.writing
    : CONTENT_GENERATION_VERBOSE_MESSAGES_BY_PHASE.idle;
  const displayedContentButtonProgress =
    isContentButtonAnimating &&
    contentButtonProgress >= activeButtonMotionProfile.decimalStartAt &&
    contentButtonProgress < 100
      ? `${contentButtonProgress.toFixed(1)}%`
      : `${roundedContentButtonProgress}%`;
  const contentButtonProgressStyle = {
    '--generate-button-progress': `${contentButtonProgress}%`,
    '--generate-button-progress-ratio': `${Math.max(
      0,
      Math.min(1, contentButtonProgress / 100)
    ).toFixed(4)}`,
    '--generate-button-flow-duration': `${activeButtonMotionProfile.flowDurationMs}ms`,
    '--generate-button-bob-duration': `${activeButtonMotionProfile.bobDurationMs}ms`,
    '--generate-button-aura-shift': `${activeButtonMotionProfile.auraShiftPx}px`,
    '--generate-button-tilt': `${activeButtonMotionProfile.tiltDeg.toFixed(2)}deg`,
  } as CSSProperties;
  const readableWorkspaceError = normalizeWorkspaceError(
    workspace.error,
    activeWorkspace
  );
  const currentPlan = subscription?.plan ?? catalog?.currentSubscription.plan ?? 'free';
  const showSuperAdminPlanSelector =
    isSuperAdminUser(user) ||
    subscription?.metadata?.superAdmin === true ||
    catalog?.currentSubscription.metadata?.superAdmin === true;
  const planDetails = PLAN_DASHBOARD_DETAILS[currentPlan];
  const isUsageLoading = isBillingLoading || isAnalyticsLoading;
  const usageSummary = getOverallUsageSummary({
    contentLimit: planDetails.contentLimit,
    imageLimit: planDetails.imageLimit,
    contentUsed: overview?.generation.contentGenerationsToday ?? null,
    imageUsed: overview?.generation.imageGenerationsToday ?? null,
    isLoading: isUsageLoading,
    hasUsageData: Boolean(overview),
    usageWindowLabel: planDetails.usageWindowLabel,
  });
  const visibleWorkspaceMenuItems = useMemo(
    () =>
      isAdmin
        ? [
            ...WORKSPACE_MENU_ITEMS,
            { label: 'Admin Health', href: '/app/admin-health', icon: ShieldCheck },
          ]
        : WORKSPACE_MENU_ITEMS,
    [isAdmin]
  );
  const shouldWatermarkImages =
    !subscription || subscription.plan === 'free';
  const threadTitle = activeConversation?.title || 'New conversation';
  const savedBrandName = profile?.brandName?.trim() || '';
  const hasSavedBrandName = Boolean(savedBrandName);
  const selectedImageBackgroundStyle =
    imageForm.backgroundStyle || IMAGE_BACKGROUND_OPTIONS[0];
  const isCustomImageBackground =
    selectedImageBackgroundStyle === CUSTOM_BACKGROUND_OPTION;
  const customImageBackgroundPrompt = isCustomImageBackground
    ? imageForm.backgroundPrompt.trim()
    : '';
  const [isCustomBackgroundApplied, setIsCustomBackgroundApplied] = useState(false);
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

  useEffect(() => {
    if (!isCustomImageBackground) {
      setIsCustomBackgroundApplied(false);
    }
  }, [isCustomImageBackground]);

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

    if (!contentForm.productDescription.trim()) {
      workspace.setError(DESCRIPTION_REQUIRED_MESSAGE);
      return;
    }

    try {
      await workspace.generateCopy({
        ...contentForm,
        keywords: splitKeywords(keywordInput),
      });

      if (contentForm.productDescription.trim()) {
        setContentDescriptionHistoryCommitSignal((current) => current + 1);
      }
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

    if (!hasImageGenerationSignal(imageForm)) {
      workspace.setError(IMAGE_REFERENCE_OR_BRIEF_REQUIRED_MESSAGE);
      return;
    }

    if (isCustomImageBackground && !customImageBackgroundPrompt) {
      workspace.setError(
        'Describe the custom background, or choose a ready-made background style.'
      );
      return;
    }

    try {
      await workspace.generateImage({
        ...imageForm,
        width: 768,
        height: 768,
        backgroundStyle: selectedImageBackgroundStyle,
        backgroundPrompt: customImageBackgroundPrompt || undefined,
        sourceImageUrl: imageForm.sourceImageUrl || undefined,
        prompt: imageForm.prompt || undefined,
      });

      if (imageForm.productDescription.trim()) {
        setImageDescriptionHistoryCommitSignal((current) => current + 1);
      }
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
    if (!contentForm.productDescription.trim()) {
      workspace.setError(DESCRIPTION_REQUIRED_MESSAGE);
      return;
    }

    if (latestCopyFeedbackContext?.contentId && latestCopyFeedbackContext.captionCount > 0) {
      Array.from({ length: latestCopyFeedbackContext.captionCount }).forEach(
        (_, index) => {
          void submitGenerateMemoryFeedback({
            sourceId: latestCopyFeedbackContext.contentId,
            sourceKey: `caption-${index + 1}`,
            memoryType: 'generated-caption',
            eventType: 'regenerated',
            platform: latestCopyFeedbackContext.platform,
            contentId: latestCopyFeedbackContext.contentId,
            metadata: {
              requestContext: 'generate-page',
              interactionSurface: 'regenerate',
              goal: latestCopyFeedbackContext.goal,
              tone: latestCopyFeedbackContext.tone,
              audience: latestCopyFeedbackContext.audience,
            },
          }).catch((error) => {
            console.warn('[generate-page] failed to record caption regeneration', {
              contentId: latestCopyFeedbackContext.contentId,
              sourceKey: `caption-${index + 1}`,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      );
    }

    void workspace
      .generateCopy({
        ...contentForm,
        keywords: splitKeywords(keywordInput),
      })
      .then(() => {
        if (contentForm.productDescription.trim()) {
          setContentDescriptionHistoryCommitSignal((current) => current + 1);
        }
      })
      .catch(() => undefined);
  };

  const regenerateImage = () => {
    if (!hasImageGenerationSignal(imageForm)) {
      workspace.setError(IMAGE_REFERENCE_OR_BRIEF_REQUIRED_MESSAGE);
      return;
    }

    if (isCustomImageBackground && !customImageBackgroundPrompt) {
      workspace.setError(
        'Describe the custom background, or choose a ready-made background style.'
      );
      return;
    }

    void workspace
      .generateImage({
        ...imageForm,
        width: 768,
        height: 768,
        backgroundStyle: selectedImageBackgroundStyle,
        backgroundPrompt: customImageBackgroundPrompt || undefined,
        sourceImageUrl: imageForm.sourceImageUrl || undefined,
        prompt: imageForm.prompt || undefined,
      })
      .then(() => {
        if (imageForm.productDescription.trim()) {
          setImageDescriptionHistoryCommitSignal((current) => current + 1);
        }
      })
      .catch(() => undefined);
  };

  const stopGeneration = () => {
    workspace.cancelCopyGeneration();
    workspace.cancelImageGeneration();
  };

  const applyCustomBackgroundPrompt = () => {
    const trimmedPrompt = imageForm.backgroundPrompt.trim();

    if (!trimmedPrompt) {
      workspace.setError('Write your custom background first.');
      setIsCustomBackgroundApplied(false);
      return;
    }

    setImageForm((current) => ({
      ...current,
      backgroundPrompt: trimmedPrompt,
    }));
    workspace.setError(null);
    setIsCustomBackgroundApplied(true);
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
              {!isConversationSidebarCollapsed ? (
                <>
                  <strong>{APP_NAME}</strong>
                  {showSuperAdminBadge ? (
                    <span className="super-admin-chip super-admin-chip--brand">SA</span>
                  ) : null}
                </>
              ) : null}
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
                  {showSuperAdminPlanSelector ? (
                    <label
                      className="sidebar__plan-select"
                      htmlFor="generate-super-admin-tier"
                      title="Switch SA testing tier"
                    >
                      <select
                        id="generate-super-admin-tier"
                        value={superAdminTestingTier}
                        onChange={(event) => {
                          const nextPlan = normalizeSuperAdminTestingTier(
                            event.target.value
                          );
                          setSuperAdminTestingTier(nextPlan);
                          writeStoredSuperAdminTestingTier(nextPlan);
                        }}
                      >
                        <option value="free">Free</option>
                        <option value="basic">Basic</option>
                        <option value="pro">Pro</option>
                      </select>
                      <span className="sidebar__plan-select-icon" aria-hidden="true">
                        <ChevronDown size={12} />
                      </span>
                    </label>
                  ) : (
                    <CurrentPlanBadge
                      plan={currentPlan}
                      className="generate-chat__plan-badge"
                    />
                  )}
                </div>
                <span>{profile?.industry || 'Open workspace options'}</span>
              </div>

              <nav className="generate-chat__account-menu-links" aria-label="Workspace navigation">
                {visibleWorkspaceMenuItems.map((item) => {
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
                            message={message}
                            assets={message.assets}
                            showImageWatermark={shouldWatermarkImages}
                            onCaptionFeedback={handleCaptionFeedback}
                            onCaptionReuse={handleCaptionReuse}
                            feedbackResetToken={captionFeedbackResetToken}
                            onRegenerateAllRejected={regenerateRejectedCaptionSet}
                            isRegeneratingAllRejected={isRegeneratingRejectedSet}
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
                      verboseMessages={
                        workspace.isGeneratingCopy
                          ? activeContentVerboseMessages
                          : undefined
                      }
                      preferLatestVerboseMessage={
                        workspace.isGeneratingCopy &&
                        workspace.copyGenerationVerboseMessages.length > 0
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
                  className={`generate-chat__submit-button ${
                    isContentButtonAnimating
                      ? 'generate-chat__submit-button--progress'
                      : ''
                  }`}
                  aria-busy={isContentButtonAnimating}
                  style={isContentButtonAnimating ? contentButtonProgressStyle : undefined}
                  disabled={
                    activeWorkspace === 'copy'
                      ? workspace.isGeneratingCopy
                      : workspace.isGeneratingImage
                  }
                >
                  {isContentButtonAnimating ? (
                    <span className="generate-chat__submit-progress">
                      <span className="generate-chat__submit-progress-copy">
                        <span className="generate-chat__submit-progress-label">
                          {submitButtonProgressLabel}
                        </span>
                        <span className="generate-chat__submit-progress-value">
                          {displayedContentButtonProgress}
                        </span>
                      </span>
                    </span>
                  ) : activeWorkspace === 'copy' ? (
                    'Generate content'
                  ) : (
                    'Generate image'
                  )}
                </Button>
                {isAnyGenerationRunning ? (
                  <button
                    type="button"
                    className="generate-chat__stop-button"
                    onClick={stopGeneration}
                    aria-label="Stop generating"
                    title="Stop generating"
                  >
                    <Square size={12} strokeWidth={2.5} />
                  </button>
                ) : null}
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
                  <DictationTextareaField
                    className="field field--full"
                    label="Description / brief"
                    storageKey="generate-content-description"
                    historyCommitSignal={contentDescriptionHistoryCommitSignal}
                    value={contentForm.productDescription}
                    onChange={(nextValue) =>
                      setContentForm((current) => ({
                        ...current,
                        productDescription: nextValue,
                      }))
                    }
                    rows={2}
                  />
                  <label className="field">
                    <span className="field__label">Keywords</span>
                    <input
                      className="field__control"
                      value={keywordInput}
                      onChange={(event) => setKeywordInput(event.target.value)}
                      placeholder="Themes, pain points, campaign terms"
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
                    label="Platform"
                    value={imageForm.platform}
                    onChange={(event) =>
                      setImageForm((current) => ({
                        ...current,
                        platform: event.target.value,
                      }))
                    }
                  >
                    {CONTENT_PLATFORM_OPTIONS.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </Select>
                  <div
                    className={`field generate-chat__background-field ${
                      isCustomImageBackground
                        ? 'generate-chat__background-field--custom'
                        : ''
                    }`}
                  >
                    <span className="field__label-row">
                      <span className="field__label">Background style</span>
                    </span>
                    <div className="generate-chat__background-shell">
                      <select
                        className="field__control field__control--select generate-chat__background-select"
                        value={selectedImageBackgroundStyle}
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
                      </select>
                      {isCustomImageBackground ? (
                        <div className="generate-chat__custom-background-panel">
                          <div className="generate-chat__custom-background-topline">
                            <span className="generate-chat__custom-background-pill">
                              <Sparkles size={14} />
                              Custom scene
                            </span>
                            <span>
                              Press Enter to apply. Use Shift + Enter for a new line.
                            </span>
                          </div>
                          <textarea
                            className="generate-chat__custom-background-input"
                            value={imageForm.backgroundPrompt}
                            onChange={(event) =>
                              {
                                setImageForm((current) => ({
                                  ...current,
                                  backgroundPrompt: event.target.value,
                                }));
                                if (isCustomBackgroundApplied) {
                                  setIsCustomBackgroundApplied(false);
                                }
                              }
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                applyCustomBackgroundPrompt();
                              }
                            }}
                            rows={3}
                            placeholder="Example: Bengali vintage cinema hall, rainy Kolkata street, red velvet curtain, old film poster wall..."
                          />
                          <div className="generate-chat__custom-background-actions">
                            <button
                              type="button"
                              className={`generate-chat__custom-background-apply ${
                                isCustomBackgroundApplied
                                  ? 'generate-chat__custom-background-apply--done'
                                  : ''
                              }`}
                              onClick={applyCustomBackgroundPrompt}
                            >
                              {isCustomBackgroundApplied ? <Check size={14} /> : <Sparkles size={14} />}
                              <span>{isCustomBackgroundApplied ? 'Applied' : 'Apply'}</span>
                            </button>
                            <span className="generate-chat__custom-background-hint">
                              PrixmoAI will turn this into a polished background prompt.
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <DictationTextareaField
                    className="field field--full"
                    label="Description / brief"
                    storageKey="generate-image-description"
                    historyCommitSignal={imageDescriptionHistoryCommitSignal}
                    value={imageForm.productDescription}
                    onChange={(nextValue) =>
                      setImageForm((current) => ({
                        ...current,
                        productDescription: nextValue,
                      }))
                    }
                    placeholder='Short prompts work here too. Example: "Create a similar image from the reference below."'
                    rows={2}
                  />
                  <label className="field">
                    <span className="field__label">Reference image URL</span>
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
                    <span className="field__label">Upload reference image</span>
                    <label className="generator-upload generator-upload--compact generate-chat__reference-upload">
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
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                    <div className="generator-source-chip__copy">
                      <strong>Reference ready</strong>
                      <span>Used as the primary visual reference for this generation.</span>
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
      {acceptedCaptionSchedulerPrompt ? (
        <div
          className="generate-accept-scheduler-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Use accepted caption in scheduler"
        >
          <button
            type="button"
            className="generate-accept-scheduler-dialog__backdrop"
            onClick={closeAcceptedCaptionSchedulerPrompt}
            aria-label="Close scheduler prompt"
          />
          <div className="generate-accept-scheduler-dialog__panel">
            <div className="generate-accept-scheduler-dialog__header">
              <div>
                <p className="section-eyebrow">Caption accepted</p>
                <h3>Use this caption in Scheduler?</h3>
              </div>
              <button
                type="button"
                className="generated-image-card__action"
                onClick={closeAcceptedCaptionSchedulerPrompt}
                aria-label="Close scheduler prompt"
              >
                <X size={16} />
              </button>
            </div>
            <p className="generate-accept-scheduler-dialog__copy">
              PrixmoAI can carry this accepted caption into Scheduler so you can post
              the same variation without rebuilding it.
            </p>
            <div className="generate-accept-scheduler-dialog__preview">
              <p>{acceptedCaptionSchedulerPrompt.carryover.acceptedCaption}</p>
            </div>
            <div className="generate-accept-scheduler-dialog__actions">
              <button
                type="button"
                className="caption-feedback-button"
                onClick={closeAcceptedCaptionSchedulerPrompt}
              >
                Not now
              </button>
              <button
                type="button"
                className="caption-feedback-button caption-feedback-button--accepted"
                onClick={useAcceptedCaptionInScheduler}
              >
                <CalendarClock size={15} />
                Use in Scheduler
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
