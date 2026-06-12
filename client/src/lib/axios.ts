import { API_BASE_URL } from './constants';
import type { ApiEnvelope, ApiErrorDetail } from '../types';
import { getSuperAdminTestingRequestHeaders } from './superAdmin';

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
const SAFE_GET_RETRY_STATUSES = new Set([408, 429, 502, 503, 504]);
const GET_RETRY_ATTEMPTS = 2;

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const isRetryableGetError = (error: unknown) => {
  if (error instanceof ApiRequestError) {
    return SAFE_GET_RETRY_STATUSES.has(error.status);
  }

  const message = error instanceof Error ? error.message : String(error);
  return /unable to reach|failed to fetch|network|load failed/i.test(message);
};

const resolveRequestHeaders = (
  options: ApiRequestOptions
): Record<string, string> => {
  const headers = new Headers();

  if (options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
    const superAdminHeaders = getSuperAdminTestingRequestHeaders();

    Object.entries(superAdminHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
  }

  if (options.headers) {
    new Headers(options.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return Object.fromEntries(headers.entries());
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

const toReadableApiMessage = (value: unknown): string => {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toReadableApiMessage).filter(Boolean).join(' ');
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const message = toReadableApiMessage(record.message);
    const error = toReadableApiMessage(record.error);
    const details = toReadableApiMessage(record.details);
    const hint = toReadableApiMessage(record.hint);
    const code = toReadableApiMessage(record.code);
    const combined = [message, error, details, hint, code ? `(${code})` : '']
      .filter(Boolean)
      .join(' ');

    if (combined) {
      return combined;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return 'The server returned an unreadable error.';
    }
  }

  return String(value);
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
      headers: resolveRequestHeaders(options),
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
    toReadableApiMessage(payload?.message) ||
    toReadableApiMessage(payload?.errors?.find((detail) => detail.message)?.message) ||
    (rawPayload.trim() && !rawPayload.trim().startsWith('<')
      ? toReadableApiMessage(rawPayload.trim())
      : '');

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

const executeApiRequestWithRetry = async <T>(
  url: string,
  options: ApiRequestOptions,
  method: NonNullable<ApiRequestOptions['method']>
) => {
  const attempts = method === 'GET' && !options.signal ? GET_RETRY_ATTEMPTS : 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await executeApiRequest<T>(url, options, method);
    } catch (error) {
      if (attempt >= attempts || !isRetryableGetError(error)) {
        throw error;
      }

      await wait(250 * attempt);
    }
  }

  return await executeApiRequest<T>(url, options, method);
};

export const apiRequest = async <T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> => {
  const method = options.method ?? 'GET';
  const url = `${API_BASE_URL}${path}${toSearchParams(options.query)}`;

  if (method !== 'GET' || options.signal) {
    return executeApiRequestWithRetry<T>(url, options, method);
  }

  const dedupeKey = JSON.stringify({
    url,
    token: options.token ?? '',
    headers: resolveRequestHeaders(options),
  });
  const existingRequest = inFlightGetRequests.get(dedupeKey) as
    | Promise<T>
    | undefined;

  if (existingRequest) {
    return existingRequest;
  }

  const nextRequest = executeApiRequestWithRetry<T>(url, options, method).finally(() => {
    inFlightGetRequests.delete(dedupeKey);
  });

  inFlightGetRequests.set(dedupeKey, nextRequest);
  return nextRequest;
};
