import { API_BASE_URL } from './constants';
import type { ApiEnvelope, ApiErrorDetail } from '../types';

export class ApiRequestError<T = unknown> extends Error {
  readonly status: number;
  readonly data?: T;
  readonly details?: ApiErrorDetail[];

  constructor(
    message: string,
    options: {
      status: number;
      data?: T;
      details?: ApiErrorDetail[];
    }
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = options.status;
    this.data = options.data;
    this.details = options.details;
  }
}

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  headers?: HeadersInit;
  query?: Record<string, string | number | null | undefined>;
  signal?: AbortSignal;
};

const inFlightGetRequests = new Map<string, Promise<unknown>>();

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

const executeApiRequest = async <T>(
  url: string,
  options: ApiRequestOptions,
  method: NonNullable<ApiRequestOptions['method']>
): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(url, {
      method,
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
    throw new ApiRequestError(
      responseMessage ||
        `Request failed with status ${response.status}. Please try again.`,
      {
        status: response.status,
        data: payload?.data,
        details: payload?.errors,
      }
    );
  }

  if (!payload) {
    return undefined as T;
  }

  if (payload.status === 'fail' || payload.status === 'error') {
    throw new ApiRequestError(responseMessage || 'Unable to complete the request.', {
      status: response.status,
      data: payload.data,
      details: payload.errors,
    });
  }

  if (payload.data === undefined) {
    return payload as T;
  }

  return payload.data;
};

export const apiRequest = async <T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> => {
  const method = options.method ?? 'GET';
  const url = `${API_BASE_URL}${path}${toSearchParams(options.query)}`;

  if (method !== 'GET' || options.signal) {
    return executeApiRequest<T>(url, options, method);
  }

  const dedupeKey = JSON.stringify({
    url,
    token: options.token ?? '',
    headers: options.headers ?? {},
  });
  const existingRequest = inFlightGetRequests.get(dedupeKey) as
    | Promise<T>
    | undefined;

  if (existingRequest) {
    return existingRequest;
  }

  const nextRequest = executeApiRequest<T>(url, options, method).finally(() => {
    inFlightGetRequests.delete(dedupeKey);
  });

  inFlightGetRequests.set(dedupeKey, nextRequest);
  return nextRequest;
};
