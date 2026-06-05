import { getCurrentRequestContext } from './requestContext';
import {
  ADMIN_HEALTH_EVENT_RETENTION_DAYS,
  OBSERVABILITY_ALERT_FAILURE_THRESHOLD,
  OBSERVABILITY_ALERT_WEBHOOK_URL,
  OBSERVABILITY_ALERT_WINDOW_MS,
} from '../config/constants';
import {
  isSupabaseAdminConfigured,
  requireSupabaseAdmin,
} from '../db/supabase';

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
let persistedEventCount = 0;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toNullableUuid = (value: unknown) =>
  typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;

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

const sanitizePayload = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.slice(0, 50).map(sanitizePayload);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const output: Record<string, unknown> = {};

  Object.entries(value as Record<string, unknown>).forEach(([key, nextValue]) => {
    if (/token|secret|password|authorization|cookie/i.test(key)) {
      output[key] = '[redacted]';
      return;
    }

    output[key] = sanitizePayload(nextValue);
  });

  return output;
};

const persistOperationalEvent = (
  event: string,
  level: LogLevel,
  entry: EventPayload & {
    requestId: string | null;
    timestamp: string;
  }
) => {
  if (!isSupabaseAdminConfigured) {
    return;
  }

  void (async () => {
    try {
      const client = requireSupabaseAdmin();
      const payload = sanitizePayload(entry) as Record<string, unknown>;

      await client.from('admin_health_events').insert({
        event,
        level,
        request_id: entry.requestId ?? null,
        user_id: toNullableUuid(entry.userId),
        actor_user_id: toNullableUuid(entry.actorUserId),
        plan: typeof entry.plan === 'string' ? entry.plan : null,
        provider: typeof entry.provider === 'string' ? entry.provider : null,
        platform: typeof entry.platform === 'string' ? entry.platform : null,
        queue: typeof entry.queue === 'string' ? entry.queue : null,
        job_id: typeof entry.jobId === 'string' ? entry.jobId : null,
        failure_kind:
          typeof entry.failureKind === 'string' ? entry.failureKind : null,
        retryable:
          typeof entry.retryable === 'boolean' ? entry.retryable : null,
        payload,
        created_at: entry.timestamp,
      });

      persistedEventCount += 1;

      if (persistedEventCount % 100 === 0) {
        const retentionCutoff = new Date(
          Date.now() - ADMIN_HEALTH_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000
        ).toISOString();

        await client
          .from('admin_health_events')
          .delete()
          .lt('created_at', retentionCutoff)
          .limit(1000);
      }
    } catch (error) {
      console.warn('[observability] health event persistence failed', {
        event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
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
  persistOperationalEvent(event, level, entry);
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
