import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiRequestError, apiRequest, toReadableApiMessage } from '../lib/axios';
import {
  isBrowserCacheFresh,
  readBrowserCache,
  writeBrowserCache,
} from '../lib/browserCache';
import { API_BASE_URL } from '../lib/constants';
import { normalizeSchedulerMediaFile } from '../lib/instagramMedia';
import { getSuperAdminTestingRequestHeaders } from '../lib/superAdmin';
import {
  emitUpgradePrompt,
  getUpgradePromptFromMessage,
} from '../lib/upgradePrompt';
import { useAuth } from './useAuth';
import type {
  CreateMediaAssetInput,
  CreateScheduleBatchInput,
  CreateScheduledItemInput,
  CreateScheduledPostInput,
  CreateSocialAccountInput,
  ApiEnvelope,
  ApiErrorDetail,
  MediaAsset,
  MetaOAuthPopupResult,
  PendingMetaFacebookPageSelection,
  PaginatedResult,
  ResolvedExternalMedia,
  ScheduleBatch,
  ScheduleBatchDetail,
  ScheduledPost,
  ScheduledItem,
  ScheduledItemStatus,
  ScheduledPostStatus,
  SocialAccount,
  UpdateScheduledItemInput,
  UploadedSourceImage,
} from '../types';

type SchedulerUiStatus = 'ready' | 'syncing' | 'error';
type SchedulerMediaRequestOptions = {
  surfaceGlobalError?: boolean;
  signal?: AbortSignal;
  onUploadProgress?: (progress: SchedulerUploadProgress) => void;
};

export type SchedulerUploadProgress = {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
};

const isUpcomingScheduledPost = (scheduledFor: string, status: ScheduledPostStatus) => {
  if (status !== 'scheduled') {
    return false;
  }

  const scheduledAtMs = new Date(scheduledFor).getTime();

  return Number.isFinite(scheduledAtMs) && scheduledAtMs > Date.now();
};

const readFileAsDataUrl = (file: File, signal?: AbortSignal): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abortRead = () => {
      reader.abort();
    };
    const cleanup = () => {
      signal?.removeEventListener('abort', abortRead);
    };

    if (signal?.aborted) {
      reject(new Error('Request cancelled by user.'));
      return;
    }

    reader.onload = () => {
      cleanup();
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Failed to read media file'));
    };

    reader.onerror = () => {
      cleanup();
      reject(new Error('Failed to read media file'));
    };
    reader.onabort = () => {
      cleanup();
      reject(new Error('Request cancelled by user.'));
    };

    signal?.addEventListener('abort', abortRead, { once: true });
    reader.readAsDataURL(file);
  });

const getJsonByteLength = (value: string) => new TextEncoder().encode(value).byteLength;

const calculateUploadPercent = (loadedBytes: number, totalBytes: number) =>
  totalBytes > 0
    ? Math.max(0, Math.min(100, Math.round((loadedBytes / totalBytes) * 100)))
    : 0;

const uploadSourceImageWithProgress = ({
  file,
  token,
  signal,
  onUploadProgress,
}: {
  file: File;
  token: string;
  signal?: AbortSignal;
  onUploadProgress?: (progress: SchedulerUploadProgress) => void;
}) =>
  new Promise<UploadedSourceImage>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Request cancelled by user.'));
      return;
    }

    void readFileAsDataUrl(file, signal)
      .then((dataUrl) => {
        if (signal?.aborted) {
          reject(new Error('Request cancelled by user.'));
          return;
        }

        const requestBody = JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          dataUrl,
        });
        const requestBodyBytes = getJsonByteLength(requestBody);
        const xhr = new XMLHttpRequest();
        const abortRequest = () => xhr.abort();
        const cleanup = () => {
          signal?.removeEventListener('abort', abortRequest);
        };

        onUploadProgress?.({
          loadedBytes: 0,
          totalBytes: requestBodyBytes,
          percent: 0,
        });

        xhr.open('POST', `${API_BASE_URL}/api/images/upload-source`);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        Object.entries(getSuperAdminTestingRequestHeaders()).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value);
        });

        xhr.upload.onprogress = (event) => {
          const totalBytes = event.lengthComputable ? event.total : requestBodyBytes;
          const loadedBytes = Math.min(event.loaded, totalBytes);

          onUploadProgress?.({
            loadedBytes,
            totalBytes,
            percent: calculateUploadPercent(loadedBytes, totalBytes),
          });
        };

        xhr.onload = () => {
          cleanup();
          const rawPayload = xhr.responseText || '';
          let payload: ApiEnvelope<UploadedSourceImage> | null = null;

          if (rawPayload.trim()) {
            try {
              payload = JSON.parse(rawPayload) as ApiEnvelope<UploadedSourceImage>;
            } catch {
              payload = null;
            }
          }

          const responseMessage =
            toReadableApiMessage(payload?.message) ||
            toReadableApiMessage(
              payload?.errors?.find((detail: ApiErrorDetail) => detail.message)?.message
            ) ||
            (rawPayload.trim() && !rawPayload.trim().startsWith('<')
              ? toReadableApiMessage(rawPayload.trim())
              : '');

          if (xhr.status < 200 || xhr.status >= 300) {
            reject(
              new ApiRequestError(
                responseMessage ||
                  `Request failed with status ${xhr.status}. Please try again.`,
                {
                  status: xhr.status,
                  data: payload?.data,
                  details: payload?.errors,
                }
              )
            );
            return;
          }

          if (!payload) {
            reject(new Error('The server returned an unreadable upload response.'));
            return;
          }

          if (payload.status === 'fail' || payload.status === 'error') {
            reject(
              new ApiRequestError(responseMessage || 'Unable to complete the request.', {
                status: xhr.status,
                data: payload.data,
                details: payload.errors,
              })
            );
            return;
          }

          onUploadProgress?.({
            loadedBytes: requestBodyBytes,
            totalBytes: requestBodyBytes,
            percent: 100,
          });
          if (!payload.data) {
            reject(new Error('The server did not return uploaded media details.'));
            return;
          }

          resolve(payload.data);
        };

        xhr.onerror = () => {
          cleanup();
          reject(
            new Error(
              `Unable to reach the PrixmoAI server at ${API_BASE_URL}. Make sure the API is running and try again.`
            )
          );
        };

        xhr.onabort = () => {
          cleanup();
          reject(new Error('Request cancelled by user.'));
        };

        signal?.addEventListener('abort', abortRequest, { once: true });
        xhr.send(requestBody);
      })
      .catch(reject);
  });

type SchedulerCache = {
  accounts: PaginatedResult<SocialAccount> | null;
  posts: PaginatedResult<ScheduledPost> | null;
  items: PaginatedResult<ScheduledItem> | null;
};

const SCHEDULER_CACHE_KEY_PREFIX = 'prixmoai.scheduler.snapshot';
const SCHEDULER_CACHE_TTL_MS = 60_000;

const buildSchedulerCacheKey = (userId: string) =>
  `${SCHEDULER_CACHE_KEY_PREFIX}:${userId}`;

const readSchedulerCache = (userId: string) =>
  readBrowserCache<SchedulerCache>(buildSchedulerCacheKey(userId));

const writeSchedulerCache = (userId: string, value: SchedulerCache) => {
  writeBrowserCache(buildSchedulerCacheKey(userId), value);
};

const isStaleSchedulerError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (/route not found|failed to fetch scheduled|failed to fetch social/i.test(normalized)) {
    return false;
  }

  return /not found|no longer available|expired|removed|deleted/i.test(normalized);
};

const hasSchedulerSnapshotData = (snapshot: SchedulerCache | null | undefined) =>
  Boolean(
    snapshot?.accounts?.items?.length ||
      snapshot?.posts?.items?.length ||
      snapshot?.items?.items?.length
  );

type UseSchedulerOptions = {
  pollIntervalMs?: number;
};

export const useScheduler = (options: UseSchedulerOptions = {}) => {
  const { token, user } = useAuth();
  const [accounts, setAccounts] = useState<PaginatedResult<SocialAccount> | null>(null);
  const [posts, setPosts] = useState<PaginatedResult<ScheduledPost> | null>(null);
  const [items, setItems] = useState<PaginatedResult<ScheduledItem> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerUiStatus>('ready');
  const pollIntervalMs =
    Number.isFinite(options.pollIntervalMs) && (options.pollIntervalMs ?? 0) >= 0
      ? options.pollIntervalMs ?? 3_000
      : 3_000;
  const upcomingPosts = useMemo(
    () =>
      (posts?.items ?? [])
        .filter((post) => isUpcomingScheduledPost(post.scheduledFor, post.status))
        .sort(
          (left, right) =>
            new Date(left.scheduledFor).getTime() - new Date(right.scheduledFor).getTime()
        ),
    [posts?.items]
  );

  const refresh = useCallback(
    async ({ silent = false, force = false }: { silent?: boolean; force?: boolean } = {}) => {
      if (!token || !user?.id) {
        return;
      }

      const cached = readSchedulerCache(user.id);
      const hasFreshCache = Boolean(
        !force &&
          cached?.cachedAt &&
          isBrowserCacheFresh(cached.cachedAt, SCHEDULER_CACHE_TTL_MS)
      );

      if (cached?.value) {
        setAccounts(cached.value.accounts);
        setPosts(cached.value.posts);
        setItems(cached.value.items);
      }

      if (!silent && !cached?.value) {
        setIsLoading(true);
        setSchedulerStatus('syncing');
      } else if (!silent && !hasFreshCache) {
        setSchedulerStatus('syncing');
      } else if (hasFreshCache) {
        setSchedulerStatus('ready');
      }

      try {
        const [accountsResult, postsResult, itemsResult] = await Promise.allSettled([
          apiRequest<PaginatedResult<SocialAccount>>('/api/scheduler/accounts', { token }),
          apiRequest<PaginatedResult<ScheduledPost>>('/api/scheduler/posts', { token }),
          apiRequest<PaginatedResult<ScheduledItem>>('/api/scheduler/items', { token }),
        ]);

        const failures = [accountsResult, postsResult, itemsResult]
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => result.reason);

        const nextAccounts =
          accountsResult.status === 'fulfilled' ? accountsResult.value : null;
        const nextPosts = postsResult.status === 'fulfilled' ? postsResult.value : null;
        const nextItems = itemsResult.status === 'fulfilled' ? itemsResult.value : null;

        if (nextAccounts) {
          setAccounts(nextAccounts);
        }

        if (nextPosts) {
          setPosts(nextPosts);
        }

        if (nextItems) {
          setItems(nextItems);
        }

        if (failures.length) {
          if (failures.every(isStaleSchedulerError)) {
            setError(null);
            setSchedulerStatus('ready');
            return;
          }

          if (
            nextAccounts ||
            nextPosts ||
            nextItems ||
            hasSchedulerSnapshotData(cached?.value)
          ) {
            setError(null);
            setSchedulerStatus('ready');
            return;
          }

          throw failures[0];
        }

        writeSchedulerCache(user.id, {
          accounts: nextAccounts,
          posts: nextPosts,
          items: nextItems,
        });
        setError(null);
        setSchedulerStatus((current) =>
          !silent || current === 'error' ? 'ready' : current
        );
      } catch (schedulerError) {
        const message =
          schedulerError instanceof Error ? schedulerError.message : 'Failed to load scheduler';

        if (hasSchedulerSnapshotData(cached?.value)) {
          setError(null);
          setSchedulerStatus('ready');
          return;
        }

        setError(message);
        setSchedulerStatus((current) => (current === 'error' ? current : 'error'));
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [token, user?.id]
  );

  const recoverFromStaleSchedulerState = useCallback(async () => {
    await refresh({ silent: true, force: true });
  }, [refresh]);

  const handleSchedulerMutationError = useCallback(
    async (mutationError: unknown, fallbackMessage: string) => {
      const message =
        mutationError instanceof Error ? mutationError.message : fallbackMessage;

      if (isStaleSchedulerError(mutationError)) {
        await recoverFromStaleSchedulerState();
        return message;
      }

      setError(message);
      setSchedulerStatus('error');
      return message;
    },
    [recoverFromStaleSchedulerState]
  );

  useEffect(() => {
    void refresh();
  }, [token, refresh]);

  useEffect(() => {
    if (!token || pollIntervalMs <= 0) {
      return;
    }

    const interval = window.setInterval(() => {
      void refresh({ silent: true });
    }, pollIntervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [token, pollIntervalMs]);

  const createAccount = async (input: CreateSocialAccountInput) => {
    if (!token) {
      throw new Error('Sign in again to connect accounts.');
    }

    setError(null);
    setIsMutating(true);

    try {
      const payload = {
        platform: input.platform,
        ...(input.accountId?.trim() ? { accountId: input.accountId.trim() } : {}),
        ...(input.profileUrl?.trim() ? { profileUrl: input.profileUrl.trim() } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };

      const created = await apiRequest<SocialAccount>('/api/scheduler/accounts', {
        method: 'POST',
        token,
        body: payload,
      });
      await refresh({ silent: true, force: true });
      return created;
    } catch (mutationError) {
      const message = await handleSchedulerMutationError(
        mutationError,
        'Failed to connect social account'
      );
      const upgradePrompt = getUpgradePromptFromMessage(message);
      const nextMessage = upgradePrompt?.message ?? message;

      if (upgradePrompt) {
        emitUpgradePrompt(upgradePrompt);
      }

      setError(nextMessage);
      throw new Error(nextMessage);
    } finally {
      setIsMutating(false);
    }
  };

  const startMetaOAuth = async (
    input: CreateSocialAccountInput
  ): Promise<MetaOAuthPopupResult | null> => {
    if (!token) {
      throw new Error('Sign in again to verify Meta accounts.');
    }

    setError(null);
    setIsMutating(true);

    try {
      const response = await apiRequest<{ authUrl: string; popupOrigin: string }>(
        '/api/scheduler/oauth/meta/start',
        {
          method: 'POST',
          token,
          body: {
            platform: input.platform,
            ...(input.accountId?.trim() ? { accountId: input.accountId.trim() } : {}),
            ...(input.profileUrl?.trim() ? { profileUrl: input.profileUrl.trim() } : {}),
          },
        }
      );

      window.location.assign(response.authUrl);
      return null;
    } catch (mutationError) {
      const message = await handleSchedulerMutationError(
        mutationError,
        'Failed to start Meta verification'
      );
      const upgradePrompt = getUpgradePromptFromMessage(message);
      const nextMessage = upgradePrompt?.message ?? message;

      if (upgradePrompt) {
        emitUpgradePrompt(upgradePrompt);
      }

      setError(nextMessage);
      throw new Error(nextMessage);
    } finally {
      setIsMutating(false);
    }
  };

  const loadPendingMetaFacebookPages = async (selectionId: string) => {
    if (!token) {
      throw new Error('Sign in again to continue connecting Facebook Pages.');
    }

    setError(null);

    try {
      return await apiRequest<PendingMetaFacebookPageSelection>(
        `/api/scheduler/oauth/meta/pending/facebook-pages/${selectionId}`,
        {
          token,
        }
      );
    } catch (pendingError) {
      const message =
        pendingError instanceof Error ? pendingError.message : 'Failed to load Facebook Pages';
      throw new Error(message);
    }
  };

  const finalizePendingMetaFacebookPages = async (
    selectionId: string,
    pageIds: string[]
  ) => {
    if (!token) {
      throw new Error('Sign in again to connect Facebook Pages.');
    }

    setError(null);
    setIsMutating(true);

    try {
      const result = await apiRequest<{ connectedAccounts: SocialAccount[] }>(
        '/api/scheduler/oauth/meta/finalize/facebook-pages',
        {
          method: 'POST',
          token,
          body: {
            selectionId,
            pageIds,
          },
        }
      );
      await refresh({ silent: true, force: true });
      return result;
    } catch (finalizeError) {
      const message =
        finalizeError instanceof Error
          ? finalizeError.message
          : 'Failed to connect the selected Facebook Pages';
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  };

  const createPost = async (input: CreateScheduledPostInput) => {
    if (!token) {
      throw new Error('Sign in again to schedule posts.');
    }

    setError(null);
    setIsMutating(true);

    try {
      const payload = {
        socialAccountId: input.socialAccountId,
        ...(input.contentId ? { contentId: input.contentId } : {}),
        ...(input.generatedImageId ? { generatedImageId: input.generatedImageId } : {}),
        ...(input.platform ? { platform: input.platform } : {}),
        ...(input.caption?.trim() ? { caption: input.caption.trim() } : {}),
        ...(input.mediaUrl?.trim() ? { mediaUrl: input.mediaUrl.trim() } : {}),
        ...(input.mediaType ? { mediaType: input.mediaType } : {}),
        scheduledFor: input.scheduledFor,
        ...(input.status ? { status: input.status } : {}),
      };

      const created = await apiRequest<ScheduledPost>('/api/scheduler/posts', {
        method: 'POST',
        token,
        body: payload,
      });
      await refresh({ silent: true, force: true });
      return created;
    } catch (mutationError) {
      const message = await handleSchedulerMutationError(
        mutationError,
        'Failed to create scheduled post'
      );
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  };

  const createMediaAssetRecord = async (
    input: CreateMediaAssetInput,
    options?: Pick<SchedulerMediaRequestOptions, 'signal'>
  ) => {
    if (!token) {
      throw new Error('Sign in again to manage media assets.');
    }

    setError(null);
    setIsMutating(true);

    try {
      return await apiRequest<MediaAsset>('/api/scheduler/media-assets', {
        method: 'POST',
        token,
        signal: options?.signal,
        body: input,
      });
    } catch (mutationError) {
      const message = await handleSchedulerMutationError(
        mutationError,
        'Failed to create media asset'
      );
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  };

  const createBatch = async (input: CreateScheduleBatchInput) => {
    if (!token) {
      throw new Error('Sign in again to create schedule batches.');
    }

    setError(null);
    setIsMutating(true);

    try {
      const created = await apiRequest<ScheduleBatch>('/api/scheduler/batches', {
        method: 'POST',
        token,
        body: input,
      });
      await refresh({ silent: true, force: true });
      return created;
    } catch (mutationError) {
      const message = await handleSchedulerMutationError(
        mutationError,
        'Failed to create schedule batch'
      );
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  };

  const getBatch = async (batchId: string) => {
    if (!token) {
      throw new Error('Sign in again to view schedule batches.');
    }

    try {
      return await apiRequest<ScheduleBatchDetail>(`/api/scheduler/batches/${batchId}`, {
        token,
      });
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to load schedule batch';
      throw new Error(message);
    }
  };

  const deleteBatch = async (batchId: string) => {
    if (!token) {
      throw new Error('Sign in again to manage drafts.');
    }

    setError(null);
    setIsMutating(true);

    try {
      await apiRequest<void>(`/api/scheduler/batches/${batchId}`, {
        method: 'DELETE',
        token,
      });
      await refresh({ silent: true, force: true });
    } catch (mutationError) {
      const message = await handleSchedulerMutationError(
        mutationError,
        'Failed to delete draft'
      );
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  };

  const listBatches = async (options: {
    page?: number;
    limit?: number;
    status?: ScheduleBatch['status'];
  } = {}) => {
    if (!token) {
      throw new Error('Sign in again to view saved drafts.');
    }

    try {
      const params = new URLSearchParams();

      if (options.page) {
        params.set('page', String(options.page));
      }

      if (options.limit) {
        params.set('limit', String(options.limit));
      }

      if (options.status) {
        params.set('status', options.status);
      }

      const query = params.toString();

      return await apiRequest<PaginatedResult<ScheduleBatch>>(
        `/api/scheduler/batches${query ? `?${query}` : ''}`,
        {
          token,
        }
      );
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to load schedule batches';
      throw new Error(message);
    }
  };

  const addBatchItems = async (batchId: string, nextItems: CreateScheduledItemInput[]) => {
    if (!token) {
      throw new Error('Sign in again to add scheduled items.');
    }

    setError(null);
    setIsMutating(true);

    try {
      const created = await apiRequest<ScheduledItem[]>(`/api/scheduler/batches/${batchId}/items`, {
        method: 'POST',
        token,
        body: {
          items: nextItems,
        },
      });
      await refresh({ silent: true, force: true });
      return created;
    } catch (mutationError) {
      const message = await handleSchedulerMutationError(
        mutationError,
        'Failed to add scheduled items'
      );
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  };

  const submitBatch = async (batchId: string) => {
    if (!token) {
      throw new Error('Sign in again to submit schedule batches.');
    }

    setError(null);
    setIsMutating(true);

    try {
      const result = await apiRequest<{ batch: ScheduleBatch; items: ScheduledItem[] }>(
        `/api/scheduler/batches/${batchId}/submit`,
        {
          method: 'POST',
          token,
        }
      );
      await refresh({ silent: true, force: true });
      return result;
    } catch (mutationError) {
      const message = await handleSchedulerMutationError(
        mutationError,
        'Failed to submit schedule batch'
      );
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  };

  const updateItem = async (itemId: string, input: UpdateScheduledItemInput) => {
    if (!token) {
      throw new Error('Sign in again to update scheduled items.');
    }

    setError(null);
    setIsMutating(true);

    try {
      const updated = await apiRequest<ScheduledItem>(`/api/scheduler/items/${itemId}`, {
        method: 'PATCH',
        token,
        body: input,
      });
      await refresh({ silent: true, force: true });
      return updated;
    } catch (mutationError) {
      const message = await handleSchedulerMutationError(
        mutationError,
        'Failed to update scheduled item'
      );
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  };

  const cancelItem = async (itemId: string) => {
    if (!token) {
      throw new Error('Sign in again to cancel scheduled items.');
    }

    setError(null);
    setIsMutating(true);

    try {
      const updated = await apiRequest<ScheduledItem>(`/api/scheduler/items/${itemId}/cancel`, {
        method: 'POST',
        token,
      });
      await refresh({ silent: true, force: true });
      return updated;
    } catch (mutationError) {
      const message = await handleSchedulerMutationError(
        mutationError,
        'Failed to cancel scheduled item'
      );
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  };

  const updateStatus = async (postId: string, status: ScheduledPostStatus) => {
    if (!token) {
      throw new Error('Sign in again to update post status.');
    }

    setError(null);
    setIsMutating(true);

    try {
      await apiRequest<ScheduledPost>(`/api/scheduler/posts/${postId}/status`, {
        method: 'PATCH',
        token,
        body: { status },
      });
      await refresh({ silent: true, force: true });
    } catch (mutationError) {
      const message = await handleSchedulerMutationError(
        mutationError,
        'Failed to update post status'
      );
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  };

  const updatePost = async (
    postId: string,
    input: Partial<CreateScheduledPostInput>
  ) => {
    if (!token) {
      throw new Error('Sign in again to update scheduled posts.');
    }

    setError(null);
    setIsMutating(true);

    try {
      const payload = {
        ...(input.socialAccountId ? { socialAccountId: input.socialAccountId } : {}),
        ...(input.contentId !== undefined ? { contentId: input.contentId } : {}),
        ...(input.generatedImageId !== undefined
          ? { generatedImageId: input.generatedImageId }
          : {}),
        ...(input.platform ? { platform: input.platform } : {}),
        ...(input.caption !== undefined ? { caption: input.caption.trim() } : {}),
        ...(input.mediaUrl !== undefined ? { mediaUrl: input.mediaUrl.trim() } : {}),
        ...(input.mediaType !== undefined ? { mediaType: input.mediaType } : {}),
        ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
        ...(input.status ? { status: input.status } : {}),
      };

      const updated = await apiRequest<ScheduledPost>(`/api/scheduler/posts/${postId}`, {
        method: 'PATCH',
        token,
        body: payload,
      });
      await refresh({ silent: true, force: true });
      return updated;
    } catch (mutationError) {
      const message = await handleSchedulerMutationError(
        mutationError,
        'Failed to update scheduled post'
      );
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  };

  const cancelPost = async (postId: string) => {
    if (!token) {
      throw new Error('Sign in again to cancel scheduled posts.');
    }

    setError(null);
    setIsMutating(true);

    try {
      const updated = await apiRequest<ScheduledPost>(`/api/scheduler/posts/${postId}/cancel`, {
        method: 'POST',
        token,
      });
      await refresh({ silent: true, force: true });
      return updated;
    } catch (mutationError) {
      const message = await handleSchedulerMutationError(
        mutationError,
        'Failed to cancel scheduled post'
      );
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  };

  const disconnectAccount = async (accountId: string) => {
    if (!token) {
      throw new Error('Sign in again to manage connected accounts.');
    }

    setError(null);
    setIsMutating(true);

    try {
      await apiRequest<void>(`/api/scheduler/accounts/${accountId}`, {
        method: 'DELETE',
        token,
      });
      await refresh({ silent: true, force: true });
    } catch (mutationError) {
      const message = await handleSchedulerMutationError(
        mutationError,
        'Failed to disconnect social account'
      );
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  };

  const maybeSurfaceMediaError = (
    message: string,
    options?: SchedulerMediaRequestOptions
  ) => {
    if (options?.surfaceGlobalError === false) {
      return;
    }

    setError(message);
    setSchedulerStatus('error');
  };

  const uploadPostMedia = async (
    file: File,
    options?: SchedulerMediaRequestOptions
  ) => {
    if (!token) {
      throw new Error('Sign in again to upload post media.');
    }

    const normalizedMedia = normalizeSchedulerMediaFile(file);
    const uploadFile = normalizedMedia.file;

    const maxBytes =
      normalizedMedia.mediaType === 'video' ? 200 * 1024 * 1024 : 20 * 1024 * 1024;

    if (uploadFile.size > maxBytes) {
      throw new Error(
        normalizedMedia.mediaType === 'video'
          ? 'Uploaded video must be 200MB or smaller.'
          : 'Uploaded image must be 20MB or smaller.'
      );
    }

    setError(null);
    setIsUploadingMedia(true);

    try {
      const uploaded = await uploadSourceImageWithProgress({
        file: uploadFile,
        token,
        signal: options?.signal,
        onUploadProgress: options?.onUploadProgress,
      });

      return uploaded;
    } catch (uploadError) {
      const message =
        uploadError instanceof Error ? uploadError.message : 'Failed to upload post media';
      maybeSurfaceMediaError(message, options);
      throw new Error(message);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const resolveExternalMediaUrl = async (
    url: string,
    options?: SchedulerMediaRequestOptions
  ) => {
    if (!token) {
      throw new Error('Sign in again to resolve media.');
    }

    setError(null);

    try {
      const resolved = await apiRequest<ResolvedExternalMedia>('/api/images/resolve-source-url', {
        method: 'POST',
        token,
        body: {
          url: url.trim(),
        },
      });

      return resolved;
    } catch (resolveError) {
      const message =
        resolveError instanceof Error ? resolveError.message : 'Failed to resolve media URL';
      maybeSurfaceMediaError(message, options);
      throw new Error(message);
    }
  };

  const importExternalMediaUrl = async (
    url: string,
    options?: SchedulerMediaRequestOptions
  ) => {
    if (!token) {
      throw new Error('Sign in again to import media.');
    }

    setError(null);
    setIsUploadingMedia(true);

    try {
      const uploaded = await apiRequest<UploadedSourceImage>('/api/images/import-source-url', {
        method: 'POST',
        token,
        signal: options?.signal,
        body: {
          url: url.trim(),
        },
      });

      return uploaded;
    } catch (importError) {
      const message =
        importError instanceof Error ? importError.message : 'Failed to import media URL';
      maybeSurfaceMediaError(message, options);
      throw new Error(message);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  return {
    accounts,
    posts,
    items,
    upcomingPosts,
    isLoading,
    isMutating,
    isUploadingMedia,
    isBusy: isLoading || isMutating || isUploadingMedia,
    schedulerStatus,
    error,
    refresh,
    createAccount,
    startMetaOAuth,
    loadPendingMetaFacebookPages,
    finalizePendingMetaFacebookPages,
    createPost,
    createMediaAssetRecord,
    createBatch,
    getBatch,
    deleteBatch,
    listBatches,
    addBatchItems,
    submitBatch,
    updateItem,
    cancelItem,
    updatePost,
    updateStatus,
    cancelPost,
    disconnectAccount,
    uploadPostMedia,
    resolveExternalMediaUrl,
    importExternalMediaUrl,
  };
};
