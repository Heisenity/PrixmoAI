import { API_BASE_URL } from './constants';
import type { ApiEnvelope } from '../types';

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  headers?: HeadersInit;
  query?: Record<string, string | number | null | undefined>;
};

const toSearchParams = (query?: ApiRequestOptions['query']) => {
  const params = new URLSearchParams();

  if (!query) {
    return '';
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    params.set(key, String(value));
  }

  const search = params.toString();
  return search ? `?${search}` : '';
};

export const apiRequest = async <T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}${toSearchParams(options.query)}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.message || 'Request failed');
  }

  if (payload.status === 'fail' || payload.status === 'error') {
    throw new Error(payload.message || 'Request failed');
  }

  if (payload.data === undefined) {
    return payload as T;
  }

  return payload.data;
};
