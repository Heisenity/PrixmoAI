import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/axios';
import { useAuth } from './useAuth';
import type { GenerateContentInput, GeneratedContent, PaginatedResult } from '../types';

export const useContent = () => {
  const { token } = useAuth();
  const [history, setHistory] = useState<PaginatedResult<GeneratedContent> | null>(null);
  const [activeContent, setActiveContent] = useState<GeneratedContent | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshHistory = async () => {
    if (!token) {
      return;
    }

    setIsLoadingHistory(true);

    try {
      const nextHistory = await apiRequest<PaginatedResult<GeneratedContent>>(
        '/api/content/history',
        { token }
      );
      setHistory(nextHistory);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Failed to load content history');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    void refreshHistory();
  }, [token]);

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
      await refreshHistory();
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
