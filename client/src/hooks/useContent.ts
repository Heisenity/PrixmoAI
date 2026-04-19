import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/axios';
import { useAuth } from './useAuth';
import type { GenerateContentInput, GeneratedContent, PaginatedResult } from '../types';

type ContentCache = {
  history: PaginatedResult<GeneratedContent> | null;
  activeContent: GeneratedContent | null;
  cachedAt: string;
};

const CONTENT_CACHE_KEY_PREFIX = 'prixmoai.content.history';
const CONTENT_CACHE_TTL_MS = 60_000;

const buildContentCacheKey = (userId: string) =>
  `${CONTENT_CACHE_KEY_PREFIX}:${userId}`;

const isFreshCache = (cachedAt: string, ttlMs: number) => {
  const cachedTime = new Date(cachedAt).getTime();
  return Number.isFinite(cachedTime) && Date.now() - cachedTime <= ttlMs;
};

const readContentCache = (userId: string): ContentCache | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(buildContentCacheKey(userId));

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ContentCache;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      history: parsed.history ?? null,
      activeContent: parsed.activeContent ?? null,
      cachedAt:
        typeof parsed.cachedAt === 'string'
          ? parsed.cachedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

const writeContentCache = (userId: string, value: ContentCache) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    buildContentCacheKey(userId),
    JSON.stringify(value)
  );
};

export const useContent = () => {
  const { token, user } = useAuth();
  const [history, setHistory] = useState<PaginatedResult<GeneratedContent> | null>(null);
  const [activeContent, setActiveContent] = useState<GeneratedContent | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshHistory = useCallback(async (options?: { force?: boolean }) => {
    if (!token || !user?.id) {
      return;
    }

    const cached = readContentCache(user.id);

    if (
      !options?.force &&
      cached?.cachedAt &&
      isFreshCache(cached.cachedAt, CONTENT_CACHE_TTL_MS)
    ) {
      setHistory(cached.history);
      setActiveContent(cached.activeContent);
      setError(null);
      return;
    }

    setIsLoadingHistory(true);

    try {
      const nextHistory = await apiRequest<PaginatedResult<GeneratedContent>>(
        '/api/content/history',
        { token }
      );
      setHistory(nextHistory);
      const nextActiveContent = activeContent ?? nextHistory.items[0] ?? null;
      setActiveContent(nextActiveContent);
      setError(null);
      writeContentCache(user.id, {
        history: nextHistory,
        activeContent: nextActiveContent,
        cachedAt: new Date().toISOString(),
      });
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Failed to load content history');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [token, user?.id, activeContent]);

  useEffect(() => {
    const userId = user?.id ?? null;

    if (!token || !userId) {
      setHistory(null);
      setActiveContent(null);
      setError(null);
      setIsLoadingHistory(false);
      return;
    }

    const cached = readContentCache(userId);
    setHistory(cached?.history ?? null);
    setActiveContent(cached?.activeContent ?? null);
    setError(null);
  }, [token, user?.id]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const generate = async (input: GenerateContentInput) => {
    if (!token) {
      throw new Error('Sign in again to generate content.');
    }

    setError(null);
    setIsGenerating(true);

    try {
      const created = await apiRequest<GeneratedContent>('/api/content/generate', {
        method: 'POST',
        token,
        body: input,
      });
      setActiveContent(created);
      await refreshHistory({ force: true });
      return created;
    } catch (generationError) {
      const message =
        generationError instanceof Error ? generationError.message : 'Failed to generate content';
      setError(message);
      throw new Error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    history,
    activeContent,
    isGenerating,
    isLoadingHistory,
    error,
    setActiveContent,
    refreshHistory,
    generate,
  };
};
