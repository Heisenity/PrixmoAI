export type UpgradePromptSource = 'content' | 'image' | 'scheduler';

export type UpgradePromptDetail = {
  source: UpgradePromptSource;
  title: string;
  message: string;
};

const UPGRADE_PROMPT_EVENT = 'prixmoai:upgrade-prompt';

export const getUpgradePromptFromMessage = (
  message: string
): UpgradePromptDetail | null => {
  if (/(monthly|daily) content generation limit reached/i.test(message)) {
    return {
      source: 'content',
      title: 'Content limit reached',
      message:
        'You have used all content generations included in your current plan for the current usage period.',
    };
  }

  if (/(monthly|daily) image generation limit reached/i.test(message)) {
    return {
      source: 'image',
      title: 'Image limit reached',
      message:
        'You have used all image generations included in your current plan for the current usage period.',
    };
  }

  if (/social account connections are not included/i.test(message)) {
    return {
      source: 'scheduler',
      title: 'Scheduler locked on this plan',
      message:
        'Upgrade to connect social accounts and unlock direct scheduling from PrixmoAI.',
    };
  }

  if (/connected social account/i.test(message)) {
    return {
      source: 'scheduler',
      title: 'Social account limit reached',
      message:
        'You have reached the number of connected social accounts included in your current plan.',
    };
  }

  return null;
};

export const emitUpgradePrompt = (detail: UpgradePromptDetail) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<UpgradePromptDetail>(UPGRADE_PROMPT_EVENT, {
      detail,
    })
  );
};

export const listenForUpgradePrompt = (
  listener: (detail: UpgradePromptDetail) => void
) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<UpgradePromptDetail>;

    if (customEvent.detail) {
      listener(customEvent.detail);
    }
  };

  window.addEventListener(UPGRADE_PROMPT_EVENT, handler);

  return () => {
    window.removeEventListener(UPGRADE_PROMPT_EVENT, handler);
  };
};
