import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/axios';
import {
  isBrowserCacheFresh,
  readBrowserCache,
  writeBrowserCache,
} from '../lib/browserCache';
import {
  readActiveGenerateConversationId,
  setActiveGenerateConversationId,
} from '../lib/generateWorkspace';
import {
  emitUpgradePrompt,
  getUpgradePromptFromMessage,
} from '../lib/upgradePrompt';
import { useAuth } from './useAuth';
import type {
  GenerateContentInput,
  GenerateConversation,
  GenerateConversationThread,
  GenerateImageInput,
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

type GenerateWorkspaceCache = {
  conversations: GenerateConversation[];
  threads: Record<string, GenerateConversationThread>;
};

const GENERATE_WORKSPACE_CACHE_KEY_PREFIX = 'prixmoai.generate.workspace';
const GENERATE_WORKSPACE_CACHE_TTL_MS = 60_000;

const buildGenerateWorkspaceCacheKey = (userId: string) =>
  `${GENERATE_WORKSPACE_CACHE_KEY_PREFIX}:${userId}`;

const readGenerateWorkspaceCache = (userId: string) =>
  readBrowserCache<GenerateWorkspaceCache>(buildGenerateWorkspaceCacheKey(userId));

const writeGenerateWorkspaceCache = (
  userId: string | null | undefined,
  value: GenerateWorkspaceCache
) => {
  if (!userId) {
    return;
  }

  writeBrowserCache(buildGenerateWorkspaceCacheKey(userId), value);
};

export const useGenerateWorkspace = () => {
  const { token, user } = useAuth();
  const copyGenerationControllerRef = useRef<AbortController | null>(null);
  const imageGenerationControllerRef = useRef<AbortController | null>(null);
  const lastUserIdRef = useRef<string | null>(user?.id ?? null);
  const [conversations, setConversations] = useState<GenerateConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    () => readActiveGenerateConversationId(user?.id)
  );
  const [activeThread, setActiveThread] = useState<GenerateConversationThread | null>(
    null
  );
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshConversations = async (
    preferredConversationId?: string | null,
    options?: { silent?: boolean }
  ) => {
    if (!token) {
      setConversations([]);
      return [];
    }

    if (!options?.silent) {
      setIsLoadingConversations(true);
    }

    try {
      const nextConversations = await apiRequest<GenerateConversation[]>(
        '/api/generate/conversations',
        { token }
      );
      setConversations(nextConversations);
      const userId = user?.id ?? lastUserIdRef.current;

      if (userId) {
        const cached = readGenerateWorkspaceCache(userId)?.value;
        writeGenerateWorkspaceCache(userId, {
          conversations: nextConversations,
          threads: cached?.threads ?? {},
        });
      }

      const nextActiveConversationId =
        preferredConversationId !== undefined
          ? preferredConversationId
          : activeConversationId;

      if (
        nextActiveConversationId &&
        !nextConversations.some(
          (conversation) => conversation.id === nextActiveConversationId
        )
      ) {
        setActiveConversationId(null);
        setActiveGenerateConversationId(null, user?.id ?? lastUserIdRef.current);
      }

      return nextConversations;
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Failed to load conversations'
      );
      return [];
    } finally {
      if (!options?.silent) {
        setIsLoadingConversations(false);
      }
    }
  };

  const refreshThread = async (
    conversationId: string,
    options?: { silent?: boolean }
  ) => {
    if (!token) {
      return null;
    }

    if (!options?.silent) {
      setIsLoadingThread(true);
    }

    try {
      const nextThread = await apiRequest<GenerateConversationThread>(
        `/api/generate/conversations/${conversationId}`,
        { token }
      );
      setActiveThread(nextThread);
      const userId = user?.id ?? lastUserIdRef.current;

      if (userId) {
        const cached = readGenerateWorkspaceCache(userId)?.value;
        writeGenerateWorkspaceCache(userId, {
          conversations: cached?.conversations ?? conversations,
          threads: {
            ...(cached?.threads ?? {}),
            [conversationId]: nextThread,
          },
        });
      }
      setError(null);
      return nextThread;
    } catch (threadError) {
      const message =
        threadError instanceof Error
          ? threadError.message
          : 'Failed to load conversation thread';
      setError(message);
      throw new Error(message);
    } finally {
      if (!options?.silent) {
        setIsLoadingThread(false);
      }
    }
  };

  useEffect(() => {
    lastUserIdRef.current = user?.id ?? lastUserIdRef.current;
  }, [user?.id]);

  useEffect(() => {
    const userId = user?.id ?? lastUserIdRef.current;

    if (!token || !userId) {
      copyGenerationControllerRef.current?.abort();
      copyGenerationControllerRef.current = null;
      imageGenerationControllerRef.current?.abort();
      imageGenerationControllerRef.current = null;
      setConversations([]);
      setActiveThread(null);
      setActiveConversationId(null);
      setActiveGenerateConversationId(null, lastUserIdRef.current);
      return;
    }

    const storedConversationId = readActiveGenerateConversationId(userId);
    const cached = readGenerateWorkspaceCache(userId);

    if (cached?.value) {
      setConversations(cached.value.conversations);
      if (storedConversationId && cached.value.threads[storedConversationId]) {
        setActiveThread(cached.value.threads[storedConversationId]);
      }
    }

    setActiveConversationId(storedConversationId);

    if (
      cached?.cachedAt &&
      isBrowserCacheFresh(cached.cachedAt, GENERATE_WORKSPACE_CACHE_TTL_MS)
    ) {
      return;
    }

    void refreshConversations(undefined, { silent: Boolean(cached?.value) });
  }, [token, user?.id]);

  useEffect(() => {
    setActiveGenerateConversationId(
      activeConversationId,
      user?.id ?? lastUserIdRef.current
    );

    const userId = user?.id ?? lastUserIdRef.current;

    if (!token || !userId || !activeConversationId) {
      setActiveThread(null);
      return;
    }

    const cached = readGenerateWorkspaceCache(userId);
    const cachedThread = cached?.value.threads[activeConversationId];

    if (cachedThread) {
      setActiveThread(cachedThread);
    }

    if (
      cachedThread &&
      cached?.cachedAt &&
      isBrowserCacheFresh(cached.cachedAt, GENERATE_WORKSPACE_CACHE_TTL_MS)
    ) {
      return;
    }

    void refreshThread(activeConversationId, { silent: Boolean(cachedThread) }).catch((threadError) => {
      if (
        threadError instanceof Error &&
        /conversation not found|no longer available/i.test(threadError.message)
      ) {
        setActiveConversationId(null);
        setActiveThread(null);
        setError(null);
        setActiveGenerateConversationId(null, user?.id ?? lastUserIdRef.current);
        return;
      }
    });
  }, [token, activeConversationId, user?.id]);

  useEffect(
    () => () => {
      copyGenerationControllerRef.current?.abort();
      copyGenerationControllerRef.current = null;
      imageGenerationControllerRef.current?.abort();
      imageGenerationControllerRef.current = null;
    },
    []
  );

  const openConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setError(null);
  };

  const startNewChat = () => {
    setActiveConversationId(null);
    setActiveThread(null);
    setError(null);
    setActiveGenerateConversationId(null, user?.id ?? lastUserIdRef.current);
  };

  const createConversation = async (title?: string, type?: GenerateConversation['type']) => {
    if (!token) {
      throw new Error('Sign in again to create a conversation.');
    }

    const conversation = await apiRequest<GenerateConversation>(
      '/api/generate/conversations',
      {
        method: 'POST',
        token,
        body: {
          title,
          type,
        },
      }
    );

    setActiveConversationId(conversation.id);
    await refreshConversations(conversation.id);
    return conversation;
  };

  const renameConversation = async (conversationId: string, title: string) => {
    if (!token) {
      throw new Error('Sign in again to rename the conversation.');
    }

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      throw new Error('Conversation title cannot be empty.');
    }

    const updatedConversation = await apiRequest<GenerateConversation>(
      `/api/generate/conversations/${conversationId}`,
      {
        method: 'PATCH',
        token,
        body: {
          title: trimmedTitle,
        },
      }
    );

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === updatedConversation.id
          ? updatedConversation
          : conversation
      )
    );

    setActiveThread((current) =>
      current && current.conversation.id === updatedConversation.id
        ? {
            ...current,
            conversation: updatedConversation,
          }
        : current
    );
  };

  const deleteConversation = async (conversationId: string) => {
    if (!token) {
      throw new Error('Sign in again to delete the conversation.');
    }

    await apiRequest(`/api/generate/conversations/${conversationId}`, {
      method: 'DELETE',
      token,
    });

    setConversations((current) =>
      current.filter((conversation) => conversation.id !== conversationId)
    );

    if (activeConversationId === conversationId) {
      startNewChat();
    }
  };

  const generateCopy = async (input: GenerateContentInput) => {
    if (!token) {
      throw new Error('Sign in again to generate copy.');
    }

    copyGenerationControllerRef.current?.abort();
    const controller = new AbortController();
    copyGenerationControllerRef.current = controller;
    setError(null);
    setIsGeneratingCopy(true);

    try {
      const nextThread = await apiRequest<GenerateConversationThread>(
        '/api/generate/copy',
        {
          method: 'POST',
          token,
          body: {
            conversationId: activeConversationId ?? undefined,
            ...input,
          },
          signal: controller.signal,
        }
      );

      setActiveConversationId(nextThread.conversation.id);
      setActiveThread(nextThread);
      writeGenerateWorkspaceCache(user?.id ?? lastUserIdRef.current, {
        conversations,
        threads: {
          ...(readGenerateWorkspaceCache(user?.id ?? lastUserIdRef.current ?? '')?.value
            .threads ?? {}),
          [nextThread.conversation.id]: nextThread,
        },
      });
      await refreshConversations(nextThread.conversation.id);

      return nextThread;
    } catch (generationError) {
      if (
        generationError instanceof Error &&
        /request cancelled by user/i.test(generationError.message)
      ) {
        setError(null);
        throw generationError;
      }

      const message =
        generationError instanceof Error
          ? generationError.message
          : 'Failed to generate copy';
      const upgradePrompt = getUpgradePromptFromMessage(message);
      const nextMessage = upgradePrompt?.message ?? message;

      if (upgradePrompt) {
        emitUpgradePrompt(upgradePrompt);
      }

      setError(nextMessage);
      throw new Error(nextMessage);
    } finally {
      if (copyGenerationControllerRef.current === controller) {
        copyGenerationControllerRef.current = null;
        setIsGeneratingCopy(false);
      }
    }
  };

  const generateImage = async (input: GenerateImageInput) => {
    if (!token) {
      throw new Error('Sign in again to generate images.');
    }

    imageGenerationControllerRef.current?.abort();
    const controller = new AbortController();
    imageGenerationControllerRef.current = controller;
    setError(null);
    setIsGeneratingImage(true);

    try {
      const nextThread = await apiRequest<GenerateConversationThread>(
        '/api/generate/image',
        {
          method: 'POST',
          token,
          body: {
            conversationId: activeConversationId ?? undefined,
            ...input,
          },
          signal: controller.signal,
        }
      );

      setActiveConversationId(nextThread.conversation.id);
      setActiveThread(nextThread);
      writeGenerateWorkspaceCache(user?.id ?? lastUserIdRef.current, {
        conversations,
        threads: {
          ...(readGenerateWorkspaceCache(user?.id ?? lastUserIdRef.current ?? '')?.value
            .threads ?? {}),
          [nextThread.conversation.id]: nextThread,
        },
      });
      await refreshConversations(nextThread.conversation.id);

      return nextThread;
    } catch (generationError) {
      if (
        generationError instanceof Error &&
        /request cancelled by user/i.test(generationError.message)
      ) {
        setError(null);
        throw generationError;
      }

      const message =
        generationError instanceof Error
          ? generationError.message
          : 'Failed to generate image';
      const upgradePrompt = getUpgradePromptFromMessage(message);
      const nextMessage = upgradePrompt?.message ?? message;

      if (upgradePrompt) {
        emitUpgradePrompt(upgradePrompt);
      }

      setError(nextMessage);
      throw new Error(nextMessage);
    } finally {
      if (imageGenerationControllerRef.current === controller) {
        imageGenerationControllerRef.current = null;
        setIsGeneratingImage(false);
      }
    }
  };

  const cancelCopyGeneration = () => {
    copyGenerationControllerRef.current?.abort();
    copyGenerationControllerRef.current = null;
    setIsGeneratingCopy(false);
    setError(null);
  };

  const cancelImageGeneration = () => {
    imageGenerationControllerRef.current?.abort();
    imageGenerationControllerRef.current = null;
    setIsGeneratingImage(false);
    setError(null);
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
      return await apiRequest<UploadedSourceImage>('/api/images/upload-source', {
        method: 'POST',
        token,
        body: {
          fileName: file.name,
          contentType: file.type,
          dataUrl,
        },
      });
    } catch (uploadError) {
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : 'Failed to upload source image';
      setError(message);
      throw new Error(message);
    } finally {
      setIsUploadingSource(false);
    }
  };

  return {
    conversations,
    activeConversationId,
    activeThread,
    isLoadingConversations,
    isLoadingThread,
    isGeneratingCopy,
    isGeneratingImage,
    isUploadingSource,
    error,
    setError,
    refreshConversations,
    refreshThread,
    openConversation,
    startNewChat,
    createConversation,
    renameConversation,
    deleteConversation,
    generateCopy,
    generateImage,
    cancelCopyGeneration,
    cancelImageGeneration,
    uploadSourceImage,
  };
};
