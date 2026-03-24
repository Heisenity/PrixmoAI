const ACTIVE_GENERATE_CONVERSATION_STORAGE_KEY =
  'prixmoai.generate.activeConversationId';

export const readActiveGenerateConversationId = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(ACTIVE_GENERATE_CONVERSATION_STORAGE_KEY);
};

export const setActiveGenerateConversationId = (
  conversationId: string | null
) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (conversationId) {
    window.localStorage.setItem(
      ACTIVE_GENERATE_CONVERSATION_STORAGE_KEY,
      conversationId
    );
    return;
  }

  window.localStorage.removeItem(ACTIVE_GENERATE_CONVERSATION_STORAGE_KEY);
};

