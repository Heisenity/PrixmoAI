import { getCurrentRequestContext } from './requestContext';
import {
  OBSERVABILITY_ALERT_FAILURE_THRESHOLD,
  OBSERVABILITY_ALERT_WEBHOOK_URL,
  OBSERVABILITY_ALERT_WINDOW_MS,
} from '../config/constants';

type LogLevel = 'info' | 'warn' | 'error';

type EventPayload = Record<string, unknown> & {
  userId?: string | null;
  jobId?: string | null;
  provider?: string | null;
  plan?: string | null;
  queue?: string | null;
};

const FAILURE_WINDOW_MS = 5 * 60_000;
const failureTimestampsByKey = new Map<string, number[]>();
const alertCooldownUntilByKey = new Map<string, number>();

const serializeError = (error: unknown) => {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
    };
  }

  return {
    message: String(error),
  };
};

export const logOperationalEvent = (
  event: string,
  payload: EventPayload = {},
  level: LogLevel = 'info'
) => {
  const requestContext = getCurrentRequestContext();
  const entry = {
    event,
    requestId: requestContext?.requestId ?? null,
    userId: payload.userId ?? requestContext?.authenticatedUserId ?? null,
    plan: payload.plan ?? requestContext?.superAdminTestPlan ?? null,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  logger(`[observability] ${event}`, entry);
};

export const logFailure = (
  event: string,
  error: unknown,
  payload: EventPayload = {},
  level: LogLevel = 'error'
) => {
  logOperationalEvent(
    event,
    {
      ...payload,
      error: serializeError(error),
    },
    level
  );
};

const sendAlert = (payload: EventPayload & { event: string }) => {
  if (!OBSERVABILITY_ALERT_WEBHOOK_URL) {
    return;
  }

  void fetch(OBSERVABILITY_ALERT_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: 'prixmoai',
      timestamp: new Date().toISOString(),
      ...payload,
    }),
  }).catch((error) => {
    console.warn('[observability] alert delivery failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
};

export const recordFailureSpikeSignal = (
  key: string,
  payload: EventPayload = {},
  options: {
    threshold?: number;
    windowMs?: number;
  } = {}
) => {
  const now = Date.now();
  const windowMs =
    options.windowMs ?? OBSERVABILITY_ALERT_WINDOW_MS ?? FAILURE_WINDOW_MS;
  const threshold =
    options.threshold ?? OBSERVABILITY_ALERT_FAILURE_THRESHOLD ?? 5;
  const recent = (failureTimestampsByKey.get(key) ?? []).filter(
    (timestamp) => now - timestamp <= windowMs
  );

  recent.push(now);
  failureTimestampsByKey.set(key, recent);

  if (recent.length < threshold) {
    return;
  }

  const cooldownUntil = alertCooldownUntilByKey.get(key) ?? 0;

  if (cooldownUntil > now) {
    return;
  }

  alertCooldownUntilByKey.set(key, now + windowMs);

  logOperationalEvent(
    'failure_spike_detected',
    {
      ...payload,
      signalKey: key,
      count: recent.length,
      windowMs,
    },
    'warn'
  );
  sendAlert({
    event: 'failure_spike_detected',
    ...payload,
    signalKey: key,
    count: recent.length,
    windowMs,
  });
};
