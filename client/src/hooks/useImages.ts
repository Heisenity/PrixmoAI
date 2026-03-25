import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/axios';
import { useAuth } from './useAuth';
import type {
  GenerateImageInput,
  GeneratedImage,
  PaginatedResult,
  UploadedSourceImage,
} from '../types';

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
  const { token } = useAuth();
  const [history, setHistory] = useState<PaginatedResult<GeneratedImage> | null>(null);
  const [activeImage, setActiveImage] = useState<GeneratedImage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshHistory = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsLoadingHistory(true);

    try {
      const nextHistory = await apiRequest<PaginatedResult<GeneratedImage>>(
        '/api/images/history',
        { token }
      );
      setHistory(nextHistory);
      setActiveImage((current) => current ?? nextHistory.items[0] ?? null);
      setError(null);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Failed to load image history');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [token]);

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
      await refreshHistory();
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
