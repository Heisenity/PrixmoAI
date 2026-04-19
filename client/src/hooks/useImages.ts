import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/axios';
import { useAuth } from './useAuth';
import type {
  GenerateImageInput,
  GeneratedImage,
  PaginatedResult,
  UploadedSourceImage,
} from '../types';

type ImageCache = {
  history: PaginatedResult<GeneratedImage> | null;
  activeImage: GeneratedImage | null;
  cachedAt: string;
};

const IMAGE_CACHE_KEY_PREFIX = 'prixmoai.images.history';
const IMAGE_CACHE_TTL_MS = 60_000;

const buildImageCacheKey = (userId: string) =>
  `${IMAGE_CACHE_KEY_PREFIX}:${userId}`;

const isFreshCache = (cachedAt: string, ttlMs: number) => {
  const cachedTime = new Date(cachedAt).getTime();
  return Number.isFinite(cachedTime) && Date.now() - cachedTime <= ttlMs;
};

const readImageCache = (userId: string): ImageCache | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(buildImageCacheKey(userId));

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ImageCache;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      history: parsed.history ?? null,
      activeImage: parsed.activeImage ?? null,
      cachedAt:
        typeof parsed.cachedAt === 'string'
          ? parsed.cachedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

const writeImageCache = (userId: string, value: ImageCache) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    buildImageCacheKey(userId),
    JSON.stringify(value)
  );
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Failed to read image file'));
    };

    reader.onerror = () => {
      reject(new Error('Failed to read image file'));
    };

    reader.readAsDataURL(file);
  });

export const useImages = () => {
  const { token, user } = useAuth();
  const [history, setHistory] = useState<PaginatedResult<GeneratedImage> | null>(null);
  const [activeImage, setActiveImage] = useState<GeneratedImage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshHistory = useCallback(async (options?: { force?: boolean }) => {
    if (!token || !user?.id) {
      return;
    }

    const cached = readImageCache(user.id);

    if (
      !options?.force &&
      cached?.cachedAt &&
      isFreshCache(cached.cachedAt, IMAGE_CACHE_TTL_MS)
    ) {
      setHistory(cached.history);
      setActiveImage(cached.activeImage);
      setError(null);
      return;
    }

    setIsLoadingHistory(true);

    try {
      const nextHistory = await apiRequest<PaginatedResult<GeneratedImage>>(
        '/api/images/history',
        { token }
      );
      setHistory(nextHistory);
      const nextActiveImage = activeImage ?? nextHistory.items[0] ?? null;
      setActiveImage(nextActiveImage);
      setError(null);
      writeImageCache(user.id, {
        history: nextHistory,
        activeImage: nextActiveImage,
        cachedAt: new Date().toISOString(),
      });
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Failed to load image history');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [token, user?.id, activeImage]);

  useEffect(() => {
    const userId = user?.id ?? null;

    if (!token || !userId) {
      setHistory(null);
      setActiveImage(null);
      setError(null);
      setIsLoadingHistory(false);
      return;
    }

    const cached = readImageCache(userId);
    setHistory(cached?.history ?? null);
    setActiveImage(cached?.activeImage ?? null);
    setError(null);
  }, [token, user?.id]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const generate = async (input: GenerateImageInput) => {
    if (!token) {
      throw new Error('Sign in again to generate images.');
    }

    setError(null);
    setIsGenerating(true);

    try {
      const created = await apiRequest<GeneratedImage>('/api/images/generate', {
        method: 'POST',
        token,
        body: input,
      });
      setActiveImage(created);
      await refreshHistory({ force: true });
      return created;
    } catch (generationError) {
      const message =
        generationError instanceof Error ? generationError.message : 'Failed to generate image';
      setError(message);
      throw new Error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const uploadSourceImage = async (file: File) => {
    if (!token) {
      throw new Error('Sign in again to upload source images.');
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Only JPG, PNG, and WEBP images are supported.');
    }

    if (file.size > 6 * 1024 * 1024) {
      throw new Error('Uploaded image must be 6MB or smaller.');
    }

    setError(null);
    setIsUploadingSource(true);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const uploaded = await apiRequest<UploadedSourceImage>('/api/images/upload-source', {
        method: 'POST',
        token,
        body: {
          fileName: file.name,
          contentType: file.type,
          dataUrl,
        },
      });

      return uploaded;
    } catch (uploadError) {
      const message =
        uploadError instanceof Error ? uploadError.message : 'Failed to upload source image';
      setError(message);
      throw new Error(message);
    } finally {
      setIsUploadingSource(false);
    }
  };

  return {
    history,
    activeImage,
    isGenerating,
    isUploadingSource,
    isLoadingHistory,
    error,
    setActiveImage,
    refreshHistory,
    generate,
    uploadSourceImage,
  };
};
