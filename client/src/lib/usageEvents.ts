export const PRIXMOAI_USAGE_REFRESH_EVENT = 'prixmoai:usage-refresh';

export const emitUsageRefresh = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(PRIXMOAI_USAGE_REFRESH_EVENT));
};
