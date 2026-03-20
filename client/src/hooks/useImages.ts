import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/axios';
import { useAuth } from './useAuth';
import type { GenerateImageInput, GeneratedImage, PaginatedResult } from '../types';

export const useImages = () => {
  const { token } = useAuth();
  const [history, setHistory] = useState<PaginatedResult<GeneratedImage> | null>(null);
  const [activeImage, setActiveImage] = useState<GeneratedImage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshHistory = async () => {
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
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Failed to load image history');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    void refreshHistory();
  }, [token]);

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

  return {
    history,
    activeImage,
    isGenerating,
    isLoadingHistory,
    error,
    setActiveImage,
    refreshHistory,
    generate,
  };
};
