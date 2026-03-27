import { useEffect, useState } from 'react';
import {
  listenForUpgradePrompt,
  type UpgradePromptDetail,
} from '../lib/upgradePrompt';

export const useUpgradePrompt = () => {
  const [prompt, setPrompt] = useState<UpgradePromptDetail | null>(null);

  useEffect(() => {
    const unsubscribe = listenForUpgradePrompt((detail) => {
      setPrompt(detail);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!prompt) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPrompt(null);
    }, 8000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [prompt]);

  return {
    prompt,
    dismissPrompt: () => setPrompt(null),
  };
};
