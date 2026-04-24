import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  Check,
  Loader2,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { DictationTextareaField } from '../generate/DictationTextareaField';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { ErrorMessage } from '../shared/ErrorMessage';
import { Card } from '../ui/card';
import { useAuth } from '../../hooks/useAuth';
import { ApiRequestError, apiRequest } from '../../lib/axios';
import {
  readBrowserCache,
  removeBrowserCache,
  writeBrowserCache,
} from '../../lib/browserCache';
import type {
  BrandProfile,
  IndustrySuggestionResult,
  ProfileSaveContext,
  SaveProfileInput,
  UsernameAvailabilityResult,
} from '../../types';
import { BRAND_VOICE_OPTIONS } from '../../lib/constants';
import { COUNTRY_OPTIONS } from '../../lib/profileCountries';
import {
  USERNAME_RULE_HINT,
  isValidUsernameInput,
  normalizeUsername,
} from '../../lib/username';
import {
  MAX_SECONDARY_INDUSTRIES,
  createIndustrySummary,
  getIndustryGroupForValue,
  getIndustryGuidance,
  getIndustryCatalogPromptItems,
  getPrimaryIndustryCards,
  getSecondaryIndustryGroups,
  isKnownPrimaryIndustryValue,
  normalizeSecondaryIndustries,
  resolvePrimaryIndustryValue,
} from '../../lib/industryCatalog';

type ProfileFormPanelProps = {
  profile: BrandProfile | null;
  defaults?: Partial<SaveProfileInput>;
  saveContext: Exclude<ProfileSaveContext, 'system'>;
  heading: string;
  subheading?: string;
  submitLabel: string;
  persistProfile?: (input: SaveProfileInput) => Promise<void>;
  onSubmit: (input: SaveProfileInput) => Promise<void>;
};

type ProfileFormState = {
  brandName: string;
  fullName: string;
  phoneNumber: string;
  username: string;
  avatarUrl: string;
  country: string;
  language: string;
  websiteUrl: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  industry: string;
  primaryIndustry: string;
  secondaryIndustries: string[];
  targetAudience: string;
  brandVoice: string;
  description: string;
};

type StringFieldKey = Exclude<keyof ProfileFormState, 'secondaryIndustries'>;

type BrandDescriptionSuggestion = {
  description: string;
  provider: 'groq' | 'gemini';
  language: string;
};

type RequiredProfileFieldKey =
  | 'country'
  | 'logo'
  | 'industry'
  | 'targetAudience'
  | 'brandVoice'
  | 'description';

const PROFILE_FORM_DRAFT_CACHE_KEY_PREFIX = 'prixmoai.profile-form.draft';
const BRAND_DESCRIPTION_CURSOR = '▍';

const buildProfileFormDraftKey = (userId?: string | null) =>
  userId ? `${PROFILE_FORM_DRAFT_CACHE_KEY_PREFIX}:${userId}` : null;

const stripBrandDescriptionCursor = (value: string) =>
  value.replace(new RegExp(`${BRAND_DESCRIPTION_CURSOR}$`), '');

const getPrimaryIndustrySeed = (
  ...values: Array<string | null | undefined>
) => {
  const firstValue = values.find((value) => value?.trim());

  if (!firstValue) {
    return '';
  }

  return firstValue.split('|')[0]?.trim() ?? '';
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Failed to read the selected file.'));
    };

    reader.onerror = () => {
      reject(new Error('Failed to read the selected file.'));
    };

    reader.readAsDataURL(file);
  });

export const ProfileFormPanel = ({
  profile,
  defaults,
  saveContext,
  heading,
  subheading,
  submitLabel,
  persistProfile,
  onSubmit,
}: ProfileFormPanelProps) => {
  const { token, user } = useAuth();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const brandDescriptionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const brandDescriptionSuggestionRef = useRef<HTMLTextAreaElement | null>(null);
  const countryFieldRef = useRef<HTMLDivElement | null>(null);
  const logoFieldRef = useRef<HTMLDivElement | null>(null);
  const industryFieldRef = useRef<HTMLDivElement | null>(null);
  const targetAudienceFieldRef = useRef<HTMLDivElement | null>(null);
  const brandVoiceFieldRef = useRef<HTMLDivElement | null>(null);
  const descriptionFieldRef = useRef<HTMLDivElement | null>(null);
  const normalizeHex = (value: string) => {
    const trimmed = value.trim();
    return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed.toUpperCase() : trimmed;
  };
  const draftCacheKey = buildProfileFormDraftKey(user?.id);
  const initialPrimaryIndustrySeed = getPrimaryIndustrySeed(
    profile?.primaryIndustry,
    defaults?.primaryIndustry,
    profile?.industry,
    defaults?.industry
  );
  const initialPrimaryIndustry = resolvePrimaryIndustryValue(
    initialPrimaryIndustrySeed
  );
  const initialPrimaryIsCustom = Boolean(
    initialPrimaryIndustrySeed &&
      !isKnownPrimaryIndustryValue(initialPrimaryIndustrySeed)
  );
  const buildFormState = (): ProfileFormState => {
    const baseState: ProfileFormState = {
      brandName: profile?.brandName || defaults?.brandName || '',
      fullName: profile?.fullName || defaults?.fullName || '',
      phoneNumber: profile?.phoneNumber || defaults?.phoneNumber || '',
      username: profile?.username || defaults?.username || '',
      avatarUrl: profile?.avatarUrl || defaults?.avatarUrl || '',
      country: profile?.country || defaults?.country || '',
      language: profile?.language || defaults?.language || '',
      websiteUrl: profile?.websiteUrl || defaults?.websiteUrl || '',
      logoUrl: profile?.logoUrl || defaults?.logoUrl || '',
      primaryColor: profile?.primaryColor || defaults?.primaryColor || '',
      secondaryColor: profile?.secondaryColor || defaults?.secondaryColor || '',
      accentColor: profile?.accentColor || defaults?.accentColor || '',
      industry: profile?.industry || defaults?.industry || '',
      primaryIndustry: initialPrimaryIndustry,
      secondaryIndustries: normalizeSecondaryIndustries(initialPrimaryIndustry, [
        ...(profile?.secondaryIndustries || defaults?.secondaryIndustries || []),
      ]),
      targetAudience: profile?.targetAudience || defaults?.targetAudience || '',
      brandVoice: profile?.brandVoice || defaults?.brandVoice || '',
      description: profile?.description || defaults?.description || '',
    };

    if (!draftCacheKey) {
      return baseState;
    }

    const cachedDraft = readBrowserCache<ProfileFormState>(draftCacheKey)?.value;

    return cachedDraft ? { ...baseState, ...cachedDraft } : baseState;
  };

  const [form, setForm] = useState<ProfileFormState>(buildFormState);
  const [error, setError] = useState<string | null>(null);
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [primarySearch, setPrimarySearch] = useState('');
  const [secondarySearch, setSecondarySearch] = useState('');
  const [isCustomPrimaryOpen, setIsCustomPrimaryOpen] =
    useState(initialPrimaryIsCustom);
  const [customPrimaryDraft, setCustomPrimaryDraft] = useState(
    initialPrimaryIsCustom ? initialPrimaryIndustry : ''
  );
  const [customSecondaryDraft, setCustomSecondaryDraft] = useState('');
  const [industrySuggestionText, setIndustrySuggestionText] = useState('');
  const [industrySocialContext, setIndustrySocialContext] = useState('');
  const [isSuggestingIndustry, setIsSuggestingIndustry] = useState(false);
  const [industrySuggestion, setIndustrySuggestion] =
    useState<IndustrySuggestionResult | null>(null);
  const [typedIndustrySuggestion, setTypedIndustrySuggestion] = useState('');
  const [usernameAvailabilityState, setUsernameAvailabilityState] = useState<
    'idle' | 'checking' | 'available' | 'unavailable'
  >('idle');
  const [usernameFeedbackMessage, setUsernameFeedbackMessage] = useState<string | null>(
    null
  );
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [lastCheckedUsername, setLastCheckedUsername] = useState('');
  const [validationTarget, setValidationTarget] =
    useState<RequiredProfileFieldKey | null>(null);
  const [isBrandDescriptionAssistantOpen, setIsBrandDescriptionAssistantOpen] =
    useState(false);
  const [brandDescriptionPrompt, setBrandDescriptionPrompt] = useState('');
  const [brandDescriptionPromptLanguage, setBrandDescriptionPromptLanguage] =
    useState('en');
  const [isGeneratingBrandDescription, setIsGeneratingBrandDescription] =
    useState(false);
  const [brandDescriptionSuggestion, setBrandDescriptionSuggestion] =
    useState<BrandDescriptionSuggestion | null>(null);
  const [brandDescriptionSuggestionDraft, setBrandDescriptionSuggestionDraft] =
    useState('');
  const [isEditingBrandDescriptionSuggestion, setIsEditingBrandDescriptionSuggestion] =
    useState(false);
  const [brandDescriptionTypingTarget, setBrandDescriptionTypingTarget] =
    useState<string | null>(null);
  const [isBrandDescriptionResultOpen, setIsBrandDescriptionResultOpen] =
    useState(false);
  const brandVoiceOptions =
    form.brandVoice &&
    !(BRAND_VOICE_OPTIONS as readonly string[]).includes(form.brandVoice)
      ? [form.brandVoice, ...BRAND_VOICE_OPTIONS]
      : BRAND_VOICE_OPTIONS;
  const primaryIndustryCards = getPrimaryIndustryCards(primarySearch);
  const secondaryIndustryGroups = getSecondaryIndustryGroups(
    form.primaryIndustry,
    secondarySearch
  );
  const normalizedSecondaryIndustries = normalizeSecondaryIndustries(
    form.primaryIndustry,
    form.secondaryIndustries
  );
  const selectedPrimaryIndustryGroup = getIndustryGroupForValue(
    form.primaryIndustry
  );
  const industryGuidance = getIndustryGuidance(form.primaryIndustry);
  const industrySuggestionSummary = industrySuggestion
    ? `${
        industrySuggestion.source === 'ai' ? 'AI mapped your business to ' : ''
      }${industrySuggestion.primaryIndustry}${
        industrySuggestion.secondaryIndustries.length
          ? ` with ${industrySuggestion.secondaryIndustries.join(', ')}`
          : ''
      }.`
    : '';
  const usernameHintText =
    usernameAvailabilityState === 'idle'
      ? USERNAME_RULE_HINT
      : usernameFeedbackMessage || USERNAME_RULE_HINT;
  const validationTargetRefs: Record<
    RequiredProfileFieldKey,
    RefObject<HTMLDivElement | null>
  > = {
    country: countryFieldRef,
    logo: logoFieldRef,
    industry: industryFieldRef,
    targetAudience: targetAudienceFieldRef,
    brandVoice: brandVoiceFieldRef,
    description: descriptionFieldRef,
  };

  useEffect(() => {
    if (!draftCacheKey) {
      return;
    }

    writeBrowserCache(draftCacheKey, {
      ...form,
      description: stripBrandDescriptionCursor(form.description),
    });
  }, [draftCacheKey, form]);

  useEffect(() => {
    if (!industrySuggestionSummary) {
      setTypedIndustrySuggestion('');
      return;
    }

    let cursor = 0;
    setTypedIndustrySuggestion('');

    const timer = window.setInterval(() => {
      cursor += 1;
      setTypedIndustrySuggestion(industrySuggestionSummary.slice(0, cursor));

      if (cursor >= industrySuggestionSummary.length) {
        window.clearInterval(timer);
      }
    }, 16);

    return () => window.clearInterval(timer);
  }, [industrySuggestionSummary]);

  useEffect(() => {
    if (!brandDescriptionTypingTarget) {
      return;
    }

    const target = stripBrandDescriptionCursor(brandDescriptionTypingTarget).trim();

    if (!target) {
      setBrandDescriptionTypingTarget(null);
      return;
    }

    let cursor = 0;
    const step = target.length > 320 ? 3 : target.length > 180 ? 2 : 1;

    setForm((current) => ({
      ...current,
      description: BRAND_DESCRIPTION_CURSOR,
    }));

    const timer = window.setInterval(() => {
      cursor = Math.min(target.length, cursor + step);

      setForm((current) => ({
        ...current,
        description:
          cursor >= target.length
            ? target
            : `${target.slice(0, cursor)}${BRAND_DESCRIPTION_CURSOR}`,
      }));

      if (cursor >= target.length) {
        window.clearInterval(timer);
        setBrandDescriptionTypingTarget(null);
      }
    }, 18);

    return () => window.clearInterval(timer);
  }, [brandDescriptionTypingTarget]);

  useEffect(() => {
    if (!validationTarget) {
      return;
    }

    const validationResolved =
      (validationTarget === 'country' && Boolean(form.country.trim())) ||
      (validationTarget === 'logo' && Boolean(form.logoUrl.trim())) ||
      (validationTarget === 'industry' && Boolean(form.primaryIndustry.trim())) ||
      (validationTarget === 'targetAudience' &&
        Boolean(form.targetAudience.trim())) ||
      (validationTarget === 'brandVoice' && Boolean(form.brandVoice.trim())) ||
      (validationTarget === 'description' &&
        Boolean(stripBrandDescriptionCursor(form.description).trim()));

    if (validationResolved) {
      setValidationTarget(null);
    }
  }, [
    form.brandVoice,
    form.country,
    form.description,
    form.logoUrl,
    form.primaryIndustry,
    form.targetAudience,
    validationTarget,
  ]);

  const scrollToValidationTarget = (key: RequiredProfileFieldKey) => {
    setValidationTarget(key);
    const target = validationTargetRefs[key].current;

    if (!target) {
      return;
    }

    target.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });

    window.setTimeout(() => {
      if (key === 'description') {
        brandDescriptionInputRef.current?.focus({ preventScroll: true });
        return;
      }

      const focusable = target.querySelector<HTMLElement>(
        'input, select, textarea, button'
      );
      focusable?.focus({ preventScroll: true });
    }, 260);
  };

  const notifyBrandDescriptionGenerationRequirement = (options: {
    message: string;
    target?: RequiredProfileFieldKey | 'brandName';
  }) => {
    setError(null);
    setSuccess(null);
    setValidationNotice(options.message);

    if (!options.target) {
      return;
    }

    if (options.target === 'brandName') {
      const brandNameInput = document.getElementById(
        'profile-brand-name'
      ) as HTMLInputElement | null;

      brandNameInput?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });

      window.setTimeout(() => {
        brandNameInput?.focus({ preventScroll: true });
      }, 260);
      return;
    }

    scrollToValidationTarget(options.target);
  };

  const findFirstMissingRequiredField = (): {
    key: RequiredProfileFieldKey;
    message: string;
  } | null => {
    if (!form.country.trim()) {
      return {
        key: 'country',
        message: 'Almost there. Select your country to continue.',
      };
    }

    if (!form.logoUrl.trim()) {
      return {
        key: 'logo',
        message: 'Almost there. Upload your logo to continue.',
      };
    }

    if (!form.primaryIndustry.trim()) {
      return {
        key: 'industry',
        message: 'Almost there. Choose your industry to continue.',
      };
    }

    if (!form.targetAudience.trim()) {
      return {
        key: 'targetAudience',
        message: 'Almost there. Add your target audience to continue.',
      };
    }

    if (!form.brandVoice.trim()) {
      return {
        key: 'brandVoice',
        message: 'Almost there. Pick your brand voice to continue.',
      };
    }

    if (!stripBrandDescriptionCursor(form.description).trim()) {
      return {
        key: 'description',
        message: 'Almost there. Add your brand description to continue.',
      };
    }

    return null;
  };

  const buildSavePayload = (nextForm: ProfileFormState): SaveProfileInput => {
    const primaryIndustry = nextForm.primaryIndustry.trim();
    const secondaryIndustries = normalizeSecondaryIndustries(
      primaryIndustry,
      nextForm.secondaryIndustries
    );
    const industry = createIndustrySummary(primaryIndustry, secondaryIndustries);
    const username = normalizeUsername(nextForm.username);

    return {
      brandName: nextForm.brandName.trim(),
      fullName: nextForm.fullName.trim(),
      phoneNumber: nextForm.phoneNumber?.trim(),
      username,
      ...(nextForm.avatarUrl?.trim() ? { avatarUrl: nextForm.avatarUrl.trim() } : {}),
      ...(nextForm.country?.trim() ? { country: nextForm.country.trim() } : {}),
      ...(nextForm.language?.trim() ? { language: nextForm.language.trim() } : {}),
      ...(nextForm.websiteUrl?.trim()
        ? { websiteUrl: nextForm.websiteUrl.trim() }
        : {}),
      ...(nextForm.logoUrl?.trim() ? { logoUrl: nextForm.logoUrl.trim() } : {}),
      ...(nextForm.primaryColor?.trim()
        ? { primaryColor: normalizeHex(nextForm.primaryColor) }
        : {}),
      ...(nextForm.secondaryColor?.trim()
        ? { secondaryColor: normalizeHex(nextForm.secondaryColor) }
        : {}),
      ...(nextForm.accentColor?.trim()
        ? { accentColor: normalizeHex(nextForm.accentColor) }
        : {}),
      ...(industry ? { industry } : {}),
      ...(primaryIndustry ? { primaryIndustry } : {}),
      secondaryIndustries,
      ...(nextForm.targetAudience?.trim()
        ? { targetAudience: nextForm.targetAudience.trim() }
        : {}),
      ...(nextForm.brandVoice?.trim()
        ? { brandVoice: nextForm.brandVoice.trim() }
        : {}),
      ...(stripBrandDescriptionCursor(nextForm.description ?? '').trim()
        ? {
            description: stripBrandDescriptionCursor(
              nextForm.description ?? ''
            ).trim(),
          }
        : {}),
      saveContext,
    };
  };

  const updateField = (key: StringFieldKey, value: string) => {
    setValidationNotice(null);
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const applyUsernameAvailability = (result: UsernameAvailabilityResult) => {
    setLastCheckedUsername(result.normalizedUsername);
    setUsernameAvailabilityState(
      result.isAvailable ? 'available' : 'unavailable'
    );
    setUsernameFeedbackMessage(result.message);
    setUsernameSuggestions(result.suggestions);

    if (result.isAvailable) {
      setError(null);
    }
  };

  const resetUsernameAvailability = () => {
    setUsernameAvailabilityState('idle');
    setUsernameFeedbackMessage(null);
    setUsernameSuggestions([]);
    setLastCheckedUsername('');
  };

  const checkUsernameAvailability = async (
    value: string
  ): Promise<UsernameAvailabilityResult | null> => {
    const normalizedUsername = normalizeUsername(value);

    if (!normalizedUsername) {
      resetUsernameAvailability();
      return null;
    }

    if (!isValidUsernameInput(value)) {
      const invalidResult: UsernameAvailabilityResult = {
        normalizedUsername,
        isAvailable: false,
        message: USERNAME_RULE_HINT,
        suggestions: [],
        provider: null,
      };
      applyUsernameAvailability(invalidResult);
      return invalidResult;
    }

    if (
      normalizedUsername === lastCheckedUsername &&
      usernameAvailabilityState !== 'idle'
    ) {
      return {
        normalizedUsername,
        isAvailable: usernameAvailabilityState === 'available',
        message: usernameFeedbackMessage || USERNAME_RULE_HINT,
        suggestions: usernameSuggestions,
        provider: null,
      };
    }

    if (!token) {
      return null;
    }

    setUsernameAvailabilityState('checking');
    setUsernameFeedbackMessage('Checking username...');
    setUsernameSuggestions([]);

    try {
      const result = await apiRequest<UsernameAvailabilityResult>(
        '/api/auth/username-availability',
        {
          method: 'POST',
          token,
          body: {
            desiredUsername: normalizedUsername,
            brandName: form.brandName.trim() || normalizedUsername,
            ...(form.fullName.trim() ? { fullName: form.fullName.trim() } : {}),
            requestContext: saveContext,
          },
        }
      );

      applyUsernameAvailability(result);
      return result;
    } catch (availabilityError) {
      if (
        availabilityError instanceof ApiRequestError &&
        availabilityError.data &&
        typeof availabilityError.data === 'object' &&
        'normalizedUsername' in availabilityError.data
      ) {
        const result = availabilityError.data as UsernameAvailabilityResult;
        applyUsernameAvailability(result);
        return result;
      }

      const fallbackMessage =
        availabilityError instanceof Error
          ? availabilityError.message
          : 'Failed to check username availability';
      setUsernameAvailabilityState('idle');
      setUsernameFeedbackMessage(null);
      setUsernameSuggestions([]);
      setLastCheckedUsername('');
      setError(fallbackMessage);
      return null;
    }
  };

  const handleUsernameChange = (value: string) => {
    updateField('username', value);
    setError(null);

    if (normalizeUsername(value) !== lastCheckedUsername) {
      resetUsernameAvailability();
    }
  };

  const handleUsernameBlur = async () => {
    const normalizedUsername = normalizeUsername(form.username);

    if (!normalizedUsername) {
      resetUsernameAvailability();
      return;
    }

    if (normalizedUsername !== form.username) {
      setForm((current) => ({
        ...current,
        username: normalizedUsername,
      }));
    }

    await checkUsernameAvailability(normalizedUsername);
  };

  const applySuggestedUsername = (value: string) => {
    const normalizedUsername = normalizeUsername(value);

    if (!normalizedUsername) {
      return;
    }

    setForm((current) => ({
      ...current,
      username: normalizedUsername,
    }));
    setLastCheckedUsername(normalizedUsername);
    setUsernameAvailabilityState('available');
    setUsernameFeedbackMessage('Recommended username selected.');
    setUsernameSuggestions([]);
    setError(null);
  };

  const updatePrimaryIndustry = (value: string) => {
    setValidationNotice(null);
    setForm((current) => ({
      ...current,
      primaryIndustry: value,
      secondaryIndustries: normalizeSecondaryIndustries(
        value,
        current.secondaryIndustries
      ),
    }));
  };

  const selectPrimaryIndustry = (value: string) => {
    setError(null);
    setValidationNotice(null);
    setSuccess(null);
    updatePrimaryIndustry(value);
    setIsCustomPrimaryOpen(false);
    setCustomPrimaryDraft('');
    setPrimarySearch('');
  };

  const toggleSecondaryIndustry = (value: string) => {
    const isSelected = normalizedSecondaryIndustries.some(
      (entry) => entry.toLowerCase() === value.toLowerCase()
    );

    if (
      !isSelected &&
      normalizedSecondaryIndustries.length >= MAX_SECONDARY_INDUSTRIES
    ) {
      setError(
        `Choose up to ${MAX_SECONDARY_INDUSTRIES} secondary industries.`
      );
      return;
    }

    setError(null);
    setValidationNotice(null);
    setForm((current) => {
      const currentIsSelected = current.secondaryIndustries.some(
        (entry) => entry.toLowerCase() === value.toLowerCase()
      );

      return {
        ...current,
        secondaryIndustries: currentIsSelected
          ? current.secondaryIndustries.filter(
              (entry) => entry.toLowerCase() !== value.toLowerCase()
            )
          : normalizeSecondaryIndustries(current.primaryIndustry, [
              ...current.secondaryIndustries,
              value,
            ]),
      };
    });
  };

  const removeSecondaryIndustry = (value: string) => {
    setValidationNotice(null);
    setForm((current) => ({
      ...current,
      secondaryIndustries: current.secondaryIndustries.filter(
        (entry) => entry.toLowerCase() !== value.toLowerCase()
      ),
    }));
  };

  const addCustomSecondaryIndustry = () => {
    const nextValue = customSecondaryDraft.trim();

    if (!nextValue) {
      return;
    }

    if (normalizedSecondaryIndustries.length >= MAX_SECONDARY_INDUSTRIES) {
      setError(
        `Choose up to ${MAX_SECONDARY_INDUSTRIES} secondary industries.`
      );
      return;
    }

    setError(null);
    setValidationNotice(null);
    setForm((current) => ({
      ...current,
      secondaryIndustries: normalizeSecondaryIndustries(
        current.primaryIndustry,
        [...current.secondaryIndustries, nextValue]
      ),
    }));
    setCustomSecondaryDraft('');
  };

  const handleCustomSecondaryKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    addCustomSecondaryIndustry();
  };

  const uploadLogoFile = async (file: File) => {
    if (!token) {
      throw new Error('Sign in again to upload your logo.');
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Only JPG, PNG, and WEBP logos are supported.');
    }

    if (file.size > 6 * 1024 * 1024) {
      throw new Error('Uploaded logo must be 6MB or smaller.');
    }

    const dataUrl = await readFileAsDataUrl(file);
    return apiRequest<{
      sourceImageUrl: string;
      bucket: string;
      path: string;
      mediaType: string;
      contentType: string;
    }>('/api/images/upload-source', {
      method: 'POST',
      token,
      body: {
        fileName: file.name,
        contentType: file.type,
        dataUrl,
      },
    });
  };

  const handleLogoInput = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError(null);
    setValidationNotice(null);
    setSuccess(null);
    setIsUploadingLogo(true);

    try {
      const uploaded = await uploadLogoFile(file);
      const nextForm = {
        ...form,
        logoUrl: uploaded.sourceImageUrl,
      };

      setForm(nextForm);

      if (
        nextForm.brandName.trim() &&
        nextForm.fullName.trim() &&
        nextForm.phoneNumber.trim() &&
        normalizeUsername(nextForm.username) &&
        persistProfile
      ) {
        await persistProfile(buildSavePayload(nextForm));

        if (draftCacheKey) {
          removeBrowserCache(draftCacheKey);
        }

        setSuccess('Logo uploaded and saved to your profile.');
      } else {
        setSuccess(
          persistProfile
            ? 'Logo uploaded. Finish the required profile fields and save to store everything else in the database.'
            : 'Logo uploaded locally. Save the profile to store it in the database.'
        );
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Failed to upload logo'
      );
    } finally {
      setIsUploadingLogo(false);
      event.target.value = '';
    }
  };

  const handleSuggestIndustry = async () => {
    if (!token) {
      setError('Sign in again to use AI industry suggestions.');
      return;
    }

    if (!industrySuggestionText.trim()) {
      setError('Tell PrixmoAI what problem your business solves first.');
      return;
    }

    setError(null);
    setValidationNotice(null);
    setIsSuggestingIndustry(true);
    setTypedIndustrySuggestion('');

    try {
      const suggestion = await apiRequest<IndustrySuggestionResult>(
        '/api/auth/industry-suggestion',
        {
          method: 'POST',
          token,
          body: {
            brandName: form.brandName.trim(),
            ...(form.username.trim() ? { username: form.username.trim() } : {}),
            ...(stripBrandDescriptionCursor(form.description).trim()
              ? {
                  description: stripBrandDescriptionCursor(form.description).trim(),
                }
              : {}),
            ...(form.websiteUrl.trim() ? { websiteUrl: form.websiteUrl.trim() } : {}),
            ...(industrySocialContext.trim()
              ? { socialContext: industrySocialContext.trim() }
              : {}),
            suggestionText: industrySuggestionText.trim(),
            requestContext: saveContext,
            catalog: getIndustryCatalogPromptItems(),
          },
        }
      );

      const resolvedPrimaryIndustry = resolvePrimaryIndustryValue(
        suggestion.primaryIndustry.trim()
      );
      const resolvedSecondaryIndustries = normalizeSecondaryIndustries(
        resolvedPrimaryIndustry,
        suggestion.secondaryIndustries
      );

      setIndustrySuggestion({
        ...suggestion,
        primaryIndustry: resolvedPrimaryIndustry,
        secondaryIndustries: resolvedSecondaryIndustries,
      });

      updatePrimaryIndustry(resolvedPrimaryIndustry);
      setForm((current) => ({
        ...current,
        secondaryIndustries: resolvedSecondaryIndustries,
      }));
      setIsCustomPrimaryOpen(
        !isKnownPrimaryIndustryValue(resolvedPrimaryIndustry)
      );
      setCustomPrimaryDraft(
        isKnownPrimaryIndustryValue(resolvedPrimaryIndustry)
          ? ''
          : resolvedPrimaryIndustry
      );
      setPrimarySearch('');
      setSecondarySearch('');

      setSuccess(
        `AI selected ${
          resolvedSecondaryIndustries.length
            ? `${resolvedPrimaryIndustry} with ${resolvedSecondaryIndustries.join(', ')}`
            : resolvedPrimaryIndustry
        }.`
      );
    } catch (suggestionError) {
      setError(
        suggestionError instanceof Error
          ? suggestionError.message
          : 'Failed to suggest industries'
      );
    } finally {
      setIsSuggestingIndustry(false);
    }
  };

  const handleGenerateBrandDescription = async () => {
    if (!token) {
      setError('Sign in again to create a brand description with PrixmoAI.');
      return;
    }

    if (!form.brandName.trim()) {
      notifyBrandDescriptionGenerationRequirement({
        message: 'Add your brand name before creating a brand description.',
        target: 'brandName',
      });
      return;
    }

    if (!form.primaryIndustry.trim()) {
      notifyBrandDescriptionGenerationRequirement({
        message: 'Choose your primary industry before creating a brand description.',
        target: 'industry',
      });
      return;
    }

    const normalizedSecondaries = normalizeSecondaryIndustries(
      form.primaryIndustry,
      form.secondaryIndustries
    );

    if (!normalizedSecondaries.length) {
      notifyBrandDescriptionGenerationRequirement({
        message: 'Add at least one secondary industry before creating a brand description.',
        target: 'industry',
      });
      return;
    }

    if (!form.brandVoice.trim()) {
      notifyBrandDescriptionGenerationRequirement({
        message: 'Pick your brand voice before creating a brand description.',
        target: 'brandVoice',
      });
      return;
    }

    if (!brandDescriptionPrompt.trim()) {
      setError(
        'Add a short brand note or use the mic so PrixmoAI has something to expand.'
      );
      return;
    }

    setError(null);
    setValidationNotice(null);
    setSuccess(null);
    clearBrandDescriptionSuggestionState();
    setIsGeneratingBrandDescription(true);

    try {
      const industry = createIndustrySummary(
        form.primaryIndustry.trim(),
        normalizedSecondaries
      );
      const suggestion = await apiRequest<BrandDescriptionSuggestion>(
        '/api/auth/brand-description-suggestion',
        {
          method: 'POST',
          token,
          body: {
            brandName: form.brandName.trim(),
            ...(form.fullName.trim() ? { fullName: form.fullName.trim() } : {}),
            ...(form.username.trim() ? { username: form.username.trim() } : {}),
            ...(form.websiteUrl.trim()
              ? { websiteUrl: form.websiteUrl.trim() }
              : {}),
            ...(industry ? { industry } : {}),
            ...(form.primaryIndustry.trim()
              ? { primaryIndustry: form.primaryIndustry.trim() }
              : {}),
            ...(normalizedSecondaries.length
              ? { secondaryIndustries: normalizedSecondaries }
              : {}),
            ...(form.targetAudience.trim()
              ? { targetAudience: form.targetAudience.trim() }
              : {}),
            ...(form.brandVoice.trim()
              ? { brandVoice: form.brandVoice.trim() }
              : {}),
            ...(industrySocialContext.trim()
              ? { socialContext: industrySocialContext.trim() }
              : {}),
            ...(stripBrandDescriptionCursor(form.description).trim()
              ? {
                  existingDescription: stripBrandDescriptionCursor(
                    form.description
                  ).trim(),
                }
              : {}),
            shortInput: brandDescriptionPrompt.trim(),
            language: brandDescriptionPromptLanguage,
            requestContext: saveContext,
          },
        }
      );

      setBrandDescriptionSuggestion(suggestion);
      setBrandDescriptionSuggestionDraft(suggestion.description);
      setIsEditingBrandDescriptionSuggestion(false);
      setIsBrandDescriptionResultOpen(true);
      setIsBrandDescriptionAssistantOpen(false);
      setSuccess('PrixmoAI prepared a fuller brand description for review.');
    } catch (descriptionError) {
      setError(
        descriptionError instanceof Error
          ? descriptionError.message
          : 'Failed to generate a brand description'
      );
    } finally {
      setIsGeneratingBrandDescription(false);
    }
  };

  const clearBrandDescriptionSuggestionState = () => {
    setBrandDescriptionSuggestion(null);
    setBrandDescriptionSuggestionDraft('');
    setIsEditingBrandDescriptionSuggestion(false);
    setIsBrandDescriptionResultOpen(false);
  };

  const handleAcceptBrandDescription = () => {
    const nextDescription = stripBrandDescriptionCursor(
      brandDescriptionSuggestionDraft
    ).trim();

    if (!nextDescription) {
      setError('There is no AI description to apply yet.');
      return;
    }

    setError(null);
    setValidationNotice(null);
    setSuccess('PrixmoAI applied the generated description to your profile.');
    setBrandDescriptionTypingTarget(nextDescription);
    clearBrandDescriptionSuggestionState();
  };

  const handleRejectBrandDescription = () => {
    clearBrandDescriptionSuggestionState();
    setError(null);
    setValidationNotice(null);
    setSuccess('The AI draft was discarded.');
  };

  const handleEditBrandDescriptionSuggestion = () => {
    setIsEditingBrandDescriptionSuggestion(true);

    window.setTimeout(() => {
      brandDescriptionSuggestionRef.current?.focus();
      brandDescriptionSuggestionRef.current?.setSelectionRange(
        brandDescriptionSuggestionDraft.length,
        brandDescriptionSuggestionDraft.length
      );
    }, 0);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationNotice(null);
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const missingRequiredField = findFirstMissingRequiredField();

      if (missingRequiredField) {
        setValidationNotice(missingRequiredField.message);
        scrollToValidationTarget(missingRequiredField.key);
        return;
      }

      const usernameResult = await checkUsernameAvailability(form.username);

      if (!usernameResult?.isAvailable) {
        setError(usernameResult?.message || 'Username exists');
        return;
      }

      const payload = buildSavePayload({
        ...form,
        username: usernameResult.normalizedUsername,
      });

      await onSubmit(payload);

      if (draftCacheKey) {
        removeBrowserCache(draftCacheKey);
      }

      setSuccess('Brand profile saved successfully.');
    } catch (submitError) {
      if (
        submitError instanceof ApiRequestError &&
        submitError.data &&
        typeof submitError.data === 'object' &&
        'normalizedUsername' in submitError.data
      ) {
        applyUsernameAvailability(submitError.data as UsernameAvailabilityResult);
      }

      setError(
        submitError instanceof Error ? submitError.message : 'Failed to save profile'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card glow className="profile-panel">
      <div className="profile-panel__header">
        <p className="section-eyebrow">Brand memory</p>
        <h2>{heading}</h2>
        {subheading ? <p>{subheading}</p> : null}
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <Input
          id="profile-brand-name"
          label="Brand / business name"
          value={form.brandName}
          onChange={(event) => updateField('brandName', event.target.value)}
          placeholder="PrixmoAI"
          required
        />
        <Input
          label="Full name"
          value={form.fullName}
          onChange={(event) => updateField('fullName', event.target.value)}
          placeholder="Sayantan Sen"
          required
        />
        <div className="field field--full profile-panel__identity-block">
          <div className="profile-panel__identity-row">
            <div className="profile-panel__identity-slot">
              <label
                className="field profile-panel__identity-field"
                htmlFor="profile-phone-number"
              >
                <span className="field__label-row">
                  <span className="field__label">Phone number</span>
                  <span className="field__required" aria-hidden="true">
                    ✦
                  </span>
                  <span className="sr-only">Required field</span>
                </span>
                <input
                  id="profile-phone-number"
                  className="field__control profile-panel__identity-input"
                  type="tel"
                  value={form.phoneNumber}
                  onChange={(event) => updateField('phoneNumber', event.target.value)}
                  placeholder="+91 98765 43210"
                  pattern="[0-9+()\\-\\s]{10,20}"
                  required
                />
              </label>
              <span className="profile-panel__phone-hint">
                Required to finish account setup and keep your workspace recoverable.
              </span>
            </div>
            <div className="profile-panel__identity-slot">
              <label
                className="field profile-panel__identity-field"
                htmlFor="profile-username"
              >
                <span className="field__label-row">
                  <span className="field__label">Username</span>
                  <span className="field__required" aria-hidden="true">
                    ✦
                  </span>
                  <span className="sr-only">Required field</span>
                </span>
                <input
                  id="profile-username"
                  className="field__control profile-panel__identity-input"
                  value={form.username}
                  onChange={(event) => handleUsernameChange(event.target.value)}
                  onBlur={() => void handleUsernameBlur()}
                  placeholder="@prixmoai"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              </label>
              <div
                className={`profile-panel__username-feedback ${
                  usernameAvailabilityState !== 'idle'
                    ? `profile-panel__username-feedback--${usernameAvailabilityState}`
                    : ''
                }`}
              >
                <span>{usernameHintText}</span>
                {usernameSuggestions.length ? (
                  <div className="profile-panel__username-suggestions">
                    {usernameSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="profile-panel__username-chip"
                        onClick={() => applySuggestedUsername(suggestion)}
                      >
                        @{suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div
          ref={countryFieldRef}
          className={`profile-panel__validation-target ${
            validationTarget === 'country'
              ? 'profile-panel__validation-target--active'
              : ''
          }`}
        >
          <Select
            label="Country"
            value={form.country}
            onChange={(event) => updateField('country', event.target.value)}
            aria-required="true"
          >
            <option value="">Select a country</option>
            {form.country && !Array.from(COUNTRY_OPTIONS).includes(form.country) ? (
              <option value={form.country}>{form.country}</option>
            ) : null}
            {COUNTRY_OPTIONS.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </Select>
        </div>
        <Input
          label="Language"
          value={form.language}
          onChange={(event) => updateField('language', event.target.value)}
          placeholder="English"
        />
        <Input
          label="Website link"
          type="url"
          value={form.websiteUrl}
          onChange={(event) => updateField('websiteUrl', event.target.value)}
          placeholder="https://yourbrand.com"
        />
        <div
          ref={logoFieldRef}
          className={`field profile-panel__validation-target ${
            validationTarget === 'logo'
              ? 'profile-panel__validation-target--active'
              : ''
          }`}
        >
          <span className="field__label">Logo</span>
          <label className="generator-upload profile-panel__logo-upload">
            <div className="generator-upload__copy">
              <Upload size={18} />
              <div>
                <strong>{isUploadingLogo ? 'Uploading...' : 'Upload logo'}</strong>
                <span>JPG, PNG, WEBP up to 6MB</span>
              </div>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleLogoInput}
              disabled={isUploadingLogo}
            />
          </label>
          {form.logoUrl ? (
            <div className="profile-panel__logo-preview">
              <img src={form.logoUrl} alt="Brand logo preview" />
              <div className="profile-panel__logo-preview-copy">
                <strong>Logo ready</strong>
                <span>{form.logoUrl.split('/').pop() || 'Saved logo'}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => updateField('logoUrl', '')}
              >
                Remove
              </Button>
            </div>
          ) : null}
        </div>

        <div
          ref={industryFieldRef}
          className={`field field--full profile-panel__industry-block profile-panel__validation-target ${
            validationTarget === 'industry'
              ? 'profile-panel__validation-target--active'
              : ''
          }`}
        >
          <div className="profile-panel__industry-header">
            <div>
              <span className="field__label">Industry</span>
              <h3 className="profile-panel__industry-guided-title">
                Let&apos;s understand your business
              </h3>
            </div>
          </div>

          <div className="profile-panel__industry-ai-row">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="profile-panel__industry-ai-toggle profile-panel__animated-button"
              onClick={handleSuggestIndustry}
              disabled={isSuggestingIndustry}
            >
              <Sparkles size={16} />
              {isSuggestingIndustry ? 'Thinking...' : 'AI suggest'}
            </Button>
            <label className="profile-panel__live-suggestion-field">
              <input
                value={industrySuggestionText}
                onChange={(event) =>
                  setIndustrySuggestionText(event.target.value)
                }
                placeholder="What problem does your business solve?"
              />
            </label>
          </div>

          <label className="field field--full profile-panel__social-field">
            <span className="field__label">Social links, bio, or post text</span>
            <textarea
              className="field__control field__control--textarea profile-panel__compact-textarea profile-panel__compact-textarea--live"
              value={industrySocialContext}
              onChange={(event) => setIndustrySocialContext(event.target.value)}
              rows={1}
              placeholder="Optional. Paste social links, bio lines, or post snippets if you want sharper AI matching."
            />
          </label>

          {isSuggestingIndustry ? (
            <div className="profile-panel__industry-inline-feedback">
              <span className="profile-panel__industry-loading">
                AI is mapping your business signals...
              </span>
            </div>
          ) : industrySuggestion ? (
            <div className="profile-panel__industry-inline-feedback">
              <strong>
                {industrySuggestion.source === 'ai'
                  ? 'AI suggested'
                  : 'Auto-selected'}
              </strong>
              <span className="profile-panel__industry-typing">
                {typedIndustrySuggestion}
              </span>
            </div>
          ) : null}

          <div className="profile-panel__industry-steps">
            <div
              className={`profile-panel__industry-step ${
                form.primaryIndustry.trim()
                  ? 'profile-panel__industry-step--filled'
                  : ''
              }`}
            >
              <div className="profile-panel__industry-zone profile-panel__industry-zone--top">
                <div className="profile-panel__step-copy">
                  <span className="profile-panel__step-title">
                    Choose your primary industry
                  </span>
                  <span className="field__hint">
                    What best describes your business?
                  </span>
                </div>
              </div>
              <div className="profile-panel__picker-shell">
                <label className="profile-panel__search-field profile-panel__search-field--soft">
                  <Search size={16} />
                  <input
                    value={primarySearch}
                    onChange={(event) => setPrimarySearch(event.target.value)}
                    placeholder="Search industry categories"
                  />
                </label>
                <div className="profile-panel__scroll-region">
                  <div
                    className={`profile-panel__primary-card-grid ${
                      isSuggestingIndustry
                        ? 'profile-panel__primary-card-grid--loading'
                        : ''
                    }`}
                  >
                {primaryIndustryCards.map((group) => {
                  const isSelected =
                    !isCustomPrimaryOpen &&
                    selectedPrimaryIndustryGroup?.id === group.id;

                      return (
                        <button
                          key={group.id}
                          type="button"
                          className={`profile-panel__primary-card ${
                            isSelected
                              ? 'profile-panel__primary-card--active'
                              : ''
                          }`}
                          onClick={() => selectPrimaryIndustry(group.label)}
                        >
                          <span className="profile-panel__primary-card-copy">
                            <strong>{group.label}</strong>
                            <span>
                              {group.options
                                .filter((entry) => !entry.isOther)
                                .slice(0, 2)
                                .map((entry) => entry.label)
                                .join(', ')}
                            </span>
                          </span>
                          {isSelected ? (
                            <span className="profile-panel__primary-card-check">
                              <Check size={14} />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className={`profile-panel__primary-card ${
                        isCustomPrimaryOpen
                          ? 'profile-panel__primary-card--active'
                          : ''
                      }`}
                      onClick={() => {
                        setError(null);
                        setSuccess(null);
                        setIsCustomPrimaryOpen(true);
                        updatePrimaryIndustry(customPrimaryDraft.trim());
                      }}
                    >
                      <span className="profile-panel__primary-card-copy">
                        <strong>Other</strong>
                        <span>Custom category</span>
                      </span>
                      {isCustomPrimaryOpen ? (
                        <span className="profile-panel__primary-card-check">
                          <Check size={14} />
                        </span>
                      ) : null}
                    </button>
                  </div>
                  {!primaryIndustryCards.length ? (
                    <div className="profile-panel__empty-state">
                      No primary industries matched that search yet.
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="profile-panel__industry-zone profile-panel__industry-zone--bottom">
                {isCustomPrimaryOpen ? (
                  <label className="field profile-panel__custom-tag-field">
                    <span className="field__label">Custom primary industry</span>
                    <input
                      className="field__control"
                      value={customPrimaryDraft}
                      onChange={(event) => {
                        const value = event.target.value;
                        setCustomPrimaryDraft(value);
                        updatePrimaryIndustry(value);
                      }}
                      placeholder="Write your industry"
                    />
                  </label>
                ) : null}
                {industryGuidance ? (
                  <div className="profile-panel__industry-hint">
                    <Sparkles size={14} />
                    <span>{industryGuidance}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className={`profile-panel__industry-step ${
                normalizedSecondaryIndustries.length
                  ? 'profile-panel__industry-step--filled'
                  : ''
              }`}
            >
              <div className="profile-panel__industry-zone profile-panel__industry-zone--top">
                <div className="profile-panel__step-copy">
                  <span className="profile-panel__step-title">
                    Secondary industries
                  </span>
                  <span className="field__hint">
                    What else is relevant to your brand?
                  </span>
                </div>
              </div>
              <div className="profile-panel__picker-shell">
                <div className="profile-panel__secondary-toolbar">
                  <span className="profile-panel__secondary-counter">
                    Select up to {MAX_SECONDARY_INDUSTRIES}
                  </span>
                  <label className="profile-panel__search-field profile-panel__search-field--soft">
                    <Search size={16} />
                    <input
                      value={secondarySearch}
                      onChange={(event) => setSecondarySearch(event.target.value)}
                      placeholder="Search related industries"
                      disabled={!form.primaryIndustry.trim()}
                    />
                  </label>
                </div>
                <div className="profile-panel__scroll-region">
                  <div className="profile-panel__smart-chip-groups">
                    {secondaryIndustryGroups.map((group) => (
                      <div key={group.id} className="profile-panel__smart-chip-group">
                        <strong>{group.label}</strong>
                        <div className="profile-panel__smart-chip-row">
                          {group.options.map((entry) => {
                            const isSelected = normalizedSecondaryIndustries.some(
                              (value) =>
                                value.toLowerCase() === entry.label.toLowerCase()
                            );

                            return (
                              <button
                                key={entry.id}
                                type="button"
                                className={`profile-panel__smart-chip ${
                                  isSelected
                                    ? 'profile-panel__smart-chip--active'
                                    : ''
                                }`}
                                onClick={() => toggleSecondaryIndustry(entry.label)}
                                disabled={
                                  !form.primaryIndustry.trim() ||
                                  (!isSelected &&
                                    normalizedSecondaryIndustries.length >=
                                      MAX_SECONDARY_INDUSTRIES)
                                }
                              >
                                <span>{entry.label}</span>
                                {isSelected ? <Check size={13} /> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {!secondaryIndustryGroups.length ? (
                      <div className="profile-panel__empty-state">
                        Choose a primary industry first to unlock related smart
                        suggestions.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="profile-panel__industry-zone profile-panel__industry-zone--bottom">
                <label className="profile-panel__tag-input">
                  <input
                    className="field__control"
                    value={customSecondaryDraft}
                    onChange={(event) =>
                      setCustomSecondaryDraft(event.target.value)
                    }
                    onKeyDown={handleCustomSecondaryKeyDown}
                    placeholder="+ Add custom industry..."
                  />
                </label>

                {normalizedSecondaryIndustries.length ? (
                  <div className="profile-panel__chip-row">
                    {normalizedSecondaryIndustries.map((entry) => (
                      <span key={entry} className="badge profile-panel__chip">
                        <span className="profile-panel__chip-label">{entry}</span>
                        <button
                          type="button"
                          className="profile-panel__chip-remove"
                          onClick={() => removeSecondaryIndustry(entry)}
                          aria-label={`Remove ${entry}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div
          ref={targetAudienceFieldRef}
          className={`profile-panel__validation-target ${
            validationTarget === 'targetAudience'
              ? 'profile-panel__validation-target--active'
              : ''
          }`}
        >
          <Input
            label="Target audience"
            value={form.targetAudience}
            onChange={(event) => updateField('targetAudience', event.target.value)}
            placeholder="Young professionals, boutique shoppers, local customers"
            aria-required="true"
          />
        </div>
        <div
          ref={brandVoiceFieldRef}
          className={`profile-panel__validation-target ${
            validationTarget === 'brandVoice'
              ? 'profile-panel__validation-target--active'
              : ''
          }`}
        >
          <Select
            label="Brand voice"
            value={form.brandVoice}
            onChange={(event) => updateField('brandVoice', event.target.value)}
            aria-required="true"
          >
            <option value="">Select a brand voice</option>
            {brandVoiceOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </div>
        <div className="field field--full">
          <span className="field__label">Brand colors</span>
          <div className="profile-panel__color-grid">
            {[
              {
                key: 'primaryColor' as const,
                label: 'Primary',
                placeholder: '#1F2937',
                fallback: '#1F2937',
              },
              {
                key: 'secondaryColor' as const,
                label: 'Secondary',
                placeholder: '#F59E0B',
                fallback: '#F59E0B',
              },
              {
                key: 'accentColor' as const,
                label: 'Accent',
                placeholder: '#10B981',
                fallback: '#10B981',
              },
            ].map((entry) => (
              <div key={entry.key} className="field profile-panel__color-item">
                <span className="profile-panel__color-label">{entry.label}</span>
                <div className="profile-panel__color-field">
                  <div className="profile-panel__color-picker-shell">
                    <span
                      className="profile-panel__color-preview"
                      style={{
                        backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(form[entry.key])
                          ? form[entry.key]
                          : entry.fallback,
                      }}
                    />
                    <input
                      type="color"
                      className="profile-panel__color-picker"
                      value={
                        /^#[0-9A-Fa-f]{6}$/.test(form[entry.key])
                          ? form[entry.key]
                          : entry.fallback
                      }
                      onChange={(event) =>
                        updateField(entry.key, event.target.value.toUpperCase())
                      }
                      aria-label={`${entry.label} color picker`}
                    />
                  </div>
                  <input
                    id={`profile-${entry.key}`}
                    className="profile-panel__color-input"
                    value={form[entry.key]}
                    onChange={(event) => updateField(entry.key, event.target.value)}
                    placeholder={entry.placeholder}
                    pattern="^#[0-9A-Fa-f]{6}$"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div
          ref={descriptionFieldRef}
          className={`field field--full profile-panel__description-stage ${
            isBrandDescriptionAssistantOpen
              ? 'profile-panel__description-stage--assistant-open'
              : ''
          } ${
            isBrandDescriptionResultOpen
              ? 'profile-panel__description-stage--result-open'
              : ''
          } ${
            validationTarget === 'description'
              ? 'profile-panel__validation-target profile-panel__validation-target--active'
              : 'profile-panel__validation-target'
          }`}
        >
          <div className="profile-panel__description-main">
            <div className="profile-panel__description-head">
              <label className="field__label" htmlFor="profile-brand-description">
                Brand description
              </label>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="profile-panel__description-ai-toggle profile-panel__animated-button"
                onClick={() => {
                  const nextIsOpen = !isBrandDescriptionAssistantOpen;
                  setIsBrandDescriptionAssistantOpen(nextIsOpen);

                  if (nextIsOpen && isBrandDescriptionResultOpen) {
                    clearBrandDescriptionSuggestionState();
                  }
                }}
              >
                <Sparkles size={14} />
                Create with PrixmoAI
              </Button>
            </div>
            <div
              className={`profile-panel__description-input-shell ${
                brandDescriptionTypingTarget
                  ? 'profile-panel__description-input-shell--typing'
                  : ''
              }`}
            >
              <textarea
                ref={brandDescriptionInputRef}
                id="profile-brand-description"
                className="field__control field__control--textarea profile-panel__description-textarea"
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                rows={5}
                readOnly={Boolean(brandDescriptionTypingTarget)}
                placeholder="Tell PrixmoAI what you sell, how you want to sound, and what kind of customers you want to attract."
              />
            </div>
          </div>

          {isBrandDescriptionAssistantOpen ? (
            <aside
              className={`profile-panel__description-assistant ${
                isGeneratingBrandDescription
                  ? 'profile-panel__description-assistant--generating'
                  : ''
              }`}
            >
              <div className="profile-panel__description-assistant-head">
                <div>
                  <span className="profile-panel__description-assistant-eyebrow">
                    Brand copilot
                  </span>
                  <strong>Create with PrixmoAI</strong>
                </div>
                <button
                  type="button"
                  className="profile-panel__description-assistant-close"
                  onClick={() => {
                    setIsBrandDescriptionAssistantOpen(false);
                    clearBrandDescriptionSuggestionState();
                  }}
                  aria-label="Close description assistant"
                >
                  <X size={15} />
                </button>
              </div>

              <p className="profile-panel__description-assistant-copy">
                Share a short note and PrixmoAI will turn it into a ready-to-save description.
              </p>

              <DictationTextareaField
                className="profile-panel__description-dictation"
                label="Quick brand note"
                hideLabel
                showHistoryToggle={false}
                showClearButton={false}
                initialDictationLanguage={brandDescriptionPromptLanguage}
                onDictationLanguageChange={setBrandDescriptionPromptLanguage}
                value={brandDescriptionPrompt}
                onChange={setBrandDescriptionPrompt}
                rows={4}
              />

              <Button
                type="button"
                size="sm"
                className="profile-panel__description-generate"
                onClick={() => void handleGenerateBrandDescription()}
                disabled={isGeneratingBrandDescription}
              >
                {isGeneratingBrandDescription ? (
                  <Loader2 size={15} className="profile-panel__description-generate-spinner" />
                ) : (
                  <Sparkles size={15} />
                )}
                {brandDescriptionSuggestion ? 'Regenerate Description' : 'Generate Description'}
              </Button>
            </aside>
          ) : null}

          {brandDescriptionSuggestion && isBrandDescriptionResultOpen ? (
            <aside className="profile-panel__description-result-window">
              <div className="profile-panel__description-result-head">
                <div>
                  <span className="profile-panel__description-assistant-eyebrow">
                    AI output
                  </span>
                  <strong>AI enhanced your description</strong>
                </div>
                <button
                  type="button"
                  className="profile-panel__description-assistant-close"
                  onClick={handleRejectBrandDescription}
                  aria-label="Close generated description"
                >
                  <X size={15} />
                </button>
              </div>
              <textarea
                ref={brandDescriptionSuggestionRef}
                className="profile-panel__description-suggestion-textarea"
                value={brandDescriptionSuggestionDraft}
                onChange={(event) =>
                  setBrandDescriptionSuggestionDraft(event.target.value)
                }
                rows={7}
                readOnly={!isEditingBrandDescriptionSuggestion}
              />
              <div className="profile-panel__description-suggestion-actions">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  className="profile-panel__description-action profile-panel__description-action--accept"
                  onClick={handleAcceptBrandDescription}
                >
                  Accept
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="profile-panel__description-action"
                  onClick={handleEditBrandDescriptionSuggestion}
                >
                  {isEditingBrandDescriptionSuggestion ? 'Editing' : 'Edit'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="profile-panel__description-action"
                  onClick={() => void handleGenerateBrandDescription()}
                  disabled={isGeneratingBrandDescription}
                >
                  Regenerate
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="profile-panel__description-action profile-panel__description-action--reject"
                  onClick={handleRejectBrandDescription}
                >
                  Reject
                </Button>
              </div>
            </aside>
          ) : null}
        </div>

        <ErrorMessage message={validationNotice} />
        <ErrorMessage message={error} showCode showDetails />
        {success ? (
          <div className="message message--success profile-panel__success-banner">
            <span className="message__copy">{success}</span>
            <button
              type="button"
              className="message__dismiss"
              onClick={() => setSuccess(null)}
              aria-label="Dismiss success message"
            >
              <X size={16} />
            </button>
          </div>
        ) : null}

        <div className="field field--full">
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting || Boolean(brandDescriptionTypingTarget)}
          >
            {isSubmitting ? 'Saving...' : submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
};
