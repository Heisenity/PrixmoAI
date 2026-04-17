import { API_BASE_URL } from './constants';
import type { ApiEnvelope } from '../types';

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  headers?: HeadersInit;
  query?: Record<string, string | number | null | undefined>;
  signal?: AbortSignal;
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
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}${toSearchParams(options.query)}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers ?? {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (requestError) {
    if (
      requestError instanceof DOMException &&
      requestError.name === 'AbortError'
    ) {
      throw new Error('Request cancelled by user.');
    }

    const message =
      requestError instanceof Error ? requestError.message : 'Unable to complete the request.';

    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      throw new Error(
        `Unable to reach the PrixmoAI server at ${API_BASE_URL}. Make sure the API is running and try again.`
      );
    }

    throw new Error(message);
  }

  const rawPayload = await response.text().catch(() => '');
  let payload: ApiEnvelope<T> | null = null;

  if (rawPayload.trim()) {
    try {
      payload = JSON.parse(rawPayload) as ApiEnvelope<T>;
    } catch {
      payload = null;
    }
  }

  const responseMessage =
    payload?.message ||
    payload?.errors?.find((detail) => detail.message)?.message ||
    (rawPayload.trim() && !rawPayload.trim().startsWith('<') ? rawPayload.trim() : '');

  if (!response.ok) {
    throw new Error(
      responseMessage ||
        `Request failed with status ${response.status}. Please try again.`
    );
  }

  if (!payload) {
    return undefined as T;
  }

  if (payload.status === 'fail' || payload.status === 'error') {
    throw new Error(responseMessage || 'Unable to complete the request.');
  }

  if (payload.data === undefined) {
    return payload as T;
  }

  return payload.data;
};
