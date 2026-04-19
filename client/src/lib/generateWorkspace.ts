const ACTIVE_GENERATE_CONVERSATION_STORAGE_KEY =
  'prixmoai.generate.activeConversationId';

const getActiveGenerateConversationStorageKey = (userId: string) =>
  `${ACTIVE_GENERATE_CONVERSATION_STORAGE_KEY}:${userId}`;

const clearLegacyGenerateConversationStorageKey = () => {
  window.localStorage.removeItem(ACTIVE_GENERATE_CONVERSATION_STORAGE_KEY);
};

export const readActiveGenerateConversationId = (userId?: string | null) => {
  if (typeof window === 'undefined') {
    return null;
  }

  clearLegacyGenerateConversationStorageKey();

  if (!userId) {
    return null;
  }

  return window.localStorage.getItem(
    getActiveGenerateConversationStorageKey(userId)
  );
};

export const setActiveGenerateConversationId = (
  conversationId: string | null,
  userId?: string | null
) => {
  if (typeof window === 'undefined') {
    return;
  }

  clearLegacyGenerateConversationStorageKey();

  if (!userId) {
    return;
  }

  const storageKey = getActiveGenerateConversationStorageKey(userId);

  if (conversationId) {
    window.localStorage.setItem(storageKey, conversationId);
    return;
  }

  window.localStorage.removeItem(storageKey);
};
