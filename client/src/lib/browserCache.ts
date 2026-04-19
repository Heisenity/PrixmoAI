export type BrowserCacheEntry<T> = {
  value: T;
  cachedAt: string;
};

export const isBrowserCacheFresh = (
  cachedAt: string | null | undefined,
  ttlMs: number
) => {
  if (!cachedAt) {
    return false;
  }

  const cachedTime = new Date(cachedAt).getTime();

  return Number.isFinite(cachedTime) && Date.now() - cachedTime <= ttlMs;
};

export const readBrowserCache = <T>(key: string): BrowserCacheEntry<T> | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(key);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as BrowserCacheEntry<T>;

    if (!parsed || typeof parsed !== 'object' || !('value' in parsed)) {
      return null;
    }

    return {
      value: parsed.value,
      cachedAt:
        typeof parsed.cachedAt === 'string'
          ? parsed.cachedAt
          : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
};

export const writeBrowserCache = <T>(key: string, value: T) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    key,
    JSON.stringify({
      value,
      cachedAt: new Date().toISOString(),
    } satisfies BrowserCacheEntry<T>)
  );
};

export const removeBrowserCache = (key: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(key);
};
