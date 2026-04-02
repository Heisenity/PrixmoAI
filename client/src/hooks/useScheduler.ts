import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/axios';
import {
  emitUpgradePrompt,
  getUpgradePromptFromMessage,
} from '../lib/upgradePrompt';
import { useAuth } from './useAuth';
import type {
  CreateScheduledPostInput,
  CreateSocialAccountInput,
  MetaOAuthPopupResult,
  PendingMetaFacebookPageSelection,
  PaginatedResult,
  ScheduledPost,
  ScheduledPostStatus,
  SocialAccount,
  UploadedSourceImage,
} from '../types';

type SchedulerUiStatus = 'ready' | 'syncing' | 'error';

const isUpcomingScheduledPost = (scheduledFor: string, status: ScheduledPostStatus) => {
  if (status !== 'scheduled') {
    return false;
  }

  const scheduledAtMs = new Date(scheduledFor).getTime();

  return Number.isFinite(scheduledAtMs) && scheduledAtMs > Date.now();
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Failed to read media file'));
    };

    reader.onerror = () => {
      reject(new Error('Failed to read media file'));
    };

    reader.readAsDataURL(file);
  });

const META_OAUTH_POPUP_MESSAGE_TYPE = 'prixmoai:meta-oauth';
const META_OAUTH_POPUP_WIDTH = 560;
const META_OAUTH_POPUP_HEIGHT = 760;

const isMetaOAuthPopupResult = (
  value: unknown
): value is MetaOAuthPopupResult => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    status?: unknown;
    message?: unknown;
    selectionId?: unknown;
  };

  if (
    candidate.status !== 'success' &&
    candidate.status !== 'error' &&
    candidate.status !== 'select_facebook_pages'
  ) {
    return false;
  }

  if (typeof candidate.message !== 'string') {
    return false;
  }

  if (
    candidate.status === 'select_facebook_pages' &&
    typeof candidate.selectionId !== 'string'
  ) {
    return false;
  }

  return true;
};

const writePendingPopupState = (popup: Window) => {
  try {
    popup.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Connecting to PrixmoAI</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b1018;
        color: #f5f7fb;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .panel {
        width: min(360px, calc(100vw - 40px));
        padding: 28px 24px;
        border-radius: 24px;
        background: rgba(18, 24, 36, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35);
        text-align: center;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 22px;
      }
      p {
        margin: 0;
        line-height: 1.6;
        color: rgba(232, 237, 248, 0.78);
      }
    </style>
  </head>
  <body>
    <div class="panel">
      <h1>Opening Meta login…</h1>
      <p>PrixmoAI is preparing the secure connection window.</p>
    </div>
  </body>
</html>`);
    popup.document.close();
  } catch {
    // Ignore popup rendering failures; the redirect can still continue.
  }
};

const openCenteredPopup = () => {
  const left = window.screenX + Math.max(0, (window.outerWidth - META_OAUTH_POPUP_WIDTH) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - META_OAUTH_POPUP_HEIGHT) / 2);
  const features = [
    `width=${META_OAUTH_POPUP_WIDTH}`,
    `height=${META_OAUTH_POPUP_HEIGHT}`,
    `left=${Math.round(left)}`,
    `top=${Math.round(top)}`,
    'popup=yes',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');

  const popup = window.open('', 'prixmoai-meta-oauth', features);

  if (popup) {
    writePendingPopupState(popup);
  }

  return popup;
};

const awaitMetaOAuthPopupResult = async (
  popup: Window,
  authUrl: string,
  popupOrigin: string
): Promise<MetaOAuthPopupResult | null> => {
  popup.location.replace(authUrl);
  popup.focus();

  return await new Promise<MetaOAuthPopupResult>((resolve, reject) => {
    let settled = false;

    const cleanup = (finish: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      window.removeEventListener('message', handleMessage);
      window.clearInterval(closePoll);
      window.clearTimeout(timeout);

      try {
        if (!popup.closed) {
          popup.close();
        }
      } catch {
        // Ignore popup close failures from the browser.
      }

      finish();
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== popupOrigin) {
        return;
      }

      const payload =
        event.data && typeof event.data === 'object'
          ? (event.data as {
              type?: string;
              result?: MetaOAuthPopupResult;
            })
          : null;

      if (payload?.type !== META_OAUTH_POPUP_MESSAGE_TYPE) {
        return;
      }

      const result = isMetaOAuthPopupResult(payload.result)
        ? payload.result
        : isMetaOAuthPopupResult(payload)
          ? payload
          : null;

      if (!result) {
        return;
      }

      cleanup(() => {
        resolve(result);
      });
    };

    const closePoll = window.setInterval(() => {
      if (!popup.closed) {
        return;
      }

      cleanup(() => {
        reject(
          new Error(
            'The Meta login window was closed before the connection finished.'
          )
        );
      });
    }, 400);

    const timeout = window.setTimeout(() => {
      cleanup(() => {
        reject(new Error('Meta login took too long. Please try connecting again.'));
      });
    }, 5 * 60_000);

    window.addEventListener('message', handleMessage);
  });
};

type UseSchedulerOptions = {
  pollIntervalMs?: number;
};

export const useScheduler = (options: UseSchedulerOptions = {}) => {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState<PaginatedResult<SocialAccount> | null>(null);
  const [posts, setPosts] = useState<PaginatedResult<ScheduledPost> | null>(null);
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
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!token) {
        return;
      }

      if (!silent) {
        setIsLoading(true);
        setSchedulerStatus('syncing');
      }

      try {
        const [nextAccounts, nextPosts] = await Promise.all([
          apiRequest<PaginatedResult<SocialAccount>>('/api/scheduler/accounts', { token }),
          apiRequest<PaginatedResult<ScheduledPost>>('/api/scheduler/posts', { token }),
        ]);
        setAccounts(nextAccounts);
        setPosts(nextPosts);
        setError(null);
        setSchedulerStatus((current) =>
          !silent || current === 'error' ? 'ready' : current
        );
      } catch (schedulerError) {
        const message =
          schedulerError instanceof Error ? schedulerError.message : 'Failed to load scheduler';

        setError(message);
        setSchedulerStatus((current) => (current === 'error' ? current : 'error'));
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [token]
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
      await refresh({ silent: true });
      return created;
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to connect social account';
      const upgradePrompt = getUpgradePromptFromMessage(message);
      const nextMessage = upgradePrompt?.message ?? message;

      if (upgradePrompt) {
        emitUpgradePrompt(upgradePrompt);
      }

      setError(nextMessage);
      setSchedulerStatus('error');
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
    const popup = openCenteredPopup();

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

      if (!popup) {
        window.location.assign(response.authUrl);
        return null;
      }

      return await awaitMetaOAuthPopupResult(
        popup,
        response.authUrl,
        response.popupOrigin
      );
    } catch (mutationError) {
      if (popup && !popup.closed) {
        popup.close();
      }
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to start Meta verification';
      const upgradePrompt = getUpgradePromptFromMessage(message);
      const nextMessage = upgradePrompt?.message ?? message;

      if (upgradePrompt) {
        emitUpgradePrompt(upgradePrompt);
      }

      setError(nextMessage);
      setSchedulerStatus('error');
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
        pendingError instanceof Error
          ? pendingError.message
          : 'Failed to load Facebook Pages';
      setError(message);
      setSchedulerStatus('error');
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
      await refresh({ silent: true });
      return result;
    } catch (finalizeError) {
      const message =
        finalizeError instanceof Error
          ? finalizeError.message
          : 'Failed to connect the selected Facebook Pages';
      setError(message);
      setSchedulerStatus('error');
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
      await refresh({ silent: true });
      return created;
    } catch (mutationError) {
      const message =
        mutationError instanceof Error ? mutationError.message : 'Failed to create scheduled post';
      setError(message);
      setSchedulerStatus('error');
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
      await refresh({ silent: true });
    } catch (mutationError) {
      const message =
        mutationError instanceof Error ? mutationError.message : 'Failed to update post status';
      setError(message);
      setSchedulerStatus('error');
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
      await refresh({ silent: true });
      return updated;
    } catch (mutationError) {
      const message =
        mutationError instanceof Error ? mutationError.message : 'Failed to update scheduled post';
      setError(message);
      setSchedulerStatus('error');
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
      await refresh({ silent: true });
      return updated;
    } catch (mutationError) {
      const message =
        mutationError instanceof Error ? mutationError.message : 'Failed to cancel scheduled post';
      setError(message);
      setSchedulerStatus('error');
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
      await refresh({ silent: true });
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to disconnect social account';
      setError(message);
      setSchedulerStatus('error');
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  };

  const uploadPostMedia = async (file: File) => {
    if (!token) {
      throw new Error('Sign in again to upload post media.');
    }

    if (
      ![
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4',
        'video/quicktime',
      ].includes(file.type)
    ) {
      throw new Error('Only JPG, PNG, WEBP, MP4, and MOV media are supported.');
    }

    const maxBytes = file.type.startsWith('video/') ? 50 * 1024 * 1024 : 6 * 1024 * 1024;

    if (file.size > maxBytes) {
      throw new Error(
        file.type.startsWith('video/')
          ? 'Uploaded video must be 50MB or smaller.'
          : 'Uploaded image must be 6MB or smaller.'
      );
    }

    setError(null);
    setIsUploadingMedia(true);

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
        uploadError instanceof Error ? uploadError.message : 'Failed to upload post media';
      setError(message);
      setSchedulerStatus('error');
      throw new Error(message);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const importExternalMediaUrl = async (url: string) => {
    if (!token) {
      throw new Error('Sign in again to import media.');
    }

    setError(null);
    setIsUploadingMedia(true);

    try {
      const uploaded = await apiRequest<UploadedSourceImage>('/api/images/import-source-url', {
        method: 'POST',
        token,
        body: {
          url: url.trim(),
        },
      });

      return uploaded;
    } catch (importError) {
      const message =
        importError instanceof Error ? importError.message : 'Failed to import media URL';
      setError(message);
      setSchedulerStatus('error');
      throw new Error(message);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  return {
    accounts,
    posts,
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
    updatePost,
    updateStatus,
    cancelPost,
    disconnectAccount,
    uploadPostMedia,
    importExternalMediaUrl,
  };
};
