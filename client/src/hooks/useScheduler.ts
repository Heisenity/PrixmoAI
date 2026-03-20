import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/axios';
import { useAuth } from './useAuth';
import type {
  CreateScheduledPostInput,
  CreateSocialAccountInput,
  PaginatedResult,
  ScheduledPost,
  ScheduledPostStatus,
  SocialAccount,
} from '../types';

export const useScheduler = () => {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState<PaginatedResult<SocialAccount> | null>(null);
  const [posts, setPosts] = useState<PaginatedResult<ScheduledPost> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!token) {
      return;
    }

    setIsLoading(true);

    try {
      const [nextAccounts, nextPosts] = await Promise.all([
        apiRequest<PaginatedResult<SocialAccount>>('/api/scheduler/accounts', { token }),
        apiRequest<PaginatedResult<ScheduledPost>>('/api/scheduler/posts', { token }),
      ]);
      setAccounts(nextAccounts);
      setPosts(nextPosts);
      setError(null);
    } catch (schedulerError) {
      setError(
        schedulerError instanceof Error ? schedulerError.message : 'Failed to load scheduler'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const createAccount = async (input: CreateSocialAccountInput) => {
    if (!token) {
      throw new Error('Sign in again to connect accounts.');
    }

    await apiRequest<SocialAccount>('/api/scheduler/accounts', {
      method: 'POST',
      token,
      body: input,
    });
    await refresh();
  };

  const createPost = async (input: CreateScheduledPostInput) => {
    if (!token) {
      throw new Error('Sign in again to schedule posts.');
    }

    await apiRequest<ScheduledPost>('/api/scheduler/posts', {
      method: 'POST',
      token,
      body: input,
    });
    await refresh();
  };

  const updateStatus = async (postId: string, status: ScheduledPostStatus) => {
    if (!token) {
      throw new Error('Sign in again to update post status.');
    }

    await apiRequest<ScheduledPost>(`/api/scheduler/posts/${postId}/status`, {
      method: 'PATCH',
      token,
      body: { status },
    });
    await refresh();
  };

  return {
    accounts,
    posts,
    isLoading,
    error,
    refresh,
    createAccount,
    createPost,
    updateStatus,
  };
};
